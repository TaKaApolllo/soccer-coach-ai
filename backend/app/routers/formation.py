"""フォーメーション・戦術分析 API

試合の画像・動画から選手とボールを検出し、
- チーム分類・フォーメーション判定（動画は攻撃時/守備時を分離推定）
- 戦術指標（コンパクトネス・ライン間・プレス強度など）
- スペース分析（ピッチ支配率ヒートマップ・危険/有効スペース）
- パスコース分析（保持者推定・パス候補のスコア化・次のプレー提案）
- オフサイドライン分析
- AI 戦術コーチ（初級/中級/上級）
- 前回解析との比較
を返す。
"""

import os
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app import db
from app.services.formation_analyzer import FormationAnalyzer
from app.services.player_detector import DetectionResult, PlayerDetector
from app.services.tactical_analyzer import TacticalAnalyzer
from app.services.tactical_coach import TacticalCoach
from app.services.video_processor import VideoProcessor

router = APIRouter()

video_processor = VideoProcessor()
player_detector = PlayerDetector()
formation_analyzer = FormationAnalyzer()
tactical_analyzer = TacticalAnalyzer()
tactical_coach = TacticalCoach()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

# 動画から局面分析に使うフレーム数
PHASE_FRAMES = 5


def _load_analysis_frames(file_path: str) -> Tuple[List[np.ndarray], List[float]]:
    """画像なら1枚、動画なら等間隔で PHASE_FRAMES 枚を取り出す

    Returns:
        (フレーム列, 各フレームの動画内時刻 [秒])
    """
    if video_processor.is_video(file_path):
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            raise ValueError("動画ファイルを開けません")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        n = min(PHASE_FRAMES, max(1, total))
        indices = [int((i + 0.5) * total / n) for i in range(n)]
        frames = []
        times = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, min(idx, total - 1))
            ok, frame = cap.read()
            if ok:
                frames.append(frame)
                times.append(idx / fps)
        cap.release()
        if not frames:
            raise ValueError("動画からフレームを取得できませんでした")
        return frames, times

    img = cv2.imread(file_path)
    if img is None:
        raise ValueError("画像ファイルを開けません")
    return [img], [0.0]


def _format_time(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m:02d}:{s:02d}"


def _facing_summary(
    base_detection: DetectionResult,
    detections: List[Optional[DetectionResult]],
    base_idx: int,
    focus_team: int,
    attack_ltr: bool,
) -> Optional[dict]:
    """選手の向き（前向き/斜め/後ろ向き）を移動方向から推定（動画のみ）

    隣接フレームの検出と最近傍マッチングし、移動ベクトルと
    攻撃方向のなす角で分類する。静止中の選手は「前向き」扱い。
    """
    other = None
    sign = 1
    for offset in (1, -1, 2, -2):
        j = base_idx + offset
        if (
            0 <= j < len(detections)
            and detections[j] is not None
            and j != base_idx
            and len(detections[j].players) >= 6  # 検出不良フレームはスキップ
        ):
            other = detections[j]
            sign = 1 if offset > 0 else -1
            break
    if other is None:
        return None

    base_players = [p for p in base_detection.players if p.team == focus_team and p.pitch_xy]
    other_players = [p for p in other.players if p.team == focus_team and p.pitch_xy]
    if not base_players or not other_players:
        return None

    forward = diagonal = backward = 0
    for bp in base_players:
        nearest = min(
            other_players,
            key=lambda op: (op.pitch_xy[0] - bp.pitch_xy[0]) ** 2 + (op.pitch_xy[1] - bp.pitch_xy[1]) ** 2,
        )
        dx = (nearest.pitch_xy[0] - bp.pitch_xy[0]) * sign
        dy = (nearest.pitch_xy[1] - bp.pitch_xy[1]) * sign
        dist = np.hypot(dx * 105, dy * 68)
        if dist > 20:  # マッチング失敗とみなす
            continue
        if dist < 0.8:  # ほぼ静止
            forward += 1
            continue
        if not attack_ltr:
            dx = -dx
        angle = abs(np.degrees(np.arctan2(dy, dx)))
        if angle < 50:
            forward += 1
        elif angle <= 120:
            diagonal += 1
        else:
            backward += 1

    total = forward + diagonal + backward
    if total == 0:
        return None
    return {"forward": forward, "diagonal": diagonal, "backward": backward}


def _team_mean_colors(detection: DetectionResult) -> dict:
    """チームごとの平均ユニフォーム色 (BGR)"""
    colors = {}
    for team_id in (0, 1):
        members = [p.jersey_color_bgr for p in detection.players if p.team == team_id]
        if members:
            colors[team_id] = np.mean(np.array(members, dtype=np.float64), axis=0)
    return colors


def _align_teams(base_colors: dict, detection: DetectionResult) -> None:
    """KMeans のラベルはフレームごとに入れ替わるため、
    基準フレームのユニフォーム色に合わせてチーム ID を揃える"""
    if 0 not in base_colors or 1 not in base_colors:
        return
    cur = _team_mean_colors(detection)
    if 0 not in cur or 1 not in cur:
        return

    keep = (np.linalg.norm(cur[0] - base_colors[0]) + np.linalg.norm(cur[1] - base_colors[1]))
    swap = (np.linalg.norm(cur[0] - base_colors[1]) + np.linalg.norm(cur[1] - base_colors[0]))
    if swap < keep:
        for p in detection.players:
            if p.team in (0, 1):
                p.team = 1 - p.team


def _team_members(detection: DetectionResult, team_id: int) -> List[Tuple[int, object]]:
    return [(i, p) for i, p in enumerate(detection.players) if p.team == team_id and p.pitch_xy]


def _formation_for(detection: DetectionResult, team_id: int):
    members = _team_members(detection, team_id)
    gk_hint = next((i for i, p in members if p.is_goalkeeper), None)
    tf = formation_analyzer.analyze_team(
        positions=[p.pitch_xy for _, p in members],
        indices=[i for i, _ in members],
        gk_hint=gk_hint,
    )
    tf.team = team_id
    return tf


def _phase_formations(frames: List[np.ndarray], base_colors: dict) -> Optional[dict]:
    """動画の複数フレームから攻撃時/守備時のフォーメーションを分離推定"""
    if len(frames) < 2:
        return None

    # フレームごとに検出→保持チーム判定→局面別にフォーメーション集計
    votes = {0: {"attack": [], "defense": []}, 1: {"attack": [], "defense": []}}
    analyzed = 0

    for frame in frames:
        try:
            det = player_detector.detect(frame)
        except Exception:
            continue
        _align_teams(base_colors, det)

        team_positions = [
            [p.pitch_xy for p in det.players if p.team == t and p.pitch_xy] for t in (0, 1)
        ]
        if len(team_positions[0]) < 5 or len(team_positions[1]) < 5:
            continue

        possession = TacticalAnalyzer.possession_team(team_positions, det.ball_pitch_xy)
        if possession is None:
            continue

        analyzed += 1
        for team_id in (0, 1):
            tf = _formation_for(det, team_id)
            if "判定不可" in tf.formation or tf.confidence <= 0:
                continue
            phase = "attack" if possession == team_id else "defense"
            votes[team_id][phase].append((tf.formation, tf.confidence))

    if analyzed == 0:
        return None

    def summarize(entries):
        if not entries:
            return None
        names = [e[0] for e in entries]
        best = max(set(names), key=names.count)
        confs = [c for n, c in entries if n == best]
        return {
            "formation": best,
            "confidence": round(float(np.mean(confs)), 2),
            "samples": len(entries),
        }

    return {
        "frames_analyzed": analyzed,
        "teams": [
            {
                "team": t,
                "attack": summarize(votes[t]["attack"]),
                "defense": summarize(votes[t]["defense"]),
            }
            for t in (0, 1)
        ],
    }


def _comparison_with_previous(current_scores: dict) -> Optional[dict]:
    """直近の過去フォーメーション解析と戦術スコアを比較"""
    history = db.list_analyses(limit=20, include_payload=True)
    prev = next(
        (h for h in history
         if h["analysis_type"] == "formation" and h.get("analysis", {}).get("tactical_scores")),
        None,
    )
    if prev is None:
        return None

    prev_scores = prev["analysis"]["tactical_scores"]
    deltas = {}
    for key, value in current_scores.items():
        if key in prev_scores and value is not None and prev_scores[key] is not None:
            deltas[key] = value - prev_scores[key]

    if not deltas:
        return None

    # 成長コメント
    improved = [k for k, v in deltas.items() if v >= 5]
    declined = [k for k, v in deltas.items() if v <= -5]
    if improved:
        comment = f"前回より {'・'.join(improved)} が向上しています。取り組みが結果に表れています。"
    elif declined:
        comment = f"前回より {'・'.join(declined)} が低下しています。直近の練習テーマを見直しましょう。"
    else:
        comment = "前回と大きな変化はありません。安定した組織を維持できています。"

    return {
        "previous_id": prev["id"],
        "previous_date": prev["created_at"],
        "previous_scores": prev_scores,
        "deltas": deltas,
        "comment": comment,
    }


@router.post("/formation/analyze")
async def analyze_formation(
    file: UploadFile = File(...),
    team_a_name: str = Form(default="チームA"),
    team_b_name: str = Form(default="チームB"),
    focus_team: int = Form(default=0),
    context: Optional[str] = Form(default=None),
):
    """フォーメーション + 戦術分析

    - **file**: 試合の画像または動画（俯瞰・放送映像）
    - **team_a_name / team_b_name**: 表示用チーム名
    - **focus_team**: AI コーチングの対象チーム（0 or 1）
    """
    filename = file.filename or "upload"
    file_ext = os.path.splitext(filename)[1].lower()
    allowed = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.jpg', '.jpeg', '.png', '.bmp', '.webp'}
    if file_ext not in allowed:
        raise HTTPException(status_code=400, detail="対応していないファイル形式です")

    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルの保存に失敗しました: {e}")

    try:
        frames, frame_times = _load_analysis_frames(file_path)
    except ValueError as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=str(e))

    # 基準フレーム = 中央のフレーム（最も選手が検出できたものを優先）
    detections = []
    for frame in frames:
        try:
            detections.append(player_detector.detect(frame))
        except Exception:
            detections.append(None)
    valid = [(i, d) for i, d in enumerate(detections) if d is not None]
    if not valid:
        raise HTTPException(status_code=500, detail="選手検出に失敗しました")
    base_idx, detection = max(valid, key=lambda t: len(t[1].players))
    base_colors = _team_mean_colors(detection)

    # --- フォーメーション判定（基準フレーム） ---
    team_names = {0: team_a_name, 1: team_b_name}
    teams_payload = []
    team_formations = []
    for team_id in (0, 1):
        members = _team_members(detection, team_id)
        tf = _formation_for(detection, team_id)
        team_formations.append({"team": team_id, "formation": tf.formation, "confidence": tf.confidence})

        jersey_rgb = None
        if members:
            b, g, r = members[0][1].jersey_color_bgr
            jersey_rgb = f"#{r:02x}{g:02x}{b:02x}"

        teams_payload.append({
            "team": team_id,
            "name": team_names[team_id],
            "formation": tf.formation,
            "confidence": tf.confidence,
            "line_counts": tf.line_counts,
            "jersey_color": jersey_rgb,
            "players": [
                {
                    "index": pl.index,
                    "role": pl.role,
                    "is_goalkeeper": pl.is_goalkeeper,
                    "detected_x": round(pl.raw_x, 3),
                    "detected_y": round(pl.raw_y, 3),
                    "board_x": round(pl.snapped_x, 3),
                    "board_y": round(pl.snapped_y, 3),
                }
                for pl in tf.players
            ],
        })

    # --- 攻守局面別フォーメーション（動画のみ） ---
    phases = None
    if len(frames) >= 2:
        try:
            phases = _phase_formations(frames, base_colors)
        except Exception:
            phases = None

    # --- 戦術分析 ---
    team_positions = [
        [p.pitch_xy for p in detection.players if p.team == t and p.pitch_xy] for t in (0, 1)
    ]
    team_gk_indices = []
    for t in (0, 1):
        members = [p for p in detection.players if p.team == t and p.pitch_xy]
        gk_idx = next((i for i, p in enumerate(members) if p.is_goalkeeper), None)
        team_gk_indices.append(gk_idx)

    tactics = None
    coaching = None
    try:
        tactics = tactical_analyzer.analyze(team_positions, team_gk_indices, detection.ball_pitch_xy)
        coaching = tactical_coach.coach(tactics, team_formations, focus_team=focus_team)
    except Exception as e:
        tactics = tactics or {"error": f"戦術分析に失敗しました: {e}"}

    # --- 選手の向きサマリー（動画のみ・移動方向から推定） ---
    facing = None
    if len(frames) >= 2 and tactics and "attack_ltr" in tactics:
        try:
            facing = _facing_summary(
                detection, detections, base_idx, focus_team,
                tactics["attack_ltr"][focus_team],
            )
        except Exception:
            facing = None

    # --- 戦術スコア（成長記録用） ---
    tactical_scores = {}
    if tactics and "teams" in tactics:
        shape = next((t for t in tactics["teams"] if t["team"] == focus_team), None)
        if shape:
            tactical_scores = {
                "コンパクトネス": shape["compactness"],
                "守備ブロック": shape["defensive_block_score"],
                "攻撃の幅": shape["attack_width_score"],
            }
        passing = tactics.get("passing")
        if passing and passing.get("options"):
            tactical_scores["パス選択"] = int(round(passing["options"][0]["success"] * 100))

    # --- 前回比較 ---
    comparison = None
    try:
        comparison = _comparison_with_previous(tactical_scores) if tactical_scores else None
    except Exception:
        comparison = None

    result = {
        "id": file_id,
        "filename": filename,
        "created_at": datetime.now().isoformat(),
        "backend": detection.backend,
        "player_count": len(detection.players),
        "frames_analyzed": len([d for d in detections if d is not None]),
        "base_time": _format_time(frame_times[base_idx]) if len(frames) >= 2 else None,
        "facing_summary": facing,
        "teams": teams_payload,
        "phases": phases,
        "tactics": tactics,
        "coaching": coaching,
        "tactical_scores": tactical_scores,
        "comparison": comparison,
        "ball": {
            "x": round(detection.ball_pitch_xy[0], 3),
            "y": round(detection.ball_pitch_xy[1], 3),
        } if detection.ball_pitch_xy else None,
        "annotated_image": detection.annotated_image_b64,
        "pitch": {"length": 105, "width": 68},
    }

    # --- 保存（解析タイプスコア = フォーメーション判定の信頼度） ---
    best_conf = max((t["confidence"] for t in teams_payload), default=0)
    score = int(round(best_conf * 100)) if best_conf > 0 else None

    media_type = "video" if video_processor.is_video(file_path) else "image"
    payload = {k: v for k, v in result.items()}
    db.save_analysis(file_id, filename, media_type, "formation", score, payload)

    # 戦術スコアを成長記録として保存
    for skill, value in tactical_scores.items():
        if value is not None:
            db.record_skill_score(skill, int(value), file_id)

    return result

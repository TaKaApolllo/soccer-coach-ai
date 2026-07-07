"""フォーメーション解析 API

試合の画像・動画から選手とボールを検出し、チーム分類・
フォーメーション判定・2D 戦術ボード用の配置座標を返す。
"""

import os
import uuid
from datetime import datetime
from typing import Optional

import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app import db
from app.services.formation_analyzer import FormationAnalyzer
from app.services.player_detector import PlayerDetector
from app.services.video_processor import VideoProcessor

router = APIRouter()

video_processor = VideoProcessor()
player_detector = PlayerDetector()
formation_analyzer = FormationAnalyzer()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")


def _pick_frame(file_path: str):
    """動画なら中間フレーム、画像ならそのまま読み込む"""
    if video_processor.is_video(file_path):
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            raise ValueError("動画ファイルを開けません")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, total // 2))
        ok, frame = cap.read()
        cap.release()
        if not ok:
            raise ValueError("動画からフレームを取得できませんでした")
        return frame

    img = cv2.imread(file_path)
    if img is None:
        raise ValueError("画像ファイルを開けません")
    return img


@router.post("/formation/analyze")
async def analyze_formation(
    file: UploadFile = File(...),
    team_a_name: str = Form(default="チームA"),
    team_b_name: str = Form(default="チームB"),
    context: Optional[str] = Form(default=None),
):
    """フォーメーション解析

    - **file**: 試合の画像または動画（俯瞰・放送映像）
    - **team_a_name / team_b_name**: 表示用チーム名
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
        frame = _pick_frame(file_path)
    except ValueError as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=str(e))

    try:
        detection = player_detector.detect(frame)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"選手検出に失敗しました: {e}")

    # チームごとにフォーメーション判定
    teams_payload = []
    team_names = {0: team_a_name, 1: team_b_name}
    for team_id in (0, 1):
        members = [(i, p) for i, p in enumerate(detection.players) if p.team == team_id and p.pitch_xy]
        gk_hint = next((i for i, p in members if p.is_goalkeeper), None)
        tf = formation_analyzer.analyze_team(
            positions=[p.pitch_xy for _, p in members],
            indices=[i for i, _ in members],
            gk_hint=gk_hint,
        )
        tf.team = team_id

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
                    "detected_x": round(pl.x, 3),
                    "detected_y": round(pl.y, 3),
                    "board_x": round(pl.snapped_x, 3),
                    "board_y": round(pl.snapped_y, 3),
                }
                for pl in tf.players
            ],
        })

    result = {
        "id": file_id,
        "filename": filename,
        "created_at": datetime.now().isoformat(),
        "backend": detection.backend,
        "player_count": len(detection.players),
        "teams": teams_payload,
        "ball": {
            "x": round(detection.ball_pitch_xy[0], 3),
            "y": round(detection.ball_pitch_xy[1], 3),
        } if detection.ball_pitch_xy else None,
        "annotated_image": detection.annotated_image_b64,
        "pitch": {"length": 105, "width": 68},
    }

    # 戦術理解スキルとして記録（判定信頼度をスコア化）
    best_conf = max((t["confidence"] for t in teams_payload), default=0)
    score = int(round(best_conf * 100)) if best_conf > 0 else None

    media_type = "video" if video_processor.is_video(file_path) else "image"
    payload = {k: v for k, v in result.items() if k != "annotated_image"}
    payload["annotated_image"] = detection.annotated_image_b64
    db.save_analysis(file_id, filename, media_type, "formation", score, payload)

    return result

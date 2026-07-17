"""フォーム解析 API（骨格推定）

動画・画像から骨格推定を行い、関節角度・フォームスコア・
ネオンスケルトンのオーバーレイ画像・AI コーチングを返す。
"""

import os
import uuid
from datetime import datetime
from typing import Optional

import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app import db
from app.services import capture_quality as quality
from app.services.ai_analyzer import AIAnalyzer
from app.services.pose_estimator import PoseEstimator, PoseUnavailableError
from app.services.video_processor import VideoProcessor

router = APIRouter()

video_processor = VideoProcessor()
pose_estimator = PoseEstimator()
ai_analyzer = AIAnalyzer()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")


def _load_frames(file_path: str, max_frames: int = 10):
    """アップロードファイルから解析用フレーム (BGR)・インデックス・fps・メタ情報を取り出す"""
    if video_processor.is_video(file_path):
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            raise ValueError("動画ファイルを開けません")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or None
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or None
        indices = (
            list(range(total))
            if total <= max_frames
            else [int(i * total / max_frames) for i in range(max_frames)]
        )
        frames = []
        kept_indices = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if ok:
                frames.append(frame)
                kept_indices.append(idx)
        cap.release()
        if not frames:
            raise ValueError("動画からフレームを取得できませんでした")
        meta = quality.VideoMeta(
            width=width or frames[0].shape[1],
            height=height or frames[0].shape[0],
            fps=fps if fps > 0 else None,
            duration_sec=total / fps if fps > 0 and total > 0 else None,
            frame_count=total,
            is_video=True,
        )
        return frames, kept_indices, fps, meta

    img = cv2.imread(file_path)
    if img is None:
        raise ValueError("画像ファイルを開けません")
    meta = quality.VideoMeta(
        width=img.shape[1], height=img.shape[0],
        fps=None, duration_sec=None, frame_count=1, is_video=False,
    )
    return [img], [0], 0.0, meta


def _video_meta_payload(meta: "quality.VideoMeta") -> dict:
    """契約 v1.0 の video フィールド用に保存するメタ情報"""
    return {
        "width": meta.width,
        "height": meta.height,
        "fps": round(meta.fps, 2) if meta.fps else None,
        "duration_ms": round(meta.duration_sec * 1000) if meta.duration_sec else None,
        "orientation": meta.orientation,
    }


def _assess_quality(meta, frames, pose_result) -> dict:
    """撮影品質評価を組み立てる（判定本体は services/capture_quality の純粋関数）"""
    stats_list = [quality.image_stats(f) for f in frames]
    landmarks_by_frame = (
        [fr.get("landmarks") or [] for fr in pose_result["frames"]] if pose_result else []
    )
    person_ratios = (
        [fr.get("person_ratio") for fr in pose_result["frames"]] if pose_result else None
    )
    # 複数人判定（HOG 近似）。重い処理のため最大3フレームに間引く
    person_counts = None
    try:
        step = max(1, len(frames) // 3)
        sample = frames[::step][:3]
        person_counts = [
            quality.person_count_from_bboxes(quality.detect_person_bboxes(f))
            for f in sample
        ]
    except Exception:
        person_counts = None

    assessment = quality.assess_capture_quality(
        meta, stats_list, landmarks_by_frame, person_ratios, person_counts
    )
    return assessment.to_payload()


@router.post("/pose/analyze")
async def analyze_pose(
    file: UploadFile = File(...),
    analysis_type: str = Form(default="kick"),
    context: Optional[str] = Form(default=None),
    face_mode: str = Form(default="real"),
):
    """骨格推定によるフォーム解析

    - **file**: 動画または画像
    - **analysis_type**: kick / pass / dribble など
    - **context**: 追加のコンテキスト情報
    - **face_mode**: real（実写のまま）/ avatar（アニメ風アバターで顔を隠す）
    """
    if face_mode not in ("real", "avatar"):
        face_mode = "real"
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
        frames, frame_indices, fps, video_meta = _load_frames(file_path)
    except ValueError as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=str(e))

    # 撮影品質プリチェック（解像度・長さ・FPS）。critical なら解析を中止し、
    # 再撮影指示つきの構造化応答を返す（500 や解析続行はしない）
    pre_warnings, pre_instructions = quality.precheck_video(video_meta)
    if pre_warnings:
        capture_quality_payload = {
            "score": None,
            "status": "unavailable",
            "level": "critical",
            "camera_view": "unknown",
            "full_body_visible": False,
            "single_person_detected": False,
            "person_scale_score": None,
            "brightness_score": None,
            "blur_score": None,
            "keypoint_coverage": None,
            "warnings": pre_warnings,
            "retake_instructions": pre_instructions,
            "angle_metrics_restricted": True,
            "metric_confidences": {},
            "unreliable_frame_indices": [],
        }
        ai_feedback = {
            "analysis_type": analysis_type,
            "raw_analysis": "",
            "score": None,
            "sections": {
                "good_points": "",
                "improvements": "",
                "advice": "",
                "reference_player": "",
                "practice_menu": "",
            },
            "note": "撮影品質が基準を満たさなかったため、解析を中止しました。",
        }
        payload = {
            "pose": None,
            "pose_error": " / ".join(pre_warnings),
            "ai_feedback": ai_feedback,
            "ball_speed": None,
            "kick_angle_range": None,
            "frame_times": None,
            "duration": video_meta.duration_sec,
            "context": context,
            "capture_quality": capture_quality_payload,
            "video_meta": _video_meta_payload(video_meta),
        }
        media_type = "video" if video_meta.is_video else "image"
        db.save_analysis(file_id, filename, media_type, analysis_type, None, payload)
        return {
            "id": file_id,
            "filename": filename,
            "analysis_type": analysis_type,
            "created_at": datetime.now().isoformat(),
            "score": None,
            **payload,
        }

    # 骨格推定
    pose_result = None
    pose_error = None
    try:
        pose_result = pose_estimator.analyze_frames(frames, face_mode=face_mode)
    except PoseUnavailableError as e:
        pose_error = str(e)
    except Exception as e:
        pose_error = f"骨格推定に失敗しました: {e}"

    # 骨格が実際に検出できたかどうか（検出ゼロの 0 点は成長記録に残さない）
    pose_detected = bool(pose_result and pose_result.get("score_breakdown"))

    # AI コーチング（骨格の計測値をプロンプトに反映）
    images_b64 = [pose_estimator._to_base64(f) for f in frames[:4]]
    ai_feedback = ai_analyzer.analyze_play(
        images_base64=images_b64,
        analysis_type=analysis_type,
        additional_context=context,
        pose_metrics=pose_result.get("metrics") if pose_detected else None,
        pose_score=pose_result.get("score") if pose_detected else None,
    )

    score = pose_result.get("score") if pose_detected else ai_feedback.get("score")

    # HUD 表示用の計測値: ボール初速（動画のみ・概算）と蹴り足の膝角度レンジ
    ball_speed = None
    kick_angle_range = None
    if pose_detected:
        if fps > 0:
            try:
                ball_speed = pose_estimator.estimate_ball_speed(
                    frames, frame_indices, fps, pose_result["frames"]
                )
            except Exception:
                ball_speed = None
        # 自分の過去解析の平均初速との差分
        if ball_speed is not None:
            past_speeds = []
            for item in db.list_analyses(limit=20, include_payload=True):
                bs = item.get("analysis", {}).get("ball_speed")
                if bs and bs.get("speed_kmh"):
                    past_speeds.append(bs["speed_kmh"])
            if past_speeds:
                avg = sum(past_speeds) / len(past_speeds)
                ball_speed["delta_vs_avg"] = round(ball_speed["speed_kmh"] - avg)
        knee_angles = [
            min(a for a in (f["angles"].get("left_knee"), f["angles"].get("right_knee")) if a is not None)
            for f in pose_result["frames"]
            if f["angles"].get("left_knee") is not None or f["angles"].get("right_knee") is not None
        ]
        if knee_angles:
            kick_angle_range = {"min": round(min(knee_angles)), "max": round(max(knee_angles))}

    # スクラバー用のフレーム時刻（秒）と総再生時間
    frame_times = [round(idx / fps, 2) for idx in frame_indices] if fps > 0 else None
    duration = round(frame_indices[-1] / fps, 2) if fps > 0 and frame_indices else None

    # 撮影品質評価（画質実測 + キーポイント品質 + 複数人判定）
    try:
        capture_quality_payload = _assess_quality(video_meta, frames, pose_result)
    except Exception:
        capture_quality_payload = None  # 品質評価の失敗は解析自体を止めない

    payload = {
        "pose": pose_result,
        "pose_error": pose_error,
        "ai_feedback": ai_feedback,
        "ball_speed": ball_speed,
        "kick_angle_range": kick_angle_range,
        "frame_times": frame_times,
        "duration": duration,
        "context": context,
        "capture_quality": capture_quality_payload,
        "video_meta": _video_meta_payload(video_meta),
    }

    media_type = "video" if video_processor.is_video(file_path) else "image"
    db.save_analysis(file_id, filename, media_type, analysis_type, score, payload)

    return {
        "id": file_id,
        "filename": filename,
        "analysis_type": analysis_type,
        "created_at": datetime.now().isoformat(),
        "score": score,
        "pose": pose_result,
        "pose_error": pose_error,
        "ball_speed": ball_speed,
        "kick_angle_range": kick_angle_range,
        "frame_times": frame_times,
        "duration": duration,
        "ai_feedback": ai_feedback,
        "capture_quality": capture_quality_payload,
        "video_meta": _video_meta_payload(video_meta),
    }

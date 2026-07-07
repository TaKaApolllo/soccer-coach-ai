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
from app.services.ai_analyzer import AIAnalyzer
from app.services.pose_estimator import PoseEstimator, PoseUnavailableError
from app.services.video_processor import VideoProcessor

router = APIRouter()

video_processor = VideoProcessor()
pose_estimator = PoseEstimator()
ai_analyzer = AIAnalyzer()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")


def _load_frames(file_path: str, max_frames: int = 8):
    """アップロードファイルから解析用フレーム (BGR) を取り出す"""
    if video_processor.is_video(file_path):
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            raise ValueError("動画ファイルを開けません")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        indices = (
            list(range(total))
            if total <= max_frames
            else [int(i * total / max_frames) for i in range(max_frames)]
        )
        frames = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if ok:
                frames.append(frame)
        cap.release()
        if not frames:
            raise ValueError("動画からフレームを取得できませんでした")
        return frames

    img = cv2.imread(file_path)
    if img is None:
        raise ValueError("画像ファイルを開けません")
    return [img]


@router.post("/pose/analyze")
async def analyze_pose(
    file: UploadFile = File(...),
    analysis_type: str = Form(default="kick"),
    context: Optional[str] = Form(default=None),
):
    """骨格推定によるフォーム解析

    - **file**: 動画または画像
    - **analysis_type**: kick / pass / dribble など
    - **context**: 追加のコンテキスト情報
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
        frames = _load_frames(file_path)
    except ValueError as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=str(e))

    # 骨格推定
    pose_result = None
    pose_error = None
    try:
        pose_result = pose_estimator.analyze_frames(frames)
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

    payload = {
        "pose": pose_result,
        "pose_error": pose_error,
        "ai_feedback": ai_feedback,
        "context": context,
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
        "ai_feedback": ai_feedback,
    }

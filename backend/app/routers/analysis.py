import os
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from app import db
from app.services.video_processor import VideoProcessor
from app.services.ai_analyzer import AIAnalyzer

router = APIRouter()

# サービスのインスタンス化
video_processor = VideoProcessor()
ai_analyzer = AIAnalyzer()

# アップロードディレクトリ
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")


class AnalysisResponse(BaseModel):
    id: str
    filename: str
    analysis_type: str
    created_at: str
    analysis: dict


class AnalysisHistory(BaseModel):
    analyses: list


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_media(
    file: UploadFile = File(...),
    analysis_type: str = Form(default="general"),
    context: Optional[str] = Form(default=None)
):
    """
    動画または画像をアップロードして解析

    - **file**: アップロードする動画/画像ファイル
    - **analysis_type**: 解析タイプ (kick, pass, positioning, movement, general)
    - **context**: 追加のコンテキスト情報
    """
    # ファイル拡張子の検証
    filename = file.filename
    file_ext = os.path.splitext(filename)[1].lower()

    allowed_extensions = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"対応していないファイル形式です。対応形式: {', '.join(allowed_extensions)}"
        )

    # ユニークなファイル名を生成
    file_id = str(uuid.uuid4())
    saved_filename = f"{file_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    # ファイルを保存
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルの保存に失敗しました: {str(e)}")

    # 画像/動画の処理
    try:
        if video_processor.is_video(file_path):
            images_base64 = video_processor.extract_frames(file_path)
        elif video_processor.is_image(file_path):
            images_base64 = [video_processor.process_image(file_path)]
        else:
            raise HTTPException(status_code=400, detail="対応していないファイル形式です")
    except Exception as e:
        # クリーンアップ
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"ファイルの処理に失敗しました: {str(e)}")

    # AI解析
    try:
        analysis_result = ai_analyzer.analyze_play(
            images_base64=images_base64,
            analysis_type=analysis_type,
            additional_context=context
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI解析に失敗しました: {str(e)}")

    # 結果を構築
    result = AnalysisResponse(
        id=file_id,
        filename=filename,
        analysis_type=analysis_type,
        created_at=datetime.now().isoformat(),
        analysis=analysis_result
    )

    # DB に保存（スキルスコア・達成バッジも自動更新）
    media_type = "video" if video_processor.is_video(file_path) else "image"
    db.save_analysis(
        file_id, filename, media_type, analysis_type,
        analysis_result.get("score"), analysis_result,
    )

    return result


@router.get("/history", response_model=AnalysisHistory)
async def get_history(limit: int = 100):
    """解析履歴を取得"""
    return AnalysisHistory(analyses=db.list_analyses(limit=limit))


@router.get("/history-latest/{analysis_type}")
async def get_latest_analysis(analysis_type: str):
    """指定タイプの最新解析結果（ペイロード込み）を取得

    ダッシュボードで前回の解析結果を復元するために使う。
    analysis_type に "pose" を指定すると骨格解析系
    （kick/pass/dribble など formation 以外）の最新を返す。
    """
    for item in db.list_analyses(limit=50, include_payload=True):
        if analysis_type == "pose":
            if item["analysis_type"] != "formation" and item.get("analysis", {}).get("pose"):
                return item
        elif item["analysis_type"] == analysis_type:
            return item
    raise HTTPException(status_code=404, detail="該当する解析結果がありません")


@router.get("/history/{analysis_id}/thumbnail")
async def get_analysis_thumbnail(analysis_id: str):
    """解析結果のサムネイル画像（キーフレーム）を返す"""
    import base64

    from fastapi import Response

    item = db.get_analysis(analysis_id)
    if item is None:
        raise HTTPException(status_code=404, detail="解析結果が見つかりません")

    payload = item.get("analysis", {})
    b64 = None
    pose_payload = payload.get("pose")
    if pose_payload and pose_payload.get("annotated_images"):
        key = pose_payload.get("key_frame_index", 0)
        images = pose_payload["annotated_images"]
        b64 = images[min(key, len(images) - 1)]
    elif payload.get("annotated_image"):
        b64 = payload["annotated_image"]

    if not b64:
        raise HTTPException(status_code=404, detail="サムネイルがありません")

    return Response(content=base64.b64decode(b64), media_type="image/jpeg")


@router.get("/history/{analysis_id}")
async def get_analysis(analysis_id: str):
    """特定の解析結果を取得"""
    analysis = db.get_analysis(analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="解析結果が見つかりません")
    return analysis


@router.delete("/history/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """解析結果を削除"""
    if not db.delete_analysis(analysis_id):
        raise HTTPException(status_code=404, detail="解析結果が見つかりません")

    # アップロードファイルも削除
    import glob
    for f in glob.glob(os.path.join(UPLOAD_DIR, f"{analysis_id}.*")):
        os.remove(f)

    return {"message": "削除しました"}


@router.get("/analysis-types")
async def get_analysis_types():
    """利用可能な解析タイプを取得"""
    return {
        "types": [
            {"id": "kick", "name": "キックフォーム分析", "description": "シュートやパスのキックフォームを詳細に分析"},
            {"id": "pass", "name": "パス分析", "description": "パスの精度、タイミング、コース選択を分析"},
            {"id": "dribble", "name": "ドリブル分析", "description": "ボールタッチ、重心移動、緩急を分析"},
            {"id": "positioning", "name": "ポジショニング分析", "description": "体の向き、足の位置、スペース認識を分析"},
            {"id": "movement", "name": "動き出し分析", "description": "オフ・ザ・ボールの動きを分析"},
            {"id": "general", "name": "総合分析", "description": "プレー全体を総合的に分析"}
        ]
    }

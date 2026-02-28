import os
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

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


# メモリ内で履歴を保存（本番環境ではDBを使用）
analysis_history = []


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

    # 履歴に保存
    analysis_history.append(result.model_dump())

    return result


@router.get("/history", response_model=AnalysisHistory)
async def get_history():
    """解析履歴を取得"""
    return AnalysisHistory(analyses=analysis_history)


@router.get("/history/{analysis_id}")
async def get_analysis(analysis_id: str):
    """特定の解析結果を取得"""
    for analysis in analysis_history:
        if analysis["id"] == analysis_id:
            return analysis

    raise HTTPException(status_code=404, detail="解析結果が見つかりません")


@router.delete("/history/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """解析結果を削除"""
    global analysis_history

    for i, analysis in enumerate(analysis_history):
        if analysis["id"] == analysis_id:
            # ファイルも削除
            file_path = os.path.join(UPLOAD_DIR, f"{analysis_id}.*")
            import glob
            for f in glob.glob(file_path):
                os.remove(f)

            analysis_history.pop(i)
            return {"message": "削除しました"}

    raise HTTPException(status_code=404, detail="解析結果が見つかりません")


@router.get("/analysis-types")
async def get_analysis_types():
    """利用可能な解析タイプを取得"""
    return {
        "types": [
            {"id": "kick", "name": "キックフォーム分析", "description": "シュートやパスのキックフォームを詳細に分析"},
            {"id": "pass", "name": "パス分析", "description": "パスの精度、タイミング、コース選択を分析"},
            {"id": "positioning", "name": "ポジショニング分析", "description": "体の向き、足の位置、スペース認識を分析"},
            {"id": "movement", "name": "動き出し分析", "description": "オフ・ザ・ボールの動きを分析"},
            {"id": "general", "name": "総合分析", "description": "プレー全体を総合的に分析"}
        ]
    }

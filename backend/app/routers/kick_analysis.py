"""キックフォーム分析 API v1.0（契約準拠エンドポイント）

設計判断:
    - 既存エンドポイント（/api/pose/analyze, /api/history*）は一切変更せず
      後方互換を維持する。契約 v1.0 は新設の /api/v1/kick-analysis* で提供
    - 応答はエンベロープ {analysis, source}:
        analysis = Pydantic で実行時検証済みの契約オブジェクト
        source   = 旧 API 互換の生ペイロード（フレーム画像等の表示素材）。
                   include_source=true のときのみ。契約本体に画像を
                   含めない（監査 H-1/H-2 のペイロード肥大対策の布石）
    - 変換・検証に失敗しても 500 で落とさず、status="failed" +
      warnings に理由を載せた構造化応答を返す（データ起因のエラー）。
      リソース自体が存在しない場合のみ 404
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app import db
from app.schemas.kick_analysis import (
    KickAnalysisEnvelope,
    KickAnalysisResult,
    KickHistoryEntry,
)
from app.services.kick_analysis_adapter import (
    failed_kick_analysis,
    kick_analysis_from_payload,
)

router = APIRouter()


def _history_entries(limit: int = 8) -> List[KickHistoryEntry]:
    """キックフォーム系（formation 以外）の履歴を契約形式で返す"""
    entries: List[KickHistoryEntry] = []
    for item in db.list_analyses(limit=50):
        if item["analysis_type"] == "formation":
            continue
        score = item.get("score")
        entries.append(
            KickHistoryEntry(
                analysis_id=item["id"],
                created_at=item["created_at"],
                overall_score=(
                    int(score) if score is not None and 0 <= score <= 100 else None
                ),
                thumbnail_url=(
                    f"/api/history/{item['id']}/thumbnail"
                    if item.get("media_type") in ("video", "image")
                    else None
                ),
            )
        )
        if len(entries) >= limit:
            break
    return entries


def _legacy_source(item: dict) -> dict:
    """旧 API（PoseAnalysisResponse）互換の生ペイロードを組み立てる"""
    payload = item.get("analysis") or {}
    return {
        "id": item["id"],
        "filename": item.get("filename", ""),
        "analysis_type": item.get("analysis_type", "kick"),
        "created_at": item.get("created_at", ""),
        "score": item.get("score"),
        "pose": payload.get("pose"),
        "pose_error": payload.get("pose_error"),
        "ball_speed": payload.get("ball_speed"),
        "kick_angle_range": payload.get("kick_angle_range"),
        "frame_times": payload.get("frame_times"),
        "duration": payload.get("duration"),
        "ai_feedback": payload.get("ai_feedback") or {},
    }


def _to_contract(item: dict) -> KickAnalysisResult:
    """DB レコード → 検証済み契約オブジェクト（失敗時は failed で構造化）"""
    analysis_id = item.get("id", "unknown")
    created_at = item.get("created_at", "")
    try:
        result = kick_analysis_from_payload(
            analysis_id=analysis_id,
            created_at=created_at,
            score=item.get("score"),
            payload=item.get("analysis") or {},
            history=_history_entries(),
        )
        # 実行時バリデーション（モデル構築時に検証済みだが、契約全体を再確認）
        KickAnalysisResult.model_validate(result.model_dump(by_alias=True))
        return result
    except (ValidationError, ValueError, TypeError, KeyError) as e:
        return failed_kick_analysis(analysis_id, created_at, str(e))


def _find_latest_pose_item() -> Optional[dict]:
    for item in db.list_analyses(limit=50, include_payload=True):
        if item["analysis_type"] != "formation" and (item.get("analysis") or {}).get("pose"):
            return item
    return None


@router.get("/v1/kick-analysis", response_model=dict)
async def list_kick_analyses(limit: int = 8):
    """解析履歴（契約 v1.0 の KickHistoryEntry[]）"""
    limit = max(1, min(limit, 50))
    return {
        "items": [e.model_dump(by_alias=True) for e in _history_entries(limit)]
    }


@router.get("/v1/kick-analysis/latest", response_model=KickAnalysisEnvelope, response_model_exclude_none=False)
async def get_latest_kick_analysis(include_source: bool = False):
    """最新のキックフォーム解析（契約 v1.0）

    - **include_source**: true でフレーム画像等を含む旧形式ペイロードを同梱
    """
    item = _find_latest_pose_item()
    if item is None:
        raise HTTPException(status_code=404, detail="キックフォーム解析の記録がありません")
    return KickAnalysisEnvelope(
        analysis=_to_contract(item),
        source=_legacy_source(item) if include_source else None,
    )


@router.get("/v1/kick-analysis/{analysis_id}", response_model=KickAnalysisEnvelope)
async def get_kick_analysis(analysis_id: str, include_source: bool = False):
    """指定 ID のキックフォーム解析（契約 v1.0）"""
    item = db.get_analysis(analysis_id)
    if item is None or item.get("analysis_type") == "formation":
        raise HTTPException(status_code=404, detail="解析結果が見つかりません")
    return KickAnalysisEnvelope(
        analysis=_to_contract(item),
        source=_legacy_source(item) if include_source else None,
    )

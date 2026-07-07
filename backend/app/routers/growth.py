"""成長記録 API

ダッシュボード・成長記録画面用のデータを提供する。
- スキルレーダー（直近 30 日 vs 前月）
- スキル推移（月次）
- 達成バッジ
- おすすめ練習ドリル
"""

from fastapi import APIRouter

from app import db

router = APIRouter()

# スコア帯に応じた練習ドリルの提案
DRILL_SUGGESTIONS = [
    (0, 50, "基礎ドリル: 壁当てインサイドキック 100 本（15分）", "kick"),
    (50, 70, "メッシ風ドリブルドリル: コーンジグザグ + 方向転換（15分）", "dribble"),
    (70, 85, "壁当てパス練習: ワンタッチコントロール（10分）", "pass"),
    (85, 101, "実戦ドリル: 2対1 突破からのフィニッシュ（20分）", "kick"),
]


@router.get("/growth/summary")
async def growth_summary():
    """ダッシュボード用サマリー"""
    radar = db.skill_radar(days=30)
    recent = db.list_analyses(limit=6)
    achievements = db.list_achievements()

    # 現在の弱点スキルに合わせて今日のドリルを提案
    current = radar["current"]
    if any(v > 0 for v in current):
        weakest_idx = min(
            (i for i, v in enumerate(current)),
            key=lambda i: current[i] if current[i] > 0 else 999,
        )
        avg_score = round(sum(v for v in current if v > 0) / max(1, sum(1 for v in current if v > 0)))
        drill = next(
            (d for lo, hi, d, _ in DRILL_SUGGESTIONS if lo <= avg_score < hi),
            DRILL_SUGGESTIONS[0][2],
        )
        focus_skill = radar["axes"][weakest_idx]
    else:
        drill = "まずは動画をアップロードして現在のフォームを解析しましょう（5分）"
        focus_skill = None

    return {
        "radar": radar,
        "recent_analyses": recent,
        "achievements": achievements[:5],
        "today_drill": {"menu": drill, "focus_skill": focus_skill},
    }


@router.get("/growth/trend")
async def growth_trend(months: int = 8):
    """月次スキル推移"""
    return db.skill_trend(months=months)


@router.get("/growth/tactical-trend")
async def growth_tactical_trend(months: int = 8):
    """月次の戦術スコア推移 + AI 成長コメント"""
    trend = db.tactical_trend(months=months)

    # 直近2回の比較から成長コメントを生成
    comments = []
    for entry in db.latest_tactical_scores(limit=2):
        records = entry["records"]
        if len(records) >= 2:
            delta = records[0]["score"] - records[1]["score"]
            if delta >= 5:
                comments.append(
                    f"{entry['skill']}が前回から +{delta} 向上しています。練習の成果が出ています。"
                )
            elif delta <= -5:
                comments.append(
                    f"{entry['skill']}が前回から {delta} 低下しています。次の練習でテーマにしましょう。"
                )
    if not comments and trend["months"]:
        comments.append("戦術スコアは安定しています。解析を続けて変化を追いかけましょう。")
    if not trend["months"]:
        comments.append("まだ戦術分析の記録がありません。戦術ボードから試合映像を解析してみましょう。")

    return {**trend, "growth_comments": comments}


@router.get("/growth/achievements")
async def growth_achievements():
    """達成バッジ一覧"""
    return {"achievements": db.list_achievements()}

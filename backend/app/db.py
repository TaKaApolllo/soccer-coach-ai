"""SQLite 永続化レイヤー

追加依存なし（標準ライブラリ sqlite3）で
- 解析履歴（フォーム解析・フォーメーション解析）
- スキルスコアの時系列（成長記録）
- 達成バッジ
を保存する。ペイロードは JSON カラムに格納する。
"""

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "soccer_coach.db")

_lock = threading.Lock()

# 解析タイプ → スキル名（レーダーチャートの軸）
SKILL_BY_ANALYSIS_TYPE = {
    "kick": "シュート",
    "pass": "パス",
    "dribble": "ドリブル",
    "positioning": "ポジショニング",
    "movement": "フィジカル",
    "general": "総合",
    "formation": "戦術理解",
}

SKILL_AXES = ["シュート", "パス", "ドリブル", "ポジショニング", "フィジカル"]

ACHIEVEMENT_RULES = [
    # (code, title, description, 判定関数への引数: skill, threshold)
    ("first_analysis", "はじめの一歩", "初めての AI 解析を完了", None, 1),
    ("kick_80", "ストライカーの素質", "キックフォーム精度 80 点以上を達成", "シュート", 80),
    ("kick_90", "メッシ級キック姿勢達成！", "キックフォーム精度 90 点以上を達成", "シュート", 90),
    ("pass_80", "司令塔の視野", "パス精度 80 点以上を達成", "パス", 80),
    ("streak_5", "継続は力なり", "解析を 5 回実施", None, 5),
    ("streak_20", "アナリストの相棒", "解析を 20 回実施", None, 20),
]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                media_type TEXT NOT NULL DEFAULT 'image',
                analysis_type TEXT NOT NULL,
                score INTEGER,
                created_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS skill_scores (
                id TEXT PRIMARY KEY,
                skill TEXT NOT NULL,
                score INTEGER NOT NULL,
                analysis_id TEXT,
                recorded_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS achievements (
                code TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                achieved_at TEXT NOT NULL
            );
            """
        )


# ----------------------------------------------------------------------
# 解析履歴
# ----------------------------------------------------------------------

def save_analysis(
    analysis_id: str,
    filename: str,
    media_type: str,
    analysis_type: str,
    score: Optional[int],
    payload: dict,
) -> None:
    now = datetime.now().isoformat()
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO analyses (id, filename, media_type, analysis_type, score, created_at, payload)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (analysis_id, filename, media_type, analysis_type, score, now, json.dumps(payload, ensure_ascii=False)),
        )

    if score is not None:
        skill = SKILL_BY_ANALYSIS_TYPE.get(analysis_type)
        if skill and skill in SKILL_AXES:
            record_skill_score(skill, score, analysis_id)

    _check_achievements(analysis_type, score)


def list_analyses(limit: int = 100, include_payload: bool = False) -> List[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    result = []
    for r in rows:
        item = {
            "id": r["id"],
            "filename": r["filename"],
            "media_type": r["media_type"],
            "analysis_type": r["analysis_type"],
            "score": r["score"],
            "created_at": r["created_at"],
        }
        if include_payload:
            item["analysis"] = json.loads(r["payload"])
        result.append(item)
    return result


def get_analysis(analysis_id: str) -> Optional[dict]:
    with _lock, _connect() as conn:
        r = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if r is None:
        return None
    return {
        "id": r["id"],
        "filename": r["filename"],
        "media_type": r["media_type"],
        "analysis_type": r["analysis_type"],
        "score": r["score"],
        "created_at": r["created_at"],
        "analysis": json.loads(r["payload"]),
    }


def delete_analysis(analysis_id: str) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
        conn.execute("DELETE FROM skill_scores WHERE analysis_id = ?", (analysis_id,))
        return cur.rowcount > 0


# ----------------------------------------------------------------------
# スキルスコア（成長記録）
# ----------------------------------------------------------------------

def record_skill_score(skill: str, score: int, analysis_id: Optional[str] = None) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO skill_scores (id, skill, score, analysis_id, recorded_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), skill, score, analysis_id, datetime.now().isoformat()),
        )


def skill_radar(days: int = 30) -> dict:
    """直近 N 日と、その前 N 日のスキル平均（レーダーチャート用）"""
    now = datetime.now()
    current_start = (now - timedelta(days=days)).isoformat()
    previous_start = (now - timedelta(days=days * 2)).isoformat()

    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT skill, score, recorded_at FROM skill_scores WHERE recorded_at >= ?",
            (previous_start,),
        ).fetchall()

    current = {axis: [] for axis in SKILL_AXES}
    previous = {axis: [] for axis in SKILL_AXES}
    for r in rows:
        if r["skill"] not in current:
            continue
        (current if r["recorded_at"] >= current_start else previous)[r["skill"]].append(r["score"])

    def avg(values):
        return round(sum(values) / len(values)) if values else 0

    return {
        "axes": SKILL_AXES,
        "current": [avg(current[a]) for a in SKILL_AXES],
        "previous": [avg(previous[a]) for a in SKILL_AXES],
    }


def skill_trend(months: int = 8) -> dict:
    """月ごとのスキル平均（推移チャート用）"""
    start = (datetime.now() - timedelta(days=months * 31)).isoformat()
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT skill, score, recorded_at FROM skill_scores WHERE recorded_at >= ? ORDER BY recorded_at",
            (start,),
        ).fetchall()

    buckets: dict = {}
    for r in rows:
        month = r["recorded_at"][:7]  # YYYY-MM
        buckets.setdefault(month, {}).setdefault(r["skill"], []).append(r["score"])

    months_sorted = sorted(buckets.keys())
    series = {}
    for axis in SKILL_AXES:
        points = []
        for m in months_sorted:
            values = buckets[m].get(axis)
            points.append(round(sum(values) / len(values)) if values else None)
        if any(p is not None for p in points):
            series[axis] = points

    return {"months": months_sorted, "series": series}


# ----------------------------------------------------------------------
# 達成バッジ
# ----------------------------------------------------------------------

def _check_achievements(analysis_type: str, score: Optional[int]) -> None:
    skill = SKILL_BY_ANALYSIS_TYPE.get(analysis_type)

    with _lock, _connect() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM analyses").fetchone()["c"]
        unlocked = {r["code"] for r in conn.execute("SELECT code FROM achievements").fetchall()}

        now = datetime.now().isoformat()
        for code, title, desc, target_skill, threshold in ACHIEVEMENT_RULES:
            if code in unlocked:
                continue
            earned = False
            if target_skill is None:
                earned = total >= threshold
            elif skill == target_skill and score is not None:
                earned = score >= threshold
            if earned:
                conn.execute(
                    "INSERT OR IGNORE INTO achievements (code, title, description, achieved_at) VALUES (?, ?, ?, ?)",
                    (code, title, desc, now),
                )


def list_achievements() -> List[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute("SELECT * FROM achievements ORDER BY achieved_at DESC").fetchall()
    return [dict(r) for r in rows]

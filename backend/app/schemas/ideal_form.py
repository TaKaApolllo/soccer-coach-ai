"""理想角度レンジの単一ソース（バックエンド側）

frontend/src/constants/idealForm.ts と値を完全一致させること。
レンジは pose_estimator.py の `_score` / `_RANKING_META` と整合している。
キーは key_angles[].key / KickMetric.id と共通。

TODO(api-contract-v1.1): metrics[].idealRange としてこの値を配布済み。
フロント側 constants/idealForm.ts を API 値参照に切り替えたら、
定義元はこのモジュールだけになる。
"""

from typing import Dict, Tuple

# key -> (label, min_deg, max_deg)
IDEAL_ANGLE_RANGES: Dict[str, Tuple[str, float, float]] = {
    "torso_lean": ("上半身の傾き", 5, 25),
    "pelvis_tilt": ("骨盤の傾き", 3, 15),
    "support_leg": ("支持脚の角度", 140, 175),
    "backswing": ("蹴り脚の振り上げ", 60, 110),
    "knee_impact": ("膝の角度（インパクト時）", 110, 150),
    "ankle_impact": ("足首の角度（インパクト時）", 120, 160),
    "follow_through": ("フォロースルー角度", 110, 150),
    "arm_extension": ("腕の開き", 90, 170),
}

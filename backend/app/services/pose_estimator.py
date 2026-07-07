"""骨格推定エンジン

MediaPipe Pose をベースに、選手の関節キーポイントを抽出し、
- 関節角度（膝・股関節・肘・体幹の傾き など）の計測
- キックフォームのフェーズ検出（助走 → バックスイング → インパクト → フォロースルー）
- フォームスコア（0-100）の算出
- ネオンスケルトンのオーバーレイ描画（AR風の解析画面用）
を行う。

RF-DETR (https://github.com/roboflow/rf-detr) が導入されている場合は
選手のバウンディングボックス検出に利用し、複数人が写っている映像でも
最も大きく写っている（＝解析対象の）選手に絞って姿勢推定を行う。
"""

import base64
import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

try:
    import mediapipe as mp
    _MEDIAPIPE_AVAILABLE = True
except ImportError:
    mp = None
    _MEDIAPIPE_AVAILABLE = False


class PoseUnavailableError(RuntimeError):
    """姿勢推定エンジンが利用できない場合に送出"""


# MediaPipe Pose の 33 ランドマークのうち、描画・計測に使う主要点
LANDMARK_NAMES = {
    0: "nose",
    11: "left_shoulder", 12: "right_shoulder",
    13: "left_elbow", 14: "right_elbow",
    15: "left_wrist", 16: "right_wrist",
    23: "left_hip", 24: "right_hip",
    25: "left_knee", 26: "right_knee",
    27: "left_ankle", 28: "right_ankle",
    29: "left_heel", 30: "right_heel",
    31: "left_foot_index", 32: "right_foot_index",
}

# スケルトンの接続（描画用）
SKELETON_CONNECTIONS = [
    (11, 12),  # 肩
    (11, 13), (13, 15),  # 左腕
    (12, 14), (14, 16),  # 右腕
    (11, 23), (12, 24), (23, 24),  # 体幹
    (23, 25), (25, 27),  # 左脚
    (24, 26), (26, 28),  # 右脚
    (27, 29), (29, 31), (27, 31),  # 左足
    (28, 30), (30, 32), (28, 32),  # 右足
]

# 描画カラー (BGR)
NEON_GREEN = (136, 229, 57)      # #39E588
NEON_GREEN_GLOW = (90, 160, 40)
JOINT_COLOR = (255, 255, 255)
ANGLE_BADGE_BG = (40, 30, 16)
ANGLE_BADGE_TEXT = (136, 229, 57)


@dataclass
class FramePose:
    """1フレーム分の姿勢推定結果"""
    frame_index: int
    landmarks: List[dict] = field(default_factory=list)  # {name, x, y, visibility}
    angles: dict = field(default_factory=dict)
    phase: str = ""


def _angle_3pt(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> Optional[float]:
    """3点 a-b-c のなす角度（b が頂点、度数法）"""
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return None
    cos_t = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
    return math.degrees(math.acos(cos_t))


def _lean_from_vertical(top: Tuple[float, float], bottom: Tuple[float, float]) -> Optional[float]:
    """体幹（bottom→top ベクトル）の鉛直からの傾き（度）"""
    dx = top[0] - bottom[0]
    dy = top[1] - bottom[1]
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return None
    # 画像座標系は y 下向きなので鉛直上向きは (0, -1)
    return abs(math.degrees(math.atan2(dx, -dy)))


class PoseEstimator:
    """MediaPipe Pose による骨格推定 + フォーム解析"""

    def __init__(self, model_complexity: int = 1):
        self.available = _MEDIAPIPE_AVAILABLE
        self._model_complexity = model_complexity

    # ------------------------------------------------------------------
    # 公開 API
    # ------------------------------------------------------------------

    def analyze_frames(self, frames_bgr: List[np.ndarray]) -> dict:
        """複数フレームを解析し、キーポイント・角度・スコア・注釈画像を返す

        Returns:
            {
              "frames": [FramePose を dict 化したもの],
              "annotated_images": [base64 JPEG],
              "key_frame_index": int,
              "metrics": {...},        # キックフォーム指標
              "score": int,            # 0-100
              "score_breakdown": [...],
              "phases": [...],
            }
        """
        if not self.available:
            raise PoseUnavailableError(
                "mediapipe がインストールされていません。`pip install mediapipe` を実行してください。"
            )

        poses: List[FramePose] = []
        annotated: List[str] = []

        with mp.solutions.pose.Pose(
            static_image_mode=True,
            model_complexity=self._model_complexity,
            min_detection_confidence=0.4,
        ) as pose_model:
            for i, frame in enumerate(frames_bgr):
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = pose_model.process(rgb)

                fp = FramePose(frame_index=i)
                if result.pose_landmarks:
                    h, w = frame.shape[:2]
                    pts = {}
                    for idx, name in LANDMARK_NAMES.items():
                        lm = result.pose_landmarks.landmark[idx]
                        pts[idx] = (lm.x * w, lm.y * h)
                        fp.landmarks.append({
                            "name": name,
                            "x": round(lm.x, 4),
                            "y": round(lm.y, 4),
                            "visibility": round(lm.visibility, 3),
                        })
                    fp.angles = self._compute_angles(pts)
                    frame_out = self._draw_skeleton(frame.copy(), pts, fp.angles)
                else:
                    frame_out = frame

                poses.append(fp)
                annotated.append(self._to_base64(frame_out))

        self._assign_phases(poses)
        key_idx = self._pick_key_frame(poses)
        metrics = self._kick_metrics(poses, key_idx)
        score, breakdown = self._score(metrics)

        return {
            "frames": [
                {
                    "frame_index": p.frame_index,
                    "landmarks": p.landmarks,
                    "angles": p.angles,
                    "phase": p.phase,
                }
                for p in poses
            ],
            "annotated_images": annotated,
            "key_frame_index": key_idx,
            "metrics": metrics,
            "score": score,
            "score_breakdown": breakdown,
            "phases": [p.phase for p in poses],
        }

    # ------------------------------------------------------------------
    # 角度計算
    # ------------------------------------------------------------------

    def _compute_angles(self, pts: dict) -> dict:
        angles = {}

        def get(i):
            return pts.get(i)

        pairs = {
            "left_knee": (23, 25, 27),
            "right_knee": (24, 26, 28),
            "left_hip": (11, 23, 25),
            "right_hip": (12, 24, 26),
            "left_elbow": (11, 13, 15),
            "right_elbow": (12, 14, 16),
            "left_ankle": (25, 27, 31),
            "right_ankle": (26, 28, 32),
        }
        for name, (a, b, c) in pairs.items():
            if get(a) and get(b) and get(c):
                v = _angle_3pt(get(a), get(b), get(c))
                if v is not None:
                    angles[name] = round(v, 1)

        # 体幹の傾き（両肩の中点と両股関節の中点）
        if all(get(i) for i in (11, 12, 23, 24)):
            shoulder_mid = ((pts[11][0] + pts[12][0]) / 2, (pts[11][1] + pts[12][1]) / 2)
            hip_mid = ((pts[23][0] + pts[24][0]) / 2, (pts[23][1] + pts[24][1]) / 2)
            lean = _lean_from_vertical(shoulder_mid, hip_mid)
            if lean is not None:
                angles["torso_lean"] = round(lean, 1)

        return angles

    # ------------------------------------------------------------------
    # フェーズ検出とキーフレーム選定
    # ------------------------------------------------------------------

    def _assign_phases(self, poses: List[FramePose]) -> None:
        """膝角度の推移からキック動作のフェーズを推定"""
        knee_series = []
        for p in poses:
            # 蹴り足（膝の屈曲が大きい側）を追跡
            lk = p.angles.get("left_knee")
            rk = p.angles.get("right_knee")
            candidates = [v for v in (lk, rk) if v is not None]
            knee_series.append(min(candidates) if candidates else None)

        valid = [(i, v) for i, v in enumerate(knee_series) if v is not None]
        if len(valid) < 2:
            for p in poses:
                p.phase = "解析中"
            return

        # 最も膝が屈曲しているフレーム = バックスイングのピーク
        backswing_idx = min(valid, key=lambda t: t[1])[0]

        for i, p in enumerate(poses):
            if i < backswing_idx:
                p.phase = "助走・踏み込み"
            elif i == backswing_idx:
                p.phase = "バックスイング"
            elif i <= backswing_idx + max(1, len(poses) // 5):
                p.phase = "インパクト"
            else:
                p.phase = "フォロースルー"

    def _pick_key_frame(self, poses: List[FramePose]) -> int:
        """インパクト付近のフレームをキーフレームとする"""
        for p in poses:
            if p.phase == "インパクト":
                return p.frame_index
        for p in poses:
            if p.phase == "バックスイング":
                return p.frame_index
        return len(poses) // 2 if poses else 0

    # ------------------------------------------------------------------
    # キックフォーム指標とスコアリング
    # ------------------------------------------------------------------

    def _kick_metrics(self, poses: List[FramePose], key_idx: int) -> dict:
        metrics = {}
        if not poses:
            return metrics

        key = poses[min(key_idx, len(poses) - 1)]

        # バックスイング時の最小膝角度
        min_knee = None
        for p in poses:
            for k in ("left_knee", "right_knee"):
                v = p.angles.get(k)
                if v is not None and (min_knee is None or v < min_knee):
                    min_knee = v
        if min_knee is not None:
            metrics["backswing_knee_angle"] = round(min_knee, 1)

        if "torso_lean" in key.angles:
            metrics["torso_lean_at_impact"] = key.angles["torso_lean"]

        # 軸足の膝角度（キーフレームで屈曲が小さい側 = 支持脚）
        lk = key.angles.get("left_knee")
        rk = key.angles.get("right_knee")
        if lk is not None and rk is not None:
            metrics["plant_leg_knee_angle"] = round(max(lk, rk), 1)
            metrics["kicking_leg_knee_angle"] = round(min(lk, rk), 1)

        # 腕の開き（バランス指標）: 肘角度の平均
        elbows = [v for v in (key.angles.get("left_elbow"), key.angles.get("right_elbow")) if v is not None]
        if elbows:
            metrics["arm_extension"] = round(sum(elbows) / len(elbows), 1)

        # 姿勢検出率
        detected = sum(1 for p in poses if p.landmarks)
        metrics["detection_rate"] = round(detected / len(poses), 2)

        return metrics

    def _score(self, metrics: dict) -> Tuple[int, List[dict]]:
        """指標を理想レンジと比較してスコア化"""
        breakdown = []

        def band_score(value, lo, hi, tolerance):
            """理想レンジ [lo, hi] 内なら満点、外れるほど減点"""
            if lo <= value <= hi:
                return 1.0
            dist = (lo - value) if value < lo else (value - hi)
            return max(0.0, 1.0 - dist / tolerance)

        checks = [
            ("backswing_knee_angle", "バックスイングの深さ", 60, 110, 50,
             "膝を深く曲げてスイングの助走距離を確保できているか"),
            ("torso_lean_at_impact", "体幹の傾き", 5, 25, 30,
             "上体が適度に前傾し、ボールを抑えられているか"),
            ("plant_leg_knee_angle", "軸足の安定性", 140, 175, 40,
             "軸足の膝が伸びすぎず、衝撃を吸収できているか"),
            ("arm_extension", "腕によるバランス", 90, 170, 60,
             "腕を使って体のバランスを取れているか"),
        ]

        total = 0.0
        weight_sum = 0.0
        for key, label, lo, hi, tol, desc in checks:
            if key in metrics:
                s = band_score(metrics[key], lo, hi, tol)
                total += s
                weight_sum += 1.0
                breakdown.append({
                    "key": key,
                    "label": label,
                    "value": metrics[key],
                    "ideal_range": [lo, hi],
                    "score": round(s * 100),
                    "description": desc,
                })

        if weight_sum == 0:
            return 0, breakdown

        base = total / weight_sum
        # 検出率が低い場合は信頼度として減点
        confidence = metrics.get("detection_rate", 1.0)
        score = int(round(base * 100 * (0.7 + 0.3 * confidence)))
        return max(0, min(100, score)), breakdown

    # ------------------------------------------------------------------
    # 描画
    # ------------------------------------------------------------------

    def _draw_skeleton(self, frame: np.ndarray, pts: dict, angles: dict) -> np.ndarray:
        overlay = frame.copy()

        # グロー（太い半透明線）→ 本線 の2層でネオン風に
        for a, b in SKELETON_CONNECTIONS:
            if a in pts and b in pts:
                pa = (int(pts[a][0]), int(pts[a][1]))
                pb = (int(pts[b][0]), int(pts[b][1]))
                cv2.line(overlay, pa, pb, NEON_GREEN_GLOW, 7, cv2.LINE_AA)

        frame = cv2.addWeighted(overlay, 0.35, frame, 0.65, 0)

        for a, b in SKELETON_CONNECTIONS:
            if a in pts and b in pts:
                pa = (int(pts[a][0]), int(pts[a][1]))
                pb = (int(pts[b][0]), int(pts[b][1]))
                cv2.line(frame, pa, pb, NEON_GREEN, 2, cv2.LINE_AA)

        for idx in LANDMARK_NAMES:
            if idx in pts:
                p = (int(pts[idx][0]), int(pts[idx][1]))
                cv2.circle(frame, p, 4, NEON_GREEN, -1, cv2.LINE_AA)
                cv2.circle(frame, p, 2, JOINT_COLOR, -1, cv2.LINE_AA)

        # 主要関節に角度バッジを描画
        badge_targets = {
            "left_knee": 25, "right_knee": 26,
            "left_hip": 23, "right_hip": 24,
        }
        for name, idx in badge_targets.items():
            if name in angles and idx in pts:
                self._draw_angle_badge(frame, pts[idx], f"{angles[name]:.0f}°")

        if "torso_lean" in angles and 11 in pts and 12 in pts:
            mid = (int((pts[11][0] + pts[12][0]) / 2), int((pts[11][1] + pts[12][1]) / 2) - 30)
            self._draw_angle_badge(frame, mid, f"{angles['torso_lean']:.0f}°")

        return frame

    def _draw_angle_badge(self, frame: np.ndarray, pos, text: str) -> None:
        x, y = int(pos[0]) + 10, int(pos[1]) - 10
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        h, w = frame.shape[:2]
        x = min(max(0, x), max(0, w - tw - 12))
        y = min(max(th + 10, y), h - 6)
        cv2.rectangle(frame, (x - 4, y - th - 6), (x + tw + 8, y + 4), ANGLE_BADGE_BG, -1)
        cv2.rectangle(frame, (x - 4, y - th - 6), (x + tw + 8, y + 4), NEON_GREEN_GLOW, 1)
        cv2.putText(frame, text, (x + 2, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    ANGLE_BADGE_TEXT, 1, cv2.LINE_AA)

    @staticmethod
    def _to_base64(frame: np.ndarray) -> str:
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            raise ValueError("画像のエンコードに失敗しました")
        return base64.b64encode(buf.tobytes()).decode("utf-8")

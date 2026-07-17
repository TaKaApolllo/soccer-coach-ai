"""撮影品質判定（キックフォーム分析）

動画・骨格ランドマークから撮影品質を評価し、
- 総合スコア（0-100）と各サブスコア
- 警告と具体的な再撮影ガイダンス
- ゲーティングレベル（ok / warning / critical）
- メトリクスごとのキーポイント信頼度
を算出する。

設計方針:
    - 判定はすべて純粋関数（フレーム画像・ランドマーク・メタ情報を引数で
      受け取る）。pose_estimator から分離してあり、捏造データを注入して
      ユニットテストできる
    - しきい値は app/config/capture_quality.py に集約（マジックナンバー禁止）
    - 測定不能は 0 にせず None で返す（契約 v1.0 の原則）
"""

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from app.config import capture_quality as cfg

# ランドマーク列の型: フレームごとの [{name, x, y, visibility}, ...]
LandmarksByFrame = Sequence[Sequence[dict]]
# bbox: (x, y, w, h) ピクセル or 正規化のどちらでも（IoU 計算は単位に不変）
BBox = Tuple[float, float, float, float]


# ----------------------------------------------------------------------
# 入出力データ構造
# ----------------------------------------------------------------------

@dataclass
class VideoMeta:
    """動画のメタ情報（routers/pose.py が OpenCV から取得して渡す）"""
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    duration_sec: Optional[float] = None
    frame_count: Optional[int] = None
    is_video: bool = True

    @property
    def orientation(self) -> str:
        if not self.width or not self.height:
            return "unknown"
        return "portrait" if self.height > self.width else "landscape"


@dataclass
class ImageStats:
    """1フレーム分の画質統計"""
    brightness: float   # 平均輝度 0-255
    contrast: float     # 輝度の標準偏差
    blur_variance: float  # Laplacian 分散（小さいほどブラー）


@dataclass
class QualityAssessment:
    """撮影品質の評価結果（payload["capture_quality"] として保存する dict の元）"""
    score: Optional[int]
    status: str                      # available / low_confidence / unavailable
    level: str                       # ok / warning / critical（ゲーティング）
    camera_view: str                 # side / front / rear / diagonal / unknown
    full_body_visible: bool
    single_person_detected: bool
    person_scale_score: Optional[int]
    brightness_score: Optional[int]
    blur_score: Optional[int]
    keypoint_coverage: Optional[int]
    warnings: List[str] = field(default_factory=list)
    retake_instructions: List[str] = field(default_factory=list)
    # 角度系メトリクスを low_confidence に制限するか（front/rear/unknown ビュー）
    angle_metrics_restricted: bool = False
    # メトリクス ID → キーポイント信頼度（0-1）
    metric_confidences: Dict[str, float] = field(default_factory=dict)
    # 主要関節の visibility が低く信頼できないフレーム番号
    unreliable_frame_indices: List[int] = field(default_factory=list)

    def to_payload(self) -> dict:
        return {
            "score": self.score,
            "status": self.status,
            "level": self.level,
            "camera_view": self.camera_view,
            "full_body_visible": self.full_body_visible,
            "single_person_detected": self.single_person_detected,
            "person_scale_score": self.person_scale_score,
            "brightness_score": self.brightness_score,
            "blur_score": self.blur_score,
            "keypoint_coverage": self.keypoint_coverage,
            "warnings": self.warnings,
            "retake_instructions": self.retake_instructions,
            "angle_metrics_restricted": self.angle_metrics_restricted,
            "metric_confidences": self.metric_confidences,
            "unreliable_frame_indices": self.unreliable_frame_indices,
        }


# ----------------------------------------------------------------------
# 画質統計（OpenCV。フレーム単位の純粋関数）
# ----------------------------------------------------------------------

def image_stats(frame_bgr: np.ndarray) -> ImageStats:
    """1フレームの明るさ・コントラスト・ブラーを計測する"""
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    # 明るさ: 輝度ヒストグラムの平均（= 画素平均）
    brightness = float(gray.mean())
    contrast = float(gray.std())
    blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return ImageStats(brightness=brightness, contrast=contrast, blur_variance=blur_variance)


def brightness_score_of(stats_list: Sequence[ImageStats]) -> Optional[int]:
    """平均輝度を 0-100 スコアへ（理想帯域内 = 100、外れるほど減点）"""
    if not stats_list:
        return None
    mean_b = float(np.mean([s.brightness for s in stats_list]))
    lo, hi = cfg.BRIGHTNESS_IDEAL_MIN, cfg.BRIGHTNESS_IDEAL_MAX
    if lo <= mean_b <= hi:
        return 100
    dist = (lo - mean_b) if mean_b < lo else (mean_b - hi)
    return int(round(max(0.0, 1.0 - dist / cfg.BRIGHTNESS_FALLOFF) * 100))


def blur_score_of(stats_list: Sequence[ImageStats]) -> Optional[int]:
    """Laplacian 分散を 0-100 スコアへ（大きいほどシャープ）"""
    if not stats_list:
        return None
    # 動画中で最もシャープなフレームで評価（全フレームブラーなら低スコア）
    best = max(s.blur_variance for s in stats_list)
    lo, hi = cfg.BLUR_ZERO_VARIANCE, cfg.BLUR_GOOD_VARIANCE
    ratio = (best - lo) / (hi - lo)
    return int(round(max(0.0, min(1.0, ratio)) * 100))


def contrast_of(stats_list: Sequence[ImageStats]) -> Optional[float]:
    if not stats_list:
        return None
    return float(np.mean([s.contrast for s in stats_list]))


# ----------------------------------------------------------------------
# 動画プリチェック（critical 判定。骨格推定の前に実行できる）
# ----------------------------------------------------------------------

def precheck_video(meta: VideoMeta) -> Tuple[List[str], List[str]]:
    """解像度・長さ・FPS の critical 判定

    Returns:
        (warnings, retake_instructions)。warnings が空でなければ critical。
    """
    warnings: List[str] = []
    instructions: List[str] = []

    if meta.width and meta.height:
        w, h = meta.width, meta.height
        # 縦動画は長辺で判定する（縦撮り自体は warning 扱い）
        long_side, short_side = max(w, h), min(w, h)
        if long_side < cfg.CRITICAL_MIN_WIDTH_PX or short_side < cfg.CRITICAL_MIN_HEIGHT_PX:
            warnings.append(
                f"解像度が低すぎます（{w}×{h}）。"
                f"{cfg.CRITICAL_MIN_WIDTH_PX}×{cfg.CRITICAL_MIN_HEIGHT_PX} 以上で撮影してください。"
            )
            instructions.append("カメラ設定で解像度を 720p 以上にして撮影し直してください。")

    if meta.is_video and meta.duration_sec is not None:
        if meta.duration_sec < cfg.CRITICAL_MIN_DURATION_SEC:
            warnings.append(
                f"動画が短すぎます（{meta.duration_sec:.1f}秒）。"
                f"助走からフォロースルーまで {cfg.CRITICAL_MIN_DURATION_SEC}秒以上を収めてください。"
            )
            instructions.append("キックの前後 1〜2 秒を含めて撮影し直してください。")
        elif meta.duration_sec > cfg.CRITICAL_MAX_DURATION_SEC:
            warnings.append(
                f"動画が長すぎます（{meta.duration_sec:.0f}秒 / 上限 {cfg.CRITICAL_MAX_DURATION_SEC:.0f}秒）。"
            )
            instructions.append("キック 1 本だけを含むようにトリミングしてください。")

    if meta.is_video and meta.fps is not None and meta.fps < cfg.CRITICAL_MIN_FPS:
        warnings.append(
            f"フレームレートが低すぎます（{meta.fps:.0f}fps / 最低 {cfg.CRITICAL_MIN_FPS:.0f}fps）。"
        )
        instructions.append("通常の動画モード（30fps 以上）で撮影し直してください。")

    return warnings, instructions


# ----------------------------------------------------------------------
# 複数人判定（bbox IoU 近似）
# ----------------------------------------------------------------------

def bbox_iou(a: BBox, b: BBox) -> float:
    ax1, ay1, ax2, ay2 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx1, by1, bx2, by2 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def person_count_from_bboxes(bboxes: Sequence[BBox]) -> int:
    """検出 bbox を IoU でクラスタリングして人数を近似する"""
    clusters: List[BBox] = []
    for box in bboxes:
        if all(bbox_iou(box, c) < cfg.MULTI_PERSON_IOU_THRESHOLD for c in clusters):
            clusters.append(box)
    return len(clusters)


_HOG = None


def detect_person_bboxes(frame_bgr: np.ndarray) -> List[BBox]:
    """HOG 歩行者検出による人物 bbox（複数人判定の近似プロバイダ）"""
    global _HOG
    if _HOG is None:
        _HOG = cv2.HOGDescriptor()
        _HOG.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    h, w = frame_bgr.shape[:2]
    # 検出速度のため幅 640 に縮小
    scale = min(1.0, 640.0 / max(1, w))
    small = cv2.resize(frame_bgr, (int(w * scale), int(h * scale))) if scale < 1.0 else frame_bgr
    rects, weights = _HOG.detectMultiScale(small, winStride=(8, 8), padding=(8, 8), scale=1.05)
    boxes: List[BBox] = []
    for (x, y, bw, bh), wt in zip(rects, list(weights) if weights is not None else []):
        if wt >= 0.5:  # 信頼度の低い検出は数えない
            boxes.append((x / scale, y / scale, bw / scale, bh / scale))
    return boxes


# ----------------------------------------------------------------------
# キーポイント系判定（純粋関数。捏造ランドマークで注入テスト可能）
# ----------------------------------------------------------------------

def _visible(lm: dict) -> bool:
    return (
        lm.get("visibility", 0) >= cfg.MIN_KEYPOINT_VISIBILITY
        and -cfg.IN_FRAME_MARGIN <= lm.get("x", -1) <= 1 + cfg.IN_FRAME_MARGIN
        and -cfg.IN_FRAME_MARGIN <= lm.get("y", -1) <= 1 + cfg.IN_FRAME_MARGIN
    )


def _lm_map(frame_landmarks: Sequence[dict]) -> Dict[str, dict]:
    return {lm["name"]: lm for lm in frame_landmarks}


def keypoint_coverage(landmarks_by_frame: LandmarksByFrame) -> Tuple[Optional[int], List[str]]:
    """全身キーポイントカバレッジ（%）と欠けているランドマーク名

    各必須ランドマークが「可視フレーム割合 >= REQUIRED_LANDMARK_FRAME_RATIO」
    を満たすかを数える。
    """
    detected = [f for f in landmarks_by_frame if f]
    if not detected:
        return None, list(cfg.REQUIRED_LANDMARKS)
    missing: List[str] = []
    covered = 0
    for name in cfg.REQUIRED_LANDMARKS:
        visible_frames = sum(
            1 for f in detected if name in _lm_map(f) and _visible(_lm_map(f)[name])
        )
        if visible_frames / len(detected) >= cfg.REQUIRED_LANDMARK_FRAME_RATIO:
            covered += 1
        else:
            missing.append(name)
    pct = int(round(covered / len(cfg.REQUIRED_LANDMARKS) * 100))
    return pct, missing


def person_height_ratio(landmarks_by_frame: LandmarksByFrame) -> Optional[float]:
    """人物の高さ（鼻〜足首）/ 画面高さ（正規化座標なのでそのまま比率）"""
    ratios: List[float] = []
    for f in landmarks_by_frame:
        lms = _lm_map(f) if f else {}
        nose = lms.get("nose")
        ankle = lms.get("left_ankle") or lms.get("right_ankle")
        if nose and ankle:
            h = abs(ankle["y"] - nose["y"])
            if h > 0.01:
                ratios.append(h)
    return float(np.median(ratios)) if ratios else None


def person_scale_score_of(ratio: Optional[float]) -> Optional[int]:
    """人物サイズ比率 → 0-100 スコア"""
    if ratio is None:
        return None
    lo, hi = cfg.IDEAL_MIN_PERSON_HEIGHT_RATIO, cfg.IDEAL_MAX_PERSON_HEIGHT_RATIO
    if lo <= ratio <= hi:
        return 100
    if ratio < lo:
        return int(round(max(0.0, ratio / lo) * 100))
    return int(round(max(0.0, 1.0 - (ratio - hi) / (1.0 - hi + 1e-6)) * 100))


def tracking_jitter(landmarks_by_frame: LandmarksByFrame) -> Optional[float]:
    """フレーム間の骨格 bbox 中心移動量の標準偏差（正規化座標）"""
    centers: List[Tuple[float, float]] = []
    for f in landmarks_by_frame:
        if not f:
            continue
        xs = [lm["x"] for lm in f]
        ys = [lm["y"] for lm in f]
        centers.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))
    if len(centers) < 3:
        return None
    dists = [
        math.hypot(c1[0] - c0[0], c1[1] - c0[1])
        for c0, c1 in zip(centers, centers[1:])
    ]
    return float(np.std(dists))


def classify_camera_view(landmarks_by_frame: LandmarksByFrame) -> str:
    """肩幅/人物高さの比と鼻の visibility からカメラビューを分類する"""
    ratios: List[float] = []
    nose_vis: List[float] = []
    for f in landmarks_by_frame:
        lms = _lm_map(f) if f else {}
        ls, rs = lms.get("left_shoulder"), lms.get("right_shoulder")
        nose = lms.get("nose")
        ankle = lms.get("left_ankle") or lms.get("right_ankle")
        if not (ls and rs and nose and ankle):
            continue
        height = abs(ankle["y"] - nose["y"])
        if height < 0.05:
            continue
        ratios.append(abs(ls["x"] - rs["x"]) / height)
        nose_vis.append(nose.get("visibility", 0.0))
    if not ratios:
        return "unknown"
    ratio = float(np.median(ratios))
    if ratio < cfg.VIEW_SIDE_MAX_SHOULDER_RATIO:
        return "side"
    if ratio >= cfg.VIEW_FRONTAL_MIN_SHOULDER_RATIO:
        return (
            "front"
            if float(np.median(nose_vis)) >= cfg.VIEW_FRONT_MIN_NOSE_VISIBILITY
            else "rear"
        )
    return "diagonal"


def frame_reliability(landmarks_by_frame: LandmarksByFrame) -> List[bool]:
    """主要関節（腰・膝・足首）の visibility が確保できているフレームか"""
    core = ("left_hip", "right_hip", "left_knee", "right_knee",
            "left_ankle", "right_ankle")
    result: List[bool] = []
    for f in landmarks_by_frame:
        lms = _lm_map(f) if f else {}
        ok = bool(f) and all(
            name in lms and lms[name].get("visibility", 0) >= cfg.FRAME_RELIABLE_MIN_VISIBILITY
            for name in core
        )
        result.append(ok)
    return result


def metric_confidences(landmarks_by_frame: LandmarksByFrame) -> Dict[str, float]:
    """メトリクス ID → 依存関節グループの最小信頼度（フレーム中央値）"""
    detected = [f for f in landmarks_by_frame if f]
    if not detected:
        return {mid: 0.0 for mid in cfg.METRIC_JOINT_DEPENDENCIES}

    # 関節ごとの visibility 中央値
    joint_conf: Dict[str, float] = {}
    joint_names = {name for deps in cfg.METRIC_JOINT_DEPENDENCIES.values() for name in deps}
    for name in joint_names:
        values = [
            _lm_map(f)[name].get("visibility", 0.0)
            for f in detected
            if name in _lm_map(f)
        ]
        joint_conf[name] = float(np.median(values)) if values else 0.0

    return {
        metric_id: round(min(joint_conf.get(name, 0.0) for name in deps), 3)
        for metric_id, deps in cfg.METRIC_JOINT_DEPENDENCIES.items()
    }


# ----------------------------------------------------------------------
# 総合評価
# ----------------------------------------------------------------------

# ランドマーク名 → 日本語（警告文用）
_LM_JA = {
    "nose": "頭", "left_shoulder": "左肩", "right_shoulder": "右肩",
    "left_hip": "左腰", "right_hip": "右腰", "left_knee": "左膝",
    "right_knee": "右膝", "left_ankle": "左足首", "right_ankle": "右足首",
    "left_foot_index": "左つま先", "right_foot_index": "右つま先",
}


def assess_capture_quality(
    meta: VideoMeta,
    stats_list: Sequence[ImageStats],
    landmarks_by_frame: LandmarksByFrame,
    person_area_ratios: Optional[Sequence[Optional[float]]] = None,
    person_counts_by_frame: Optional[Sequence[int]] = None,
) -> QualityAssessment:
    """撮影品質の総合評価（純粋関数）

    Args:
        meta: 動画メタ情報
        stats_list: フレームごとの画質統計
        landmarks_by_frame: フレームごとの骨格ランドマーク（未検出は空リスト）
        person_area_ratios: フレームごとの被写体占有率（セグメンテーション比率）
        person_counts_by_frame: フレームごとの検出人数（bbox IoU クラスタ数）
    """
    warnings: List[str] = []
    instructions: List[str] = []

    # ---- 1) 動画プリチェック（critical） ----
    pre_warnings, pre_instructions = precheck_video(meta)
    warnings.extend(pre_warnings)
    instructions.extend(pre_instructions)

    # ---- 2) 人物検出品質 ----
    total_frames = max(1, len(landmarks_by_frame))
    detected_frames = sum(1 for f in landmarks_by_frame if f)
    detection_ratio = detected_frames / total_frames

    person_missing = detection_ratio < cfg.CRITICAL_MIN_DETECTION_RATIO
    if person_missing:
        warnings.append("人物（骨格）を検出できませんでした。")
        instructions.append(
            "選手の全身（頭からつま先まで）が写るように、横から 3〜5m 離れて撮影してください。"
        )

    single_person = True
    if person_counts_by_frame:
        multi_frames = sum(1 for c in person_counts_by_frame if c > 1)
        if multi_frames / max(1, len(person_counts_by_frame)) > cfg.WARN_MULTI_PERSON_FRAME_RATIO:
            single_person = False
            warnings.append("複数の人物が写っています。解析対象を特定できない場合があります。")
            instructions.append("解析したい選手 1 人だけが写るように撮影してください。")

    scale_ratio = person_height_ratio(landmarks_by_frame)
    scale_score = person_scale_score_of(scale_ratio)
    if scale_ratio is not None and scale_ratio < cfg.WARN_MIN_PERSON_HEIGHT_RATIO:
        warnings.append("人物が小さすぎます。角度計測の精度が下がります。")
        instructions.append("カメラを 2〜3m ほど選手に近づけて撮影してください。")

    if person_area_ratios:
        valid = [r for r in person_area_ratios if r is not None]
        if valid and float(np.mean(valid)) < cfg.WARN_MIN_PERSON_AREA_RATIO:
            if not any("小さすぎます" in w for w in warnings):
                warnings.append("被写体が画面に対して小さすぎます。")
                instructions.append("カメラを選手に近づけるか、ズームして撮影してください。")

    jitter = tracking_jitter(landmarks_by_frame)
    if jitter is not None and jitter > cfg.WARN_MAX_CENTER_JITTER:
        warnings.append("骨格トラッキングが不安定です（手ブレ・誤検出の可能性）。")
        instructions.append("カメラを固定（三脚など）して撮影してください。")

    # ---- 3) 全身キーポイントカバレッジ ----
    coverage, missing = keypoint_coverage(landmarks_by_frame)
    full_body = coverage is not None and coverage >= cfg.FULL_BODY_MIN_COVERAGE_PCT
    if coverage is not None and not full_body and not person_missing:
        parts = "・".join(_LM_JA.get(m, m) for m in missing[:4])
        warnings.append(f"体の一部（{parts}）が画面から見切れています。")
        instructions.append(
            "カメラを 1m ほど後ろへ移動し、頭からつま先まで全身が写るようにしてください。"
        )

    # ---- 4) 画質 ----
    b_score = brightness_score_of(stats_list)
    contrast = contrast_of(stats_list)
    if b_score is not None and b_score < cfg.WARN_BRIGHTNESS_SCORE:
        warnings.append("映像が暗すぎる（または明るすぎる）ため、検出精度が下がります。")
        instructions.append("もう少し明るい場所か、日中の屋外で撮影してください。")
    elif contrast is not None and contrast < cfg.WARN_MIN_CONTRAST_STD:
        warnings.append("映像のコントラストが低く、輪郭が判別しづらい状態です。")
        instructions.append("背景と選手の服の色にコントラストがつく場所で撮影してください。")

    bl_score = blur_score_of(stats_list)
    if bl_score is not None and bl_score < cfg.WARN_BLUR_SCORE:
        warnings.append("モーションブラーが強く、関節位置の推定精度が下がります。")
        instructions.append(
            "明るい場所でシャッタースピードを確保するか、スポーツ撮影モードで撮影してください。"
        )

    if meta.orientation == "portrait":
        warnings.append("縦向きの動画です。助走が画面から外れやすくなります。")
        instructions.append("スマートフォンを横向きに構えて撮影してください。")

    # ---- 5) カメラビュー ----
    view = classify_camera_view(landmarks_by_frame)
    angle_restricted = (
        view not in cfg.ANGLE_RELIABLE_VIEWS and view not in cfg.ANGLE_SEMI_RELIABLE_VIEWS
    )
    if not person_missing:
        if view in ("front", "rear"):
            warnings.append(
                f"{'正面' if view == 'front' else '背面'}からの撮影のため、角度の計測は参考値になります。"
            )
            instructions.append("蹴り足側の真横から撮影すると、角度を正確に計測できます。")
        elif view == "unknown":
            warnings.append("撮影アングルを判定できませんでした。角度の計測は参考値になります。")
            instructions.append("選手の真横・腰の高さから撮影してください。")

    # ---- 6) キーポイント信頼度 ----
    reliability = frame_reliability(landmarks_by_frame)
    unreliable = [i for i, ok in enumerate(reliability) if not ok]
    if (
        detected_frames > 0
        and len(unreliable) / total_frames > cfg.WARN_MAX_UNRELIABLE_FRAME_RATIO
        and not person_missing
    ):
        warnings.append("主要な関節（腰・膝・足首）の検出が不安定なフレームが多くあります。")
        instructions.append("体の前に障害物がない位置から、全身が写るように撮影してください。")

    # ---- 総合スコア ----
    person_component = None
    if scale_score is not None:
        person_component = scale_score * detection_ratio
    elif detected_frames > 0:
        person_component = 60.0 * detection_ratio
    image_components = [s for s in (b_score, bl_score) if s is not None]
    image_component = float(np.mean(image_components)) if image_components else None
    view_component = float(cfg.VIEW_SCORES.get(view, cfg.VIEW_SCORES["unknown"]))

    weighted: List[Tuple[float, float]] = []
    if person_component is not None:
        weighted.append((person_component, cfg.SCORE_WEIGHT_PERSON))
    if coverage is not None:
        weighted.append((float(coverage), cfg.SCORE_WEIGHT_COVERAGE))
    if image_component is not None:
        weighted.append((image_component, cfg.SCORE_WEIGHT_IMAGE))
    if detected_frames > 0:
        weighted.append((view_component, cfg.SCORE_WEIGHT_VIEW))

    if person_missing:
        # 人物が検出できない場合、キーポイント系の品質は測定不能。
        # 画質だけで高スコアを出すと誤解を招くため None とする（0 埋めもしない）
        score: Optional[int] = None
    elif weighted:
        total_w = sum(w for _, w in weighted)
        score = int(round(sum(v * w for v, w in weighted) / total_w))
    else:
        score = None

    # ---- ゲーティングレベル ----
    if pre_warnings or person_missing:
        level = "critical"
        status = "unavailable"
    elif warnings:
        level = "warning"
        status = "low_confidence"
    else:
        level = "ok"
        status = (
            "available"
            if score is not None and score >= cfg.LOW_CONFIDENCE_QUALITY_SCORE
            else "low_confidence"
        )

    return QualityAssessment(
        score=score,
        status=status,
        level=level,
        camera_view=view,
        full_body_visible=full_body,
        single_person_detected=single_person,
        person_scale_score=scale_score,
        brightness_score=b_score,
        blur_score=bl_score,
        keypoint_coverage=coverage,
        warnings=warnings,
        retake_instructions=instructions,
        angle_metrics_restricted=angle_restricted,
        metric_confidences=metric_confidences(landmarks_by_frame),
        unreliable_frame_indices=unreliable,
    )

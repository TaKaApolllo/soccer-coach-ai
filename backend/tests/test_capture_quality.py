"""撮影品質判定の11条件テスト

画質系（明るさ/ブラー/解像度/長さ/向き）は OpenCV 合成フレーム・合成動画で実測。
キーポイント系（カバレッジ/ビュー分類/信頼度/スケール）は捏造ランドマークを
純粋関数 `assess_capture_quality` へ直接注入して検証する。

① 正常な横撮り ② 縦向き ③ 暗い ④ 低解像度 ⑤ 足首が見切れ
⑥ 人物が小さすぎ ⑦ 複数人 ⑧ 正面撮り ⑨ 強ブラー ⑩ 短すぎる動画
⑪ キーポイント欠損
"""

import cv2
import numpy as np
import pytest

from app.config import capture_quality as cfg
from app.services.capture_quality import (
    ImageStats,
    VideoMeta,
    assess_capture_quality,
    bbox_iou,
    classify_camera_view,
    image_stats,
    metric_confidences,
    person_count_from_bboxes,
    precheck_video,
)

# ----------------------------------------------------------------------
# フィクスチャ生成ヘルパー
# ----------------------------------------------------------------------

rng = np.random.default_rng(42)


def noise_frame(mean: int, size=(720, 1280)) -> np.ndarray:
    """テクスチャあり（シャープ・高コントラスト）なフレーム。mean で明るさを制御

    3チャンネル独立ノイズはグレースケール化で分散が約 1/√3 に落ちるため、
    単一チャンネルのノイズを複製して意図どおりのコントラストにする。
    """
    lo = max(0, mean - 50)
    hi = min(255, mean + 50)
    gray = rng.integers(lo, hi, size=size, dtype=np.uint8).astype(np.uint8)
    return cv2.merge([gray, gray, gray])


def flat_gradient_frame(size=(720, 1280)) -> np.ndarray:
    """なだらかなグラデーションのみ（Laplacian 分散 ≈ 0 = 強ブラー相当）"""
    row = np.linspace(110, 150, size[1], dtype=np.uint8)
    img = np.tile(row, (size[0], 1))
    return cv2.merge([img, img, img])


GOOD_META = VideoMeta(width=1280, height=720, fps=30.0, duration_sec=3.0, frame_count=90)


def make_landmarks(
    view: str = "side",
    height: float = 0.6,
    visibility: float = 0.95,
    top_y: float = 0.15,
    overrides: dict | None = None,
) -> list:
    """1フレーム分の捏造ランドマーク（正規化座標）"""
    ankle_y = top_y + height
    shoulder_y = top_y + height * 0.2
    hip_y = top_y + height * 0.5
    knee_y = top_y + height * 0.75

    if view == "side":
        sx = (0.50, 0.53)  # 肩がほぼ重なる（横向き）
        hx = (0.50, 0.53)
    else:  # front
        half = height * 0.28
        sx = (0.5 - half, 0.5 + half)  # 肩幅が広い（正面）
        hx = (0.5 - half * 0.7, 0.5 + half * 0.7)

    pts = {
        "nose": (0.5, top_y),
        "left_shoulder": (sx[0], shoulder_y),
        "right_shoulder": (sx[1], shoulder_y),
        "left_elbow": (sx[0] - 0.03, shoulder_y + height * 0.15),
        "right_elbow": (sx[1] + 0.03, shoulder_y + height * 0.15),
        "left_wrist": (sx[0] - 0.05, shoulder_y + height * 0.3),
        "right_wrist": (sx[1] + 0.05, shoulder_y + height * 0.3),
        "left_hip": (hx[0], hip_y),
        "right_hip": (hx[1], hip_y),
        "left_knee": (hx[0] - 0.02, knee_y),
        "right_knee": (hx[1] + 0.04, knee_y),
        "left_ankle": (hx[0] - 0.03, ankle_y),
        "right_ankle": (hx[1] + 0.08, ankle_y - height * 0.1),
        "left_foot_index": (hx[0] - 0.05, ankle_y + 0.02),
        "right_foot_index": (hx[1] + 0.12, ankle_y - height * 0.08),
    }
    frame = [
        {"name": name, "x": x, "y": y, "visibility": visibility}
        for name, (x, y) in pts.items()
    ]
    if overrides:
        for lm in frame:
            if lm["name"] in overrides:
                lm.update(overrides[lm["name"]])
    return frame


def frames_of(n: int = 8, **kwargs) -> list:
    return [make_landmarks(**kwargs) for _ in range(n)]


def good_stats(n: int = 8) -> list:
    return [image_stats(noise_frame(130)) for _ in range(min(n, 2))] * (n // 2 or 1)


# ----------------------------------------------------------------------
# ① 正常な横撮り
# ----------------------------------------------------------------------

class TestNormalSideCapture:
    def test_ok_level_and_high_score(self):
        result = assess_capture_quality(
            GOOD_META,
            good_stats(),
            frames_of(view="side"),
            person_area_ratios=[0.15] * 8,
            person_counts_by_frame=[1] * 8,
        )
        assert result.level == "ok"
        assert result.status == "available"
        assert result.camera_view == "side"
        assert result.full_body_visible is True
        assert result.single_person_detected is True
        assert result.keypoint_coverage == 100
        assert result.score is not None and result.score >= cfg.LOW_CONFIDENCE_QUALITY_SCORE
        assert result.warnings == []
        assert result.retake_instructions == []
        assert result.angle_metrics_restricted is False

    def test_metric_confidences_high(self):
        result = assess_capture_quality(GOOD_META, good_stats(), frames_of(view="side"))
        assert result.metric_confidences["knee_impact"] >= 0.9
        assert result.metric_confidences["torso_lean"] >= 0.9


# ----------------------------------------------------------------------
# ② 縦向き
# ----------------------------------------------------------------------

class TestPortraitOrientation:
    def test_portrait_yields_warning_with_instruction(self):
        meta = VideoMeta(width=720, height=1280, fps=30.0, duration_sec=3.0, frame_count=90)
        result = assess_capture_quality(meta, good_stats(), frames_of(view="side"))
        assert meta.orientation == "portrait"
        assert result.level == "warning"
        assert any("縦向き" in w for w in result.warnings)
        assert any("横向き" in i for i in result.retake_instructions)


# ----------------------------------------------------------------------
# ③ 暗い（OpenCV フレーム実測）
# ----------------------------------------------------------------------

class TestDarkVideo:
    def test_dark_frames_yield_low_brightness_score(self):
        dark = [image_stats(noise_frame(25)) for _ in range(3)]
        result = assess_capture_quality(GOOD_META, dark, frames_of(view="side"))
        assert result.brightness_score is not None
        assert result.brightness_score < cfg.WARN_BRIGHTNESS_SCORE
        assert any("暗すぎる" in w for w in result.warnings)
        assert any("明るい場所" in i for i in result.retake_instructions)
        assert result.level == "warning"

    def test_dark_synthetic_video_measured_via_opencv(self, tmp_path):
        """実際に動画ファイルへ書き出し、読み戻して実測する"""
        path = str(tmp_path / "dark.avi")
        writer = cv2.VideoWriter(
            path, cv2.VideoWriter_fourcc(*"MJPG"), 30.0, (640, 480)
        )
        for _ in range(30):
            writer.write(noise_frame(20, size=(480, 640)))
        writer.release()

        cap = cv2.VideoCapture(path)
        assert cap.isOpened()
        stats = []
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            stats.append(image_stats(frame))
        cap.release()
        assert len(stats) == 30
        result = assess_capture_quality(
            VideoMeta(width=640, height=480, fps=30.0, duration_sec=1.0, frame_count=30),
            stats,
            frames_of(view="side"),
        )
        assert result.brightness_score is not None
        assert result.brightness_score < cfg.WARN_BRIGHTNESS_SCORE


# ----------------------------------------------------------------------
# ④ 低解像度（critical）
# ----------------------------------------------------------------------

class TestLowResolution:
    def test_low_resolution_is_critical(self):
        meta = VideoMeta(width=320, height=240, fps=30.0, duration_sec=3.0, frame_count=90)
        warnings, instructions = precheck_video(meta)
        assert any("解像度" in w for w in warnings)
        assert any("720p" in i for i in instructions)

        result = assess_capture_quality(meta, good_stats(), frames_of(view="side"))
        assert result.level == "critical"
        assert result.status == "unavailable"

    def test_portrait_hd_is_not_low_resolution(self):
        # 縦 720×1280 は長辺判定で解像度 OK（縦向き警告のみ）
        meta = VideoMeta(width=720, height=1280, fps=30.0, duration_sec=3.0, frame_count=90)
        warnings, _ = precheck_video(meta)
        assert not any("解像度" in w for w in warnings)


# ----------------------------------------------------------------------
# ⑤ 足首が見切れ
# ----------------------------------------------------------------------

class TestAnkleCutOff:
    def test_ankles_out_of_frame_reduce_coverage(self):
        overrides = {
            "left_ankle": {"y": 1.08},
            "right_ankle": {"y": 1.1},
            "left_foot_index": {"y": 1.12},
            "right_foot_index": {"y": 1.15},
        }
        result = assess_capture_quality(
            GOOD_META, good_stats(), frames_of(view="side", overrides=overrides)
        )
        assert result.full_body_visible is False
        assert result.keypoint_coverage is not None and result.keypoint_coverage < 100
        assert any("見切れ" in w for w in result.warnings)
        assert any("後ろへ移動" in i for i in result.retake_instructions)
        assert result.level == "warning"


# ----------------------------------------------------------------------
# ⑥ 人物が小さすぎ
# ----------------------------------------------------------------------

class TestPersonTooSmall:
    def test_small_person_warns_to_move_closer(self):
        result = assess_capture_quality(
            GOOD_META, good_stats(), frames_of(view="side", height=0.12)
        )
        assert result.person_scale_score is not None
        assert result.person_scale_score < 60
        assert any("小さすぎます" in w for w in result.warnings)
        assert any("近づけて" in i for i in result.retake_instructions)
        assert result.level == "warning"

    def test_low_occupancy_also_warns(self):
        result = assess_capture_quality(
            GOOD_META,
            good_stats(),
            frames_of(view="side"),
            person_area_ratios=[0.005] * 8,
        )
        assert any("小さすぎます" in w for w in result.warnings)


# ----------------------------------------------------------------------
# ⑦ 複数人（bbox IoU 近似）
# ----------------------------------------------------------------------

class TestMultiplePeople:
    def test_disjoint_bboxes_count_as_two(self):
        boxes = [(0.1, 0.2, 0.2, 0.6), (0.6, 0.2, 0.2, 0.6)]
        assert person_count_from_bboxes(boxes) == 2

    def test_overlapping_bboxes_count_as_one(self):
        boxes = [(0.4, 0.2, 0.2, 0.6), (0.42, 0.22, 0.2, 0.6)]
        assert bbox_iou(boxes[0], boxes[1]) >= cfg.MULTI_PERSON_IOU_THRESHOLD
        assert person_count_from_bboxes(boxes) == 1

    def test_multi_person_frames_disable_single_person_flag(self):
        result = assess_capture_quality(
            GOOD_META,
            good_stats(),
            frames_of(view="side"),
            person_counts_by_frame=[2] * 8,
        )
        assert result.single_person_detected is False
        assert any("複数の人物" in w for w in result.warnings)
        assert any("1 人だけ" in i for i in result.retake_instructions)
        assert result.level == "warning"


# ----------------------------------------------------------------------
# ⑧ 正面撮り（角度系メトリクスの制限）
# ----------------------------------------------------------------------

class TestFrontCapture:
    def test_front_view_classified(self):
        assert classify_camera_view(frames_of(view="front")) == "front"
        assert classify_camera_view(frames_of(view="side")) == "side"

    def test_rear_view_when_nose_hidden(self):
        frames = frames_of(view="front", overrides={"nose": {"visibility": 0.1}})
        assert classify_camera_view(frames) == "rear"

    def test_front_view_restricts_angle_metrics(self):
        result = assess_capture_quality(GOOD_META, good_stats(), frames_of(view="front"))
        assert result.camera_view == "front"
        assert result.angle_metrics_restricted is True
        assert any("正面" in w for w in result.warnings)
        assert any("真横から" in i for i in result.retake_instructions)
        assert result.level == "warning"


# ----------------------------------------------------------------------
# ⑨ 強ブラー（OpenCV フレーム実測）
# ----------------------------------------------------------------------

class TestStrongBlur:
    def test_flat_frames_yield_low_blur_score(self):
        blurred = [image_stats(flat_gradient_frame()) for _ in range(3)]
        result = assess_capture_quality(GOOD_META, blurred, frames_of(view="side"))
        assert result.blur_score is not None
        assert result.blur_score < cfg.WARN_BLUR_SCORE
        assert any("ブラー" in w for w in result.warnings)
        assert any("スポーツ撮影モード" in i for i in result.retake_instructions)

    def test_sharp_frames_yield_high_blur_score(self):
        sharp = [image_stats(noise_frame(130)) for _ in range(3)]
        result = assess_capture_quality(GOOD_META, sharp, frames_of(view="side"))
        assert result.blur_score is not None and result.blur_score > 80


# ----------------------------------------------------------------------
# ⑩ 短すぎる動画（critical）
# ----------------------------------------------------------------------

class TestTooShortVideo:
    def test_short_video_is_critical(self):
        meta = VideoMeta(width=1280, height=720, fps=30.0, duration_sec=0.3, frame_count=9)
        warnings, instructions = precheck_video(meta)
        assert any("短すぎます" in w for w in warnings)
        assert any("前後 1〜2 秒" in i for i in instructions)

        result = assess_capture_quality(meta, good_stats(), frames_of(view="side"))
        assert result.level == "critical"
        assert result.status == "unavailable"

    def test_too_long_video_is_critical(self):
        meta = VideoMeta(width=1280, height=720, fps=30.0, duration_sec=120.0, frame_count=3600)
        warnings, _ = precheck_video(meta)
        assert any("長すぎます" in w for w in warnings)

    def test_low_fps_is_critical(self):
        meta = VideoMeta(width=1280, height=720, fps=5.0, duration_sec=3.0, frame_count=15)
        warnings, _ = precheck_video(meta)
        assert any("フレームレート" in w for w in warnings)


# ----------------------------------------------------------------------
# ⑪ キーポイント欠損
# ----------------------------------------------------------------------

class TestKeypointDropout:
    LOW_VIS = {
        "left_knee": {"visibility": 0.2},
        "right_knee": {"visibility": 0.2},
        "left_ankle": {"visibility": 0.15},
        "right_ankle": {"visibility": 0.15},
    }

    def test_low_visibility_joints_lower_metric_confidence(self):
        frames = frames_of(view="side", overrides=self.LOW_VIS)
        conf = metric_confidences(frames)
        assert conf["knee_impact"] <= 0.2       # 膝・足首依存 → 低信頼
        assert conf["torso_lean"] >= 0.9        # 肩・腰依存 → 影響なし

    def test_unreliable_frames_flagged(self):
        frames = frames_of(view="side", overrides=self.LOW_VIS)
        result = assess_capture_quality(GOOD_META, good_stats(), frames)
        assert len(result.unreliable_frame_indices) == len(frames)
        assert any("不安定" in w for w in result.warnings)
        assert result.level == "warning"

    def test_no_person_detected_is_critical(self):
        result = assess_capture_quality(GOOD_META, good_stats(), [[] for _ in range(8)])
        assert result.level == "critical"
        assert result.status == "unavailable"
        assert result.keypoint_coverage is None  # 0 埋めしない
        assert result.person_scale_score is None
        assert any("検出できませんでした" in w for w in result.warnings)
        assert any("横から" in i for i in result.retake_instructions)


# ----------------------------------------------------------------------
# しきい値がすべて設定ファイル由来であることの確認
# ----------------------------------------------------------------------

class TestThresholdsFromConfig:
    def test_config_has_named_thresholds(self):
        required = [
            "CRITICAL_MIN_WIDTH_PX", "CRITICAL_MIN_HEIGHT_PX",
            "CRITICAL_MIN_DURATION_SEC", "CRITICAL_MAX_DURATION_SEC",
            "CRITICAL_MIN_FPS", "CRITICAL_MIN_DETECTION_RATIO",
            "MULTI_PERSON_IOU_THRESHOLD", "WARN_MIN_PERSON_HEIGHT_RATIO",
            "WARN_MIN_PERSON_AREA_RATIO", "MIN_KEYPOINT_VISIBILITY",
            "REQUIRED_LANDMARK_FRAME_RATIO", "BRIGHTNESS_IDEAL_MIN",
            "BLUR_GOOD_VARIANCE", "FRAME_RELIABLE_MIN_VISIBILITY",
            "METRIC_JOINT_DEPENDENCIES", "VIEW_SCORES",
        ]
        for name in required:
            assert hasattr(cfg, name), f"config に {name} がありません"

    def test_threshold_changes_affect_judgement(self, monkeypatch):
        """しきい値が設定由来であること（差し替えると判定が変わる）"""
        meta = VideoMeta(width=1280, height=720, fps=30.0, duration_sec=3.0, frame_count=90)
        assert precheck_video(meta) == ([], [])
        monkeypatch.setattr(cfg, "CRITICAL_MIN_DURATION_SEC", 5.0)
        warnings, _ = precheck_video(meta)
        assert any("短すぎます" in w for w in warnings)

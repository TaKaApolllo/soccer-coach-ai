"""API 契約 v1.0 のテスト

① 正常レスポンスがスキーマ検証を通る
② 測定不能値（unavailable + null）の表現
③ low_confidence ケース
④ 必須フィールド欠落の検出
⑤ 不正 enum 値の検出
⑥ confidence / score の範囲外検出
⑦ 旧形式 → 新形式変換の正しさ
⑧ 旧 API の後方互換（既存レスポンスキーが壊れていない）
"""

import copy

import pytest
from pydantic import ValidationError

from app.schemas.ideal_form import IDEAL_ANGLE_RANGES
from app.schemas.kick_analysis import (
    AnalysisStatus,
    KickAnalysisResult,
    KickScores,
    MeasurementStatus,
    MetricStatus,
    MotionPhaseSegment,
    MotionPhaseType,
)
from app.services.kick_analysis_adapter import (
    LOW_CONFIDENCE_DETECTION_RATE,
    failed_kick_analysis,
    kick_analysis_from_payload,
)

# ----------------------------------------------------------------------
# フィクスチャ: routers/pose.py が保存する旧形式ペイロード（合成データ）
# ----------------------------------------------------------------------

LEGACY_PAYLOAD = {
    "pose": {
        "frames": [
            {"frame_index": 0, "landmarks": [], "angles": {}, "phase": "助走・踏み込み"},
            {"frame_index": 1, "landmarks": [], "angles": {}, "phase": "助走・踏み込み"},
            {"frame_index": 2, "landmarks": [], "angles": {}, "phase": "バックスイング"},
            {"frame_index": 3, "landmarks": [], "angles": {}, "phase": "インパクト"},
            {"frame_index": 4, "landmarks": [], "angles": {}, "phase": "フォロースルー"},
            {"frame_index": 5, "landmarks": [], "angles": {}, "phase": "フォロースルー"},
        ],
        "annotated_images": [],
        "key_frame_index": 3,
        "metrics": {
            "backswing_knee_angle": 95.0,
            "torso_lean_at_impact": 12.0,
            "plant_leg_knee_angle": 160.0,
            "arm_extension": 120.0,
            "detection_rate": 0.9,
        },
        "score": 82,
        "score_breakdown": [
            {"key": "backswing_knee_angle", "label": "バックスイングの深さ",
             "value": 95.0, "ideal_range": [60, 110], "score": 100, "description": ""},
        ],
        "phases": ["助走・踏み込み", "助走・踏み込み", "バックスイング",
                   "インパクト", "フォロースルー", "フォロースルー"],
        "key_angles": [
            {"key": "torso_lean", "label": "上半身の傾き", "label_en": "LEAN",
             "value": 12.0, "ideal": 10, "ideal_text": "理想 5〜25°"},
            {"key": "backswing", "label": "蹴り脚の振り上げ", "label_en": "BACKSWING",
             "value": 95.0, "ideal": 95, "ideal_text": "理想 95°"},
            {"key": "follow_through", "label": "フォロースルー角度", "label_en": "FOLLOW THROUGH",
             "value": 90.0, "ideal": 130, "ideal_text": "理想 130°"},
        ],
        "timeline": [
            {"frame_index": 0, "phase": "助走・踏み込み", "intensity": 10},
            {"frame_index": 1, "phase": "助走・踏み込み", "intensity": 40},
            {"frame_index": 2, "phase": "バックスイング", "intensity": 70},
            {"frame_index": 3, "phase": "インパクト", "intensity": 100},
            {"frame_index": 4, "phase": "フォロースルー", "intensity": 80},
            {"frame_index": 5, "phase": "フォロースルー", "intensity": 30},
        ],
        "body_part_scores": {
            "plant_leg": {"label": "軸足", "score": 82, "status": "good",
                          "comments": [], "angles": {"knee": 160.0}},
            "kicking_leg": {"label": "蹴り足", "score": 74, "status": "warn",
                            "comments": [], "angles": {}},
        },
        "improvement_rankings": [
            {"rank": 1, "part": "kicking_leg", "label": "蹴り足",
             "issue": "フォロースルーが浅い", "advice": "大きく振り抜きましょう",
             "delta_deg": 40.0, "severity": "high"},
        ],
    },
    "pose_error": None,
    "ai_feedback": {
        "analysis_type": "kick",
        "raw_analysis": "",
        "score": 82,
        "sections": {
            "good_points": "- 軸足が安定しています\n- 体幹の傾きが理想的です",
            "improvements": "",
            "advice": "",
            "reference_player": "",
            "practice_menu": "壁当てインサイドキック 100 本（15分）: 軸足の位置を毎回確認",
        },
    },
    "ball_speed": {"speed_kmh": 95, "approximate": True},
    "kick_angle_range": {"min": 60, "max": 170},
    "frame_times": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
    "duration": 1.0,
    "context": None,
}


def convert(payload=None, score=82, analysis_id="test-id", created_at="2026-07-16T10:00:00"):
    return kick_analysis_from_payload(
        analysis_id=analysis_id,
        created_at=created_at,
        score=score,
        payload=payload if payload is not None else copy.deepcopy(LEGACY_PAYLOAD),
    )


# ----------------------------------------------------------------------
# ① 正常レスポンスがスキーマ検証を通る
# ----------------------------------------------------------------------

class TestValidResponse:
    def test_adapter_output_passes_schema_validation(self):
        result = convert()
        dumped = result.model_dump(by_alias=True)
        revalidated = KickAnalysisResult.model_validate(dumped)
        assert revalidated.schema_version == "1.0"
        assert revalidated.status == AnalysisStatus.COMPLETED

    def test_camel_case_serialization(self):
        dumped = convert().model_dump(by_alias=True)
        assert "schemaVersion" in dumped
        assert "analysisId" in dumped
        assert "captureQuality" in dumped
        assert "durationMs" in dumped["video"]
        assert "measurementStatus" in dumped["metrics"][0]
        assert "idealRange" in dumped["metrics"][0]

    def test_units_and_ranges(self):
        result = convert()
        assert result.video.duration_ms == 1000  # 1.0 秒 → ms
        for seg in result.phases:
            assert 0.0 <= seg.confidence <= 1.0
        assert result.scores.overall is not None and 0 <= result.scores.overall <= 100


# ----------------------------------------------------------------------
# ② 測定不能値（unavailable + null）の表現
# ----------------------------------------------------------------------

class TestUnavailableValues:
    def test_missing_ball_speed_is_unavailable_not_zero(self):
        payload = copy.deepcopy(LEGACY_PAYLOAD)
        payload["ball_speed"] = None
        result = convert(payload)
        ball = next(m for m in result.metrics if m.id == "ball_speed")
        assert ball.value is None  # 0 ではなく null
        assert ball.measurement_status == MeasurementStatus.UNAVAILABLE
        assert ball.status == MetricStatus.UNKNOWN

    def test_no_pose_yields_null_scores_and_unavailable_quality(self):
        payload = copy.deepcopy(LEGACY_PAYLOAD)
        payload["pose"] = None
        payload["pose_error"] = "骨格推定に失敗しました"
        result = convert(payload, score=None)
        assert result.scores.overall is None
        assert result.scores.support_leg is None  # 0 になっていない
        assert result.capture_quality.score is None
        assert result.capture_quality.status == MeasurementStatus.UNAVAILABLE
        assert any("骨格推定に失敗" in w for w in result.capture_quality.warnings)

    def test_unmeasured_capture_quality_fields_are_null(self):
        result = convert()
        assert result.capture_quality.brightness_score is None  # #22 まで未計測
        assert result.capture_quality.blur_score is None
        assert result.capture_quality.camera_view.value == "unknown"


# ----------------------------------------------------------------------
# ③ low_confidence ケース
# ----------------------------------------------------------------------

class TestLowConfidence:
    def test_low_detection_rate_yields_low_confidence_status(self):
        payload = copy.deepcopy(LEGACY_PAYLOAD)
        payload["pose"]["metrics"]["detection_rate"] = 0.3
        result = convert(payload)
        assert 0.3 < LOW_CONFIDENCE_DETECTION_RATE
        assert result.status == AnalysisStatus.LOW_CONFIDENCE
        assert result.capture_quality.status == MeasurementStatus.LOW_CONFIDENCE
        assert result.capture_quality.score == 30
        angle = next(m for m in result.metrics if m.unit == "deg")
        assert angle.measurement_status == MeasurementStatus.LOW_CONFIDENCE
        assert len(result.capture_quality.warnings) > 0

    def test_no_detection_is_low_confidence_not_failed(self):
        payload = copy.deepcopy(LEGACY_PAYLOAD)
        payload["pose"]["score_breakdown"] = []
        result = convert(payload)
        assert result.status == AnalysisStatus.LOW_CONFIDENCE


# ----------------------------------------------------------------------
# ④ 必須フィールド欠落の検出
# ----------------------------------------------------------------------

class TestMissingRequiredFields:
    def test_missing_status_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        del dumped["status"]
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)

    def test_missing_capture_quality_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        del dumped["captureQuality"]
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)

    def test_unknown_extra_field_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        dumped["unexpectedField"] = 1
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)


# ----------------------------------------------------------------------
# ⑤ 不正 enum 値の検出
# ----------------------------------------------------------------------

class TestInvalidEnums:
    def test_invalid_analysis_status_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        dumped["status"] = "great"
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)

    def test_invalid_phase_type_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        dumped["phases"][0]["type"] = "windup"
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)

    def test_invalid_measurement_status_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        dumped["metrics"][0]["measurementStatus"] = "maybe"
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)

    def test_enum_values_match_ts_contract(self):
        assert {s.value for s in AnalysisStatus} == {
            "queued", "processing", "completed", "low_confidence", "failed"}
        assert {s.value for s in MeasurementStatus} == {
            "available", "low_confidence", "unavailable"}
        assert {s.value for s in MetricStatus} == {
            "excellent", "good", "warning", "poor", "unknown"}
        assert {s.value for s in MotionPhaseType} == {
            "approach", "backswing", "support_plant", "impact", "follow_through"}


# ----------------------------------------------------------------------
# ⑥ confidence / score の範囲外検出
# ----------------------------------------------------------------------

class TestRangeValidation:
    def test_confidence_above_one_rejected(self):
        with pytest.raises(ValidationError):
            MotionPhaseSegment(
                type=MotionPhaseType.IMPACT,
                start_frame=0, peak_frame=0, end_frame=1,
                confidence=1.5,
            )

    def test_negative_confidence_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        dumped["metrics"][0]["confidence"] = -0.1
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)

    def test_score_above_100_rejected(self):
        with pytest.raises(ValidationError):
            KickScores(overall=150)

    def test_negative_frame_rejected(self):
        dumped = convert().model_dump(by_alias=True)
        dumped["phases"][0]["startFrame"] = -1
        with pytest.raises(ValidationError):
            KickAnalysisResult.model_validate(dumped)


# ----------------------------------------------------------------------
# ⑦ 旧形式 → 新形式変換の正しさ
# ----------------------------------------------------------------------

class TestAdapterConversion:
    def test_japanese_phases_mapped_and_grouped(self):
        result = convert()
        types = [p.type for p in result.phases]
        assert types == [
            MotionPhaseType.APPROACH,
            MotionPhaseType.BACKSWING,
            MotionPhaseType.IMPACT,
            MotionPhaseType.FOLLOW_THROUGH,
        ]
        approach = result.phases[0]
        assert (approach.start_frame, approach.end_frame) == (0, 1)
        follow = result.phases[-1]
        assert (follow.start_frame, follow.end_frame) == (4, 5)
        # peakFrame は区間内で intensity 最大（フォロースルーは F4=80 > F5=30）
        assert follow.peak_frame == 4

    def test_detection_rate_becomes_confidence(self):
        result = convert()
        assert result.phases[0].confidence == pytest.approx(0.9)
        assert result.metrics[0].confidence == pytest.approx(0.9)
        assert result.capture_quality.score == 90

    def test_ideal_range_comes_from_single_source(self):
        result = convert()
        torso = next(m for m in result.metrics if m.id == "torso_lean")
        _, lo, hi = IDEAL_ANGLE_RANGES["torso_lean"]
        assert torso.ideal_range is not None
        assert (torso.ideal_range.min, torso.ideal_range.max) == (lo, hi)
        assert torso.status == MetricStatus.EXCELLENT  # 12° はレンジ中央帯

    def test_body_part_scores_mapped(self):
        result = convert()
        assert result.scores.support_leg == 82
        assert result.scores.kicking_leg == 74
        assert result.scores.upper_body is None  # 無い部位は null

    def test_follow_through_derived_score(self):
        # 90° はレンジ 110-150 の下限から 20° 外 → 1 - 20/40 = 0.5 → 50 点
        result = convert()
        assert result.scores.follow_through == 50

    def test_feedback_strengths_and_drills(self):
        result = convert()
        assert result.feedback.strengths == ["軸足が安定しています", "体幹の傾きが理想的です"]
        assert result.feedback.priorities[0].severity.value == "high"
        drill = result.feedback.drills[0]
        assert drill.duration_minutes == 15
        assert drill.title.startswith("壁当てインサイドキック")

    def test_failed_result_is_schema_valid(self):
        result = failed_kick_analysis("bad-id", "2026-07-16T10:00:00", "broken payload")
        dumped = result.model_dump(by_alias=True)
        revalidated = KickAnalysisResult.model_validate(dumped)
        assert revalidated.status == AnalysisStatus.FAILED
        assert revalidated.scores.overall is None
        assert len(revalidated.capture_quality.warnings) == 1


# ----------------------------------------------------------------------
# ⑦b 撮影品質評価（#22）が保存されたペイロードの変換
# ----------------------------------------------------------------------

STORED_QUALITY = {
    "score": 72,
    "status": "low_confidence",
    "level": "warning",
    "camera_view": "front",
    "full_body_visible": True,
    "single_person_detected": True,
    "person_scale_score": 88,
    "brightness_score": 95,
    "blur_score": 90,
    "keypoint_coverage": 100,
    "warnings": ["正面からの撮影のため、角度の計測は参考値になります。"],
    "retake_instructions": ["蹴り足側の真横から撮影すると、角度を正確に計測できます。"],
    "angle_metrics_restricted": True,
    "metric_confidences": {"torso_lean": 0.4},
    "unreliable_frame_indices": [],
}

STORED_VIDEO_META = {
    "width": 1280, "height": 720, "fps": 29.97,
    "duration_ms": 1000, "orientation": "landscape",
}


class TestStoredCaptureQuality:
    def _payload_with_quality(self, quality=None, video_meta=None):
        payload = copy.deepcopy(LEGACY_PAYLOAD)
        payload["capture_quality"] = quality if quality is not None else copy.deepcopy(STORED_QUALITY)
        payload["video_meta"] = video_meta if video_meta is not None else dict(STORED_VIDEO_META)
        return payload

    def test_stored_quality_is_preferred(self):
        result = convert(self._payload_with_quality())
        q = result.capture_quality
        assert q.camera_view.value == "front"
        assert q.person_scale_score == 88
        assert q.keypoint_coverage == 100
        assert q.retake_instructions == STORED_QUALITY["retake_instructions"]
        # スキーマ検証も通る（optional 拡張の後方互換）
        KickAnalysisResult.model_validate(result.model_dump(by_alias=True))

    def test_warning_level_downgrades_status(self):
        result = convert(self._payload_with_quality())
        assert result.status == AnalysisStatus.LOW_CONFIDENCE

    def test_critical_level_yields_failed(self):
        quality = dict(STORED_QUALITY, level="critical", status="unavailable")
        result = convert(self._payload_with_quality(quality=quality))
        assert result.status == AnalysisStatus.FAILED

    def test_ok_level_keeps_completed(self):
        quality = dict(
            STORED_QUALITY,
            level="ok", status="available", camera_view="side",
            angle_metrics_restricted=False, metric_confidences={},
            warnings=[], retake_instructions=[],
        )
        result = convert(self._payload_with_quality(quality=quality))
        assert result.status == AnalysisStatus.COMPLETED

    def test_angle_restriction_downgrades_deg_metrics_only(self):
        result = convert(self._payload_with_quality())
        for m in result.metrics:
            if m.unit == "deg":
                assert m.measurement_status == MeasurementStatus.LOW_CONFIDENCE
        ball = next(m for m in result.metrics if m.id == "ball_speed")
        assert ball.measurement_status == MeasurementStatus.LOW_CONFIDENCE  # 元々概算

    def test_metric_confidence_overridden_by_keypoint_confidence(self):
        result = convert(self._payload_with_quality())
        torso = next(m for m in result.metrics if m.id == "torso_lean")
        assert torso.confidence == pytest.approx(0.4)

    def test_unreliable_frame_downgrades_metric(self):
        quality = dict(
            STORED_QUALITY,
            angle_metrics_restricted=False, metric_confidences={},
            unreliable_frame_indices=[3],  # key_frame_index = 3
        )
        result = convert(self._payload_with_quality(quality=quality))
        torso = next(m for m in result.metrics if m.id == "torso_lean")
        assert torso.frame == 3
        assert torso.measurement_status == MeasurementStatus.LOW_CONFIDENCE

    def test_video_meta_fills_contract_video(self):
        result = convert(self._payload_with_quality())
        assert result.video.width == 1280
        assert result.video.height == 720
        assert result.video.fps == pytest.approx(29.97)
        assert result.video.duration_ms == 1000
        assert result.video.orientation.value == "landscape"

    def test_legacy_payload_without_quality_still_works(self):
        result = convert()  # capture_quality / video_meta なしの旧レコード
        assert result.video.fps is None
        assert result.capture_quality.retake_instructions == []
        assert result.status == AnalysisStatus.COMPLETED


# ----------------------------------------------------------------------
# ⑧ 旧 API の後方互換 + v1 エンドポイント
# ----------------------------------------------------------------------

LEGACY_HISTORY_KEYS = {"id", "filename", "media_type", "analysis_type", "score", "created_at"}


class TestEndpoints:
    def _seed(self, temp_db, payload=None):
        temp_db.save_analysis(
            "seed-1", "kick.mp4", "video", "kick", 82,
            payload if payload is not None else copy.deepcopy(LEGACY_PAYLOAD),
        )

    def test_legacy_history_latest_keys_unchanged(self, temp_db, api_client):
        self._seed(temp_db)
        r = api_client.get("/api/history-latest/pose")
        assert r.status_code == 200
        item = r.json()
        assert LEGACY_HISTORY_KEYS.issubset(item.keys())
        # 旧ペイロードのキーが壊れていない
        analysis = item["analysis"]
        for key in ("pose", "pose_error", "ai_feedback", "ball_speed",
                    "frame_times", "duration"):
            assert key in analysis
        assert "key_angles" in analysis["pose"]

    def test_legacy_history_list_unchanged(self, temp_db, api_client):
        self._seed(temp_db)
        r = api_client.get("/api/history")
        assert r.status_code == 200
        analyses = r.json()["analyses"]
        assert len(analyses) == 1
        assert LEGACY_HISTORY_KEYS.issubset(analyses[0].keys())

    def test_v1_latest_returns_valid_contract(self, temp_db, api_client):
        self._seed(temp_db)
        r = api_client.get("/api/v1/kick-analysis/latest")
        assert r.status_code == 200
        body = r.json()
        assert body["source"] is None
        analysis = KickAnalysisResult.model_validate(body["analysis"])
        assert analysis.analysis_id == "seed-1"
        assert analysis.status == AnalysisStatus.COMPLETED
        assert len(analysis.history) == 1

    def test_v1_include_source_matches_legacy_shape(self, temp_db, api_client):
        self._seed(temp_db)
        r = api_client.get("/api/v1/kick-analysis/latest?include_source=true")
        source = r.json()["source"]
        assert source is not None
        for key in ("id", "score", "created_at", "pose", "ai_feedback"):
            assert key in source
        assert source["id"] == "seed-1"

    def test_v1_malformed_payload_returns_failed_not_500(self, temp_db, api_client):
        # key_angles の value に文字列を混入させ、変換エラーを誘発
        broken = copy.deepcopy(LEGACY_PAYLOAD)
        broken["pose"]["key_angles"][0]["value"] = "not-a-number"
        self._seed(temp_db, broken)
        r = api_client.get("/api/v1/kick-analysis/latest")
        assert r.status_code == 200  # 500 で落ちない
        analysis = KickAnalysisResult.model_validate(r.json()["analysis"])
        assert analysis.status == AnalysisStatus.FAILED
        assert len(analysis.capture_quality.warnings) == 1

    def test_v1_not_found_returns_404(self, temp_db, api_client):
        r = api_client.get("/api/v1/kick-analysis/no-such-id")
        assert r.status_code == 404

    def test_v1_history_list(self, temp_db, api_client):
        self._seed(temp_db)
        r = api_client.get("/api/v1/kick-analysis?limit=5")
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["analysisId"] == "seed-1"
        assert items[0]["overallScore"] == 82
        assert items[0]["thumbnailUrl"] == "/api/history/seed-1/thumbnail"

"""旧 pose 解析ペイロード → API 契約 v1.0 への変換アダプタ

frontend/src/types/kickAnalysis.ts の `kickAnalysisFromPoseResponse` と
同一のロジック（鏡合わせ）。DB に保存済みの旧形式ペイロード
（routers/pose.py が構築する dict）を、検証済みの KickAnalysisResult
へ変換する。

変換で判断できない項目は unknown / None（null）で正直に返す。
測定不能を 0 で表現しない。
"""

import re
from typing import List, Optional

from app.schemas.ideal_form import IDEAL_ANGLE_RANGES
from app.schemas.kick_analysis import (
    AnalysisStatus,
    CameraView,
    CaptureQuality,
    FeedbackPriority,
    FeedbackSeverity,
    IdealRange,
    KickAnalysisResult,
    KickFeedback,
    KickHistoryEntry,
    KickMetric,
    KickScores,
    MeasurementStatus,
    MetricStatus,
    MotionPhaseSegment,
    MotionPhaseType,
    RecommendedDrill,
    VideoInfo,
    VideoOrientation,
)

# これ未満の骨格検出率は low_confidence として扱う（TS 側と同値）
LOW_CONFIDENCE_DETECTION_RATE = 0.5

# 現行バックエンドの日本語フェーズ名 → enum
_PHASE_TYPE_BY_LABEL = {
    "助走・踏み込み": MotionPhaseType.APPROACH,
    "バックスイング": MotionPhaseType.BACKSWING,
    "インパクト": MotionPhaseType.IMPACT,
    "フォロースルー": MotionPhaseType.FOLLOW_THROUGH,
}

_SEVERITIES = {s.value for s in FeedbackSeverity}


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def metric_status_for(value: Optional[float], ideal: Optional[IdealRange]) -> MetricStatus:
    """理想レンジに対する評価（TS metricStatusFor と同一）"""
    if value is None or ideal is None:
        return MetricStatus.UNKNOWN
    width = ideal.max - ideal.min
    if ideal.min <= value <= ideal.max:
        center_lo = ideal.min + width * 0.25
        center_hi = ideal.max - width * 0.25
        return (
            MetricStatus.EXCELLENT
            if center_lo <= value <= center_hi
            else MetricStatus.GOOD
        )
    dist = ideal.min - value if value < ideal.min else value - ideal.max
    return MetricStatus.WARNING if dist <= width * 0.25 else MetricStatus.POOR


def _phase_segments(pose: dict, confidence: float) -> List[MotionPhaseSegment]:
    """フレーム列（日本語フェーズ付き）→ フェーズ区間リスト"""
    frames = pose.get("frames") or []
    timeline = pose.get("timeline") or []
    segments: List[dict] = []
    current: Optional[dict] = None

    for frame in frames:
        phase_type = _PHASE_TYPE_BY_LABEL.get(frame.get("phase", ""))
        idx = frame.get("frame_index", 0)
        if phase_type is None:
            current = None
            continue
        if current is not None and current["type"] == phase_type:
            current["end"] = idx
        else:
            current = {"type": phase_type, "start": idx, "end": idx}
            segments.append(current)

    result = []
    for seg in segments:
        # peakFrame: 区間内で動作強度が最大のフレーム
        peak = seg["start"]
        best = -1
        for pt in timeline:
            fi = pt.get("frame_index", -1)
            if seg["start"] <= fi <= seg["end"] and pt.get("intensity", 0) > best:
                best = pt.get("intensity", 0)
                peak = fi
        result.append(
            MotionPhaseSegment(
                type=seg["type"],
                start_frame=seg["start"],
                peak_frame=peak,
                end_frame=seg["end"],
                confidence=_clamp01(confidence),
            )
        )
    return result


def _angle_metrics(pose: dict, confidence: float) -> List[KickMetric]:
    """key_angles → KickMetric[]（理想レンジは単一ソース ideal_form）"""
    measurement = (
        MeasurementStatus.AVAILABLE
        if confidence >= LOW_CONFIDENCE_DETECTION_RATE
        else MeasurementStatus.LOW_CONFIDENCE
    )
    metrics: List[KickMetric] = []
    for ka in pose.get("key_angles") or []:
        key = ka.get("key", "")
        entry = IDEAL_ANGLE_RANGES.get(key)
        ideal = IdealRange(min=entry[1], max=entry[2]) if entry else None
        value = ka.get("value")
        metrics.append(
            KickMetric(
                id=key,
                label=entry[0] if entry else ka.get("label", key),
                value=value,
                unit="deg",
                frame=pose.get("key_frame_index"),
                ideal_range=ideal,
                confidence=_clamp01(confidence),
                status=metric_status_for(value, ideal),
                measurement_status=measurement,
            )
        )
    return metrics


def _ball_speed_metric(payload: dict, confidence: float) -> KickMetric:
    """ボール初速。推定できなかった場合も unavailable として必ず返す"""
    ball = payload.get("ball_speed") or {}
    speed = ball.get("speed_kmh")
    if speed is None:
        status = MetricStatus.UNKNOWN
    elif speed >= 90:
        status = MetricStatus.EXCELLENT
    elif speed >= 70:
        status = MetricStatus.GOOD
    else:
        status = MetricStatus.WARNING
    return KickMetric(
        id="ball_speed",
        label="推定シュート速度",
        value=speed,
        unit="km/h",
        confidence=_clamp01(min(confidence, 0.6)) if speed is not None else 0.0,
        status=status,
        measurement_status=(
            MeasurementStatus.LOW_CONFIDENCE  # 概算のため常に参考値
            if speed is not None
            else MeasurementStatus.UNAVAILABLE
        ),
    )


def _scores(payload: dict, pose: Optional[dict], top_score: Optional[int]) -> KickScores:
    parts = (pose or {}).get("body_part_scores") or {}

    def part(key: str) -> Optional[int]:
        v = (parts.get(key) or {}).get("score")
        return int(v) if v is not None else None

    # followThrough は現行 API に部位スコアが無いため key_angles から暫定導出
    # （TS 側 scoresFromPose と同一。API v1.1 で正式配布したら置換）
    follow_through: Optional[int] = None
    ft = next(
        (k for k in (pose or {}).get("key_angles") or [] if k.get("key") == "follow_through"),
        None,
    )
    entry = IDEAL_ANGLE_RANGES.get("follow_through")
    if ft is not None and ft.get("value") is not None and entry:
        v = ft["value"]
        lo, hi = entry[1], entry[2]
        dist = lo - v if v < lo else (v - hi if v > hi else 0.0)
        follow_through = round(_clamp01(1 - dist / 40) * 100)

    overall = top_score if top_score is not None else (pose or {}).get("score")
    return KickScores(
        overall=int(overall) if overall is not None else None,
        support_leg=part("plant_leg"),
        kicking_leg=part("kicking_leg"),
        upper_body=part("upper_body"),
        balance=part("balance"),
        follow_through=follow_through,
    )


def _bullet_lines(text: Optional[str]) -> List[str]:
    if not text:
        return []
    lines = []
    for line in text.split("\n"):
        cleaned = re.sub(r"^[-・\s]+", "", line).strip()
        if cleaned:
            lines.append(cleaned)
    return lines


def _feedback(payload: dict, pose: Optional[dict]) -> KickFeedback:
    sections = (payload.get("ai_feedback") or {}).get("sections") or {}
    strengths = _bullet_lines(sections.get("good_points"))

    priorities = []
    for r in (pose or {}).get("improvement_rankings") or []:
        severity = r.get("severity")
        priorities.append(
            FeedbackPriority(
                rank=r.get("rank", len(priorities) + 1),
                label=r.get("label", ""),
                issue=r.get("issue", ""),
                advice=r.get("advice", ""),
                severity=(
                    FeedbackSeverity(severity)
                    if severity in _SEVERITIES
                    else FeedbackSeverity.MID
                ),
            )
        )

    drills = []
    menu = (sections.get("practice_menu") or "").strip()
    if menu:
        m = re.search(r"([0-9]+)\s*分", menu)
        title = re.split(r"[（(:：]", menu)[0].strip() or menu
        drills.append(
            RecommendedDrill(
                id="drill-practice-menu",
                title=title,
                focus=menu,
                duration_minutes=int(m.group(1)) if m else None,
                tag="AI提案",
            )
        )
    return KickFeedback(strengths=strengths, priorities=priorities, drills=drills)


_MEASUREMENT_VALUES = {s.value for s in MeasurementStatus}
_CAMERA_VIEW_VALUES = {v.value for v in CameraView}


def _clamp_score(v) -> Optional[int]:
    """0-100 に収まる整数のみ受け入れる（それ以外は None = 測定不能）"""
    if isinstance(v, (int, float)) and 0 <= v <= 100:
        return int(round(v))
    return None


def _capture_quality_from_stored(stored: dict) -> CaptureQuality:
    """解析時に保存された撮影品質評価（#22）→ 契約 CaptureQuality"""
    status = stored.get("status")
    view = stored.get("camera_view")
    warnings = stored.get("warnings")
    instructions = stored.get("retake_instructions")
    return CaptureQuality(
        score=_clamp_score(stored.get("score")),
        status=(
            MeasurementStatus(status)
            if status in _MEASUREMENT_VALUES
            else MeasurementStatus.UNAVAILABLE
        ),
        camera_view=(
            CameraView(view) if view in _CAMERA_VIEW_VALUES else CameraView.UNKNOWN
        ),
        full_body_visible=bool(stored.get("full_body_visible")),
        single_person_detected=bool(stored.get("single_person_detected")),
        person_scale_score=_clamp_score(stored.get("person_scale_score")),
        brightness_score=_clamp_score(stored.get("brightness_score")),
        blur_score=_clamp_score(stored.get("blur_score")),
        keypoint_coverage=_clamp_score(stored.get("keypoint_coverage")),
        warnings=[str(w) for w in warnings] if isinstance(warnings, list) else [],
        retake_instructions=(
            [str(i) for i in instructions] if isinstance(instructions, list) else []
        ),
    )


def _capture_quality(payload: dict, detection_rate: Optional[float]) -> CaptureQuality:
    warnings: List[str] = []
    if payload.get("pose_error"):
        warnings.append(str(payload["pose_error"]))
    if detection_rate is None:
        warnings.append("骨格を検出できませんでした。横から全身が写るように撮影してください。")
        status = MeasurementStatus.UNAVAILABLE
    elif detection_rate < LOW_CONFIDENCE_DETECTION_RATE:
        warnings.append(
            "骨格の検出率が低いため、結果は参考値です。明るい場所で横から全身を撮影すると精度が上がります。"
        )
        status = MeasurementStatus.LOW_CONFIDENCE
    else:
        status = MeasurementStatus.AVAILABLE

    return CaptureQuality(
        score=round(detection_rate * 100) if detection_rate is not None else None,
        status=status,
        camera_view=CameraView.UNKNOWN,  # 現行 API は撮影アングルを推定しない（#22 で実装予定）
        full_body_visible=(
            detection_rate is not None and detection_rate >= LOW_CONFIDENCE_DETECTION_RATE
        ),
        single_person_detected=payload.get("pose") is not None,
        brightness_score=None,  # 未計測（#22 で実装予定）
        blur_score=None,  # 未計測（#22 で実装予定）
        warnings=warnings,
    )


def kick_analysis_from_payload(
    analysis_id: str,
    created_at: str,
    score: Optional[int],
    payload: dict,
    history: Optional[List[KickHistoryEntry]] = None,
) -> KickAnalysisResult:
    """DB 保存済みの旧形式ペイロード → 契約 v1.0

    Args:
        analysis_id: analyses.id
        created_at:  analyses.created_at（ISO 文字列）
        score:       analyses.score（トップレベルの総合スコア）
        payload:     analyses.payload（routers/pose.py が保存した dict）
        history:     解析履歴（呼び出し側で組み立てて渡す）
    """
    pose = payload.get("pose")
    detected = bool(pose and pose.get("score_breakdown"))
    detection_rate = (
        (pose.get("metrics") or {}).get("detection_rate") if detected else None
    )
    confidence = detection_rate if detection_rate is not None else 0.0

    if not detected or confidence < LOW_CONFIDENCE_DETECTION_RATE:
        status = AnalysisStatus.LOW_CONFIDENCE
    else:
        status = AnalysisStatus.COMPLETED

    metrics = _angle_metrics(pose, confidence) if pose else []
    metrics.append(_ball_speed_metric(payload, confidence))

    # ---- 撮影品質評価（#22）が保存されていれば優先し、ゲーティングを適用 ----
    stored_quality = payload.get("capture_quality")
    if isinstance(stored_quality, dict):
        capture = _capture_quality_from_stored(stored_quality)
        level = stored_quality.get("level")
        if level == "critical":
            status = AnalysisStatus.FAILED
        elif level == "warning" and status == AnalysisStatus.COMPLETED:
            status = AnalysisStatus.LOW_CONFIDENCE
        metrics = _apply_quality_to_metrics(metrics, stored_quality)
    else:
        capture = _capture_quality(payload, detection_rate)

    # ---- 動画メタ（#22 で解析時に保存）。無い旧レコードは従来どおり ----
    duration = payload.get("duration")
    vm = payload.get("video_meta")
    if isinstance(vm, dict):
        orientation = vm.get("orientation")
        video = VideoInfo(
            duration_ms=(
                vm.get("duration_ms")
                if vm.get("duration_ms") is not None
                else (round(duration * 1000) if duration is not None else None)
            ),
            fps=vm.get("fps"),
            width=vm.get("width"),
            height=vm.get("height"),
            orientation=(
                VideoOrientation(orientation)
                if orientation in {o.value for o in VideoOrientation}
                else VideoOrientation.UNKNOWN
            ),
        )
    else:
        video = VideoInfo(
            duration_ms=round(duration * 1000) if duration is not None else None,
            fps=None,  # 旧レコードは fps を保存していない
            width=None,
            height=None,
            orientation=VideoOrientation.UNKNOWN,
        )

    return KickAnalysisResult(
        analysis_id=analysis_id,
        status=status,
        created_at=created_at,
        video=video,
        capture_quality=capture,
        phases=_phase_segments(pose, confidence) if pose else [],
        scores=_scores(payload, pose, score),
        metrics=metrics,
        feedback=_feedback(payload, pose),
        history=history or [],
    )


def _apply_quality_to_metrics(
    metrics: List[KickMetric], stored_quality: dict
) -> List[KickMetric]:
    """撮影品質評価をメトリクスへ反映する

    - metric_confidences: 関節グループの visibility 由来の信頼度で上書き
      （既存の検出率ベース confidence との小さい方）
    - angle_metrics_restricted: front/rear/unknown ビューでは角度系を
      low_confidence に制限
    - unreliable_frame_indices: 主要関節の visibility が低いフレームで
      計測されたメトリクスを low_confidence に落とす（除外/補間フラグ）
    """
    conf_map = stored_quality.get("metric_confidences")
    conf_map = conf_map if isinstance(conf_map, dict) else {}
    restricted = bool(stored_quality.get("angle_metrics_restricted"))
    unreliable = stored_quality.get("unreliable_frame_indices")
    unreliable_set = set(unreliable) if isinstance(unreliable, list) else set()

    adjusted: List[KickMetric] = []
    for m in metrics:
        confidence = m.confidence
        measurement = m.measurement_status
        if m.unit == "deg":
            kp_conf = conf_map.get(m.id)
            if isinstance(kp_conf, (int, float)):
                confidence = round(min(confidence, max(0.0, min(1.0, float(kp_conf)))), 3)
            downgrade = (
                restricted
                or (m.frame is not None and m.frame in unreliable_set)
                or confidence < LOW_CONFIDENCE_DETECTION_RATE
            )
            if downgrade and measurement == MeasurementStatus.AVAILABLE:
                measurement = MeasurementStatus.LOW_CONFIDENCE
        adjusted.append(
            m.model_copy(update={"confidence": confidence, "measurement_status": measurement})
        )
    return adjusted


def failed_kick_analysis(analysis_id: str, created_at: str, message: str) -> KickAnalysisResult:
    """変換不能なデータに対する構造化エラー（500 で落とさないための応答）"""
    return KickAnalysisResult(
        analysis_id=analysis_id,
        status=AnalysisStatus.FAILED,
        created_at=created_at,
        video=VideoInfo(),
        capture_quality=CaptureQuality(
            score=None,
            status=MeasurementStatus.UNAVAILABLE,
            warnings=[f"解析データを契約形式へ変換できませんでした: {message}"],
        ),
        phases=[],
        scores=KickScores(),
        metrics=[],
        feedback=KickFeedback(),
        history=[],
    )

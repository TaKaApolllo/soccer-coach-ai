"""キックフォーム分析 API 契約 v1.0（Pydantic モデル）

正となる契約は frontend/src/types/kickAnalysis.ts。本モジュールは
TS 側と名称（camelCase）・単位・enum 値を完全一致させたバックエンド実装。

規約:
    - confidence: 0-1 / score: 0-100 / 角度: deg / 時間: ms / frame: int
    - 測定不能を 0 で表現しない。値は null（None）にし、
      MeasurementStatus で「測れなかった」ことを明示する。

JSON シリアライズは camelCase（alias_generator=to_camel）。
Python コードからは snake_case でも camelCase でもアクセス可能
（populate_by_name=True）。
"""

from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

SCHEMA_VERSION: Literal["1.0"] = "1.0"


# ----------------------------------------------------------------------
# enum（値は TS 側と完全一致）
# ----------------------------------------------------------------------

class AnalysisStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    LOW_CONFIDENCE = "low_confidence"
    FAILED = "failed"


class MeasurementStatus(str, Enum):
    AVAILABLE = "available"
    LOW_CONFIDENCE = "low_confidence"
    UNAVAILABLE = "unavailable"


class MetricStatus(str, Enum):
    EXCELLENT = "excellent"
    GOOD = "good"
    WARNING = "warning"
    POOR = "poor"
    UNKNOWN = "unknown"


class CameraView(str, Enum):
    SIDE = "side"
    FRONT = "front"
    REAR = "rear"
    DIAGONAL = "diagonal"
    UNKNOWN = "unknown"


class MotionPhaseType(str, Enum):
    APPROACH = "approach"
    BACKSWING = "backswing"
    SUPPORT_PLANT = "support_plant"
    IMPACT = "impact"
    FOLLOW_THROUGH = "follow_through"


class VideoOrientation(str, Enum):
    LANDSCAPE = "landscape"
    PORTRAIT = "portrait"
    UNKNOWN = "unknown"


class FeedbackSeverity(str, Enum):
    HIGH = "high"
    MID = "mid"
    LOW = "low"


# ----------------------------------------------------------------------
# モデル
# ----------------------------------------------------------------------

class _ContractModel(BaseModel):
    """契約共通設定: camelCase シリアライズ + 余剰フィールド禁止"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        use_enum_values=False,
    )


class VideoInfo(_ContractModel):
    duration_ms: Optional[int] = Field(default=None, ge=0)
    fps: Optional[float] = Field(default=None, gt=0)
    width: Optional[int] = Field(default=None, gt=0)
    height: Optional[int] = Field(default=None, gt=0)
    orientation: VideoOrientation = VideoOrientation.UNKNOWN


class CaptureQuality(_ContractModel):
    """撮影品質。score が None の項目は 0 ではなく「測定不能」を意味する

    person_scale_score / keypoint_coverage / retake_instructions は
    契約 v1.0 の optional 拡張（#22）。旧クライアントは無視できる。
    """

    score: Optional[int] = Field(default=None, ge=0, le=100)
    status: MeasurementStatus
    camera_view: CameraView = CameraView.UNKNOWN
    full_body_visible: bool = False
    single_person_detected: bool = False
    person_scale_score: Optional[int] = Field(default=None, ge=0, le=100)
    brightness_score: Optional[int] = Field(default=None, ge=0, le=100)
    blur_score: Optional[int] = Field(default=None, ge=0, le=100)
    keypoint_coverage: Optional[int] = Field(default=None, ge=0, le=100)
    warnings: List[str] = Field(default_factory=list)
    retake_instructions: List[str] = Field(default_factory=list)


class MotionPhaseSegment(_ContractModel):
    type: MotionPhaseType
    start_frame: int = Field(ge=0)
    peak_frame: int = Field(ge=0)
    end_frame: int = Field(ge=0)
    confidence: float = Field(ge=0.0, le=1.0)


class KickScores(_ContractModel):
    """部位別スコア。測定不能な部位は None（0 にしない）"""

    overall: Optional[int] = Field(default=None, ge=0, le=100)
    support_leg: Optional[int] = Field(default=None, ge=0, le=100)
    kicking_leg: Optional[int] = Field(default=None, ge=0, le=100)
    upper_body: Optional[int] = Field(default=None, ge=0, le=100)
    balance: Optional[int] = Field(default=None, ge=0, le=100)
    follow_through: Optional[int] = Field(default=None, ge=0, le=100)


class IdealRange(_ContractModel):
    min: float
    max: float


class KickMetric(_ContractModel):
    id: str
    label: str
    value: Optional[float] = None
    unit: str
    frame: Optional[int] = Field(default=None, ge=0)
    phase: Optional[MotionPhaseType] = None
    ideal_range: Optional[IdealRange] = None
    confidence: float = Field(ge=0.0, le=1.0)
    status: MetricStatus
    measurement_status: MeasurementStatus


class FeedbackPriority(_ContractModel):
    rank: int = Field(ge=1)
    label: str
    issue: str
    advice: str
    severity: FeedbackSeverity
    related_metric_id: Optional[str] = None


class RecommendedDrill(_ContractModel):
    id: str
    title: str
    focus: str
    duration_minutes: Optional[int] = Field(default=None, gt=0)
    tag: str


class KickFeedback(_ContractModel):
    strengths: List[str] = Field(default_factory=list)
    priorities: List[FeedbackPriority] = Field(default_factory=list)
    drills: List[RecommendedDrill] = Field(default_factory=list)


class KickHistoryEntry(_ContractModel):
    analysis_id: str
    created_at: str
    overall_score: Optional[int] = Field(default=None, ge=0, le=100)
    thumbnail_url: Optional[str] = None


class KickAnalysisResult(_ContractModel):
    """契約 v1.0 のルートオブジェクト"""

    schema_version: Literal["1.0"] = SCHEMA_VERSION
    analysis_id: str
    status: AnalysisStatus
    created_at: str
    video: VideoInfo
    capture_quality: CaptureQuality
    phases: List[MotionPhaseSegment] = Field(default_factory=list)
    scores: KickScores
    metrics: List[KickMetric] = Field(default_factory=list)
    feedback: KickFeedback
    history: List[KickHistoryEntry] = Field(default_factory=list)


class KickAnalysisEnvelope(_ContractModel):
    """v1.0 エンドポイントの応答エンベロープ

    analysis: 検証済みの契約オブジェクト
    source:   旧 API 互換の生ペイロード（フレーム画像等の表示素材）。
              include_source=true のときのみ含まれる。契約本体を汚さず
              重い表示素材を同一リクエストで運ぶための封筒。
    """

    analysis: KickAnalysisResult
    source: Optional[dict] = None

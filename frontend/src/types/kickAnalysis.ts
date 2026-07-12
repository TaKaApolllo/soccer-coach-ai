import { PoseAnalysisResponse, PoseFrame, PoseResult } from './index'
import { IDEAL_ANGLE_RANGES } from '../constants/idealForm'

// =====================================================================
// キックフォーム分析 API 契約 v1.0
//
// 次フェーズでバックエンドがこのスキーマを実装する前提の「先行契約」。
// 現行 API（PoseAnalysisResponse）からは下部の adapter
// `kickAnalysisFromPoseResponse` で変換する。
//
// 規約:
//   - confidence: 0-1 / score: 0-100 / 角度: deg / 時間: ms / frame: integer
//   - 測定不能を 0 で表現しない。値は null にし、measurementStatus /
//     MeasurementStatus で「測れなかった」ことを明示する。
// =====================================================================

export const KICK_ANALYSIS_SCHEMA_VERSION = '1.0' as const
export type KickAnalysisSchemaVersion = typeof KICK_ANALYSIS_SCHEMA_VERSION

/** 解析ジョブの状態 */
export type AnalysisStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'low_confidence'
  | 'failed'

/** 個別計測値の取得状態（測定不能を 0 にしないための表現） */
export type MeasurementStatus = 'available' | 'low_confidence' | 'unavailable'

/** 計測値の評価 */
export type MetricStatus = 'excellent' | 'good' | 'warning' | 'poor' | 'unknown'

/** 撮影アングル */
export type CameraView = 'side' | 'front' | 'rear' | 'diagonal' | 'unknown'

/** キック動作フェーズ */
export type MotionPhaseType =
  | 'approach'
  | 'backswing'
  | 'support_plant'
  | 'impact'
  | 'follow_through'

export type VideoOrientation = 'landscape' | 'portrait' | 'unknown'

export interface VideoInfo {
  /** 動画全体の長さ（ms）。画像や不明時は null */
  durationMs: number | null
  fps: number | null
  width: number | null
  height: number | null
  orientation: VideoOrientation
}

/** 撮影品質（解析信頼度の根拠） */
export interface CaptureQuality {
  /** 0-100。算出不能なら null */
  score: number | null
  status: MeasurementStatus
  cameraView: CameraView
  fullBodyVisible: boolean
  singlePersonDetected: boolean
  /** 0-100。現行 API では未計測のため null */
  brightnessScore: number | null
  /** 0-100。現行 API では未計測のため null */
  blurScore: number | null
  warnings: string[]
}

export interface MotionPhaseSegment {
  type: MotionPhaseType
  startFrame: number
  /** フェーズ内で最も特徴的なフレーム（例: インパクト瞬間） */
  peakFrame: number
  endFrame: number
  /** 0-1 */
  confidence: number
}

/** 部位別スコア。測定不能な部位は null（0 にしない） */
export interface KickScores {
  overall: number | null
  supportLeg: number | null
  kickingLeg: number | null
  upperBody: number | null
  balance: number | null
  followThrough: number | null
}

export interface IdealRange {
  min: number
  max: number
}

export interface KickMetric {
  /** 安定キー（例: 'backswing', 'knee_impact', 'ball_speed'） */
  id: string
  label: string
  /** 測定不能時は null + measurementStatus で表現 */
  value: number | null
  unit: string
  /** 計測フレーム（該当する場合のみ） */
  frame?: number
  phase?: MotionPhaseType
  idealRange?: IdealRange
  /** 0-1 */
  confidence: number
  status: MetricStatus
  measurementStatus: MeasurementStatus
}

export type FeedbackSeverity = 'high' | 'mid' | 'low'

export interface FeedbackPriority {
  rank: number
  label: string
  issue: string
  advice: string
  severity: FeedbackSeverity
  /** 対応する KickMetric.id（クロスハイライト用） */
  relatedMetricId?: string
}

export interface RecommendedDrill {
  id: string
  title: string
  focus: string
  /** 分。不明なら null */
  durationMinutes: number | null
  tag: string
}

export interface KickFeedback {
  strengths: string[]
  priorities: FeedbackPriority[]
  drills: RecommendedDrill[]
}

export interface KickHistoryEntry {
  analysisId: string
  createdAt: string
  overallScore: number | null
  thumbnailUrl: string | null
}

/** ルートオブジェクト（API 契約 v1.0） */
export interface KickAnalysisResult {
  schemaVersion: KickAnalysisSchemaVersion
  analysisId: string
  status: AnalysisStatus
  createdAt: string
  video: VideoInfo
  captureQuality: CaptureQuality
  phases: MotionPhaseSegment[]
  scores: KickScores
  metrics: KickMetric[]
  feedback: KickFeedback
  history: KickHistoryEntry[]
}

// =====================================================================
// 現行 API（PoseAnalysisResponse）→ v1.0 スキーマへの adapter
// =====================================================================

/** これ未満の骨格検出率は low_confidence として扱う */
export const LOW_CONFIDENCE_DETECTION_RATE = 0.5

/** 現行バックエンドの日本語フェーズ名 → enum のマッピング */
const PHASE_TYPE_BY_LABEL: Record<string, MotionPhaseType> = {
  '助走・踏み込み': 'approach',
  バックスイング: 'backswing',
  インパクト: 'impact',
  フォロースルー: 'follow_through'
}

export const PHASE_LABEL_BY_TYPE: Record<MotionPhaseType, string> = {
  approach: '助走',
  backswing: 'バックスイング',
  support_plant: '踏み込み',
  impact: 'インパクト',
  follow_through: 'フォロースルー'
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** 理想レンジに対する評価（レンジ中央 50% なら excellent、レンジ内 good、以降幅比で warning/poor） */
export function metricStatusFor(value: number | null, range?: IdealRange): MetricStatus {
  if (value === null || !range) return 'unknown'
  const width = range.max - range.min
  if (value >= range.min && value <= range.max) {
    const centerLo = range.min + width * 0.25
    const centerHi = range.max - width * 0.25
    return value >= centerLo && value <= centerHi ? 'excellent' : 'good'
  }
  const dist = value < range.min ? range.min - value : value - range.max
  return dist <= width * 0.25 ? 'warning' : 'poor'
}

/** フレーム列（日本語フェーズ付き）→ フェーズ区間リスト */
function phaseSegmentsFromFrames(
  frames: PoseFrame[],
  timeline: { frame_index: number; intensity: number }[] | undefined,
  confidence: number
): MotionPhaseSegment[] {
  const segments: MotionPhaseSegment[] = []
  let current: { type: MotionPhaseType; start: number; end: number } | null = null

  for (const frame of frames) {
    const type = PHASE_TYPE_BY_LABEL[frame.phase]
    if (!type) {
      current = null
      continue
    }
    if (current && current.type === type) {
      current.end = frame.frame_index
    } else {
      current = { type, start: frame.frame_index, end: frame.frame_index }
      segments.push({
        type,
        startFrame: current.start,
        peakFrame: current.start,
        endFrame: current.end,
        confidence
      })
    }
    segments[segments.length - 1].endFrame = current.end
  }

  // peakFrame: 区間内で動作強度が最大のフレーム
  if (timeline?.length) {
    for (const seg of segments) {
      let best = seg.startFrame
      let bestIntensity = -1
      for (const pt of timeline) {
        if (pt.frame_index >= seg.startFrame && pt.frame_index <= seg.endFrame && pt.intensity > bestIntensity) {
          bestIntensity = pt.intensity
          best = pt.frame_index
        }
      }
      seg.peakFrame = best
    }
  }
  return segments
}

/** key_angles → KickMetric[]（理想レンジは単一ソース constants/idealForm を使用） */
function metricsFromPose(pose: PoseResult, confidence: number): KickMetric[] {
  const measurement: MeasurementStatus =
    confidence >= LOW_CONFIDENCE_DETECTION_RATE ? 'available' : 'low_confidence'

  const metrics: KickMetric[] = (pose.key_angles ?? []).map((ka) => {
    const range = IDEAL_ANGLE_RANGES[ka.key]
    const idealRange: IdealRange | undefined = range
      ? { min: range.min, max: range.max }
      : undefined
    return {
      id: ka.key,
      label: range?.label ?? ka.label,
      value: ka.value,
      unit: 'deg',
      frame: pose.key_frame_index,
      idealRange,
      confidence,
      status: metricStatusFor(ka.value, idealRange),
      measurementStatus: measurement
    }
  })
  return metrics
}

/** ボール初速メトリクス（推定できなかった場合も unavailable として必ず返す） */
function ballSpeedMetric(resp: PoseAnalysisResponse, confidence: number): KickMetric {
  const speed = resp.ball_speed?.speed_kmh ?? null
  return {
    id: 'ball_speed',
    label: '推定シュート速度',
    value: speed,
    unit: 'km/h',
    confidence: speed !== null ? Math.min(confidence, 0.6) : 0, // 概算のため上限を抑える
    status: speed === null ? 'unknown' : speed >= 90 ? 'excellent' : speed >= 70 ? 'good' : 'warning',
    measurementStatus: speed !== null ? 'low_confidence' : 'unavailable'
  }
}

function scoresFromPose(resp: PoseAnalysisResponse, pose: PoseResult | null): KickScores {
  const parts = pose?.body_part_scores
  // followThrough は現行 API に部位スコアが無いため key_angles から暫定導出する。
  // TODO(api-contract-v1.1): バックエンドが scores.followThrough を配布したら削除。
  let followThrough: number | null = null
  const ft = pose?.key_angles?.find((k) => k.key === 'follow_through')
  const ftRange = IDEAL_ANGLE_RANGES.follow_through
  if (ft && ftRange) {
    const dist =
      ft.value < ftRange.min ? ftRange.min - ft.value : ft.value > ftRange.max ? ft.value - ftRange.max : 0
    followThrough = Math.round(clamp01(1 - dist / 40) * 100)
  }
  return {
    overall: resp.score ?? pose?.score ?? null,
    supportLeg: parts?.plant_leg?.score ?? null,
    kickingLeg: parts?.kicking_leg?.score ?? null,
    upperBody: parts?.upper_body?.score ?? null,
    balance: parts?.balance?.score ?? null,
    followThrough
  }
}

/** 「- 箇条書き」形式のテキストを行配列へ */
function bulletLines(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split('\n')
    .map((l) => l.replace(/^[-・\s]+/, '').trim())
    .filter((l) => l.length > 0)
}

function feedbackFromResponse(resp: PoseAnalysisResponse): KickFeedback {
  const sections = resp.ai_feedback?.sections
  const strengths = bulletLines(sections?.good_points)

  const priorities: FeedbackPriority[] = (resp.pose?.improvement_rankings ?? []).map((r) => ({
    rank: r.rank,
    label: r.label,
    issue: r.issue,
    advice: r.advice,
    severity: r.severity,
    relatedMetricId: undefined
  }))

  const drills: RecommendedDrill[] = []
  const menu = sections?.practice_menu?.trim()
  if (menu) {
    const durationMatch = menu.match(/([0-9]+)\s*分/)
    drills.push({
      id: 'drill-practice-menu',
      title: menu.split(/[（(:：]/)[0].trim() || menu,
      focus: menu,
      durationMinutes: durationMatch ? Number(durationMatch[1]) : null,
      tag: 'AI提案'
    })
  }
  return { strengths, priorities, drills }
}

function captureQualityFromResponse(
  resp: PoseAnalysisResponse,
  detectionRate: number | null
): CaptureQuality {
  const warnings: string[] = []
  if (resp.pose_error) warnings.push(resp.pose_error)
  if (detectionRate === null) {
    warnings.push('骨格を検出できませんでした。横から全身が写るように撮影してください。')
  } else if (detectionRate < LOW_CONFIDENCE_DETECTION_RATE) {
    warnings.push('骨格の検出率が低いため、結果は参考値です。明るい場所で横から全身を撮影すると精度が上がります。')
  }
  return {
    score: detectionRate === null ? null : Math.round(detectionRate * 100),
    status:
      detectionRate === null
        ? 'unavailable'
        : detectionRate >= LOW_CONFIDENCE_DETECTION_RATE
          ? 'available'
          : 'low_confidence',
    cameraView: 'unknown', // 現行 API は撮影アングルを推定しない
    fullBodyVisible: detectionRate !== null && detectionRate >= LOW_CONFIDENCE_DETECTION_RATE,
    singlePersonDetected: resp.pose !== null,
    brightnessScore: null,
    blurScore: null,
    warnings
  }
}

/**
 * 現行 API 応答 → v1.0 スキーマ変換。
 * history はこの関数では埋めない（サービス層 getKickAnalysisHistory が担当）。
 */
export function kickAnalysisFromPoseResponse(resp: PoseAnalysisResponse): KickAnalysisResult {
  const pose = resp.pose
  const detected = !!pose && pose.score_breakdown.length > 0
  const detectionRate = detected ? (pose.metrics.detection_rate ?? null) : null
  const confidence = detectionRate ?? 0

  const status: AnalysisStatus = !detected
    ? 'low_confidence'
    : confidence < LOW_CONFIDENCE_DETECTION_RATE
      ? 'low_confidence'
      : 'completed'

  const metrics = pose ? metricsFromPose(pose, confidence) : []
  metrics.push(ballSpeedMetric(resp, confidence))

  return {
    schemaVersion: KICK_ANALYSIS_SCHEMA_VERSION,
    analysisId: resp.id,
    status,
    createdAt: resp.created_at,
    video: {
      durationMs: resp.duration != null ? Math.round(resp.duration * 1000) : null,
      fps: null, // 現行 API は fps を返さない（frame_times から間接把握のみ）
      width: null,
      height: null,
      orientation: 'unknown'
    },
    captureQuality: captureQualityFromResponse(resp, detectionRate),
    phases: pose ? phaseSegmentsFromFrames(pose.frames, pose.timeline, confidence) : [],
    scores: scoresFromPose(resp, pose),
    metrics,
    feedback: feedbackFromResponse(resp),
    history: []
  }
}

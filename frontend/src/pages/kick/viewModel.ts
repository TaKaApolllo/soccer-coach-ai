import { PoseLandmark, TimelinePoint } from '../../types'
import {
  AngleLabel,
  CoachComment,
  MotionPhase,
  OverallScore,
  Tone,
  TrainingRec,
  resolveJoint
} from '../../types/analysis'
import {
  KickAnalysisResult,
  KickMetric,
  MetricStatus,
  MotionPhaseType,
  PHASE_LABEL_BY_TYPE
} from '../../types/kickAnalysis'
import { KickAnalysisPayload } from '../../services/kickAnalysisApi'
import { MOCK_KICK_LANDMARKS } from '../../mocks/kickAnalysis.mock'

// =====================================================================
// /analysis/kick のビューモデル
// KickAnalysisPayload（API 契約 v1.0 + 現行 API の生応答）を
// 各パネルが直接消費できる形へ変換する。固定値はここに書かない。
// =====================================================================

export type ViewTab = 'form' | 'angle' | 'skeleton' | 'compare'

export const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'form', label: 'フォーム' },
  { id: 'angle', label: '角度' },
  { id: 'skeleton', label: '骨格' },
  { id: 'compare', label: '比較' }
]

/** フェーズごとの表示色（デザイントークン: phase 系列） */
export const PHASE_COLOR: Record<MotionPhaseType, string> = {
  approach: '#38bdf8',
  backswing: '#a78bfa',
  support_plant: '#f59e0b',
  impact: '#f97316',
  follow_through: '#22c55e'
}

export function toneFromMetricStatus(status: MetricStatus): Tone {
  switch (status) {
    case 'excellent':
    case 'good':
      return 'good'
    case 'warning':
      return 'warn'
    case 'poor':
      return 'bad'
    case 'unknown':
      return 'neutral'
  }
}

export const METRIC_STATUS_LABEL: Record<MetricStatus, string> = {
  excellent: '非常に良い',
  good: '良い',
  warning: '要改善',
  poor: '大きく改善',
  unknown: '判定不可'
}

export interface KickViewModel {
  /** ビューワーに表示する骨格（キーフレーム or サンプル） */
  landmarks: PoseLandmark[]
  /** フレームごとの骨格（実データのみ。スクラバー連動用） */
  landmarksByFrame: PoseLandmark[][] | null
  angleLabels: AngleLabel[]
  overall: OverallScore
  /** 実データのフレーム画像（タブ別）。サンプル時は null */
  images: {
    form: (string | null)[]
    angle: string[]
    skeleton: (string | null)[]
  } | null
  keyFrameIndex: number
  frameTimes: number[] | null
  /** フレームごとの日本語フェーズ名（HUD 表示用） */
  phaseLabels: string[]
  /** 再生時間（秒）。不明なら null */
  durationSec: number | null
  /** タイムラインのフェーズ帯（0-1 正規化） */
  timelinePhases: MotionPhase[]
  /** フレームごとの動作強度（実データのみ） */
  intensityTimeline: TimelinePoint[] | null
  coach: CoachComment
  recs: TrainingRec[]
}

function overallFromAnalysis(payload: KickAnalysisPayload): OverallScore {
  const { analysis, source } = payload
  const score = analysis.scores.overall
  const headline =
    source?.pose?.score_message?.headline ??
    (score === null
      ? 'スコアを算出できませんでした'
      : score >= 85
        ? '素晴らしいフォームです'
        : score >= 70
          ? '良いフォームです'
          : score >= 50
            ? '改善の余地があります'
            : '基礎から確認しましょう')

  const chips: OverallScore['chips'] = []
  const quality = analysis.captureQuality
  if (quality.score !== null) {
    chips.push({
      label: '信頼度',
      value: `${quality.score}%`,
      tone: quality.status === 'available' ? 'good' : 'warn'
    })
  }
  const speed = analysis.metrics.find((m) => m.id === 'ball_speed')
  if (speed && speed.value !== null) {
    chips.push({ label: '推定速度', value: `${Math.round(speed.value)}km/h`, tone: 'neutral' })
  }
  return { score: score ?? 0, max: 100, headline, chips }
}

/** 角度メトリクス → AvatarViewer 用の角度ラベル */
function angleLabelsFromMetrics(metrics: KickMetric[]): AngleLabel[] {
  const seen = new Set<string>()
  const labels: AngleLabel[] = []
  for (const m of metrics) {
    if (m.unit !== 'deg' || m.value === null) continue
    const joint = resolveJoint(`${m.id} ${m.label}`)
    if (!joint || seen.has(joint)) continue
    seen.add(joint)
    labels.push({
      joint,
      label: m.label.replace(/（.*）/, '').slice(0, 4),
      value: m.value,
      ideal: m.idealRange ? (m.idealRange.min + m.idealRange.max) / 2 : undefined,
      unit: '°',
      status: toneFromMetricStatus(m.status)
    })
  }
  return labels
}

/** フェーズ区間（フレーム基準）→ 0-1 正規化のタイムライン帯 */
function timelinePhasesFromAnalysis(
  analysis: KickAnalysisResult,
  frameCount: number
): MotionPhase[] {
  if (!analysis.phases.length) return []
  const maxFrame = Math.max(
    frameCount - 1,
    ...analysis.phases.map((p) => p.endFrame),
    1
  )
  return analysis.phases.map((p, i) => ({
    key: `${p.type}-${i}`,
    label: PHASE_LABEL_BY_TYPE[p.type],
    start: p.startFrame / (maxFrame + 1),
    end: (p.endFrame + 1) / (maxFrame + 1),
    color: PHASE_COLOR[p.type]
  }))
}

function coachFromAnalysis(analysis: KickAnalysisResult): CoachComment {
  const { strengths, priorities, drills } = analysis.feedback
  const top = priorities[0]
  return {
    good: strengths.length
      ? strengths.join('。') + '。'
      : '解析を重ねると、良い点のフィードバックが表示されます。',
    improvement: top
      ? `${top.label}: ${top.issue}`
      : '大きな課題は検出されませんでした。',
    next: top
      ? top.advice
      : drills[0]
        ? `${drills[0].title}（${drills[0].focus}）に取り組みましょう。`
        : '解析を続けて成長を記録しましょう。'
  }
}

function recsFromAnalysis(analysis: KickAnalysisResult): TrainingRec[] {
  const severityTone: Record<string, Tone> = { high: 'bad', mid: 'warn', low: 'good' }
  return analysis.feedback.drills.map((d, i) => ({
    id: d.id,
    title: d.title,
    focus: d.focus,
    duration: d.durationMinutes !== null ? `${d.durationMinutes}分` : '-',
    tag: d.tag,
    tone: severityTone[analysis.feedback.priorities[i]?.severity ?? ''] ?? 'good'
  }))
}

/** ペイロード全体 → ビューモデル */
export function buildKickViewModel(payload: KickAnalysisPayload): KickViewModel {
  const { analysis, source } = payload
  const pose = source?.pose ?? null

  const landmarksByFrame = pose
    ? pose.frames.map((f) => f.landmarks)
    : null
  const keyFrameIndex = pose?.key_frame_index ?? 0
  const keyLandmarks =
    landmarksByFrame?.[keyFrameIndex]?.length
      ? landmarksByFrame[keyFrameIndex]
      : landmarksByFrame?.find((l) => l.length > 0)

  const frameCount = pose?.frames.length ?? 0

  return {
    landmarks: keyLandmarks?.length ? keyLandmarks : MOCK_KICK_LANDMARKS,
    landmarksByFrame,
    angleLabels: angleLabelsFromMetrics(analysis.metrics),
    overall: overallFromAnalysis(payload),
    images: pose
      ? {
          form: pose.clean_images ?? pose.annotated_images,
          angle: pose.annotated_images,
          skeleton: pose.skeleton_images ?? pose.annotated_images
        }
      : null,
    keyFrameIndex,
    frameTimes: source?.frame_times ?? null,
    phaseLabels: pose?.phases ?? [],
    durationSec: source?.duration ?? (analysis.video.durationMs !== null ? analysis.video.durationMs / 1000 : null),
    timelinePhases: timelinePhasesFromAnalysis(analysis, frameCount),
    intensityTimeline: pose?.timeline ?? null,
    coach: coachFromAnalysis(analysis),
    recs: recsFromAnalysis(analysis)
  }
}

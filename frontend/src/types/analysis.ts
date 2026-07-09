import {
  BodyPartScores,
  ImprovementRanking,
  KeyAngle,
  PoseAnalysisResponse,
  PoseLandmark,
  PoseResult,
  TimelinePoint
} from './index'

// ---------------------------------------------------------------
// Kick Form Analysis Pro 画面専用のビュー型
// 既存の PoseResult / KeyAngle / TimelinePoint 等を、この画面が
// 直接消費しやすい形へ正規化した型群。
// ---------------------------------------------------------------

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** アバターの表示モード。将来 Three.js / R3F 実装へ差し替え可能にするための抽象。 */
export type AvatarMode = '2d' | '3d'

/** 関節に重ねる角度ラベル。AvatarViewer が landmarks を元に配置する。 */
export interface AngleLabel {
  /** landmark name（例: 'left_knee'）。この関節の近傍にラベルを描画する */
  joint: string
  label: string
  value: number
  ideal?: number
  unit?: string
  status?: Tone
}

/** 主要角度一覧の 1 行（現在値と理想値） */
export interface AngleRow {
  key: string
  label: string
  current: number
  ideal: number
  unit: string
  /** 現在値が理想からどれくらいズレているかで決まる評価 */
  status: Tone
}

/** サイドバーのショット情報 */
export interface ShotThumb {
  id: string
  /** data URI もしくは画像URL。無ければプレースホルダを描画 */
  src?: string | null
  time: string
}

export interface ShotInfo {
  title: string
  mainSrc?: string | null
  thumbs: ShotThumb[]
  duration: number
}

/** 左サイドのセッション情報 */
export interface SessionInfo {
  formation: string
  phase: string
  time: string
  confidence: number
}

/** モーションタイムラインの 1 フェーズ */
export interface MotionPhase {
  key: string
  label: string
  /** 0-1 の開始 / 終了位置 */
  start: number
  end: number
  color: string
}

export type ComparisonBaseline = 'ideal' | 'pro' | 'previous'

/** 理想フォームとの比較 1 項目（基準値をベースライン切替で差し替える） */
export interface ComparisonItem {
  key: string
  label: string
  current: number
  ideal: number
  pro: number
  previous: number
  unit: string
}

export interface SkillRadar {
  axes: string[]
  current: number[]
  previous: number[]
}

export interface SkillProgress {
  months: string[]
  series: Record<string, number[]>
}

export interface HistoryEntry {
  id: string
  date: string
  score: number
  thumbSrc?: string | null
}

export interface TrainingRec {
  id: string
  title: string
  focus: string
  duration: string
  tag: string
  tone: Tone
}

export type GaugeType = 'circle' | 'semi'

export interface MetricCard {
  key: string
  label: string
  value: number
  max: number
  unit: string
  tone: Tone
  gauge: GaugeType
  caption: string
}

export interface CoachComment {
  good: string
  improvement: string
  next: string
}

export interface ImprovementItem {
  rank: number
  label: string
  issue: string
  advice: string
  /** 改善で見込めるスコア上昇（点） */
  delta: number
  tone: Tone
}

export interface ScoreChip {
  label: string
  value: string
  tone: Tone
}

export interface OverallScore {
  score: number
  max: number
  headline: string
  chips: ScoreChip[]
}

/** 画面全体のデータ契約 */
export interface ProAnalysis {
  /** 実 API 由来か、モックか */
  isSample: boolean
  shot: ShotInfo
  session: SessionInfo
  angles: AngleRow[]
  landmarks: PoseLandmark[]
  angleLabels: AngleLabel[]
  overall: OverallScore
  phases: MotionPhase[]
  comparisons: ComparisonItem[]
  radar: SkillRadar
  progress: SkillProgress
  history: HistoryEntry[]
  recommendations: TrainingRec[]
  metrics: MetricCard[]
  coach: CoachComment
  improvements: ImprovementItem[]
}

// ---------------------------------------------------------------
// 実 API → Pro 画面用型 への変換
// ---------------------------------------------------------------

function toneFromDelta(delta: number, tol = 6): Tone {
  const a = Math.abs(delta)
  if (a <= tol) return 'good'
  if (a <= tol * 2.4) return 'warn'
  return 'bad'
}

function toneFromStatus(status: string): Tone {
  if (status === 'good') return 'good'
  if (status === 'warn') return 'warn'
  if (status === 'bad') return 'bad'
  return 'neutral'
}

/** KeyAngle[] → AngleRow[] */
export function anglesFromKeyAngles(keyAngles: KeyAngle[]): AngleRow[] {
  return keyAngles.map((k) => ({
    key: k.key,
    label: k.label,
    current: Math.round(k.value),
    ideal: Math.round(k.ideal),
    unit: '°',
    status: toneFromDelta(k.value - k.ideal)
  }))
}

/** TimelinePoint[] → MotionPhase[]（連続する同一フェーズをまとめる） */
const PHASE_META: Record<string, { label: string; color: string }> = {
  approach: { label: '助走', color: '#38bdf8' },
  run_up: { label: '助走', color: '#38bdf8' },
  takeback: { label: 'テイクバック', color: '#a78bfa' },
  backswing: { label: 'テイクバック', color: '#a78bfa' },
  impact: { label: 'インパクト', color: '#f97316' },
  follow_through: { label: 'フォロースルー', color: '#22c55e' },
  followthrough: { label: 'フォロースルー', color: '#22c55e' }
}

export function phasesFromTimeline(timeline: TimelinePoint[]): MotionPhase[] | null {
  if (!timeline.length) return null
  const n = timeline.length
  const groups: { key: string; start: number; end: number }[] = []
  timeline.forEach((pt, i) => {
    const pos = i / n
    const last = groups[groups.length - 1]
    if (last && last.key === pt.phase) {
      last.end = (i + 1) / n
    } else {
      groups.push({ key: pt.phase, start: pos, end: (i + 1) / n })
    }
  })
  return groups.map((g, i) => {
    const meta = PHASE_META[g.key] ?? { label: g.key, color: '#64748b' }
    return { key: `${g.key}-${i}`, label: meta.label, start: g.start, end: g.end, color: meta.color }
  })
}

/** ImprovementRanking[] → ImprovementItem[] */
export function improvementsFromRankings(rankings: ImprovementRanking[]): ImprovementItem[] {
  return rankings.map((r) => ({
    rank: r.rank,
    label: r.label,
    issue: r.issue,
    advice: r.advice,
    // 改善効果はズレの大きさから概算（3〜10 点）
    delta: Math.max(3, Math.min(10, Math.round(r.delta_deg / 4))),
    tone: r.severity === 'high' ? 'bad' : r.severity === 'mid' ? 'warn' : 'good'
  }))
}

/** BodyPartScores → メトリクスの一部やコーチコメント素材として使えるように整形 */
export function partScoreEntries(scores: BodyPartScores): { key: string; label: string; score: number; tone: Tone; comment: string }[] {
  return Object.entries(scores)
    .filter(([, v]) => !!v)
    .map(([key, v]) => ({
      key,
      label: v!.label,
      score: v!.score,
      tone: toneFromStatus(v!.status),
      comment: v!.comments[0] ?? ''
    }))
}

/**
 * 実 API のレスポンス（PoseAnalysisResponse）から、ベースとなるモックへ
 * 上書きマージするための部分データを生成する。存在しないフィールドは
 * モック側の値をそのまま使う。
 */
export function proFromPoseResponse(
  resp: PoseAnalysisResponse
): Partial<ProAnalysis> & { landmarks?: PoseLandmark[] } {
  const pose: PoseResult | null = resp.pose
  const out: Partial<ProAnalysis> = { isSample: false }
  if (!pose) return out

  if (pose.key_angles && pose.key_angles.length) {
    out.angles = anglesFromKeyAngles(pose.key_angles)
  }
  if (pose.timeline && pose.timeline.length) {
    const p = phasesFromTimeline(pose.timeline)
    if (p) out.phases = p
  }
  if (pose.improvement_rankings && pose.improvement_rankings.length) {
    out.improvements = improvementsFromRankings(pose.improvement_rankings)
  }
  // 代表フレームの landmarks
  const keyFrame = pose.frames?.[pose.key_frame_index] ?? pose.frames?.[0]
  if (keyFrame?.landmarks?.length) {
    out.landmarks = keyFrame.landmarks
  }
  return out
}

import { PoseLandmark } from '../types'
import { IDEAL_LANDMARKS } from '../mocks/formAnalysisMock'
import {
  AngleLabel,
  AngleRow,
  ComparisonItem,
  CoachComment,
  HistoryEntry,
  ImprovementItem,
  MetricCard,
  MotionPhase,
  OverallScore,
  ProAnalysis,
  SessionInfo,
  ShotInfo,
  SkillProgress,
  SkillRadar,
  TrainingRec
} from '../types/analysis'

/**
 * 「実際に蹴った選手」の現在フォームを表す骨格（インパクト直後想定）。
 * 蹴り脚を大きく振り上げ、上体がやや後傾したフォーム。
 */
const CURRENT_LANDMARKS: PoseLandmark[] = [
  { name: 'nose', x: 0.47, y: 0.13, visibility: 1 },
  { name: 'left_shoulder', x: 0.4, y: 0.25, visibility: 1 },
  { name: 'right_shoulder', x: 0.56, y: 0.24, visibility: 1 },
  { name: 'left_elbow', x: 0.29, y: 0.33, visibility: 1 },
  { name: 'right_elbow', x: 0.69, y: 0.31, visibility: 1 },
  { name: 'left_wrist', x: 0.2, y: 0.42, visibility: 1 },
  { name: 'right_wrist', x: 0.8, y: 0.24, visibility: 1 },
  { name: 'left_hip', x: 0.44, y: 0.52, visibility: 1 },
  { name: 'right_hip', x: 0.57, y: 0.51, visibility: 1 },
  { name: 'left_knee', x: 0.41, y: 0.71, visibility: 1 },
  { name: 'right_knee', x: 0.72, y: 0.56, visibility: 1 },
  { name: 'left_ankle', x: 0.38, y: 0.9, visibility: 1 },
  { name: 'right_ankle', x: 0.87, y: 0.66, visibility: 1 },
  { name: 'left_foot_index', x: 0.36, y: 0.95, visibility: 1 },
  { name: 'right_foot_index', x: 0.93, y: 0.7, visibility: 1 }
]

/**
 * ヒーロー画像（実写級の選手写真）に重ねる用のプリセット骨格。
 * 同梱イラスト / 生成画像は「サイドビューのインステップキック」を想定した
 * 構図なので、画面全体（0-1）を基準に、その構図へ整列する固定ランドマークを
 * 定義する。実測骨格ではなくオーバーレイ表現用の代表点。
 * 構図: 選手は右向き、左足で踏み込み、右足を前方へ振り抜いてボールを捉える。
 */
export const HERO_PRESET_LANDMARKS: PoseLandmark[] = [
  { name: 'nose', x: 0.46, y: 0.2, visibility: 1 },
  { name: 'left_shoulder', x: 0.44, y: 0.31, visibility: 1 },
  { name: 'right_shoulder', x: 0.51, y: 0.31, visibility: 1 },
  { name: 'left_elbow', x: 0.37, y: 0.4, visibility: 1 },
  { name: 'right_elbow', x: 0.58, y: 0.41, visibility: 1 },
  { name: 'left_wrist', x: 0.31, y: 0.47, visibility: 1 },
  { name: 'right_wrist', x: 0.64, y: 0.48, visibility: 1 },
  { name: 'left_hip', x: 0.46, y: 0.53, visibility: 1 },
  { name: 'right_hip', x: 0.51, y: 0.53, visibility: 1 },
  { name: 'left_knee', x: 0.45, y: 0.69, visibility: 1 },
  { name: 'right_knee', x: 0.59, y: 0.61, visibility: 1 },
  { name: 'left_ankle', x: 0.44, y: 0.85, visibility: 1 },
  { name: 'right_ankle', x: 0.71, y: 0.66, visibility: 1 },
  { name: 'left_foot_index', x: 0.48, y: 0.89, visibility: 1 },
  { name: 'right_foot_index', x: 0.77, y: 0.68, visibility: 1 }
]

const MOCK_ANGLE_ROWS: AngleRow[] = [
  { key: 'upper_lean', label: '上半身の傾き', current: 24, ideal: 12, unit: '°', status: 'bad' },
  { key: 'pelvis', label: '骨盤の傾き', current: 9, ideal: 4, unit: '°', status: 'warn' },
  { key: 'plant_leg', label: '支持脚角度', current: 168, ideal: 170, unit: '°', status: 'good' },
  { key: 'kick_backswing', label: '蹴り脚の振り上げ', current: 118, ideal: 135, unit: '°', status: 'warn' },
  { key: 'knee', label: '膝角度', current: 148, ideal: 158, unit: '°', status: 'warn' },
  { key: 'ankle', label: '足首角度', current: 122, ideal: 128, unit: '°', status: 'good' },
  { key: 'follow_through', label: 'フォロースルー角度', current: 96, ideal: 120, unit: '°', status: 'bad' }
]

const MOCK_ANGLE_LABELS: AngleLabel[] = [
  { joint: 'right_knee', label: '膝', value: 148, ideal: 158, unit: '°', status: 'warn' },
  { joint: 'left_knee', label: '支持脚', value: 168, ideal: 170, unit: '°', status: 'good' },
  { joint: 'right_hip', label: '骨盤', value: 9, ideal: 4, unit: '°', status: 'warn' },
  { joint: 'left_shoulder', label: '上体', value: 24, ideal: 12, unit: '°', status: 'bad' },
  { joint: 'right_ankle', label: '足首', value: 122, ideal: 128, unit: '°', status: 'good' }
]

const MOCK_SHOT: ShotInfo = {
  title: 'Shot #128 · インステップ',
  mainSrc: null,
  thumbs: [
    { id: 't1', time: '00:00.8' },
    { id: 't2', time: '00:01.2' },
    { id: 't3', time: '00:01.6' }
  ],
  duration: 2.4
}

const MOCK_SESSION: SessionInfo = {
  formation: 'インステップキック',
  phase: 'インパクト',
  time: '00:01.42',
  confidence: 87
}

const MOCK_OVERALL: OverallScore = {
  score: 88,
  max: 100,
  headline: '素晴らしいフォームです',
  chips: [
    { label: '安定性', value: '高い', tone: 'good' },
    { label: 'パワー', value: '強い', tone: 'good' },
    { label: 'キレ', value: '良好', tone: 'good' }
  ]
}

const MOCK_PHASES: MotionPhase[] = [
  { key: 'approach', label: '助走', start: 0, end: 0.3, color: '#38bdf8' },
  { key: 'takeback', label: 'テイクバック', start: 0.3, end: 0.6, color: '#a78bfa' },
  { key: 'impact', label: 'インパクト', start: 0.6, end: 0.8, color: '#f97316' },
  { key: 'follow_through', label: 'フォロースルー', start: 0.8, end: 1, color: '#22c55e' }
]

const MOCK_COMPARISONS: ComparisonItem[] = [
  { key: 'plant_dist', label: '軸足の位置', current: 74, ideal: 90, pro: 94, previous: 70, unit: '%' },
  { key: 'backswing', label: '振り上げの深さ', current: 62, ideal: 85, pro: 91, previous: 58, unit: '%' },
  { key: 'impact_timing', label: 'インパクト精度', current: 88, ideal: 92, pro: 96, previous: 83, unit: '%' },
  { key: 'follow', label: 'フォロースルー', current: 55, ideal: 88, pro: 93, previous: 60, unit: '%' },
  { key: 'balance', label: '体幹の安定', current: 79, ideal: 90, pro: 95, previous: 74, unit: '%' }
]

const MOCK_RADAR: SkillRadar = {
  axes: ['シュート', 'パス', 'ドリブル', 'ポジショニング', 'フィジカル'],
  current: [88, 72, 68, 76, 81],
  previous: [80, 70, 62, 71, 77]
}

const MOCK_PROGRESS: SkillProgress = {
  months: ['2月', '3月', '4月', '5月', '6月', '7月'],
  series: {
    シュート: [72, 75, 78, 80, 84, 88],
    パス: [65, 66, 68, 69, 71, 72],
    ドリブル: [58, 60, 61, 64, 66, 68]
  }
}

const MOCK_HISTORY: HistoryEntry[] = [
  { id: 'h1', date: '7/9', score: 88 },
  { id: 'h2', date: '7/2', score: 83 },
  { id: 'h3', date: '6/25', score: 81 },
  { id: 'h4', date: '6/18', score: 77 }
]

const MOCK_RECS: TrainingRec[] = [
  { id: 'r1', title: 'インパクト強化ドリル', focus: '蹴り脚の振り抜き', duration: '15分', tag: 'パワー', tone: 'bad' },
  { id: 'r2', title: '軸足固定トレーニング', focus: '支持脚の安定', duration: '10分', tag: 'バランス', tone: 'warn' },
  { id: 'r3', title: 'フォロースルー改善', focus: '蹴った後の姿勢', duration: '12分', tag: 'フォーム', tone: 'good' }
]

const MOCK_METRICS: MetricCard[] = [
  { key: 'speed', label: '推定シュート速度', value: 96, max: 130, unit: 'km/h', tone: 'good', gauge: 'semi', caption: 'リーグ平均+8' },
  { key: 'impact', label: 'インパクトの強さ', value: 82, max: 100, unit: 'pt', tone: 'good', gauge: 'circle', caption: '強い' },
  { key: 'stability', label: 'フォーム安定性', value: 79, max: 100, unit: 'pt', tone: 'warn', gauge: 'circle', caption: 'やや後傾' },
  { key: 'power', label: 'パワー効率', value: 74, max: 100, unit: '%', tone: 'warn', gauge: 'semi', caption: '伝達ロスあり' },
  { key: 'injury', label: 'ケガのリスク', value: 22, max: 100, unit: '%', tone: 'good', gauge: 'circle', caption: '低い' }
]

const MOCK_COACH: CoachComment = {
  good: 'あなたのフォームはインパクト直前の軸足が安定しており、強いシュートが期待できます。上半身のひねりから足先までの連動もスムーズで、ボールに芯で当てられています。',
  improvement: '改善点はフォロースルーです。蹴った後に膝がやや外へ流れており、力が最後まで伝わり切っていません。振り上げの深さももう一段確保できると、球速がさらに伸びます。',
  next: '次回は軸足をボール横20cmに置く意識をしてください。蹴り終わりでつま先を目標方向へ真っすぐ送り切ると、フォロースルーの評価が大きく改善します。'
}

const MOCK_IMPROVEMENTS: ImprovementItem[] = [
  { rank: 1, label: 'フォロースルー', issue: '蹴り足が外へ流れる', advice: 'つま先を目標へ送り切る', delta: 6, tone: 'bad' },
  { rank: 2, label: '骨盤の開き', issue: '開きが早く力が逃げる', advice: 'インパクトまで開きを我慢', delta: 4, tone: 'warn' },
  { rank: 3, label: '足首の固定', issue: 'ミート時に緩む', advice: '足首をロックして当てる', delta: 3, tone: 'good' }
]

/** 画面全体を成立させる完全モック。実データがあれば proFromPoseResponse で上書き。 */
export const MOCK_PRO_ANALYSIS: ProAnalysis = {
  isSample: true,
  shot: MOCK_SHOT,
  session: MOCK_SESSION,
  angles: MOCK_ANGLE_ROWS,
  landmarks: CURRENT_LANDMARKS,
  angleLabels: MOCK_ANGLE_LABELS,
  overall: MOCK_OVERALL,
  phases: MOCK_PHASES,
  comparisons: MOCK_COMPARISONS,
  radar: MOCK_RADAR,
  progress: MOCK_PROGRESS,
  history: MOCK_HISTORY,
  recommendations: MOCK_RECS,
  metrics: MOCK_METRICS,
  coach: MOCK_COACH,
  improvements: MOCK_IMPROVEMENTS
}

export { CURRENT_LANDMARKS, IDEAL_LANDMARKS }

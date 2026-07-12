import { PoseLandmark } from '../types'
import {
  KICK_ANALYSIS_SCHEMA_VERSION,
  KickAnalysisResult
} from '../types/kickAnalysis'
import { IDEAL_ANGLE_RANGES } from '../constants/idealForm'

// =====================================================================
// キックフォーム分析（/analysis/kick）用モックデータ
//
// 画面コンポーネントに固定値を直接書かず、すべてここに集約する。
// API 契約 v1.0（types/kickAnalysis.ts）と同一の型で定義し、
// 実 API と差し替え可能にしている。
//
// 旧 mocks/formAnalysisMock.ts / data/mockAnalysisData.ts は legacy
// ページ用に残置。新画面からは参照しないこと。
// =====================================================================

/** サンプルバッジ表示等に使う識別子 */
export const MOCK_ANALYSIS_ID = 'sample-kick-analysis'

function range(id: string): { min: number; max: number } | undefined {
  const r = IDEAL_ANGLE_RANGES[id]
  return r ? { min: r.min, max: r.max } : undefined
}

/** 完全モック（初回訪問・解析ゼロ件時のサンプル表示用） */
export const MOCK_KICK_ANALYSIS: KickAnalysisResult = {
  schemaVersion: KICK_ANALYSIS_SCHEMA_VERSION,
  analysisId: MOCK_ANALYSIS_ID,
  status: 'completed',
  createdAt: '2026-07-09T18:30:00',
  video: {
    durationMs: 2400,
    fps: 30,
    width: 1280,
    height: 720,
    orientation: 'landscape'
  },
  captureQuality: {
    score: 87,
    status: 'available',
    cameraView: 'side',
    fullBodyVisible: true,
    singlePersonDetected: true,
    brightnessScore: 78,
    blurScore: 82,
    warnings: []
  },
  phases: [
    { type: 'approach', startFrame: 0, peakFrame: 1, endFrame: 2, confidence: 0.87 },
    { type: 'backswing', startFrame: 3, peakFrame: 4, endFrame: 5, confidence: 0.87 },
    { type: 'impact', startFrame: 6, peakFrame: 6, endFrame: 7, confidence: 0.87 },
    { type: 'follow_through', startFrame: 8, peakFrame: 8, endFrame: 9, confidence: 0.87 }
  ],
  scores: {
    overall: 88,
    supportLeg: 82,
    kickingLeg: 74,
    upperBody: 68,
    balance: 79,
    followThrough: 62
  },
  metrics: [
    {
      id: 'torso_lean',
      label: IDEAL_ANGLE_RANGES.torso_lean.label,
      value: 24,
      unit: 'deg',
      frame: 6,
      phase: 'impact',
      idealRange: range('torso_lean'),
      confidence: 0.87,
      status: 'good',
      measurementStatus: 'available'
    },
    {
      id: 'pelvis_tilt',
      label: IDEAL_ANGLE_RANGES.pelvis_tilt.label,
      value: 9,
      unit: 'deg',
      frame: 6,
      phase: 'impact',
      idealRange: range('pelvis_tilt'),
      confidence: 0.87,
      status: 'excellent',
      measurementStatus: 'available'
    },
    {
      id: 'support_leg',
      label: IDEAL_ANGLE_RANGES.support_leg.label,
      value: 168,
      unit: 'deg',
      frame: 6,
      phase: 'impact',
      idealRange: range('support_leg'),
      confidence: 0.87,
      status: 'good',
      measurementStatus: 'available'
    },
    {
      id: 'backswing',
      label: IDEAL_ANGLE_RANGES.backswing.label,
      value: 118,
      unit: 'deg',
      frame: 4,
      phase: 'backswing',
      idealRange: range('backswing'),
      confidence: 0.87,
      status: 'warning',
      measurementStatus: 'available'
    },
    {
      id: 'knee_impact',
      label: IDEAL_ANGLE_RANGES.knee_impact.label,
      value: 148,
      unit: 'deg',
      frame: 6,
      phase: 'impact',
      idealRange: range('knee_impact'),
      confidence: 0.87,
      status: 'good',
      measurementStatus: 'available'
    },
    {
      id: 'ankle_impact',
      label: IDEAL_ANGLE_RANGES.ankle_impact.label,
      value: 122,
      unit: 'deg',
      frame: 6,
      phase: 'impact',
      idealRange: range('ankle_impact'),
      confidence: 0.87,
      status: 'good',
      measurementStatus: 'available'
    },
    {
      id: 'follow_through',
      label: IDEAL_ANGLE_RANGES.follow_through.label,
      value: 96,
      unit: 'deg',
      frame: 9,
      phase: 'follow_through',
      idealRange: range('follow_through'),
      confidence: 0.87,
      status: 'warning',
      measurementStatus: 'available'
    },
    {
      id: 'ball_speed',
      label: '推定シュート速度',
      value: 110,
      unit: 'km/h',
      confidence: 0.6,
      status: 'excellent',
      measurementStatus: 'low_confidence'
    }
  ],
  feedback: {
    strengths: [
      'インパクト直前の軸足が安定しており、強いシュートが期待できます',
      '上半身のひねりから足先までの連動がスムーズで、ボールに芯で当てられています'
    ],
    priorities: [
      {
        rank: 1,
        label: 'フォロースルー',
        issue: '蹴り足が外へ流れており、力が最後まで伝わり切っていません',
        advice: '蹴り終わりでつま先を目標方向へ真っすぐ送り切りましょう',
        severity: 'high',
        relatedMetricId: 'follow_through'
      },
      {
        rank: 2,
        label: '蹴り脚の振り上げ',
        issue: 'バックスイングが浅く、キックの威力が出にくいフォームです',
        advice: 'かかとをお尻に近づけるように膝を深く畳みましょう',
        severity: 'mid',
        relatedMetricId: 'backswing'
      },
      {
        rank: 3,
        label: '足首の固定',
        issue: 'ミートの瞬間に足首がやや緩んでいます',
        advice: '足首をロックしてインパクトの精度を高めましょう',
        severity: 'low',
        relatedMetricId: 'ankle_impact'
      }
    ],
    drills: [
      {
        id: 'drill-impact',
        title: 'インパクト強化ドリル',
        focus: '蹴り脚の振り抜き',
        durationMinutes: 15,
        tag: 'パワー'
      },
      {
        id: 'drill-plant',
        title: '軸足固定トレーニング',
        focus: '支持脚の安定',
        durationMinutes: 10,
        tag: 'バランス'
      },
      {
        id: 'drill-follow',
        title: 'フォロースルー改善',
        focus: '蹴った後の姿勢',
        durationMinutes: 12,
        tag: 'フォーム'
      }
    ]
  },
  history: [
    { analysisId: 'sample-h1', createdAt: '2026-07-09T18:30:00', overallScore: 88, thumbnailUrl: null },
    { analysisId: 'sample-h2', createdAt: '2026-07-02T17:10:00', overallScore: 83, thumbnailUrl: null },
    { analysisId: 'sample-h3', createdAt: '2026-06-25T18:05:00', overallScore: 81, thumbnailUrl: null },
    { analysisId: 'sample-h4', createdAt: '2026-06-18T18:40:00', overallScore: 77, thumbnailUrl: null }
  ]
}

/**
 * サンプル表示用の現在フォーム骨格（インパクト直後想定・正規化座標 0-1）。
 * 実解析時は PoseAnalysisResponse.pose.frames[].landmarks を使う。
 */
export const MOCK_KICK_LANDMARKS: PoseLandmark[] = [
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
 * 比較ベースライン（プロ平均・前回平均）のモック。
 * バックエンド未実装のため常にモック（API 契約 v1.1 で配布予定）。
 * key は KickMetric.id。
 */
export interface ComparisonBaselineValues {
  metricId: string
  pro: number
  previous: number
}

export const MOCK_COMPARISON_BASELINES: ComparisonBaselineValues[] = [
  { metricId: 'support_leg', pro: 168, previous: 160 },
  { metricId: 'backswing', pro: 92, previous: 122 },
  { metricId: 'knee_impact', pro: 132, previous: 143 },
  { metricId: 'follow_through', pro: 128, previous: 101 },
  { metricId: 'torso_lean', pro: 14, previous: 27 }
]

/** 「リーグ平均+8 km/h」等の比較キャプション（バックエンド未実装のためモック） */
export const MOCK_BALL_SPEED_LEAGUE_DELTA = 8

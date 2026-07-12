import { PoseLandmark } from '../types'

/**
 * 理想フォーム基準値の単一ソース（フロントエンド側）。
 *
 * 監査で「同一概念の理想値が backend / mockAnalysisData / formAnalysisMock の
 * 3 ソースで食い違う」問題が確認されたため、新画面（/analysis/kick）は
 * 必ずこのモジュールだけを参照する。
 *
 * レンジはバックエンド `pose_estimator.py` の `_score` / `_RANKING_META` と
 * 一致させてある（キーは `key_angles` の key と同一）。
 *
 * TODO(api-contract-v1.1): バックエンドが API 契約 v1.1 で
 * `metrics[].idealRange` を配布するようになったら、この定義を削除して
 * API 応答の値へ完全に置換する。
 */

export interface IdealAngleRange {
  /** 表示ラベル（日本語） */
  label: string
  /** 理想レンジ下限（度） */
  min: number
  /** 理想レンジ上限（度） */
  max: number
}

/** key は backend `key_angles[].key` / `KickMetric.id` と共通 */
export const IDEAL_ANGLE_RANGES: Record<string, IdealAngleRange> = {
  torso_lean: { label: '上半身の傾き', min: 5, max: 25 },
  pelvis_tilt: { label: '骨盤の傾き', min: 3, max: 15 },
  support_leg: { label: '支持脚の角度', min: 140, max: 175 },
  backswing: { label: '蹴り脚の振り上げ', min: 60, max: 110 },
  knee_impact: { label: '膝の角度（インパクト時）', min: 110, max: 150 },
  ankle_impact: { label: '足首の角度（インパクト時）', min: 120, max: 160 },
  follow_through: { label: 'フォロースルー角度', min: 110, max: 150 },
  arm_extension: { label: '腕の開き', min: 90, max: 170 }
}

/** レンジの中央値（差分表示のアンカーに使用） */
export function idealMidpoint(range: IdealAngleRange): number {
  return (range.min + range.max) / 2
}

/**
 * 理想フォームのデフォルト骨格（正規化座標 0-1、MediaPipe Pose 準拠の代表点）。
 * AvatarViewer のゴースト表示・理想フォーム表示に使用する。
 * （旧 `mocks/formAnalysisMock.ts` から移設。ここが唯一の定義元）
 */
export const IDEAL_LANDMARKS: PoseLandmark[] = [
  { name: 'nose', x: 0.5, y: 0.12, visibility: 1 },
  { name: 'left_shoulder', x: 0.42, y: 0.24, visibility: 1 },
  { name: 'right_shoulder', x: 0.58, y: 0.23, visibility: 1 },
  { name: 'left_elbow', x: 0.33, y: 0.34, visibility: 1 },
  { name: 'right_elbow', x: 0.68, y: 0.3, visibility: 1 },
  { name: 'left_wrist', x: 0.26, y: 0.45, visibility: 1 },
  { name: 'right_wrist', x: 0.78, y: 0.22, visibility: 1 },
  { name: 'left_hip', x: 0.45, y: 0.5, visibility: 1 },
  { name: 'right_hip', x: 0.56, y: 0.49, visibility: 1 },
  { name: 'left_knee', x: 0.4, y: 0.68, visibility: 1 },
  { name: 'right_knee', x: 0.68, y: 0.6, visibility: 1 },
  { name: 'left_ankle', x: 0.37, y: 0.88, visibility: 1 },
  { name: 'right_ankle', x: 0.78, y: 0.74, visibility: 1 },
  { name: 'left_foot_index', x: 0.35, y: 0.93, visibility: 1 },
  { name: 'right_foot_index', x: 0.86, y: 0.8, visibility: 1 }
]

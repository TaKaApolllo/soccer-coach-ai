import { BodyPartScores, CenterOfGravity, ImprovementRanking, PoseLandmark } from '../types'

/**
 * バックエンドの /form-analysis 系エンドポイントが実装されるまでの
 * 見た目確認用モックデータ。データ契約はバックエンドと共有済み。
 */
export const MOCK_BODY_PART_SCORES: BodyPartScores = {
  plant_leg: {
    label: '軸足',
    score: 82,
    status: 'good',
    comments: ['軸足の位置と膝のクッションが理想的です'],
    angles: { knee: 167 }
  },
  kicking_leg: {
    label: '蹴り足',
    score: 58,
    status: 'warn',
    comments: [
      '蹴り足の膝の振りが小さいため、ボールに力が伝わりにくいです。かかとをお尻に近づけるように深く畳みましょう'
    ],
    angles: { backswing: 128, knee_impact: 133 }
  },
  upper_body: {
    label: '上半身',
    score: 45,
    status: 'bad',
    comments: [
      '上半身が後ろに倒れているため、シュートが浮きやすくなります。胸をボールにかぶせる意識を持ちましょう'
    ],
    angles: { lean: 32, pelvis: 6 }
  },
  balance: {
    label: 'バランス',
    score: 74,
    status: 'warn',
    comments: ['腕の開きは良好ですが、重心がやや後ろに残っています'],
    angles: { arm: 130 }
  }
}

export const MOCK_IMPROVEMENT_RANKINGS: ImprovementRanking[] = [
  {
    rank: 1,
    part: 'upper_body',
    label: '上半身',
    issue: '後傾が大きい',
    advice: '胸をボールにかぶせる',
    delta_deg: 22,
    severity: 'high'
  },
  {
    rank: 2,
    part: 'kicking_leg',
    label: '蹴り足',
    issue: 'バックスイングが浅い',
    advice: '膝を深く畳む',
    delta_deg: 33,
    severity: 'mid'
  },
  {
    rank: 3,
    part: 'balance',
    label: 'バランス',
    issue: '重心がやや後ろ寄り',
    advice: '軸足の上に重心を残す',
    delta_deg: 9,
    severity: 'low'
  }
]

export const MOCK_CENTER_OF_GRAVITY: CenterOfGravity = {
  x: 0.52,
  y: 0.55,
  over_plant_foot: false,
  comment: '重心が軸足に乗っていません'
}

export const MOCK_OVERALL_SCORE = 64

/** 角度キーごとの理想値と表示ラベル（関節角度の差分テーブル用の基準値） */
export const IDEAL_ANGLES: Record<string, { label: string; ideal: number }> = {
  knee: { label: '軸足の膝', ideal: 170 },
  backswing: { label: 'バックスイング', ideal: 160 },
  knee_impact: { label: 'インパクト時の膝', ideal: 165 },
  lean: { label: '上体の傾き', ideal: 10 },
  pelvis: { label: '骨盤の回旋', ideal: 0 },
  arm: { label: '腕の開き', ideal: 145 }
}

/** 理想フォームのデフォルト骨格（正規化座標 0-1、MediaPipe Pose準拠の代表点） */
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

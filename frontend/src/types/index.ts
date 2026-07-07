export interface AnalysisType {
  id: string
  name: string
  description: string
}

export interface AnalysisSections {
  good_points: string
  improvements: string
  advice: string
  reference_player: string
  practice_menu: string
}

export interface AIFeedback {
  analysis_type: string
  raw_analysis: string
  score?: number | null
  sections: AnalysisSections
  note?: string
}

export interface AnalysisResult {
  id: string
  filename: string
  analysis_type: string
  created_at: string
  analysis: AIFeedback
}

export interface AnalysisHistoryItem {
  id: string
  filename: string
  media_type: string
  analysis_type: string
  score: number | null
  created_at: string
}

export interface AnalysisHistory {
  analyses: AnalysisHistoryItem[]
}

// ---------------------------------------------------------------
// 骨格推定（フォーム解析）
// ---------------------------------------------------------------

export interface PoseLandmark {
  name: string
  x: number
  y: number
  visibility: number
}

export interface PoseFrame {
  frame_index: number
  landmarks: PoseLandmark[]
  angles: Record<string, number>
  phase: string
}

export interface ScoreBreakdownItem {
  key: string
  label: string
  value: number
  ideal_range: [number, number]
  score: number
  description: string
}

export interface PoseResult {
  frames: PoseFrame[]
  annotated_images: string[]
  key_frame_index: number
  metrics: Record<string, number>
  score: number
  score_breakdown: ScoreBreakdownItem[]
  phases: string[]
}

export interface PoseAnalysisResponse {
  id: string
  filename: string
  analysis_type: string
  created_at: string
  score: number | null
  pose: PoseResult | null
  pose_error: string | null
  ai_feedback: AIFeedback
}

// ---------------------------------------------------------------
// フォーメーション解析
// ---------------------------------------------------------------

export interface FormationPlayer {
  index: number
  role: string
  is_goalkeeper: boolean
  detected_x: number
  detected_y: number
  board_x: number
  board_y: number
}

export interface TeamFormation {
  team: number
  name: string
  formation: string
  confidence: number
  line_counts: number[]
  jersey_color: string | null
  players: FormationPlayer[]
}

export interface FormationResponse {
  id: string
  filename: string
  created_at: string
  backend: string
  player_count: number
  teams: TeamFormation[]
  ball: { x: number; y: number } | null
  annotated_image: string
  pitch: { length: number; width: number }
}

// ---------------------------------------------------------------
// 成長記録
// ---------------------------------------------------------------

export interface RadarData {
  axes: string[]
  current: number[]
  previous: number[]
}

export interface Achievement {
  code: string
  title: string
  description: string
  achieved_at: string
}

export interface GrowthSummary {
  radar: RadarData
  recent_analyses: AnalysisHistoryItem[]
  achievements: Achievement[]
  today_drill: { menu: string; focus_skill: string | null }
}

export interface TrendData {
  months: string[]
  series: Record<string, (number | null)[]>
}

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
  ball_speed: { speed_kmh: number; approximate: boolean } | null
  kick_angle_range: { min: number; max: number } | null
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

// ---------------------------------------------------------------
// 戦術分析
// ---------------------------------------------------------------

export interface TeamTactics {
  team: number
  width_m: number
  depth_m: number
  compactness: number
  line_x: Record<string, number>
  line_gaps_m: Record<string, number>
  line_gap_warnings: string[]
  block_height: string
  press_intensity: number
  slide_offset_m: number
  side_space_m: { left: number; right: number }
  central_density: number
  attack_width_score: number
  attack_depth_score: number
  support_score: number
  defensive_block_score: number
}

export interface SpaceZone {
  x: number
  y: number
  type: 'danger' | 'opportunity'
  label: string
}

export interface SpaceAnalysis {
  grid_w: number
  grid_h: number
  control: number[][]
  zones: SpaceZone[]
}

export interface PassOption {
  index: number
  x: number
  y: number
  distance_m: number
  success: number
  progress_m: number
  risk: number
  interceptors: number
  class: 'safe' | 'progressive' | 'risky'
  label: string
}

export interface PassAnalysis {
  holder: { team: number; index: number; x: number; y: number }
  options: PassOption[]
  recommendation: string
}

export interface OffsideTeam {
  team: number
  line_x: number | null
  gk_x?: number
  behind_space_m?: number
  height_level?: 'ok' | 'warning'
  assessment?: string
  runnable_behind?: boolean
}

export interface Tactics {
  attack_ltr: boolean[]
  teams: TeamTactics[]
  space: SpaceAnalysis
  passing: PassAnalysis | null
  offside: { teams: OffsideTeam[] }
}

export type CoachLevel = 'beginner' | 'intermediate' | 'advanced'

export interface CoachLevelContent {
  good_points: string[]
  issues: string[]
  improvements: string[]
}

export interface Coaching {
  focus_team: number
  good_points: string[]
  issues: string[]
  improvements: string[]
  levels: Record<CoachLevel, CoachLevelContent>
  individual: { target: string; comment: string }[]
  next_drill: { issue: string | null; menu: string; reason: string }
  llm_summary?: string
}

export interface PhaseFormation {
  formation: string
  confidence: number
  samples: number
}

export interface Phases {
  frames_analyzed: number
  teams: {
    team: number
    attack: PhaseFormation | null
    defense: PhaseFormation | null
  }[]
}

export interface Comparison {
  previous_id: string
  previous_date: string
  previous_scores: Record<string, number>
  deltas: Record<string, number>
  comment: string
}

export interface FormationResponse {
  id: string
  filename: string
  created_at: string
  backend: string
  player_count: number
  frames_analyzed: number
  teams: TeamFormation[]
  phases: Phases | null
  tactics: Tactics | null
  coaching: Coaching | null
  tactical_scores: Record<string, number>
  comparison: Comparison | null
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

export interface TacticalTrendData extends TrendData {
  growth_comments: string[]
}

export interface AnalysisType {
  id: string
  name: string
  description: string
}

export interface AnalysisResult {
  id: string
  filename: string
  analysis_type: string
  created_at: string
  analysis: {
    analysis_type: string
    raw_analysis: string
    sections: {
      good_points: string
      improvements: string
      advice: string
      reference_player: string
      practice_menu: string
    }
  }
}

export interface AnalysisHistory {
  analyses: AnalysisResult[]
}

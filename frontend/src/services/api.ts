import axios from 'axios'
import {
  AnalysisHistory,
  AnalysisResult,
  AnalysisType,
  FormationResponse,
  GrowthSummary,
  PoseAnalysisResponse,
  TacticalTrendData,
  TrendData
} from '../types'

const API_BASE = '/api'

export const api = {
  // ---------------------------------------------------------------
  // フォーム解析（骨格推定 + AI コーチング）
  // ---------------------------------------------------------------

  async analyzePose(
    file: File,
    analysisType: string,
    context?: string,
    faceMode: 'real' | 'avatar' = 'real'
  ): Promise<PoseAnalysisResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('analysis_type', analysisType)
    if (context) formData.append('context', context)
    formData.append('face_mode', faceMode)

    const response = await axios.post<PoseAnalysisResponse>(
      `${API_BASE}/pose/analyze`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 }
    )
    return response.data
  },

  // ---------------------------------------------------------------
  // フォーメーション解析
  // ---------------------------------------------------------------

  async analyzeFormation(
    file: File,
    teamAName?: string,
    teamBName?: string,
    focusTeam = 0
  ): Promise<FormationResponse> {
    const formData = new FormData()
    formData.append('file', file)
    if (teamAName) formData.append('team_a_name', teamAName)
    if (teamBName) formData.append('team_b_name', teamBName)
    formData.append('focus_team', String(focusTeam))

    const response = await axios.post<FormationResponse>(
      `${API_BASE}/formation/analyze`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 }
    )
    return response.data
  },

  // ---------------------------------------------------------------
  // 従来の Vision 解析
  // ---------------------------------------------------------------

  async analyzeMedia(
    file: File,
    analysisType: string,
    context?: string
  ): Promise<AnalysisResult> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('analysis_type', analysisType)
    if (context) formData.append('context', context)

    const response = await axios.post<AnalysisResult>(
      `${API_BASE}/analyze`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 }
    )
    return response.data
  },

  async getAnalysisTypes(): Promise<{ types: AnalysisType[] }> {
    const response = await axios.get<{ types: AnalysisType[] }>(
      `${API_BASE}/analysis-types`
    )
    return response.data
  },

  // ---------------------------------------------------------------
  // 履歴・成長記録
  // ---------------------------------------------------------------

  async getHistory(): Promise<AnalysisHistory> {
    const response = await axios.get<AnalysisHistory>(`${API_BASE}/history`)
    return response.data
  },

  async getAnalysis(id: string): Promise<Record<string, unknown>> {
    const response = await axios.get(`${API_BASE}/history/${id}`)
    return response.data
  },

  /** 指定タイプの最新解析（ペイロード込み）。"pose" で骨格解析系の最新 */
  async getLatestAnalysis<T = Record<string, unknown>>(
    analysisType: string
  ): Promise<{ id: string; created_at: string; analysis: T } | null> {
    try {
      const response = await axios.get(`${API_BASE}/history-latest/${analysisType}`)
      return response.data
    } catch {
      return null
    }
  },

  async deleteAnalysis(id: string): Promise<void> {
    await axios.delete(`${API_BASE}/history/${id}`)
  },

  async getGrowthSummary(): Promise<GrowthSummary> {
    const response = await axios.get<GrowthSummary>(`${API_BASE}/growth/summary`)
    return response.data
  },

  async getGrowthTrend(months = 8): Promise<TrendData> {
    const response = await axios.get<TrendData>(
      `${API_BASE}/growth/trend`,
      { params: { months } }
    )
    return response.data
  },

  async getTacticalTrend(months = 8): Promise<TacticalTrendData> {
    const response = await axios.get<TacticalTrendData>(
      `${API_BASE}/growth/tactical-trend`,
      { params: { months } }
    )
    return response.data
  }
}

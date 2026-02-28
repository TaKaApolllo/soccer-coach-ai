import axios from 'axios'
import { AnalysisResult, AnalysisType, AnalysisHistory } from '../types'

const API_BASE = '/api'

export const api = {
  async analyzeMedia(
    file: File,
    analysisType: string,
    context?: string
  ): Promise<AnalysisResult> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('analysis_type', analysisType)
    if (context) {
      formData.append('context', context)
    }

    const response = await axios.post<AnalysisResult>(
      `${API_BASE}/analyze`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )

    return response.data
  },

  async getAnalysisTypes(): Promise<{ types: AnalysisType[] }> {
    const response = await axios.get<{ types: AnalysisType[] }>(
      `${API_BASE}/analysis-types`
    )
    return response.data
  },

  async getHistory(): Promise<AnalysisHistory> {
    const response = await axios.get<AnalysisHistory>(`${API_BASE}/history`)
    return response.data
  },

  async getAnalysis(id: string): Promise<AnalysisResult> {
    const response = await axios.get<AnalysisResult>(`${API_BASE}/history/${id}`)
    return response.data
  },

  async deleteAnalysis(id: string): Promise<void> {
    await axios.delete(`${API_BASE}/history/${id}`)
  }
}

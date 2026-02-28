import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { AnalysisResult } from '../types'

function HistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([])
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const data = await api.getHistory()
      setAnalyses(data.analyses)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この解析結果を削除しますか？')) return

    try {
      await api.deleteAnalysis(id)
      setAnalyses(analyses.filter((a) => a.id !== id))
      if (selectedAnalysis?.id === id) {
        setSelectedAnalysis(null)
      }
    } catch (err) {
      console.error('Failed to delete analysis:', err)
    }
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getAnalysisTypeName = (type: string): string => {
    const names: Record<string, string> = {
      kick: 'キックフォーム分析',
      pass: 'パス分析',
      positioning: 'ポジショニング分析',
      movement: '動き出し分析',
      general: '総合分析'
    }
    return names[type] || type
  }

  if (loading) {
    return (
      <div className="card">
        <p>読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="history-page">
      <div className="card">
        <h2 className="card-title">解析履歴</h2>

        {analyses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>まだ解析履歴がありません</p>
            <p>ホームページから動画・画像をアップロードして解析を始めましょう</p>
          </div>
        ) : (
          <div className="history-list">
            {analyses.map((analysis) => (
              <div key={analysis.id} className="history-item">
                <div className="history-item-info">
                  <h3>{analysis.filename}</h3>
                  <div className="history-item-meta">
                    {getAnalysisTypeName(analysis.analysis_type)} | {formatDate(analysis.created_at)}
                  </div>
                </div>
                <div className="history-item-actions">
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() => setSelectedAnalysis(analysis)}
                  >
                    詳細
                  </button>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => handleDelete(analysis.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedAnalysis && (
        <div className="card analysis-result">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>
              {selectedAnalysis.filename} の解析結果
            </h2>
            <button
              className="btn btn-small"
              onClick={() => setSelectedAnalysis(null)}
              style={{ background: 'var(--border-color)' }}
            >
              閉じる
            </button>
          </div>

          <div className="result-section">
            <h3>📝 詳細分析</h3>
            <p>{selectedAnalysis.analysis.raw_analysis}</p>
          </div>

          {selectedAnalysis.analysis.sections.good_points && (
            <div className="result-section">
              <h3>✅ 良い点</h3>
              <p>{selectedAnalysis.analysis.sections.good_points}</p>
            </div>
          )}

          {selectedAnalysis.analysis.sections.improvements && (
            <div className="result-section">
              <h3>🎯 改善点</h3>
              <p>{selectedAnalysis.analysis.sections.improvements}</p>
            </div>
          )}

          {selectedAnalysis.analysis.sections.advice && (
            <div className="result-section">
              <h3>💡 具体的アドバイス</h3>
              <p>{selectedAnalysis.analysis.sections.advice}</p>
            </div>
          )}

          {selectedAnalysis.analysis.sections.reference_player && (
            <div className="result-section">
              <h3>⭐ 参考選手</h3>
              <p>{selectedAnalysis.analysis.sections.reference_player}</p>
            </div>
          )}

          {selectedAnalysis.analysis.sections.practice_menu && (
            <div className="result-section">
              <h3>🏃 練習メニュー</h3>
              <p>{selectedAnalysis.analysis.sections.practice_menu}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HistoryPage

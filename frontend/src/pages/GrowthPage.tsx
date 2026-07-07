import { useEffect, useState } from 'react'
import RadarChart from '../components/RadarChart'
import TrendChart from '../components/TrendChart'
import { api } from '../services/api'
import { AnalysisHistoryItem, GrowthSummary, TacticalTrendData, TrendData } from '../types'

const TYPE_NAMES: Record<string, string> = {
  kick: 'キックフォーム分析',
  pass: 'パス分析',
  dribble: 'ドリブル分析',
  positioning: 'ポジショニング分析',
  movement: '動き出し分析',
  general: '総合分析',
  formation: 'フォーメーション解析'
}

function GrowthPage() {
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [tacticalTrend, setTacticalTrend] = useState<TacticalTrendData | null>(null)
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getGrowthSummary(),
      api.getGrowthTrend(),
      api.getTacticalTrend(),
      api.getHistory()
    ])
      .then(([s, t, tt, h]) => {
        setSummary(s)
        setTrend(t)
        setTacticalTrend(tt)
        setHistory(h.analyses)
      })
      .catch((err) => console.error('Failed to load growth data:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('この解析結果を削除しますか？')) return
    try {
      await api.deleteAnalysis(id)
      setHistory(history.filter((a) => a.id !== id))
    } catch (err) {
      console.error('Failed to delete analysis:', err)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })

  if (loading) {
    return <div className="card"><p>読み込み中...</p></div>
  }

  return (
    <div>
      <h2 className="greeting">成長記録</h2>
      <p className="section-label">成長を『数値』で実感する</p>

      <div className="card">
        <h3 className="card-title">スキル推移（技術）</h3>
        {trend && <TrendChart data={trend} />}
      </div>

      <div className="card">
        <h3 className="card-title">戦術スコア推移</h3>
        {tacticalTrend && <TrendChart data={tacticalTrend} />}
        {tacticalTrend?.growth_comments.map((c, i) => (
          <p key={i} className="note-text" style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>
            🤖 {c}
          </p>
        ))}
      </div>

      {summary && summary.achievements.length > 0 && (
        <div className="card">
          <h3 className="card-title">達成バッジ</h3>
          {summary.achievements.map((a) => (
            <div key={a.code} className="achievement-banner">
              <span aria-hidden>🏆</span>
              <div>
                <div>{a.title}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                  {a.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dash-grid">
        <div className="card">
          <h3 className="card-title">スキル概要（直近30日）</h3>
          {summary && <RadarChart data={summary.radar} />}
        </div>

        <div className="card">
          <h3 className="card-title">解析履歴</h3>
          {history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p>まだ解析履歴がありません</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((a) => (
                <div key={a.id} className="history-item">
                  <div className="history-item-info">
                    <h3>{TYPE_NAMES[a.analysis_type] ?? a.analysis_type}</h3>
                    <div className="history-item-meta">
                      {a.filename} ・ {formatDate(a.created_at)}
                    </div>
                  </div>
                  <div className="history-item-actions">
                    {a.score !== null && <span className="history-score">{a.score}</span>}
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete(a.id)}>
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GrowthPage

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RadarChart from '../components/RadarChart'
import { api } from '../services/api'
import { loadProfile } from '../services/profile'
import { GrowthSummary } from '../types'

const TYPE_NAMES: Record<string, string> = {
  kick: 'キックフォーム分析',
  pass: 'パス分析',
  dribble: 'ドリブル分析',
  positioning: 'ポジショニング分析',
  movement: '動き出し分析',
  general: '総合分析',
  formation: 'フォーメーション解析'
}

function DashboardPage() {
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .getGrowthSummary()
      .then(setSummary)
      .catch((err) => console.error('Failed to load summary:', err))
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })

  if (loading) {
    return <div className="card"><p>読み込み中...</p></div>
  }

  return (
    <div>
      <h2 className="greeting">こんにちは、{loadProfile().name} 👋</h2>

      {summary && (
        <Link to="/analysis" className="drill-banner">
          <div>
            <div className="drill-label">今日の練習提案</div>
            <div className="drill-menu">{summary.today_drill.menu}</div>
          </div>
          <span className="chevron">›</span>
        </Link>
      )}

      {summary && summary.achievements.length > 0 && (
        <div className="achievement-banner">
          <span aria-hidden>🏆</span>
          {summary.achievements[0].title}
        </div>
      )}

      <div className="dash-grid">
        <div className="card">
          <h3 className="card-title">
            スキル概要
            <Link to="/growth" className="title-link">成長記録 ›</Link>
          </h3>
          {summary && <RadarChart data={summary.radar} />}
        </div>

        <div className="card">
          <h3 className="card-title">
            最近の分析
            <Link to="/growth" className="title-link">すべて見る ›</Link>
          </h3>
          {summary && summary.recent_analyses.length > 0 ? (
            <div className="recent-list">
              {summary.recent_analyses.map((a) => (
                <div key={a.id} className="recent-item">
                  <div>
                    <div className="recent-type">{TYPE_NAMES[a.analysis_type] ?? a.analysis_type}</div>
                    <div className="recent-date">{formatDate(a.created_at)} ・ {a.filename}</div>
                  </div>
                  {a.score !== null && <div className="recent-score">{a.score}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">⚽</div>
              <p>まだ解析がありません。</p>
              <p>フォーム解析から始めましょう！</p>
              <Link to="/analysis" className="btn btn-primary btn-small" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
                フォーム解析を開始
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage

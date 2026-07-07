import { useState } from 'react'
import PitchView from '../components/PitchView'
import UploadCard from '../components/UploadCard'
import { api } from '../services/api'
import { FormationResponse } from '../types'

const TEAM_COLORS = ['var(--series-1)', 'var(--series-2)']

function FormationPage() {
  const [file, setFile] = useState<File | null>(null)
  const [teamAName, setTeamAName] = useState('チームA')
  const [teamBName, setTeamBName] = useState('チームB')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FormationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'board' | 'detected' | 'photo'>('board')

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await api.analyzeFormation(file, teamAName, teamBName)
      setResult(res)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? (err instanceof Error ? err.message : 'フォーメーション解析に失敗しました'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="greeting">戦術ボード</h2>
      <p className="section-label">フォーメーション自動判定 × 2D 配置</p>

      <div className="card">
        <h3 className="card-title">試合の画像・動画をアップロード</h3>
        <UploadCard
          file={file}
          onFileChange={(f) => {
            setFile(f)
            setResult(null)
            setError(null)
          }}
          hint="俯瞰・放送映像がおすすめ。選手とボールを自動検出してコート上に配置します"
        />

        {file && (
          <>
            <div style={{ display: 'flex', gap: 12, margin: '16px 0', flexWrap: 'wrap' }}>
              <input
                className="text-input"
                style={{ flex: 1, minWidth: 140 }}
                value={teamAName}
                onChange={(e) => setTeamAName(e.target.value)}
                placeholder="チームA の名前"
                aria-label="チームAの名前"
              />
              <input
                className="text-input"
                style={{ flex: 1, minWidth: 140 }}
                value={teamBName}
                onChange={(e) => setTeamBName(e.target.value)}
                placeholder="チームB の名前"
                aria-label="チームBの名前"
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  選手を検出中...
                </>
              ) : (
                'フォーメーションを判定'
              )}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="card error-card">
          <p style={{ color: 'var(--error-color)' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="card">
          <div className="formation-header">
            {result.teams.map((team, ti) => (
              <div key={ti} className="formation-chip">
                <span className="team-dot" style={{ background: TEAM_COLORS[ti % 2] }} />
                <span>{team.name}</span>
                <span className="formation-name">{team.formation}</span>
                {team.confidence > 0 && (
                  <span className="confidence">信頼度 {Math.round(team.confidence * 100)}%</span>
                )}
              </div>
            ))}
          </div>

          <div className="view-toggle" role="tablist" aria-label="表示切り替え">
            <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>
              戦術ボード
            </button>
            <button className={view === 'detected' ? 'active' : ''} onClick={() => setView('detected')}>
              検出位置
            </button>
            <button className={view === 'photo' ? 'active' : ''} onClick={() => setView('photo')}>
              検出結果の写真
            </button>
          </div>

          {view === 'photo' ? (
            <div className="annotated-photo">
              <img
                src={`data:image/jpeg;base64,${result.annotated_image}`}
                alt="選手検出結果"
              />
            </div>
          ) : (
            <PitchView
              teams={result.teams}
              ball={result.ball}
              useSnapped={view === 'board'}
            />
          )}

          <p className="note-text">
            検出選手数: {result.player_count} 名 ・ 検出エンジン: {result.backend}
            {view === 'board' && ' ・ 戦術ボードでは各ラインを等間隔に整列して表示しています'}
          </p>
        </div>
      )}
    </div>
  )
}

export default FormationPage

import { useState } from 'react'
import PitchView from '../components/PitchView'
import UploadCard from '../components/UploadCard'
import { api } from '../services/api'
import { CoachLevel, FormationResponse } from '../types'

const TEAM_COLORS = ['var(--series-1)', 'var(--series-2)']

type ViewMode = 'board' | 'space' | 'pass' | 'offside' | 'photo'

const VIEW_TABS: { id: ViewMode; label: string }[] = [
  { id: 'board', label: '戦術ボード' },
  { id: 'space', label: 'スペース分析' },
  { id: 'pass', label: 'パスコース' },
  { id: 'offside', label: 'オフサイド' },
  { id: 'photo', label: '検出写真' }
]

const LEVEL_TABS: { id: CoachLevel; label: string }[] = [
  { id: 'beginner', label: '初心者向け' },
  { id: 'intermediate', label: '中級者向け' },
  { id: 'advanced', label: '上級者向け' }
]

function FormationPage() {
  const [file, setFile] = useState<File | null>(null)
  const [teamAName, setTeamAName] = useState('チームA')
  const [teamBName, setTeamBName] = useState('チームB')
  const [focusTeam, setFocusTeam] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FormationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('board')
  const [coachLevel, setCoachLevel] = useState<CoachLevel>('intermediate')

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await api.analyzeFormation(file, teamAName, teamBName, focusTeam)
      setResult(res)
      setView('board')
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? (err instanceof Error ? err.message : 'フォーメーション解析に失敗しました'))
    } finally {
      setLoading(false)
    }
  }

  const tactics = result?.tactics ?? null
  const coaching = result?.coaching ?? null
  const focusTactics = tactics?.teams?.find((t) => t.team === focusTeam) ?? null
  const coachContent = coaching?.levels?.[coachLevel]

  const teamName = (id: number) => (id === 0 ? teamAName : teamBName)

  const deltaText = (v: number) => (v > 0 ? `+${v}` : `${v}`)

  return (
    <div>
      <h2 className="greeting">戦術分析ボード</h2>
      <p className="section-label">フォーメーション判定 × 戦術指標 × AIコーチ</p>

      <div className="card">
        <h3 className="card-title">試合の画像・動画をアップロード</h3>
        <UploadCard
          file={file}
          onFileChange={(f) => {
            setFile(f)
            setResult(null)
            setError(null)
          }}
          hint="俯瞰・放送映像がおすすめ。動画なら攻撃時と守備時のフォーメーションを分離推定します"
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

            <div style={{ marginBottom: 16 }}>
              <span className="section-label" style={{ marginRight: 12 }}>コーチング対象</span>
              <div className="view-toggle">
                {[0, 1].map((t) => (
                  <button
                    key={t}
                    className={focusTeam === t ? 'active' : ''}
                    onClick={() => setFocusTeam(t)}
                  >
                    {teamName(t)}
                  </button>
                ))}
              </div>
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
                  選手検出と戦術分析を実行中...
                </>
              ) : (
                '戦術分析を開始'
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
        <>
          {/* フォーメーション判定結果 */}
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

            {/* 攻守局面別フォーメーション（動画のみ） */}
            {result.phases && (
              <div className="phase-grid">
                {result.phases.teams.map((pt) => (
                  <div key={pt.team} className="phase-tile">
                    <div className="phase-team">{teamName(pt.team)}</div>
                    <div className="phase-row">
                      <span className="phase-label">⚔ 攻撃時</span>
                      {pt.attack ? (
                        <span>
                          <strong>{pt.attack.formation}</strong>
                          <span className="confidence"> 信頼度 {Math.round(pt.attack.confidence * 100)}%</span>
                        </span>
                      ) : (
                        <span className="confidence">サンプル不足</span>
                      )}
                    </div>
                    <div className="phase-row">
                      <span className="phase-label">🛡 守備時</span>
                      {pt.defense ? (
                        <span>
                          <strong>{pt.defense.formation}</strong>
                          <span className="confidence"> 信頼度 {Math.round(pt.defense.confidence * 100)}%</span>
                        </span>
                      ) : (
                        <span className="confidence">サンプル不足</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="view-toggle" role="tablist" aria-label="表示切り替え">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={view === tab.id ? 'active' : ''}
                  onClick={() => setView(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
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
                space={view === 'space' ? tactics?.space ?? null : null}
                passing={view === 'pass' ? tactics?.passing ?? null : null}
                offside={view === 'offside' ? tactics?.offside?.teams ?? null : null}
              />
            )}

            {/* ビューごとの補足情報 */}
            {view === 'space' && tactics?.space?.zones && tactics.space.zones.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {tactics.space.zones.map((z, i) => (
                  <p key={i} className="zone-note" style={{
                    color: z.type === 'danger' ? 'var(--error-color)' : 'var(--accent)'
                  }}>
                    {z.type === 'danger' ? '⚠' : '↗'} {z.label}
                  </p>
                ))}
              </div>
            )}
            {view === 'pass' && tactics?.passing && (
              <p className="note-text" style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>
                💡 {tactics.passing.recommendation}
              </p>
            )}
            {view === 'offside' && tactics?.offside?.teams.map((ot) =>
              ot.assessment ? (
                <p key={ot.team} className="note-text" style={{
                  color: ot.height_level === 'warning' ? 'var(--gold)' : 'var(--text-muted)'
                }}>
                  {teamName(ot.team)}: {ot.assessment}
                  {ot.behind_space_m !== undefined && ` （裏のスペース ${ot.behind_space_m}m）`}
                </p>
              ) : null
            )}

            <p className="note-text">
              検出選手数: {result.player_count} 名 ・ 解析フレーム: {result.frames_analyzed} ・
              検出エンジン: {result.backend}
            </p>
          </div>

          {/* 戦術指標 */}
          {focusTactics && (
            <div className="card">
              <h3 className="card-title">戦術指標（{teamName(focusTeam)}）</h3>
              <div className="metric-grid">
                <div className={`metric-tile ${focusTactics.compactness >= 60 ? 'ok' : 'warn'}`}>
                  <div className="metric-label">コンパクトネス</div>
                  <div className="metric-value">{focusTactics.compactness}</div>
                  <div className="metric-range">選手間距離の凝集度 (0-100)</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">縦幅 × 横幅</div>
                  <div className="metric-value">{focusTactics.depth_m}×{focusTactics.width_m}m</div>
                  <div className="metric-range">ブロックのサイズ</div>
                </div>
                <div className={`metric-tile ${Object.values(focusTactics.line_gaps_m).every((g) => g <= 22) ? 'ok' : 'warn'}`}>
                  <div className="metric-label">ライン間距離</div>
                  <div className="metric-value">
                    {Object.values(focusTactics.line_gaps_m).map((v) => `${v}m`).join(' / ') || '-'}
                  </div>
                  <div className="metric-range">
                    {Object.keys(focusTactics.line_gaps_m).join(' / ') || 'ライン検出不可'}
                  </div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">守備ブロック</div>
                  <div className="metric-value" style={{ fontSize: '1rem' }}>{focusTactics.block_height}</div>
                  <div className="metric-range">スライドずれ {focusTactics.slide_offset_m}m</div>
                </div>
                <div className={`metric-tile ${focusTactics.press_intensity >= 50 ? 'ok' : 'warn'}`}>
                  <div className="metric-label">プレス強度</div>
                  <div className="metric-value">{focusTactics.press_intensity}</div>
                  <div className="metric-range">ボール周辺の人数圧 (0-100)</div>
                </div>
                <div className={`metric-tile ${focusTactics.attack_width_score >= 60 ? 'ok' : 'warn'}`}>
                  <div className="metric-label">攻撃の幅</div>
                  <div className="metric-value">{focusTactics.attack_width_score}</div>
                  <div className="metric-range">深さ {focusTactics.attack_depth_score} / サポート {focusTactics.support_score}</div>
                </div>
                <div className={`metric-tile ${focusTactics.defensive_block_score >= 60 ? 'ok' : 'warn'}`}>
                  <div className="metric-label">守備ブロックスコア</div>
                  <div className="metric-value">{focusTactics.defensive_block_score}</div>
                  <div className="metric-range">凝集度 × ライン間バランス</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">サイドの空き / 中央密集</div>
                  <div className="metric-value" style={{ fontSize: '1rem' }}>
                    左{focusTactics.side_space_m.left}m・右{focusTactics.side_space_m.right}m
                  </div>
                  <div className="metric-range">中央レーン {focusTactics.central_density} 人</div>
                </div>
              </div>
              {focusTactics.line_gap_warnings.map((w, i) => (
                <p key={i} className="zone-note" style={{ color: 'var(--gold)' }}>⚠ {w}</p>
              ))}
            </div>
          )}

          {/* AI 戦術コーチ */}
          {coaching && coachContent && (
            <div className="card">
              <h3 className="card-title">
                AI 戦術コーチ（{teamName(coaching.focus_team)}）
              </h3>

              <div className="view-toggle" role="tablist" aria-label="説明レベル">
                {LEVEL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className={coachLevel === tab.id ? 'active' : ''}
                    onClick={() => setCoachLevel(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {coachContent.good_points.length > 0 && (
                <div className="result-section">
                  <h3>✅ 良い点</h3>
                  <p>{coachContent.good_points.map((g) => `- ${g}`).join('\n')}</p>
                </div>
              )}
              {coachContent.issues.length > 0 && (
                <div className="result-section">
                  <h3>🎯 課題</h3>
                  <p>{coachContent.issues.map((g) => `- ${g}`).join('\n')}</p>
                </div>
              )}
              {coachContent.improvements.length > 0 && (
                <div className="result-section">
                  <h3>💡 改善案</h3>
                  <p>{coachContent.improvements.map((g) => `- ${g}`).join('\n')}</p>
                </div>
              )}

              {coaching.individual.length > 0 && (
                <div className="result-section">
                  <h3>👤 個人へのアドバイス</h3>
                  <p>
                    {coaching.individual
                      .map((ind) => `【${ind.target}】\n${ind.comment}`)
                      .join('\n\n')}
                  </p>
                </div>
              )}

              <div className="result-section" style={{ borderColor: 'var(--accent-border)' }}>
                <h3>🏃 次の練習メニュー</h3>
                <p>{coaching.next_drill.menu}{'\n'}{coaching.next_drill.reason}</p>
              </div>

              {coaching.llm_summary && (
                <div className="result-section">
                  <h3>📋 総評</h3>
                  <p>{coaching.llm_summary}</p>
                </div>
              )}
            </div>
          )}

          {/* 前回比較 */}
          {result.comparison && (
            <div className="card">
              <h3 className="card-title">前回との比較</h3>
              <div className="metric-grid">
                {Object.entries(result.comparison.deltas).map(([k, v]) => (
                  <div key={k} className={`metric-tile ${v >= 0 ? 'ok' : 'warn'}`}>
                    <div className="metric-label">{k}</div>
                    <div className="metric-value">{deltaText(v)}</div>
                    <div className="metric-range">
                      前回 {result.comparison!.previous_scores[k]} → 今回 {result.tactical_scores[k]}
                    </div>
                  </div>
                ))}
              </div>
              <p className="note-text" style={{ color: 'var(--accent)' }}>
                {result.comparison.comment}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default FormationPage

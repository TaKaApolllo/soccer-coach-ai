import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PitchView from '../components/PitchView'
import PassMiniMap from '../components/PassMiniMap'
import PoseViewer from '../components/PoseViewer'
import RadarChart from '../components/RadarChart'
import ScoreRing from '../components/ScoreRing'
import SpaceHeatmap from '../components/SpaceHeatmap'
import TrendChart from '../components/TrendChart'
import UploadCard from '../components/UploadCard'
import { IDEAL_MODEL_SCORE } from '../components/IdealModelFigure'
import { api } from '../services/api'
import { FaceMode, loadProfile } from '../services/profile'
import {
  AnalysisHistoryItem,
  CoachLevel,
  FormationResponse,
  GrowthSummary,
  PoseAnalysisResponse,
  TrendData
} from '../types'

type BoardTab = '2d' | 'photo' | '3d'
type PitchLayer = 'board' | 'metrics' | 'detected' | 'space' | 'pass' | 'offside'

const LEVEL_TABS: { id: CoachLevel; label: string }[] = [
  { id: 'beginner', label: '初心者' },
  { id: 'intermediate', label: '中級者' },
  { id: 'advanced', label: '上級者' }
]

const TYPE_NAMES: Record<string, string> = {
  kick: 'キックフォーム 角度',
  pass: 'パス精度',
  dribble: 'ドリブル突破',
  positioning: 'ポジショニング',
  movement: '動き出し',
  general: '総合分析',
  formation: 'フォーメーション解析'
}

function AnalysisDashboardPage() {
  // 戦術ボード側
  const [tacticsFile, setTacticsFile] = useState<File | null>(null)
  const [tacticsLoading, setTacticsLoading] = useState(false)
  const [formation, setFormation] = useState<FormationResponse | null>(null)
  const [boardTab, setBoardTab] = useState<BoardTab>('2d')
  const [pitchLayer, setPitchLayer] = useState<PitchLayer>('board')

  // フォーム解析側
  const [poseFile, setPoseFile] = useState<File | null>(null)
  const [poseLoading, setPoseLoading] = useState(false)
  const [poseResult, setPoseResult] = useState<PoseAnalysisResponse | null>(null)
  const [faceMode, setFaceMode] = useState<FaceMode>(loadProfile().faceMode)

  // 右カラム
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([])

  const [coachLevel, setCoachLevel] = useState<CoachLevel>(loadProfile().coachLevel)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 前回の解析結果と成長データを復元
    api.getGrowthSummary().then(setSummary).catch(() => undefined)
    api.getGrowthTrend(6).then(setTrend).catch(() => undefined)
    api.getHistory().then((h) => setHistory(h.analyses.slice(0, 4))).catch(() => undefined)

    api.getLatestAnalysis<FormationResponse>('formation').then((latest) => {
      if (latest) setFormation({ ...latest.analysis, id: latest.id })
    })
    api.getLatestAnalysis<PoseAnalysisResponse>('pose').then((latest) => {
      if (latest) {
        const res = latest.analysis as PoseAnalysisResponse
        const score = (latest as unknown as { score?: number }).score ?? res.pose?.score ?? null
        setPoseResult({ ...res, id: latest.id, score })
      }
    })
  }, [])

  const runTactics = async () => {
    if (!tacticsFile) return
    setTacticsLoading(true)
    setError(null)
    try {
      const res = await api.analyzeFormation(tacticsFile)
      setFormation(res)
      setTacticsFile(null)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? '戦術分析に失敗しました')
    } finally {
      setTacticsLoading(false)
    }
  }

  const runPose = async () => {
    if (!poseFile) return
    setPoseLoading(true)
    setError(null)
    try {
      const res = await api.analyzePose(poseFile, 'kick', undefined, faceMode)
      setPoseResult(res)
      setPoseFile(null)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'フォーム解析に失敗しました')
    } finally {
      setPoseLoading(false)
    }
  }

  const tactics = formation?.tactics ?? null
  const coaching = formation?.coaching ?? null
  const focusTactics = tactics?.teams?.find((t) => t.team === (coaching?.focus_team ?? 0)) ?? null
  const coachContent = coaching?.levels?.[coachLevel]
  const pose = poseResult?.pose ?? null

  const lineGapStatus = focusTactics
    ? Object.values(focusTactics.line_gaps_m).every((g) => g <= 22) ? '良好' : '要注意'
    : '-'

  const passCounts = tactics?.passing
    ? {
        safe: tactics.passing.options.filter((o) => o.class === 'safe').length,
        progressive: tactics.passing.options.filter((o) => o.class === 'progressive').length,
        risky: tactics.passing.options.filter((o) => o.class === 'risky').length
      }
    : null

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })

  return (
    <div className="tactica">
      {error && (
        <div className="card error-card"><p style={{ color: 'var(--error-color)' }}>{error}</p></div>
      )}

      <div className="tactica-grid">
        {/* ============ 左カラム: 戦術ボード ============ */}
        <div className="tactica-col">
          <div className="card">
            <h3 className="card-title">戦術ボード</h3>

            {!formation && (
              <p className="note-text" style={{ marginBottom: 10 }}>
                試合の画像・動画をアップロードすると、フォーメーションと戦術指標を自動分析します。
              </p>
            )}
            <UploadCard file={tacticsFile} onFileChange={setTacticsFile} hint="試合映像（俯瞰・放送映像）" />
            {tacticsFile && (
              <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={runTactics} disabled={tacticsLoading}>
                {tacticsLoading ? <><span className="loading-spinner" />分析中...</> : '戦術分析を開始'}
              </button>
            )}

            {formation && (
              <>
                <div className="stat-chip-row">
                  <div className="stat-chip">
                    <span className="stat-chip-label">フォーメーション</span>
                    <span className="stat-chip-value">{formation.teams[0]?.formation ?? '-'}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">フェーズ</span>
                    <span className="stat-chip-value">{formation?.phases ? '攻守分析' : '基準フレーム'}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">時間</span>
                    <span className="stat-chip-value">{formation.base_time ?? '--:--'}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">信頼度</span>
                    <span className="stat-chip-value accent">
                      {Math.round((formation.teams[0]?.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                </div>

                <div className="view-toggle" role="tablist" aria-label="ボード表示">
                  <button className={boardTab === '2d' ? 'active' : ''} onClick={() => setBoardTab('2d')}>2Dボード</button>
                  <button className={boardTab === 'photo' ? 'active' : ''} onClick={() => setBoardTab('photo')}>検出画像</button>
                  <button className={boardTab === '3d' ? 'active' : ''} onClick={() => setBoardTab('3d')}>3Dビュー</button>
                </div>

                {boardTab === 'photo' ? (
                  <div className="annotated-photo">
                    <img src={`data:image/jpeg;base64,${formation.annotated_image}`} alt="選手検出結果" />
                  </div>
                ) : (
                  <div className={boardTab === '3d' ? 'pitch-3d' : ''}>
                    <PitchView
                      teams={formation.teams}
                      ball={formation.ball}
                      layer={pitchLayer}
                      space={tactics?.space ?? null}
                      passing={tactics?.passing ?? null}
                      offside={tactics?.offside?.teams ?? null}
                      pitch={formation.pitch}
                    />
                  </div>
                )}

                {boardTab !== 'photo' && (
                  <div className="view-toggle pitch-layer-toggle" style={{ marginTop: 10, flexWrap: 'wrap' }} role="tablist" aria-label="レイヤー">
                    <button className={pitchLayer === 'board' ? 'active' : ''} onClick={() => setPitchLayer('board')}>整形配置</button>
                    <button className={pitchLayer === 'metrics' ? 'active' : ''} onClick={() => setPitchLayer('metrics')}>角度・距離</button>
                    <button className={pitchLayer === 'detected' ? 'active' : ''} onClick={() => setPitchLayer('detected')}>検出位置</button>
                    <button className={pitchLayer === 'space' ? 'active' : ''} onClick={() => setPitchLayer('space')}>スペース</button>
                    <button className={pitchLayer === 'pass' ? 'active' : ''} onClick={() => setPitchLayer('pass')}>パス</button>
                    <button className={pitchLayer === 'offside' ? 'active' : ''} onClick={() => setPitchLayer('offside')}>ライン</button>
                  </div>
                )}
              </>
            )}
          </div>

          {focusTactics && (
            <div className="tactica-duo">
              <div className="card">
                <h3 className="card-title">チーム構造</h3>
                <div className="struct-bars">
                  <div className="struct-bar">
                    <div className="struct-bar-head"><span>縦幅</span><strong>{focusTactics.depth_m}m</strong></div>
                    <div className="struct-bar-track">
                      <div className="struct-bar-fill" style={{ width: `${Math.min(100, (focusTactics.depth_m / 105) * 100)}%`, background: 'var(--series-1)' }} />
                    </div>
                  </div>
                  <div className="struct-bar">
                    <div className="struct-bar-head"><span>横幅</span><strong>{focusTactics.width_m}m</strong></div>
                    <div className="struct-bar-track">
                      <div className="struct-bar-fill" style={{ width: `${Math.min(100, (focusTactics.width_m / 68) * 100)}%`, background: 'var(--series-2)' }} />
                    </div>
                  </div>
                  <div className="struct-bar">
                    <div className="struct-bar-head">
                      <span>コンパクトネス</span>
                      <strong className={focusTactics.compactness >= 60 ? 'accent-text' : 'warn-text'}>{focusTactics.compactness}/100</strong>
                    </div>
                    <div className="struct-bar-track">
                      <div className="struct-bar-fill" style={{ width: `${Math.min(100, focusTactics.compactness)}%`, background: focusTactics.compactness >= 60 ? 'var(--accent)' : 'var(--series-3)' }} />
                    </div>
                  </div>
                  <div className="struct-row" style={{ marginTop: 4 }}>
                    <span>ライン間距離</span>
                    <strong className={lineGapStatus === '良好' ? 'accent-text' : 'warn-text'}>{lineGapStatus}</strong>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 className="card-title">スペース分析</h3>
                {tactics?.space ? (
                  <SpaceHeatmap
                    space={tactics.space}
                    teamAName={formation?.teams[0]?.name}
                    teamBName={formation?.teams[1]?.name}
                  />
                ) : (
                  <p className="note-text">データなし</p>
                )}
              </div>
            </div>
          )}

          {formation && (
            <div className="tactica-duo">
              <div className="card">
                <h3 className="card-title">選手角度サマリー</h3>
                {formation.facing_summary ? (
                  <div className="facing-row">
                    <div className="facing-item">
                      <div className="facing-label">前向き</div>
                      <div className="facing-value accent-text">{formation.facing_summary.forward}人</div>
                    </div>
                    <div className="facing-item">
                      <div className="facing-label">斜め</div>
                      <div className="facing-value">{formation.facing_summary.diagonal}人</div>
                    </div>
                    <div className="facing-item">
                      <div className="facing-label">後ろ向き</div>
                      <div className="facing-value warn-text">{formation.facing_summary.backward}人</div>
                    </div>
                  </div>
                ) : (
                  <p className="note-text">動画を解析すると移動方向から選手の向きを推定します</p>
                )}
              </div>

              <div className="card">
                <h3 className="card-title">パスコース候補</h3>
                {tactics?.passing && passCounts ? (
                  <>
                    <PassMiniMap passing={tactics.passing} />
                    <button className="btn btn-ghost btn-small" style={{ width: '100%', marginTop: 10 }} onClick={() => { setBoardTab('2d'); setPitchLayer('pass') }}>
                      ボードで確認
                    </button>
                  </>
                ) : (
                  <p className="note-text">ボールが検出されるとパス候補を表示します</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ============ 中央カラム: キックフォーム分析 + AIコーチ ============ */}
        <div className="tactica-col">
          <div className="card">
            <h3 className="card-title">
              キックフォーム分析
              <Link to="/kick-pro" className="title-link" style={{ marginRight: 10, color: 'var(--accent)' }}>Pro分析 ›</Link>
              <Link to="/form-analysis" className="title-link" style={{ marginRight: 10 }}>フォーム分析 ›</Link>
              <Link to="/kick" className="title-link">詳細分析を開く ›</Link>
            </h3>

            {!poseResult && (
              <p className="note-text" style={{ marginBottom: 10 }}>
                キック動画をアップロードすると、骨格推定で角度とフォームを解析します。
              </p>
            )}
            <UploadCard file={poseFile} onFileChange={setPoseFile} hint="キック動画（横から全身が写るように）" />
            {poseFile && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
                  <span className="section-label" style={{ marginBottom: 0 }}>顔の表示</span>
                  <div className="view-toggle" style={{ marginBottom: 0 }}>
                    <button className={faceMode === 'real' ? 'active' : ''} onClick={() => setFaceMode('real')}>
                      実写のまま
                    </button>
                    <button className={faceMode === 'avatar' ? 'active' : ''} onClick={() => setFaceMode('avatar')}>
                      アバターで隠す
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={runPose} disabled={poseLoading}>
                  {poseLoading ? <><span className="loading-spinner" />骨格を解析中...</> : 'フォーム解析を開始'}
                </button>
              </>
            )}

            {poseResult && (
              <>
                <PoseViewer result={poseResult} />

                <div className="score-hero" style={{ marginTop: 14 }}>
                  <ScoreRing score={poseResult.score ?? 0} size={92} />
                  <div className="score-hero-text">
                    <h3 className="accent-text">{pose?.score_message?.headline ?? 'フォーム解析'}</h3>
                    <p>{pose?.score_message?.detail ?? ''}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">AIコーチからのアドバイス</h3>

            {coaching && coachContent ? (
              <>
                <div className="view-toggle" role="tablist" aria-label="説明レベル">
                  {LEVEL_TABS.map((tab) => (
                    <button key={tab.id} className={coachLevel === tab.id ? 'active' : ''} onClick={() => setCoachLevel(tab.id)}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                {coachContent.issues.length > 0 && (
                  <div className="result-section">
                    <h3>🎯 今日の課題</h3>
                    <p>{coachContent.issues.slice(0, 2).map((s) => `- ${s}`).join('\n')}</p>
                  </div>
                )}
                {coachContent.improvements.length > 0 && (
                  <div className="result-section">
                    <h3>💡 改善のヒント</h3>
                    <p>{coachContent.improvements.slice(0, 2).map((s) => `- ${s}`).join('\n')}</p>
                  </div>
                )}
              </>
            ) : summary ? (
              <div className="result-section">
                <h3>🎯 今日の課題</h3>
                <p>{summary.today_drill.menu}</p>
              </div>
            ) : (
              <p className="note-text">解析を実行するとアドバイスが表示されます</p>
            )}

            <Link to="/drills" className="btn btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 8 }}>
              練習メニューを見る
            </Link>
          </div>

          <div className="card">
            <h3 className="card-title">プロ選手比較（理想モデル）</h3>
            <div className="pro-compare-row">
              <div className="pro-compare-side">
                <div className="compare-label">自分</div>
                <div className="pro-compare-score">{poseResult?.score ?? '-'}</div>
              </div>
              <div className="compare-vs">VS</div>
              <div className="pro-compare-side">
                <div className="compare-label">理想モデル</div>
                <div className="pro-compare-score accent-text">{IDEAL_MODEL_SCORE}</div>
              </div>
            </div>
            <p className="note-text">
              比較タブで理想インパクト姿勢と自分のフォームを並べて確認できます。
            </p>
          </div>
        </div>

        {/* ============ 右カラム: スキル・履歴 ============ */}
        <div className="tactica-col">
          <div className="card">
            <h3 className="card-title">スキルレーダー</h3>
            {summary && <RadarChart data={summary.radar} size={260} />}
          </div>

          <div className="card">
            <h3 className="card-title">スキル推移 <span className="confidence">直近6ヶ月</span></h3>
            {trend && trend.months.length > 0 ? (
              <TrendChart data={trend} height={200} />
            ) : (
              <p className="note-text">解析を重ねると推移が表示されます</p>
            )}
          </div>

          {summary && summary.achievements.length > 0 && (
            <div className="achievement-banner">
              <span aria-hidden>🏆</span>
              {summary.achievements[0].title}
            </div>
          )}

          <div className="card">
            <h3 className="card-title">解析履歴</h3>
            {history.length === 0 ? (
              <p className="note-text">まだ解析履歴がありません</p>
            ) : (
              <div className="recent-list">
                {history.map((a) => (
                  <div key={a.id} className="recent-item">
                    <div>
                      <div className="recent-type">{TYPE_NAMES[a.analysis_type] ?? a.analysis_type}</div>
                      <div className="recent-date">{formatDate(a.created_at)}</div>
                    </div>
                    {a.score !== null && <div className="recent-score">{a.score}</div>}
                    <span aria-hidden style={{ marginLeft: 6 }}>👍</span>
                  </div>
                ))}
              </div>
            )}
            <Link to="/growth" className="btn btn-ghost btn-small" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}>
              すべての履歴を見る
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnalysisDashboardPage

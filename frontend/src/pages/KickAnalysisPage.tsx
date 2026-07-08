import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import GaugeTile from '../components/GaugeTile'
import IdealCompareBars from '../components/IdealCompareBars'
import MotionTimeline from '../components/MotionTimeline'
import RadarChart from '../components/RadarChart'
import TrendChart from '../components/TrendChart'
import UploadCard from '../components/UploadCard'
import { api } from '../services/api'
import { FaceMode, loadProfile } from '../services/profile'
import {
  AnalysisHistoryItem,
  FormationResponse,
  GrowthSummary,
  PoseAnalysisResponse,
  TrendData
} from '../types'

type ViewTab = 'form' | 'angle' | 'skeleton' | 'compare'

const TABS: { id: ViewTab; label: string }[] = [
  { id: 'form', label: 'フォーム' },
  { id: 'angle', label: '角度' },
  { id: 'skeleton', label: '骨格' },
  { id: 'compare', label: '比較' }
]

const SPEEDS = [0.5, 1.0, 2.0]

function formatTime(sec?: number | null): string {
  if (sec === undefined || sec === null) return '--:--.--'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

function KickAnalysisPage() {
  const [result, setResult] = useState<PoseAnalysisResponse | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [faceMode, setFaceMode] = useState<FaceMode>(loadProfile().faceMode)

  const [tab, setTab] = useState<ViewTab>('angle')
  const [tilt3d, setTilt3d] = useState(false)
  const [activeFrame, setActiveFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1.0)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 右カラム・セッション情報
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [shots, setShots] = useState<AnalysisHistoryItem[]>([])
  const [session, setSession] = useState<FormationResponse | null>(null)

  useEffect(() => {
    api.getGrowthSummary().then(setSummary).catch(() => undefined)
    api.getGrowthTrend(6).then(setTrend).catch(() => undefined)
    api.getHistory().then((h) =>
      setShots(h.analyses.filter((a) => a.analysis_type !== 'formation').slice(0, 4))
    ).catch(() => undefined)
    api.getLatestAnalysis<FormationResponse>('formation').then((latest) => {
      if (latest) setSession(latest.analysis as FormationResponse)
    })
    api.getLatestAnalysis<PoseAnalysisResponse>('pose').then((latest) => {
      if (latest) {
        const res = latest.analysis as PoseAnalysisResponse
        const score = (latest as unknown as { score?: number }).score ?? res.pose?.score ?? null
        setResult({ ...res, id: latest.id, score })
        setActiveFrame(res.pose?.key_frame_index ?? 0)
      }
    })
  }, [])

  const pose = result?.pose ?? null
  const frameCount = pose?.annotated_images.length ?? 0

  // 再生（フレーム送り）
  useEffect(() => {
    if (playTimer.current) clearInterval(playTimer.current)
    if (playing && frameCount > 1) {
      const baseInterval = ((result?.duration ?? 2) / frameCount) * 1000
      playTimer.current = setInterval(() => {
        setActiveFrame((f) => (f + 1) % frameCount)
      }, Math.max(80, baseInterval / speed))
    }
    return () => {
      if (playTimer.current) clearInterval(playTimer.current)
    }
  }, [playing, speed, frameCount, result])

  const loadShot = async (id: string) => {
    const item = await api.getAnalysis(id) as unknown as {
      id: string
      score?: number
      analysis: PoseAnalysisResponse
    }
    if (item?.analysis?.pose) {
      const score = item.score ?? item.analysis.pose.score ?? null
      setResult({ ...item.analysis, id: item.id, score })
      setActiveFrame(item.analysis.pose.key_frame_index ?? 0)
      setPlaying(false)
    }
  }

  const runAnalysis = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.analyzePose(file, 'kick', undefined, faceMode)
      setResult(res)
      setActiveFrame(res.pose?.key_frame_index ?? 0)
      setFile(null)
      api.getHistory().then((h) =>
        setShots(h.analyses.filter((a) => a.analysis_type !== 'formation').slice(0, 4))
      )
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'フォーム解析に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const imageFor = (i: number): string | null => {
    if (!pose) return null
    if (tab === 'form') return pose.clean_images?.[i] ?? pose.annotated_images[i]
    if (tab === 'skeleton' || tab === 'compare') return pose.skeleton_images?.[i] ?? pose.annotated_images[i]
    return pose.annotated_images[i]
  }

  const sub = pose?.sub_scores
  const stabilityHigh = (sub?.stability?.score ?? 0) >= 70
  const powerHigh = (sub?.impact_strength?.score ?? 0) >= 70

  const speedDelta = result?.ball_speed?.delta_vs_avg
  const activeTime = result?.frame_times?.[activeFrame]

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="kick-page">
      {/* ページヘッダー: 戻る + タブ + 3Dビュー */}
      <div className="kick-header">
        <Link to="/analysis" className="kick-back" aria-label="分析ダッシュボードへ戻る">‹</Link>
        <h2>キックフォーム分析</h2>
        <div className="view-toggle" role="tablist" aria-label="表示切り替え">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          className={`btn btn-ghost btn-small ${tilt3d ? 'accent-text' : ''}`}
          onClick={() => setTilt3d(!tilt3d)}
          style={{ marginLeft: 'auto' }}
        >
          ⦿ 3Dビュー
        </button>
      </div>

      {error && <div className="card error-card"><p style={{ color: 'var(--error-color)' }}>{error}</p></div>}

      <div className="kick-grid">
        {/* ========== 左カラム ========== */}
        <div className="tactica-col">
          <div className="card">
            <h3 className="card-title">分析中のショット</h3>

            {result && pose ? (
              <>
                <button
                  className="shot-main"
                  onClick={() => setActiveFrame(pose.key_frame_index)}
                  aria-label="キーフレームへ移動"
                >
                  <img src={`data:image/jpeg;base64,${pose.annotated_images[pose.key_frame_index]}`} alt="現在のショット" />
                  <span className="shot-time">▶ {formatTime(result.frame_times?.[pose.key_frame_index])}</span>
                </button>
                <div className="shot-strip">
                  {shots.map((s) => (
                    <button key={s.id} className={s.id === result.id ? 'active' : ''} onClick={() => loadShot(s.id)}>
                      <img src={`/api/history/${s.id}/thumbnail`} alt="" loading="lazy" />
                      <span className="shot-strip-time">
                        {new Date(s.created_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })}
                      </span>
                    </button>
                  ))}
                </div>
                <Link to="/growth" className="title-link" style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>
                  すべてのショットを表示 ›
                </Link>
              </>
            ) : (
              <p className="note-text">まだ解析がありません。下からキック動画をアップロードしてください。</p>
            )}

            <div style={{ marginTop: 12 }}>
              <UploadCard file={file} onFileChange={setFile} hint="新しいキック動画を解析" />
              {file && (
                <>
                  <div className="view-toggle" style={{ margin: '8px 0' }}>
                    <button className={faceMode === 'real' ? 'active' : ''} onClick={() => setFaceMode('real')}>実写のまま</button>
                    <button className={faceMode === 'avatar' ? 'active' : ''} onClick={() => setFaceMode('avatar')}>アバターで隠す</button>
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={runAnalysis} disabled={loading}>
                    {loading ? <><span className="loading-spinner" />解析中...</> : '解析を開始'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">セッション情報</h3>
            <div className="struct-rows">
              <div className="struct-row"><span>フォーメーション</span><strong>{session?.teams?.[0]?.formation ?? '-'}</strong></div>
              <div className="struct-row"><span>フェーズ</span><strong className="accent-text">{session?.phases ? '攻撃時' : '-'}</strong></div>
              <div className="struct-row"><span>時間</span><strong>{result?.duration ? `${result.duration.toFixed(2)}秒` : '-'}</strong></div>
              <div className="struct-row">
                <span>信頼度</span>
                <strong className="accent-text">
                  {pose ? `${Math.round((pose.metrics.detection_rate ?? 0) * 100)}%` : '-'}
                </strong>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">主要角度一覧</h3>
            {pose?.key_angles && pose.key_angles.length > 0 ? (
              <div className="angle-list">
                {pose.key_angles.map((a) => (
                  <div key={a.key} className="angle-row">
                    <div>
                      <div className="angle-name">{a.label}</div>
                      <div className="angle-en">{a.label_en}</div>
                    </div>
                    <div className="angle-values">
                      <span className={`angle-value ${Math.abs(a.value - a.ideal) <= Math.max(4, a.ideal * 0.08) ? 'accent-text' : 'warn-text'}`}>
                        {Math.round(a.value)}°
                      </span>
                      <span className="angle-ideal">{a.ideal_text}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="note-text">解析すると角度一覧が表示されます</p>
            )}
          </div>
        </div>

        {/* ========== 中央カラム ========== */}
        <div className="tactica-col kick-center">
          <div className="card">
            <h3 className="card-title">キックフォーム分析</h3>

            {pose ? (
              <>
                <div className={`pose-stage kick-stage ${tilt3d ? 'stage-3d' : ''}`}>
                  {tab === 'compare' ? (
                    <div className="compare-grid">
                      <div className="compare-side">
                        <img src={`data:image/jpeg;base64,${imageFor(activeFrame) ?? pose.annotated_images[activeFrame]}`} alt="自分のフォーム" />
                        <div className="compare-label">自分</div>
                        <div className="compare-score">{result?.score ?? '-'}</div>
                      </div>
                      <div className="compare-vs">VS</div>
                      <div className="compare-side">
                        <IdealCompareBars angles={pose.key_angles ?? []} />
                      </div>
                    </div>
                  ) : (
                    <>
                      {imageFor(activeFrame) ? (
                        <img src={`data:image/jpeg;base64,${imageFor(activeFrame)}`} alt={`フレーム ${activeFrame + 1}`} />
                      ) : (
                        <div className="empty-state"><p>このフレームでは骨格を検出できませんでした</p></div>
                      )}

                      {/* 総合スコアの HUD カード */}
                      <div className="hud-chip top-left score-hud">
                        <div className="hud-label">総合スコア</div>
                        <div className="score-hud-value">
                          {result?.score ?? '-'}<span className="hud-unit">/100</span>
                        </div>
                        <div className="score-hud-msg">{pose.score_message?.headline}</div>
                        <div className="score-hud-detail">{pose.score_message?.detail}</div>
                        <div className="score-hud-chips">
                          <span className={stabilityHigh ? 'on' : ''}>安定性: {stabilityHigh ? '高い' : '普通'}</span>
                          <span className={powerHigh ? 'on' : ''}>パワー: {powerHigh ? '強い' : '普通'}</span>
                        </div>
                      </div>

                      {pose.phases[activeFrame] && (
                        <div className="hud-chip top-right">
                          <div className="hud-label">フェーズ</div>
                          <div className="hud-value" style={{ fontSize: '0.9rem' }}>{pose.phases[activeFrame]}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* スクラバー */}
                {frameCount > 1 && tab !== 'compare' && (
                  <div className="scrubber">
                    <button
                      className="scrub-play"
                      onClick={() => setPlaying(!playing)}
                      aria-label={playing ? '一時停止' : '再生'}
                    >
                      {playing ? '❚❚' : '▶'}
                    </button>
                    <span className="scrub-time">
                      {formatTime(activeTime)} / {formatTime(result?.duration)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={frameCount - 1}
                      value={activeFrame}
                      onChange={(e) => { setActiveFrame(Number(e.target.value)); setPlaying(false) }}
                      aria-label="フレーム位置"
                    />
                    <div className="scrub-speeds">
                      {SPEEDS.map((s) => (
                        <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
                          {s.toFixed(1)}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🎥</div>
                <p>キック動画をアップロードすると解析が始まります</p>
              </div>
            )}
          </div>

          <div className="tactica-duo">
            <div className="card">
              <h3 className="card-title">モーションタイムライン</h3>
              {pose?.timeline && pose.timeline.length > 1 ? (
                <MotionTimeline
                  timeline={pose.timeline}
                  activeFrame={activeFrame}
                  onSelectFrame={(i) => { setActiveFrame(i); setPlaying(false) }}
                />
              ) : (
                <p className="note-text">動画を解析すると動作の流れが表示されます</p>
              )}
            </div>

            <div className="card">
              <h3 className="card-title">理想フォームとの比較</h3>
              <IdealCompareBars angles={pose?.key_angles ?? []} />
            </div>
          </div>
        </div>

        {/* ========== 右カラム ========== */}
        <div className="tactica-col">
          <div className="card">
            <h3 className="card-title">スキルレーダー <span className="confidence">前回との比較</span></h3>
            {summary && <RadarChart data={summary.radar} size={250} />}
          </div>

          <div className="card">
            <h3 className="card-title">スキル推移 <span className="confidence">直近6ヶ月</span></h3>
            {trend && trend.months.length > 0 ? (
              <TrendChart data={trend} height={190} />
            ) : (
              <p className="note-text">解析を重ねると推移が表示されます</p>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">解析履歴</h3>
            {shots.length === 0 ? (
              <p className="note-text">まだ履歴がありません</p>
            ) : (
              <div className="recent-list">
                {shots.map((s) => (
                  <button key={s.id} className="recent-item shot-history" onClick={() => loadShot(s.id)}>
                    <img src={`/api/history/${s.id}/thumbnail`} alt="" loading="lazy" />
                    <div>
                      <div className="recent-type">キックフォーム分析</div>
                      <div className="recent-date">{formatDate(s.created_at)}</div>
                    </div>
                    {s.score !== null && <div className="recent-score">{s.score}</div>}
                    <span aria-hidden>👍</span>
                  </button>
                ))}
              </div>
            )}
            <Link to="/growth" className="title-link" style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>
              すべて見る ›
            </Link>
          </div>

          <div className="card">
            <h3 className="card-title">今日のおすすめ練習</h3>
            {summary && (
              <>
                <div className="drill-banner" style={{ marginBottom: 12, cursor: 'default' }}>
                  <div>
                    <div className="drill-label">おすすめ</div>
                    <div className="drill-menu">{summary.today_drill.menu}</div>
                  </div>
                </div>
                <Link to="/drills" className="btn btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  すべての練習メニューを見る
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========== 下部ゲージタイル列 ========== */}
      {pose && (
        <div className="gauge-row">
          <GaugeTile
            title="推定シュート速度"
            value={result?.ball_speed?.speed_kmh ?? '-'}
            unit=" km/h"
            label={result?.ball_speed ? (result.ball_speed.speed_kmh >= 90 ? '良い' : '標準的') : 'データなし'}
            detail={
              result?.ball_speed
                ? speedDelta !== undefined
                  ? `平均より ${speedDelta >= 0 ? '+' : ''}${speedDelta} km/h ※概算`
                  : '骨格スケールからの概算'
                : '動画から検出できませんでした'
            }
            percent={result?.ball_speed ? Math.min(100, (result.ball_speed.speed_kmh / 130) * 100) : 0}
            good={(result?.ball_speed?.speed_kmh ?? 0) >= 80}
          />
          {sub?.impact_strength && (
            <GaugeTile
              title="インパクトの強さ"
              value={sub.impact_strength.score}
              unit="/100"
              label={sub.impact_strength.label}
              detail={sub.impact_strength.detail}
              percent={sub.impact_strength.score}
              good={sub.impact_strength.score >= 60}
            />
          )}
          {sub?.stability && (
            <GaugeTile
              title="フォームの安定性"
              value={sub.stability.score}
              unit="/100"
              label={sub.stability.label}
              detail={sub.stability.detail}
              percent={sub.stability.score}
              good={sub.stability.score >= 60}
            />
          )}
          {sub?.power_efficiency && (
            <GaugeTile
              title="パワー効率"
              value={sub.power_efficiency.score}
              unit="/100"
              label={sub.power_efficiency.label}
              detail={sub.power_efficiency.detail}
              percent={sub.power_efficiency.score}
              good={sub.power_efficiency.score >= 60}
            />
          )}
          {sub?.injury_risk && (
            <GaugeTile
              title="ケガのリスク"
              value={sub.injury_risk.level}
              label={sub.injury_risk.level === '低' ? '安全なフォームです' : '姿勢に注意'}
              detail={sub.injury_risk.comment}
              icon="🛡"
              good={sub.injury_risk.level === '低'}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default KickAnalysisPage

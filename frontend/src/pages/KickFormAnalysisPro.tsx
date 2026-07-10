import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AICoachCommentCard from '../components/analysis/AICoachCommentCard'
import AnalysisHeader, { ProTab } from '../components/analysis/AnalysisHeader'
import AnalysisHistoryCard from '../components/analysis/AnalysisHistoryCard'
import AngleListCard from '../components/analysis/AngleListCard'
import IdealComparisonCard from '../components/analysis/IdealComparisonCard'
import ImprovementRankingCard from '../components/analysis/ImprovementRankingCard'
import InsightStrip from '../components/analysis/InsightStrip'
import MainFormViewer from '../components/analysis/MainFormViewer'
import MetricGaugeCard from '../components/analysis/MetricGaugeCard'
import MotionTimeline from '../components/analysis/MotionTimeline'
import Onboarding, { ONBOARD_KEY } from '../components/analysis/Onboarding'
import SessionInfoCard from '../components/analysis/SessionInfoCard'
import ShotSidebar from '../components/analysis/ShotSidebar'
import SkillProgressCard from '../components/analysis/SkillProgressCard'
import SkillRadarCard from '../components/analysis/SkillRadarCard'
import ToastStack, { ToastItem, ToastTone } from '../components/analysis/Toast'
import TrainingRecommendationCard from '../components/analysis/TrainingRecommendationCard'
import { MOCK_PRO_ANALYSIS } from '../data/mockAnalysisData'
import { api } from '../services/api'
import { FaceMode, loadProfile, saveProfile } from '../services/profile'
import { PoseAnalysisResponse } from '../types'
import {
  ComparisonBaseline,
  HistoryEntry,
  InsightTarget,
  ProAnalysis,
  deriveInsights,
  proFromPoseResponse
} from '../types/analysis'

/** ゲージ・バーのマウント時アニメーション + 開封演出（この画面専用の軽量 CSS） */
const PAGE_CSS = `
@keyframes kproGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.kpro-grow-bar { transform-origin: left center; animation: kproGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes kproReveal { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.kpro-reveal { animation: kproReveal 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes kproFlash { 0%, 100% { box-shadow: none; } 25% { box-shadow: 0 0 0 2px rgba(57,255,136,0.75), 0 0 26px -4px rgba(57,255,136,0.6); } }
.kpro-flash { animation: kproFlash 1.1s ease; border-radius: 16px; }
@keyframes kproToastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.kpro-toast { animation: kproToastIn 0.25s ease both; }
@media (prefers-reduced-motion: reduce) { .kpro-grow-bar, .kpro-reveal, .kpro-flash, .kpro-toast { animation: none; } }
`

/** 実 API のレスポンスをモックへ上書きマージするための共通ロジック */
function mergePoseIntoData(prev: ProAnalysis, resp: PoseAnalysisResponse): ProAnalysis {
  const partial = proFromPoseResponse(resp)
  const merged: ProAnalysis = { ...prev, ...partial }
  const pose = resp.pose
  if (pose?.score) {
    merged.overall = {
      ...prev.overall,
      score: Math.round(pose.score),
      headline: pose.score_message?.headline ?? prev.overall.headline
    }
  }
  return merged
}

/**
 * Kick Form Analysis Pro — プロクラブ仕様のキックフォーム分析ダッシュボード。
 * モックデータで完結し、実 API（pose 解析）があれば該当フィールドが差し替わる。
 * 画面内で解析（アップロード）まで完結し、クロスハイライトで読み解きを支援する。
 */
function KickFormAnalysisPro() {
  const [tab, setTab] = useState<ProTab>('form')
  const [baseline, setBaseline] = useState<ComparisonBaseline>('ideal')
  const [data, setData] = useState<ProAnalysis>(MOCK_PRO_ANALYSIS)

  // 再生状態
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const rafRef = useRef<number>(0)
  const lastTick = useRef<number>(0)

  // クロスハイライト（hover は一時的・click は固定）
  const [hoverJoint, setHoverJoint] = useState<string | null>(null)
  const [activeJoint, setActiveJoint] = useState<string | null>(null)
  const focusJoint = hoverJoint ?? activeJoint

  // 解析フロー
  const [faceMode, setFaceMode] = useState<FaceMode>(loadProfile().faceMode)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeStep, setAnalyzeStep] = useState(0)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [showDropzone, setShowDropzone] = useState(MOCK_PRO_ANALYSIS.isSample)
  const [compareBlend, setCompareBlend] = useState(45)

  // 開封演出 / トースト / オンボーディング
  const [revealKey, setRevealKey] = useState(0)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastId = useRef(0)
  const [onboarding, setOnboarding] = useState(false)

  // スクロール & ハイライト対象
  const coachRef = useRef<HTMLDivElement>(null)
  const improvementRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<HTMLDivElement>(null)

  const duration = data.shot.duration

  const addToast = useCallback((tone: ToastTone, message: string) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, tone, message }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])

  // 再生ループ（requestAnimationFrame でタイムラインと連動）
  useEffect(() => {
    if (!playing) return
    lastTick.current = performance.now()
    const loop = (t: number) => {
      const dt = (t - lastTick.current) / 1000
      lastTick.current = t
      setCurrentTime((prev) => {
        const next = prev + dt * speed
        return next >= duration ? next - duration : next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed, duration])

  // 実データがあればモックへ上書きマージ
  useEffect(() => {
    api.getLatestAnalysis<PoseAnalysisResponse>('pose').then((latest) => {
      if (!latest) return
      setData((prev) => mergePoseIntoData(prev, latest.analysis))
      setShowDropzone(false)
    })

    api.getHistory().then((h) => {
      const entries: HistoryEntry[] = h.analyses
        .filter((a) => a.analysis_type !== 'formation' && a.score != null)
        .slice(0, 4)
        .map((a) => ({
          id: a.id,
          date: new Date(a.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
          score: Math.round(a.score as number),
          thumbSrc: a.media_type === 'video' || a.media_type === 'image' ? `/api/history/${a.id}/thumbnail` : null
        }))
      if (entries.length) setData((prev) => ({ ...prev, history: entries }))
    }).catch(() => undefined)
  }, [])

  // 初回オンボーディング
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setOnboarding(true)
    } catch { /* noop */ }
  }, [])

  // キーボードショートカット（Space / ←→ / 1・2・3）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (analyzing) return
      const step = Math.max(0.02, duration / 48)
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((v) => !v)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        setPlaying(false)
        setCurrentTime((t) => Math.min(duration, t + step))
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        setPlaying(false)
        setCurrentTime((t) => Math.max(0, t - step))
      } else if (e.key === '1') {
        setSpeed(0.5)
      } else if (e.key === '2') {
        setSpeed(1.0)
      } else if (e.key === '3') {
        setSpeed(2.0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, analyzing])

  const progress = duration > 0 ? currentTime / duration : 0

  // ズレの大きい関節を常時ハイライト
  const highlightJoints = useMemo(
    () => data.angleLabels.filter((a) => a.status === 'bad').map((a) => a.joint),
    [data.angleLabels]
  )

  const insights = useMemo(() => deriveInsights(data), [data])

  // スムーズスクロール + 一瞬ハイライト
  const flash = useCallback((el: HTMLElement | null) => {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('kpro-flash')
    void el.offsetWidth
    el.classList.add('kpro-flash')
    window.setTimeout(() => el.classList.remove('kpro-flash'), 1200)
  }, [])

  const targetRef = (t: InsightTarget) =>
    t === 'coach' ? coachRef.current : t === 'improvements' ? improvementRef.current : recRef.current

  const handleJump = useCallback((t: InsightTarget, joint?: string) => {
    if (joint) setActiveJoint(joint)
    flash(targetRef(t))
  }, [flash])

  const handleImprovementSelect = useCallback((joint: string | null) => {
    setActiveJoint(joint)
    if (joint) flash(coachRef.current)
  }, [flash])

  const handleFaceMode = useCallback((m: FaceMode) => {
    setFaceMode(m)
    const p = loadProfile()
    saveProfile({ ...p, faceMode: m })
  }, [])

  // 画面内解析（段階的プログレス + 実 API 呼び出し）
  const handleFile = useCallback(async (file: File) => {
    setAnalyzeError(null)
    setAnalyzing(true)
    setShowDropzone(false)
    setPlaying(false)
    setAnalyzeStep(0)
    const timers: number[] = [
      window.setTimeout(() => setAnalyzeStep(1), 700),
      window.setTimeout(() => setAnalyzeStep(2), 1600),
      window.setTimeout(() => setAnalyzeStep(3), 2600)
    ]
    try {
      const res = await api.analyzePose(file, 'kick', undefined, faceMode)
      timers.forEach(clearTimeout)
      setAnalyzeStep(3)
      setData((prev) => mergePoseIntoData(prev, res))
      setAnalyzing(false)
      setRevealKey((k) => k + 1)
      setActiveJoint(null)
      addToast('success', '解析が完了しました')
      api.getHistory().then((h) => {
        const entries: HistoryEntry[] = h.analyses
          .filter((a) => a.analysis_type !== 'formation' && a.score != null)
          .slice(0, 4)
          .map((a) => ({
            id: a.id,
            date: new Date(a.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
            score: Math.round(a.score as number),
            thumbSrc: a.media_type === 'video' || a.media_type === 'image' ? `/api/history/${a.id}/thumbnail` : null
          }))
        if (entries.length) setData((prev) => ({ ...prev, history: entries }))
      }).catch(() => undefined)
    } catch (err: unknown) {
      timers.forEach(clearTimeout)
      setAnalyzing(false)
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAnalyzeError(detail ?? 'フォーム解析に失敗しました。動画を確認して再度お試しください。')
      setShowDropzone(true)
      addToast('error', '解析に失敗しました')
    }
  }, [faceMode, addToast])

  const analyzeMode: 'dropzone' | 'progress' | null = analyzing ? 'progress' : showDropzone ? 'dropzone' : null

  // 開封演出: revealKey 変化で主要セクションを再マウントして stagger 表示
  const Reveal = ({ i, children }: { i: number; children: ReactNode }) => (
    <div key={`rv-${revealKey}-${i}`} className="kpro-reveal" style={{ animationDelay: `${i * 70}ms` }}>
      {children}
    </div>
  )

  return (
    <div className="relative">
      <style>{PAGE_CSS}</style>

      {/* この画面専用の多層グラデーション背景 */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: -1,
          background: [
            'radial-gradient(1100px 480px at 85% -8%, rgba(34, 197, 94, 0.09), transparent 60%)',
            'radial-gradient(800px 420px at -5% 30%, rgba(56, 189, 248, 0.07), transparent 60%)',
            'radial-gradient(900px 500px at 50% 115%, rgba(11, 18, 32, 0.9), transparent 70%)',
            'linear-gradient(180deg, #020617 0%, #06111f 45%, #0b1220 100%)'
          ].join(', ')
        }}
      />

      <AnalysisHeader tab={tab} onTabChange={setTab} />

      {/* インサイトサマリーストリップ（一瞬で理解の核） */}
      <InsightStrip insights={insights} onJump={handleJump} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[236px_minmax(0,1fr)_280px]">
        {/* 左サイドバー（モバイルでは中央の後ろへ） */}
        <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-none">
          <ShotSidebar shot={data.shot} currentTime={currentTime} />
          <SessionInfoCard session={data.session} />
          <AngleListCard
            angles={data.angles}
            activeJoint={focusJoint}
            onHoverJoint={setHoverJoint}
            onSelectJoint={setActiveJoint}
          />
        </aside>

        {/* 中央メイン */}
        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-none">
          <Reveal i={0}>
            <MainFormViewer
              tab={tab}
              landmarks={data.landmarks}
              angleLabels={data.angleLabels}
              highlightJoints={highlightJoints}
              overall={data.overall}
              isSample={data.isSample}
              playing={playing}
              onTogglePlay={() => setPlaying((v) => !v)}
              currentTime={currentTime}
              duration={duration}
              onSeek={(t) => setCurrentTime(Math.max(0, Math.min(duration, t)))}
              speed={speed}
              onSpeedChange={setSpeed}
              focusJoint={focusJoint}
              analyzeMode={analyzeMode}
              faceMode={faceMode}
              onFaceModeChange={handleFaceMode}
              onFile={handleFile}
              analyzeStepIndex={analyzeStep}
              analyzeError={analyzeError}
              onDismissError={() => setAnalyzeError(null)}
              onNewAnalysis={() => { setAnalyzeError(null); setShowDropzone(true) }}
              compareBlend={compareBlend}
              onCompareBlendChange={setCompareBlend}
            />
          </Reveal>

          {/* 改善ランキング + AIコーチ（モバイルではビューワー直下） */}
          <div className="order-1 grid grid-cols-1 gap-4 lg:order-none lg:grid-cols-2">
            <div ref={improvementRef} className="order-1 lg:order-none">
              <Reveal i={1}>
                <ImprovementRankingCard items={data.improvements} activeJoint={focusJoint} onSelect={handleImprovementSelect} />
              </Reveal>
            </div>
            <div ref={coachRef} className="order-2 lg:order-none">
              <Reveal i={2}>
                <AICoachCommentCard coach={data.coach} />
              </Reveal>
            </div>
          </div>

          <div className="order-2 lg:order-none">
            <Reveal i={3}>
              <MotionTimeline phases={data.phases} progress={progress} onSeek={(p) => setCurrentTime(p * duration)} />
            </Reveal>
          </div>

          <div className="order-3 lg:order-none">
            <Reveal i={4}>
              <IdealComparisonCard
                items={data.comparisons}
                baseline={baseline}
                onBaselineChange={setBaseline}
                activeJoint={focusJoint}
                onHoverJoint={setHoverJoint}
                onSelectJoint={setActiveJoint}
              />
            </Reveal>
          </div>
        </div>

        {/* 右サイドバー */}
        <aside className="order-3 grid min-w-0 grid-cols-1 gap-4 self-start sm:grid-cols-2 lg:order-none lg:grid-cols-1">
          <SkillRadarCard radar={data.radar} />
          <SkillProgressCard progress={data.progress} />
          <AnalysisHistoryCard history={data.history} />
          <div ref={recRef}>
            <TrainingRecommendationCard recs={data.recommendations} />
          </div>
        </aside>
      </div>

      {/* 下部メトリクスカード列 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.metrics.map((m) => (
          <MetricGaugeCard key={m.key} metric={m} />
        ))}
      </div>

      <ToastStack toasts={toasts} />
      {onboarding && <Onboarding onClose={() => setOnboarding(false)} />}
    </div>
  )
}

export default KickFormAnalysisPro

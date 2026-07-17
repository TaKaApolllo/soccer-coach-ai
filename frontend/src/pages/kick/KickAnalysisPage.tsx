import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AnalysisDetailGrid from '../../components/kick/AnalysisDetailGrid'
import AnalysisWorkspace from '../../components/kick/AnalysisWorkspace'
import KickAnalysisHeader from '../../components/kick/KickAnalysisHeader'
import MainVideoPanel from '../../components/kick/MainVideoPanel'
import AnalysisSummaryPanel from '../../components/kick/AnalysisSummaryPanel'
import ShotSelector from '../../components/kick/ShotSelector'
import {
  FailedPanel,
  LowConfidenceBanner,
  SampleNotice
} from '../../components/kick/StatusPanels'
import {
  MOCK_BALL_SPEED_LEAGUE_DELTA,
  MOCK_COMPARISON_BASELINES,
  MOCK_KICK_ANALYSIS
} from '../../mocks/kickAnalysis.mock'
import { api } from '../../services/api'
import {
  KickAnalysisPayload,
  getKickAnalysisHistory,
  getKickAnalysisResult,
  uploadKickVideo,
  validateKickVideoFile
} from '../../services/kickAnalysisApi'
import { FaceMode, loadProfile, saveProfile } from '../../services/profile'
import { SkillRadar } from '../../types/analysis'
import { KickHistoryEntry } from '../../types/kickAnalysis'
import { ViewTab, buildKickViewModel } from './viewModel'

/** グロー/バーのマウント時アニメーション（reduced-motion で無効化） */
const PAGE_CSS = `
@keyframes kickGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.kpro-grow-bar { transform-origin: left center; animation: kickGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .kpro-grow-bar { animation: none; }
  .kick-analysis-page * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
`

// =====================================================================
// /analysis/kick — キックフォーム分析（統合ページ）
//
// 状態機械（discriminated union）:
//   idle           解析結果なし。サンプルデータ + アップロード導線
//   uploading      動画送信中（進捗 0-1）
//   processing     AI 解析中（段階表示）
//   completed      解析完了（実データ表示）
//   low_confidence 結果はあるが信頼度不足（結果 + 警告バナー）
//   failed         失敗（エラー内容 + 再試行 + 次の行動）
// =====================================================================

type PageState =
  | { phase: 'idle'; payload: KickAnalysisPayload }
  | { phase: 'uploading'; fileName: string; progress: number; payload: KickAnalysisPayload }
  | { phase: 'processing'; fileName: string; step: number; payload: KickAnalysisPayload }
  | { phase: 'completed'; payload: KickAnalysisPayload }
  | { phase: 'low_confidence'; payload: KickAnalysisPayload }
  | { phase: 'failed'; message: string; hint: string; payload: KickAnalysisPayload }

const SAMPLE_PAYLOAD: KickAnalysisPayload = {
  analysis: MOCK_KICK_ANALYSIS,
  source: null,
  isSample: true
}

const RETRY_HINT =
  '横から全身（頭からつま先まで）が写る明るいキック動画（MP4 推奨・100MB 以下）で再試行してください。'

/** 解析ステップ演出のタイミング（AnalyzePanel の 4 ステップに対応） */
const PROCESSING_STEP_DELAYS_MS = [700, 1600, 2600]

function KickAnalysisPage() {
  const [state, setState] = useState<PageState>({ phase: 'idle', payload: SAMPLE_PAYLOAD })
  const [history, setHistory] = useState<KickHistoryEntry[]>([])
  const [loadingShotId, setLoadingShotId] = useState<string | null>(null)
  const [radar, setRadar] = useState<SkillRadar | null>(null)

  // ビュー操作
  const [tab, setTab] = useState<ViewTab>('angle')
  const [activeFrame, setActiveFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1.0)
  const [compareBlend, setCompareBlend] = useState(45)

  // アップロード導線
  const [faceMode, setFaceMode] = useState<FaceMode>(loadProfile().faceMode)
  const [showDropzone, setShowDropzone] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepTimers = useRef<number[]>([])

  const payload = state.payload
  const vm = useMemo(() => buildKickViewModel(payload), [payload])
  const frameCount = vm.images?.angle.length ?? 0
  const analysisId = payload.isSample ? null : payload.analysis.analysisId

  // ---------------- 初期ロード（最新解析 + 履歴の復元） ----------------
  useEffect(() => {
    let cancelled = false
    Promise.all([getKickAnalysisResult(), getKickAnalysisHistory(8)]).then(([latest, hist]) => {
      if (cancelled) return
      setHistory(hist)
      if (latest) {
        applyPayload(latest)
      } else {
        setState({ phase: 'idle', payload: SAMPLE_PAYLOAD })
        setShowDropzone(true)
      }
    })
    // スキルレーダー（成長記録 API）。失敗時はカード非表示のまま
    api
      .getGrowthSummary()
      .then((s) => {
        if (!cancelled && s.radar.current.some((v) => v > 0)) setRadar(s.radar)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------- 再生ループ ----------------
  useEffect(() => {
    if (playTimer.current) clearInterval(playTimer.current)
    if (playing && frameCount > 1) {
      const base = ((vm.durationSec ?? 2) / frameCount) * 1000
      playTimer.current = setInterval(() => {
        setActiveFrame((f) => (f + 1) % frameCount)
      }, Math.max(80, base / speed))
    }
    return () => {
      if (playTimer.current) clearInterval(playTimer.current)
    }
  }, [playing, speed, frameCount, vm.durationSec])

  // ---------------- キーボードショートカット ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (state.phase === 'uploading' || state.phase === 'processing') return
      if (e.code === 'Space' && frameCount > 1) {
        e.preventDefault()
        setPlaying((v) => !v)
      } else if (e.code === 'ArrowRight' && frameCount > 0) {
        e.preventDefault()
        setPlaying(false)
        setActiveFrame((f) => Math.min(frameCount - 1, f + 1))
      } else if (e.code === 'ArrowLeft' && frameCount > 0) {
        e.preventDefault()
        setPlaying(false)
        setActiveFrame((f) => Math.max(0, f - 1))
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
  }, [frameCount, state.phase])

  // ---------------- 状態遷移ヘルパー ----------------

  const applyPayload = useCallback((p: KickAnalysisPayload) => {
    if (p.analysis.status === 'failed') {
      // バックエンドが構造化エラー（変換不能データ等）を返したケース
      setState({
        phase: 'failed',
        message:
          p.analysis.captureQuality.warnings[0] ?? '解析データを読み込めませんでした。',
        hint: RETRY_HINT,
        payload: SAMPLE_PAYLOAD
      })
      setShowDropzone(false)
      setPlaying(false)
      return
    }
    setState(
      p.analysis.status === 'low_confidence'
        ? { phase: 'low_confidence', payload: p }
        : { phase: 'completed', payload: p }
    )
    setShowDropzone(false)
    setPlaying(false)
    setActiveFrame(p.source?.pose?.key_frame_index ?? 0)
  }, [])

  const clearStepTimers = () => {
    stepTimers.current.forEach((t) => window.clearTimeout(t))
    stepTimers.current = []
  }

  // ---------------- アップロード → 解析 ----------------

  const handleFile = useCallback(
    async (file: File) => {
      const validation = validateKickVideoFile(file)
      if (!validation.ok) {
        setValidationError(`${validation.reason} — ${validation.hint}`)
        return
      }
      setValidationError(null)
      setPlaying(false)
      const prevPayload = state.payload
      setState({ phase: 'uploading', fileName: file.name, progress: 0, payload: prevPayload })

      try {
        const uploaded = { done: false }
        const result = await uploadKickVideo(file, {
          faceMode,
          onUploadProgress: (ratio) => {
            if (ratio >= 1 && !uploaded.done) {
              uploaded.done = true
              // アップロード完了 → AI 解析ステップ演出へ
              setState({ phase: 'processing', fileName: file.name, step: 0, payload: prevPayload })
              clearStepTimers()
              stepTimers.current = PROCESSING_STEP_DELAYS_MS.map((ms, i) =>
                window.setTimeout(() => {
                  setState((s) =>
                    s.phase === 'processing' ? { ...s, step: i + 1 } : s
                  )
                }, ms)
              )
            } else if (!uploaded.done) {
              setState((s) =>
                s.phase === 'uploading' ? { ...s, progress: ratio } : s
              )
            }
          }
        })
        clearStepTimers()
        applyPayload(result)
        getKickAnalysisHistory(8).then(setHistory)
      } catch (err: unknown) {
        clearStepTimers()
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        const message =
          detail ??
          (err instanceof Error && err.message.includes('Network')
            ? 'サーバーに接続できませんでした。バックエンドが起動しているか確認してください。'
            : 'フォーム解析に失敗しました。')
        setState({ phase: 'failed', message, hint: RETRY_HINT, payload: prevPayload })
        setShowDropzone(false)
      }
    },
    [faceMode, state.payload, applyPayload]
  )

  // ---------------- 履歴からの読み込み ----------------

  const handleSelectShot = useCallback(
    async (id: string) => {
      if (id === analysisId || id.startsWith('sample-')) return
      setLoadingShotId(id)
      try {
        const p = await getKickAnalysisResult(id)
        if (p) applyPayload(p)
      } finally {
        setLoadingShotId(null)
      }
    },
    [analysisId, applyPayload]
  )

  const handleFaceMode = useCallback((m: FaceMode) => {
    setFaceMode(m)
    saveProfile({ ...loadProfile(), faceMode: m })
  }, [])

  const handleRetry = useCallback(() => {
    setValidationError(null)
    setState((s) => ({ phase: 'idle', payload: s.payload }))
    setShowDropzone(true)
  }, [])

  // ---------------- 表示用の導出値 ----------------

  const analyzeMode: 'dropzone' | 'progress' | null =
    state.phase === 'uploading' || state.phase === 'processing'
      ? 'progress'
      : state.phase === 'idle' || showDropzone
        ? 'dropzone'
        : null

  // AnalyzePanel の 4 ステップ: 0=アップロード, 1-3=解析ステップ
  const analyzeStepIndex =
    state.phase === 'uploading' ? 0 : state.phase === 'processing' ? Math.min(3, state.step + 1) : 0

  const speedDelta = payload.source?.ball_speed?.delta_vs_avg
  const ballSpeedCaption = payload.isSample
    ? `リーグ平均+${MOCK_BALL_SPEED_LEAGUE_DELTA} km/h（サンプル）`
    : speedDelta !== undefined
      ? `自分の平均${speedDelta >= 0 ? '+' : ''}${speedDelta} km/h ※概算`
      : null

  const shotEntries: KickHistoryEntry[] = history.length > 0 ? history : payload.analysis.history

  const timelineProgress = frameCount > 1 ? activeFrame / (frameCount - 1) : 0
  const handleTimelineSeek = useCallback(
    (p: number) => {
      if (frameCount > 1) {
        setActiveFrame(Math.round(p * (frameCount - 1)))
        setPlaying(false)
      }
    },
    [frameCount]
  )

  return (
    <div className="kick-analysis-page relative" data-testid="kick-page" data-state={state.phase}>
      <style>{PAGE_CSS}</style>
      <KickAnalysisHeader tab={tab} onTabChange={setTab} />

      {/* 状態バナー */}
      {state.phase === 'idle' && <SampleNotice />}
      {state.phase === 'low_confidence' && (
        <LowConfidenceBanner
          warnings={payload.analysis.captureQuality.warnings}
          detectionScore={payload.analysis.captureQuality.score}
        />
      )}
      {state.phase === 'failed' && (
        <FailedPanel message={state.message} hint={state.hint} onRetry={handleRetry} />
      )}

      <AnalysisWorkspace
        shotSelector={
          <ShotSelector
            entries={shotEntries}
            activeId={analysisId}
            onSelect={handleSelectShot}
            loadingId={loadingShotId}
          />
        }
        main={
          <MainVideoPanel
            tab={tab}
            vm={vm}
            isSample={payload.isSample}
            activeFrame={activeFrame}
            onFrameChange={(i) => {
              setActiveFrame(i)
              setPlaying(false)
            }}
            playing={playing}
            onTogglePlay={() => setPlaying((v) => !v)}
            speed={speed}
            onSpeedChange={setSpeed}
            compareBlend={compareBlend}
            onCompareBlendChange={setCompareBlend}
            analyzeMode={analyzeMode}
            faceMode={faceMode}
            onFaceModeChange={handleFaceMode}
            onFile={handleFile}
            analyzeStepIndex={analyzeStepIndex}
            analyzeError={validationError}
            onDismissError={() => setValidationError(null)}
            onNewAnalysis={() => setShowDropzone(true)}
          />
        }
        summary={
          <AnalysisSummaryPanel analysis={payload.analysis} ballSpeedCaption={ballSpeedCaption} />
        }
      />

      <AnalysisDetailGrid
        vm={vm}
        analysis={payload.analysis}
        partComments={payload.source?.pose?.body_part_scores ?? null}
        radar={radar}
        baselines={MOCK_COMPARISON_BASELINES}
        baselinesAreSample
        history={shotEntries}
        activeAnalysisId={analysisId}
        onSelectHistory={handleSelectShot}
        progress={timelineProgress}
        onSeek={handleTimelineSeek}
      />
    </div>
  )
}

export default KickAnalysisPage

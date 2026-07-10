import { useEffect, useRef, useState } from 'react'
import { PoseLandmark } from '../../types'
import { AngleLabel, OverallScore } from '../../types/analysis'
import { HERO_PRESET_LANDMARKS } from '../../data/mockAnalysisData'
import { api } from '../../services/api'
import { ProTab } from './AnalysisHeader'
import AvatarViewer from './AvatarViewer'
import ScoreOverlayCard from './ScoreOverlayCard'
import VideoControls from './VideoControls'

interface MainFormViewerProps {
  tab: ProTab
  landmarks: PoseLandmark[]
  angleLabels: AngleLabel[]
  highlightJoints: string[]
  overall: OverallScore
  isSample: boolean
  playing: boolean
  onTogglePlay: () => void
  currentTime: number
  duration: number
  onSeek: (t: number) => void
  speed: number
  onSpeedChange: (s: number) => void
}

/** 外部の画像生成 AI（ChatGPT 等）に貼り付けるための推奨プロンプト（英文・固定） */
const HERO_PROMPT =
  'Photorealistic professional soccer player in a dark navy uniform performing a powerful instep kick, side view, right leg swinging through a white ball, dramatic dark stadium with floodlights bokeh in the background, cinematic rim lighting with subtle green accent glow, sports photography style, no visible face of any real person, original fictional athlete'

/**
 * 中央の大型分析ビューワー。フォトリアルなヒーロー画像があればそれを土台に、
 * 無ければスタジアム風の AvatarViewer（ベクターイラスト）を土台にして、
 * ガラス HUD の総合スコアと動画コントロールを重ねる。
 * 右下メニューから AI 生成 / 画像アップロード / デフォルト復帰が行える。
 */
function MainFormViewer({
  tab,
  landmarks,
  angleLabels,
  highlightJoints,
  overall,
  isSample,
  playing,
  onTogglePlay,
  currentTime,
  duration,
  onSeek,
  speed,
  onSpeedChange
}: MainFormViewerProps) {
  const showAngles = tab === 'angle' || tab === 'form'
  const showGhost = tab === 'compare'
  const is3d = tab === '3d'
  const skeletonOnly = tab === 'skeleton'

  // ---- ヒーロー画像の状態 ----
  const [heroUrl, setHeroUrl] = useState<string | null>(null)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<null | string>(null)
  const [promptModal, setPromptModal] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const heroActive = !!heroUrl

  // 初回ロード: 保存済みヒーロー画像があればヒーローモードへ
  useEffect(() => {
    api.hasHeroImage().then((has) => {
      if (has) setHeroUrl(api.heroImageUrl(Date.now()))
    })
  }, [])

  const refreshHero = () => setHeroUrl(api.heroImageUrl(Date.now()))

  const handleGenerate = async () => {
    setMenuOpen(false)
    setBusy('AIで生成中…')
    try {
      await api.generateHeroImage()
      refreshHero()
    } catch (err) {
      setPromptModal(err instanceof Error ? err.message : '画像生成に失敗しました')
    } finally {
      setBusy(null)
    }
  }

  const handleUploadClick = () => {
    setMenuOpen(false)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('アップロード中…')
    try {
      await api.uploadHeroImage(file)
      refreshHero()
    } catch (err) {
      setPromptModal(err instanceof Error ? err.message : 'アップロードに失敗しました')
    } finally {
      setBusy(null)
    }
  }

  const handleReset = async () => {
    setMenuOpen(false)
    setBusy('リセット中…')
    try {
      await api.deleteHeroImage()
      setHeroUrl(null)
    } finally {
      setBusy(null)
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(HERO_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{
        border: '1px solid rgba(148, 163, 184, 0.18)',
        background: 'linear-gradient(180deg, #0a1f33 0%, #06111f 55%, #020617 100%)',
        boxShadow: '0 24px 60px -30px rgba(0,0,0,0.9), 0 0 40px -18px rgba(57,255,136,0.25)',
        minHeight: 420
      }}
      data-testid="main-viewer"
    >
      <div className="absolute inset-0 flex items-stretch justify-center pb-12 pt-16">
        <AvatarViewer
          landmarks={heroActive ? HERO_PRESET_LANDMARKS : landmarks}
          mode={is3d ? '3d' : '2d'}
          highlightJoints={skeletonOnly ? [] : highlightJoints}
          angleLabels={showAngles ? angleLabels : []}
          showGhost={showGhost}
          tilt={is3d}
          backdropUrl={heroActive ? heroUrl : null}
          showSkeleton={showSkeleton}
        />
      </div>

      {/* 左上: ビューモードバッジ + サンプルデータバッジ */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
          style={{ background: 'rgba(2,6,17,0.7)', border: '1px solid rgba(148,163,184,0.25)', color: 'rgba(226,232,240,0.85)' }}
        >
          {heroActive ? 'HERO PHOTO' : is3d ? '3D VIEW (BETA)' : skeletonOnly ? 'SKELETON' : showGhost ? 'GHOST COMPARE' : 'LIVE ANALYSIS'}
        </span>
        {isSample && (
          <span
            data-testid="sample-badge"
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: 'rgba(250,204,21,0.14)', border: '1px solid rgba(250,204,21,0.4)', color: '#facc15' }}
          >
            サンプルデータ
          </span>
        )}
      </div>

      {/* 比較タブ時の凡例 */}
      {showGhost && !heroActive && (
        <div
          className="pointer-events-none absolute right-3 top-3 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold"
          style={{ background: 'rgba(2,6,17,0.7)', border: '1px solid rgba(148,163,184,0.2)' }}
        >
          <span className="mr-3 inline-flex items-center gap-1 text-slate-200">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: '#39ff88' }} /> 現在
          </span>
          <span className="inline-flex items-center gap-1 text-slate-300">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: 'rgba(120,180,255,0.8)', borderBottom: '1px dashed' }} /> 理想
          </span>
        </div>
      )}

      {/* ヒーローモード時: 骨格 ON/OFF トグル（右上） */}
      {heroActive && (
        <button
          type="button"
          data-testid="skeleton-toggle"
          onClick={() => setShowSkeleton((v) => !v)}
          className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide transition"
          style={{
            background: showSkeleton ? 'rgba(57,255,136,0.16)' : 'rgba(2,6,17,0.7)',
            border: `1px solid ${showSkeleton ? 'rgba(57,255,136,0.5)' : 'rgba(148,163,184,0.3)'}`,
            color: showSkeleton ? '#39ff88' : 'rgba(226,232,240,0.85)'
          }}
        >
          骨格 {showSkeleton ? 'ON' : 'OFF'}
        </button>
      )}

      {/* 上部 HUD: 総合スコア */}
      <div className="pointer-events-none absolute left-3 right-3 top-12 flex justify-start sm:top-3 sm:justify-end">
        <div className="mt-2 sm:mt-9">
          <ScoreOverlayCard overall={overall} />
        </div>
      </div>

      {/* 下部 HUD: 動画コントロール */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3">
        <VideoControls
          playing={playing}
          onTogglePlay={onTogglePlay}
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
          speed={speed}
          onSpeedChange={onSpeedChange}
        />
      </div>

      {/* 右下: ヒーロー画像メニュー */}
      <div className="absolute bottom-16 right-3 flex flex-col items-end gap-2">
        {menuOpen && (
          <div
            data-testid="hero-menu"
            className="flex flex-col gap-1 rounded-xl p-1.5 text-[11px] font-semibold"
            style={{ background: 'rgba(2,6,17,0.92)', border: '1px solid rgba(148,163,184,0.25)', backdropFilter: 'blur(6px)' }}
          >
            <button
              type="button"
              data-testid="hero-generate"
              onClick={handleGenerate}
              className="rounded-lg px-3 py-1.5 text-left text-slate-100 transition hover:bg-white/10"
            >
              ✨ AIで生成
            </button>
            <button
              type="button"
              data-testid="hero-upload"
              onClick={handleUploadClick}
              className="rounded-lg px-3 py-1.5 text-left text-slate-100 transition hover:bg-white/10"
            >
              📤 画像をアップロード
            </button>
            <button
              type="button"
              data-testid="hero-reset"
              onClick={handleReset}
              disabled={!heroActive}
              className="rounded-lg px-3 py-1.5 text-left text-slate-100 transition hover:bg-white/10 disabled:opacity-40"
            >
              🗑 デフォルトに戻す
            </button>
          </div>
        )}
        <button
          type="button"
          data-testid="hero-menu-toggle"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-full px-3 py-1.5 text-[11px] font-bold shadow-lg transition"
          style={{ background: 'rgba(2,6,17,0.85)', border: '1px solid rgba(57,255,136,0.4)', color: '#39ff88' }}
        >
          🎨 ビジュアル
        </button>
      </div>

      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* 処理中スピナー */}
      {busy && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(2,6,17,0.6)', backdropFilter: 'blur(2px)' }}>
          <div
            className="h-10 w-10 animate-spin rounded-full"
            style={{ border: '3px solid rgba(57,255,136,0.25)', borderTopColor: '#39ff88' }}
          />
          <span className="text-xs font-semibold text-slate-200">{busy}</span>
        </div>
      )}

      {/* 503 / エラー時: メッセージ + 推奨プロンプトのコピー UI */}
      {promptModal && (
        <div
          data-testid="hero-prompt-modal"
          className="absolute inset-0 z-30 flex items-center justify-center p-4"
          style={{ background: 'rgba(2,6,17,0.78)', backdropFilter: 'blur(3px)' }}
          onClick={() => setPromptModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-4"
            style={{ background: 'rgba(9,14,26,0.98)', border: '1px solid rgba(148,163,184,0.28)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-sm font-bold text-slate-100">ヒーロー画像の生成</div>
            <p className="mb-3 text-xs leading-relaxed text-slate-300">{promptModal}</p>
            <div className="mb-2 text-[11px] font-semibold text-slate-400">推奨生成プロンプト（外部 AI にコピペ）</div>
            <div
              className="mb-3 max-h-32 overflow-y-auto rounded-lg p-2.5 text-[11px] leading-relaxed text-slate-200"
              style={{ background: 'rgba(2,6,17,0.85)', border: '1px solid rgba(148,163,184,0.2)' }}
            >
              {HERO_PROMPT}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                data-testid="hero-copy-prompt"
                onClick={copyPrompt}
                className="rounded-lg px-3 py-1.5 text-xs font-bold transition"
                style={{ background: 'rgba(57,255,136,0.16)', border: '1px solid rgba(57,255,136,0.5)', color: '#39ff88' }}
              >
                {copied ? '✓ コピーしました' : 'プロンプトをコピー'}
              </button>
              <button
                type="button"
                onClick={() => setPromptModal(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                style={{ border: '1px solid rgba(148,163,184,0.25)' }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MainFormViewer

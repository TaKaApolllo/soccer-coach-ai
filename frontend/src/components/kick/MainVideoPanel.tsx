import { FaceMode } from '../../services/profile'
import { KickViewModel, ViewTab } from '../../pages/kick/viewModel'
import AnalyzePanel from '../analysis/AnalyzePanel'
import AvatarViewer from '../analysis/AvatarViewer'
import ScoreOverlayCard from '../analysis/ScoreOverlayCard'
import { btnReset } from '../analysis/ui'

const SPEEDS = [0.5, 1.0, 2.0]

interface MainVideoPanelProps {
  tab: ViewTab
  vm: KickViewModel
  isSample: boolean
  activeFrame: number
  onFrameChange: (i: number) => void
  playing: boolean
  onTogglePlay: () => void
  speed: number
  onSpeedChange: (s: number) => void
  /** 比較タブのゴースト混合率 0-100 */
  compareBlend: number
  onCompareBlendChange: (v: number) => void
  /** アップロード導線: null なら結果表示のみ */
  analyzeMode: 'dropzone' | 'progress' | null
  faceMode: FaceMode
  onFaceModeChange: (m: FaceMode) => void
  onFile: (f: File) => void
  analyzeStepIndex: number
  analyzeError: string | null
  onDismissError: () => void
  onNewAnalysis: () => void
}

function formatTime(sec?: number | null): string {
  if (sec === undefined || sec === null) return '--:--.--'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

/**
 * 中央のメインビューワー。
 * - 実データ: 骨格オーバーレイ済みフレーム画像 + スクラバー再生
 * - サンプル/比較タブ: AvatarViewer（ベクター描画 + 理想ゴースト）
 * - アップロード導線（ドロップゾーン / 段階プログレス）を重ねて表示
 */
function MainVideoPanel({
  tab,
  vm,
  isSample,
  activeFrame,
  onFrameChange,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  compareBlend,
  onCompareBlendChange,
  analyzeMode,
  faceMode,
  onFaceModeChange,
  onFile,
  analyzeStepIndex,
  analyzeError,
  onDismissError,
  onNewAnalysis
}: MainVideoPanelProps) {
  const frameCount = vm.images?.angle.length ?? 0
  const hasFrames = frameCount > 0 && tab !== 'compare'

  const frameImage = (i: number): string | null => {
    if (!vm.images) return null
    if (tab === 'form') return vm.images.form[i] ?? vm.images.angle[i]
    if (tab === 'skeleton') return vm.images.skeleton[i] ?? vm.images.angle[i]
    return vm.images.angle[i] ?? null
  }

  // 比較タブ・サンプル時に使う骨格（フレーム連動、無ければキーフレーム）
  const avatarLandmarks =
    vm.landmarksByFrame?.[activeFrame]?.length
      ? vm.landmarksByFrame[activeFrame]
      : vm.landmarks

  const showCompare = tab === 'compare'
  const currentImage = hasFrames ? frameImage(activeFrame) : null
  const phaseLabel = vm.phaseLabels[activeFrame]
  const activeTime = vm.frameTimes?.[activeFrame] ?? null

  const blend = compareBlend / 100

  return (
    <section
      aria-label="キックフォームビューワー"
      className="relative overflow-hidden rounded-3xl"
      style={{
        border: '1px solid rgba(148, 163, 184, 0.18)',
        background: 'linear-gradient(180deg, #0a1f33 0%, #06111f 55%, #020617 100%)',
        boxShadow: '0 24px 60px -30px rgba(0,0,0,0.9), 0 0 40px -18px rgba(57,255,136,0.25)',
        minHeight: 420
      }}
      data-testid="main-video-panel"
    >
      {/* ===== ビュー本体 ===== */}
      {hasFrames ? (
        <div className="absolute inset-0 flex items-center justify-center pb-16 pt-14">
          {currentImage ? (
            <img
              src={`data:image/jpeg;base64,${currentImage}`}
              alt={`フレーム ${activeFrame + 1}（${phaseLabel ?? 'フェーズ不明'}）`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p className="px-6 text-center text-sm text-slate-400">
              このフレームでは骨格を検出できませんでした
            </p>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-stretch justify-center pb-14 pt-14">
          <AvatarViewer
            landmarks={avatarLandmarks}
            angleLabels={tab === 'angle' || tab === 'form' || isSample ? vm.angleLabels : []}
            highlightJoints={[]}
            showGhost={showCompare}
            ghostOpacity={showCompare ? 0.2 + blend * 0.8 : 0.55}
            bodyOpacity={showCompare ? 1 - blend * 0.9 : 1}
          />
        </div>
      )}

      {/* ===== 左上バッジ ===== */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
          style={{ background: 'rgba(2,6,17,0.7)', border: '1px solid rgba(148,163,184,0.25)', color: 'rgba(226,232,240,0.85)' }}
        >
          {showCompare ? 'GHOST COMPARE' : hasFrames ? 'LIVE ANALYSIS' : 'PREVIEW'}
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
        {phaseLabel && hasFrames && (
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: 'rgba(57,255,136,0.12)', border: '1px solid rgba(57,255,136,0.4)', color: '#39ff88' }}
          >
            {phaseLabel}
          </span>
        )}
      </div>

      {/* ===== 右上 HUD: 総合スコア ===== */}
      <div className="pointer-events-none absolute right-3 top-3">
        <ScoreOverlayCard overall={vm.overall} />
      </div>

      {/* ===== 比較タブ: ブレンドスライダー ===== */}
      {showCompare && (
        <div
          className="absolute left-1/2 top-16 flex w-64 max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(2,8,20,0.72)', border: '1px solid rgba(148,163,184,0.2)', backdropFilter: 'blur(12px)' }}
        >
          <span className="shrink-0 text-[10px] font-bold" style={{ color: '#39ff88' }}>自分</span>
          <input
            type="range"
            min={0}
            max={100}
            value={compareBlend}
            onChange={(e) => onCompareBlendChange(Number(e.target.value))}
            className="h-1 min-w-0 flex-1 cursor-pointer"
            style={{ accentColor: '#39ff88' }}
            aria-label="現在と理想の重ね合わせ不透明度"
          />
          <span className="shrink-0 text-[10px] font-bold" style={{ color: 'rgba(120,180,255,0.9)' }}>理想</span>
        </div>
      )}

      {/* ===== 下部: スクラバー（実フレームがある場合のみ） ===== */}
      {hasFrames && frameCount > 1 && (
        <div
          className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(2,8,20,0.72)', border: '1px solid rgba(148,163,184,0.2)', backdropFilter: 'blur(12px)' }}
        >
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? '一時停止' : '再生'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
            style={{ ...btnReset, background: 'rgba(57,255,136,0.14)', border: '1px solid rgba(57,255,136,0.4)', color: '#39ff88' }}
            data-testid="play-toggle"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-300">
            {formatTime(activeTime)} / {formatTime(vm.durationSec)}
          </span>
          <input
            type="range"
            min={0}
            max={frameCount - 1}
            value={Math.min(activeFrame, frameCount - 1)}
            onChange={(e) => onFrameChange(Number(e.target.value))}
            className="h-1 min-w-[80px] flex-1 cursor-pointer"
            style={{ accentColor: '#39ff88' }}
            aria-label="フレーム位置"
          />
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="再生速度">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSpeedChange(s)}
                aria-pressed={speed === s}
                className="rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
                style={{
                  ...btnReset,
                  background: speed === s ? 'rgba(57,255,136,0.9)' : 'rgba(148,163,184,0.1)',
                  color: speed === s ? '#02120a' : 'rgba(203,213,225,0.75)'
                }}
              >
                {s.toFixed(1)}x
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== ＋新しい解析（結果表示中のみ） ===== */}
      {!analyzeMode && (
        <button
          type="button"
          data-testid="new-analysis"
          onClick={onNewAnalysis}
          className="absolute bottom-16 right-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
          style={{ ...btnReset, background: 'rgba(2,6,17,0.85)', border: '1px solid rgba(57,255,136,0.4)', color: '#39ff88' }}
        >
          ＋新しい解析
        </button>
      )}

      {/* ===== アップロード導線（ドロップゾーン / プログレス） ===== */}
      {analyzeMode && (
        <AnalyzePanel
          mode={analyzeMode}
          faceMode={faceMode}
          onFaceModeChange={onFaceModeChange}
          onFile={onFile}
          stepIndex={analyzeStepIndex}
          error={analyzeError}
          onDismissError={onDismissError}
        />
      )}
    </section>
  )
}

export default MainVideoPanel

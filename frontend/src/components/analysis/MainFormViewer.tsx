import { PoseLandmark } from '../../types'
import { AngleLabel, OverallScore } from '../../types/analysis'
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

/**
 * 中央の大型分析ビューワー。スタジアム風の AvatarViewer を土台に、
 * ガラス HUD の総合スコアと動画コントロールを重ねる。
 * タブに応じて角度ラベル / ゴースト / 3D 風表示を切り替える。
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
          landmarks={landmarks}
          mode={is3d ? '3d' : '2d'}
          highlightJoints={skeletonOnly ? [] : highlightJoints}
          angleLabels={showAngles ? angleLabels : []}
          showGhost={showGhost}
          tilt={is3d}
        />
      </div>

      {/* 左上: ビューモードバッジ + サンプルデータバッジ */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
          style={{ background: 'rgba(2,6,17,0.7)', border: '1px solid rgba(148,163,184,0.25)', color: 'rgba(226,232,240,0.85)' }}
        >
          {is3d ? '3D VIEW (BETA)' : skeletonOnly ? 'SKELETON' : showGhost ? 'GHOST COMPARE' : 'LIVE ANALYSIS'}
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
      {showGhost && (
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
    </div>
  )
}

export default MainFormViewer

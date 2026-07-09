import { btnReset } from './ui'

interface VideoControlsProps {
  playing: boolean
  onTogglePlay: () => void
  currentTime: number
  duration: number
  onSeek: (t: number) => void
  speed: number
  onSpeedChange: (s: number) => void
}

const SPEEDS = [0.5, 1.0, 2.0]

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * 再生 / 一時停止・時間表示・プログレスバー・再生速度の動画コントロール。
 */
function VideoControls({ playing, onTogglePlay, currentTime, duration, onSeek, speed, onSpeedChange }: VideoControlsProps) {
  const progress = duration > 0 ? currentTime / duration : 0

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(p * duration)
  }

  return (
    <div
      className="pointer-events-auto flex items-center gap-3 rounded-xl px-3 py-2"
      style={{
        background: 'rgba(2, 8, 20, 0.7)',
        border: '1px solid rgba(148,163,184,0.2)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }}
    >
      <button
        type="button"
        data-testid="play-toggle"
        aria-label={playing ? '一時停止' : '再生'}
        onClick={onTogglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
        style={{
          ...btnReset,
          background: 'linear-gradient(135deg, #22c55e, #39ff88)',
          color: '#02120a',
          boxShadow: '0 0 16px rgba(57,255,136,0.45)'
        }}
      >
        {playing ? (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <rect x="1.5" y="1" width="3.2" height="10" rx="1" />
            <rect x="7.3" y="1" width="3.2" height="10" rx="1" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M2.5 1.2v9.6l8-4.8-8-4.8Z" />
          </svg>
        )}
      </button>

      <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-200">
        {fmt(currentTime)} <span className="text-slate-500">/ {fmt(duration)}</span>
      </span>

      <div
        className="group relative h-5 min-w-0 flex-1 cursor-pointer"
        onClick={handleBarClick}
        role="slider"
        aria-label="再生位置"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.18)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, #22c55e, #39ff88)',
              boxShadow: '0 0 10px rgba(57,255,136,0.5)'
            }}
          />
        </div>
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform group-hover:scale-125"
          style={{ left: `${progress * 100}%`, background: '#39ff88', boxShadow: '0 0 8px rgba(57,255,136,0.8)' }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 rounded-full p-0.5" style={{ background: 'rgba(148,163,184,0.1)' }}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            className="rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors"
            style={{
              ...btnReset,
              background: speed === s ? 'rgba(57,255,136,0.9)' : 'transparent',
              color: speed === s ? '#02120a' : 'rgba(203,213,225,0.6)'
            }}
          >
            {s.toFixed(1)}x
          </button>
        ))}
      </div>
    </div>
  )
}

export default VideoControls

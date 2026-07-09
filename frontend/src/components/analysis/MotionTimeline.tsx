import { MotionPhase } from '../../types/analysis'
import { Card, btnReset } from './ui'

interface MotionTimelineProps {
  phases: MotionPhase[]
  /** 再生位置 0-1 */
  progress: number
  onSeek?: (p: number) => void
}

/**
 * モーションタイムライン。フェーズ帯（助走 / テイクバック / インパクト /
 * フォロースルー）を表示し、現在の再生位置のフェーズを強調する。
 */
function MotionTimeline({ phases, progress, onSeek }: MotionTimelineProps) {
  const activeIdx = phases.findIndex((p) => progress >= p.start && progress < p.end)
  const active = activeIdx >= 0 ? activeIdx : phases.length - 1

  return (
    <Card
      title="モーションタイムライン"
      action={
        <span className="text-[11px] font-bold" style={{ color: phases[active]?.color ?? '#39ff88' }}>
          現在: {phases[active]?.label ?? '-'}
        </span>
      }
    >
      <div className="relative">
        <div className="flex h-12 w-full gap-1">
          {phases.map((p, i) => {
            const isActive = i === active
            return (
              <button
                key={p.key}
                type="button"
                data-testid={`phase-${i}`}
                onClick={() => onSeek?.((p.start + p.end) / 2)}
                className="relative flex items-center justify-center overflow-hidden rounded-lg p-0 transition-all duration-300"
                style={{
                  ...btnReset,
                  flex: `${(p.end - p.start) * 100} 0 0`,
                  background: isActive ? `${p.color}2e` : 'rgba(148,163,184,0.08)',
                  border: `1px solid ${isActive ? p.color : 'rgba(148,163,184,0.14)'}`,
                  boxShadow: isActive ? `0 0 16px -4px ${p.color}` : 'none',
                  transform: isActive ? 'translateY(-2px)' : 'none'
                }}
              >
                <span
                  className="px-1 text-center text-[10px] font-bold leading-tight transition-colors sm:text-[11px]"
                  style={{ color: isActive ? p.color : 'rgba(148,163,184,0.75)' }}
                >
                  {p.label}
                  <span className="block text-[9px] font-semibold opacity-70">
                    {Math.round(p.start * 100)}–{Math.round(p.end * 100)}%
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* 再生ヘッド */}
        <div
          className="pointer-events-none absolute -bottom-1 -top-1 w-0.5 transition-none"
          style={{
            left: `${progress * 100}%`,
            background: '#ffffff',
            boxShadow: '0 0 8px rgba(255,255,255,0.8)'
          }}
        />
      </div>

      {/* 目盛り */}
      <div className="mt-1.5 flex justify-between text-[9px] font-semibold text-slate-500">
        {[0, 25, 50, 75, 100].map((v) => (
          <span key={v}>{v}%</span>
        ))}
      </div>
    </Card>
  )
}

export default MotionTimeline

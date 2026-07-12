import { useEffect, useState } from 'react'
import { OverallScore } from '../../types/analysis'
import { Chip } from './ui'

interface ScoreOverlayCardProps {
  overall: OverallScore
}

/**
 * ビューワー上に重ねるガラス HUD の総合スコアカード。
 * マウント時にスコアがカウントアップする。
 */
function ScoreOverlayCard({ overall }: ScoreOverlayCardProps) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const dur = 900
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(overall.score * ease))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [overall.score])

  return (
    <div
      className="pointer-events-auto flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
      style={{
        background: 'rgba(2, 8, 20, 0.66)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        boxShadow: '0 12px 32px -16px rgba(0,0,0,0.8), 0 0 22px -8px rgba(57,255,136,0.3)'
      }}
    >
      <div className="flex items-baseline gap-1">
        <span
          className="text-3xl font-black leading-none tabular-nums"
          style={{ color: '#39ff88', textShadow: '0 0 18px rgba(57,255,136,0.45)' }}
        >
          {display}
        </span>
        <span className="text-sm font-bold text-slate-400">/{overall.max}</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-white">{overall.headline}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {overall.chips.map((c) => (
            <Chip key={c.label} tone={c.tone}>
              {c.label}: {c.value}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ScoreOverlayCard

import { useEffect, useState } from 'react'
import { MetricCard } from '../../types/analysis'
import { Card, TONE_COLOR } from './ui'

interface MetricGaugeCardProps {
  metric: MetricCard
}

function useAnimated(target: number, dur = 900): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return v
}

function CircleGauge({ ratio, color }: { ratio: number; color: string }) {
  const R = 30
  const C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 76 76" width="72" height="72" aria-hidden>
      <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="7" />
      <circle
        cx="38" cy="38" r={R} fill="none"
        stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${C * ratio} ${C}`}
        transform="rotate(-90 38 38)"
        style={{ filter: `drop-shadow(0 0 5px ${color}88)`, transition: 'stroke-dasharray 0.2s linear' }}
      />
    </svg>
  )
}

function SemiGauge({ ratio, color }: { ratio: number; color: string }) {
  const R = 30
  const C = Math.PI * R
  return (
    <svg viewBox="0 0 76 46" width="72" height="44" aria-hidden>
      <path d="M8 40 A30 30 0 0 1 68 40" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="7" strokeLinecap="round" />
      <path
        d="M8 40 A30 30 0 0 1 68 40" fill="none"
        stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${C * ratio} ${C}`}
        style={{ filter: `drop-shadow(0 0 5px ${color}88)`, transition: 'stroke-dasharray 0.2s linear' }}
      />
    </svg>
  )
}

/**
 * 下部メトリクスカード（円形 / 半円ゲージ + 値）。マウント時にアニメーション。
 */
function MetricGaugeCard({ metric }: MetricGaugeCardProps) {
  const animated = useAnimated(metric.value)
  const ratio = Math.max(0, Math.min(1, animated / metric.max))
  const color = TONE_COLOR[metric.tone]

  return (
    <Card className="flex flex-col items-center text-center transition-transform hover:-translate-y-0.5" style={{ padding: 14 }}>
      <p className="text-[11px] font-bold text-slate-400">{metric.label}</p>
      <div className={`relative mt-1 flex items-center justify-center ${metric.gauge === 'semi' ? 'h-12' : 'h-[72px]'}`}>
        {metric.gauge === 'circle' ? <CircleGauge ratio={ratio} color={color} /> : <SemiGauge ratio={ratio} color={color} />}
        <span
          className={`absolute text-base font-black tabular-nums ${metric.gauge === 'semi' ? 'bottom-0' : ''}`}
          style={{ color }}
        >
          {Math.round(animated)}
        </span>
      </div>
      <p className="mt-1 text-[10px] font-semibold text-slate-500">
        <span className="font-bold text-slate-300">{metric.unit}</span> · {metric.caption}
      </p>
    </Card>
  )
}

export default MetricGaugeCard

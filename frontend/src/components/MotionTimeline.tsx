import { useRef, useState } from 'react'
import { TimelinePoint } from '../types'

interface MotionTimelineProps {
  timeline: TimelinePoint[]
  activeFrame?: number
  onSelectFrame?: (i: number) => void
}

/**
 * モーションタイムライン: フレームごとの動作強度の折れ線 + フェーズ帯。
 * クリック/ホバーでフレームを選択でき、ヒーロービューと連動する。
 */
function MotionTimeline({ timeline, activeFrame, onSelectFrame }: MotionTimelineProps) {
  const W = 560
  const H = 170
  const pad = { top: 14, right: 12, bottom: 44, left: 12 }
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: TimelinePoint } | null>(null)

  const n = timeline.length
  if (n === 0) return null

  const xAt = (i: number) =>
    n <= 1 ? W / 2 : pad.left + ((W - pad.left - pad.right) * i) / (n - 1)
  const yAt = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / 100)

  // フェーズの連続区間を帯として抽出
  const bands: { phase: string; from: number; to: number }[] = []
  timeline.forEach((p, i) => {
    const last = bands[bands.length - 1]
    if (last && last.phase === p.phase) {
      last.to = i
    } else {
      bands.push({ phase: p.phase, from: i, to: i })
    }
  })

  const path = timeline
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.intensity).toFixed(1)}`)
    .join(' ')
  const area = `${path} L${xAt(n - 1).toFixed(1)},${yAt(0)} L${xAt(0).toFixed(1)},${yAt(0)} Z`

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i) - px)
      if (d < bestD) { bestD = d; best = i }
    }
    if (wrapRef.current) {
      const wr = wrapRef.current.getBoundingClientRect()
      setTooltip({
        x: Math.min(e.clientX - wr.left + 10, wr.width - 120),
        y: e.clientY - wr.top - 8,
        p: timeline[best]
      })
    }
    onSelectFrame?.(best)
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={handleMove}
        onMouseLeave={() => setTooltip(null)}
        role="img"
        aria-label="モーションタイムライン"
      >
        {/* フェーズ帯 */}
        {bands.map((b, bi) => {
          const x0 = b.from === 0 ? pad.left : (xAt(b.from - 1) + xAt(b.from)) / 2
          const x1 = b.to === n - 1 ? W - pad.right : (xAt(b.to) + xAt(b.to + 1)) / 2
          const isKey = b.phase === 'インパクト'
          return (
            <g key={bi}>
              <rect
                x={x0}
                y={pad.top}
                width={Math.max(0, x1 - x0)}
                height={H - pad.top - pad.bottom}
                fill={isKey ? 'rgba(57, 229, 140, 0.12)' : bi % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent'}
              />
              <text
                x={(x0 + x1) / 2}
                y={H - 26}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={isKey ? 800 : 500}
                fill={isKey ? 'var(--accent)' : 'var(--text-muted)'}
              >
                {b.phase}
              </text>
              <text x={(x0 + x1) / 2} y={H - 13} textAnchor="middle" fontSize={8.5} fill="var(--text-muted)">
                {Math.round((b.from / Math.max(1, n - 1)) * 100)}% - {Math.round((b.to / Math.max(1, n - 1)) * 100)}%
              </text>
            </g>
          )
        })}

        {/* 面 + 線 + 点 */}
        <path d={area} fill="var(--series-1)" opacity={0.14} />
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {timeline.map((p, i) => (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(p.intensity)}
            r={i === activeFrame ? 5 : 3}
            fill={i === activeFrame ? 'var(--accent)' : 'var(--series-1)'}
            stroke="var(--surface)"
            strokeWidth={1.5}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectFrame?.(i)}
          />
        ))}

        {/* アクティブフレームのマーカー */}
        {activeFrame !== undefined && activeFrame >= 0 && activeFrame < n && (
          <line
            x1={xAt(activeFrame)}
            x2={xAt(activeFrame)}
            y1={pad.top}
            y2={H - pad.bottom}
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div style={{ fontWeight: 700 }}>{tooltip.p.phase}</div>
          <div>動作強度: <strong>{tooltip.p.intensity}</strong></div>
        </div>
      )}
    </div>
  )
}

export default MotionTimeline

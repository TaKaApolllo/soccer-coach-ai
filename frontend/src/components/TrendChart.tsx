import { useMemo, useRef, useState } from 'react'
import { TrendData } from '../types'

interface TrendChartProps {
  data: TrendData
  height?: number
}

const SERIES_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)'
]

interface TooltipState {
  x: number
  y: number
  month: string
  values: { name: string; value: number; color: string }[]
}

/**
 * スキル推移の折れ線チャート（月次・ホバーでクロスヘア + ツールチップ）
 */
function TrendChart({ data, height = 260 }: TrendChartProps) {
  const width = 640
  const pad = { top: 16, right: 24, bottom: 30, left: 36 }
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const seriesNames = Object.keys(data.series)
  const nMonths = data.months.length

  const xAt = (i: number) =>
    nMonths <= 1
      ? (pad.left + width - pad.right) / 2
      : pad.left + ((width - pad.left - pad.right) * i) / (nMonths - 1)

  const yAt = (v: number) =>
    pad.top + (height - pad.top - pad.bottom) * (1 - v / 100)

  const paths = useMemo(() => {
    return seriesNames.map((name) => {
      const points = data.series[name]
      let d = ''
      let started = false
      points.forEach((v, i) => {
        if (v === null || v === undefined) {
          started = false
          return
        }
        d += `${started ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `
        started = true
      })
      return d.trim()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const monthLabel = (m: string) => {
    const parts = m.split('-')
    return parts.length === 2 ? `${parseInt(parts[1], 10)}月` : m
  }

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (nMonths === 0) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width

    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < nMonths; i++) {
      const d = Math.abs(xAt(i) - px)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    setHoverIdx(best)

    const values = seriesNames
      .map((name, si) => ({
        name,
        value: data.series[name][best],
        color: SERIES_COLORS[si % SERIES_COLORS.length]
      }))
      .filter((v): v is { name: string; value: number; color: string } => v.value !== null && v.value !== undefined)

    if (wrapRef.current) {
      const wrapRect = wrapRef.current.getBoundingClientRect()
      setTooltip({
        x: Math.min(e.clientX - wrapRect.left + 12, wrapRect.width - 130),
        y: e.clientY - wrapRect.top - 10,
        month: data.months[best],
        values
      })
    }
  }

  const handleLeave = () => {
    setTooltip(null)
    setHoverIdx(null)
  }

  if (nMonths === 0 || seriesNames.length === 0) {
    return (
      <div className="empty-state">
        <p>まだ記録がありません。解析を重ねると成長グラフが表示されます。</p>
      </div>
    )
  }

  // 直接ラベルは各系列の最後の有効点に付ける
  const lastPoint = (name: string) => {
    const points = data.series[name]
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i] !== null && points[i] !== undefined) return { i, v: points[i] as number }
    }
    return null
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        role="img"
        aria-label="スキル推移チャート"
      >
        {/* y グリッドと目盛り */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke="var(--grid-line)"
            />
            <text x={pad.left - 8} y={yAt(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="var(--text-muted)">
              {v}
            </text>
          </g>
        ))}

        {/* x ラベル */}
        {data.months.map((m, i) => (
          <text
            key={m}
            x={xAt(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--text-muted)"
          >
            {monthLabel(m)}
          </text>
        ))}

        {/* クロスヘア */}
        {hoverIdx !== null && (
          <line
            x1={xAt(hoverIdx)}
            x2={xAt(hoverIdx)}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="var(--axis-line)"
            strokeDasharray="3 3"
          />
        )}

        {/* 系列 */}
        {seriesNames.map((name, si) => (
          <g key={name}>
            <path
              d={paths[si]}
              fill="none"
              stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {data.series[name].map((v, i) =>
              v === null || v === undefined ? null : (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={hoverIdx === i ? 5 : 3.5}
                  fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              )
            )}
          </g>
        ))}

        {/* 直接ラベル（系列名を最後の点の横に） */}
        {seriesNames.map((name, si) => {
          const lp = lastPoint(name)
          if (!lp) return null
          return (
            <text
              key={name}
              x={Math.min(xAt(lp.i) + 8, width - 4)}
              y={yAt(lp.v) - 8}
              fontSize={11}
              fontWeight={700}
              fill={SERIES_COLORS[si % SERIES_COLORS.length]}
            >
              {name}
            </text>
          )
        })}
      </svg>

      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.month}</div>
          {tooltip.values.map((v) => (
            <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color, display: 'inline-block' }} />
              {v.name}: <strong>{v.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="chart-legend">
        {seriesNames.map((name, si) => (
          <span key={name} className="legend-item">
            <span className="legend-swatch" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

export default TrendChart

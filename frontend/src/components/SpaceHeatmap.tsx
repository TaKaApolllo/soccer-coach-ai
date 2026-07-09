import { SpaceAnalysis } from '../types'

interface SpaceHeatmapProps {
  space: SpaceAnalysis
  teamAName?: string
  teamBName?: string
}

/**
 * スペース分析のコンパクトなヒートマップ（ダッシュボードカード用）
 */
function SpaceHeatmap({ space, teamAName = 'チームA', teamBName = 'チームB' }: SpaceHeatmapProps) {
  const W = 300
  const H = 190
  const cellW = W / space.grid_w
  const cellH = H / space.grid_h

  const cellColor = (v: number): string | null => {
    if (Math.abs(v) < 0.1) return null
    const alpha = Math.min(0.6, Math.abs(v) * 0.7)
    return v > 0 ? `rgba(28, 174, 119, ${alpha})` : `rgba(230, 103, 103, ${alpha})`
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="スペース支配ヒートマップ" style={{ width: '100%', borderRadius: 10 }}>
        <rect x={0} y={0} width={W} height={H} rx={10} fill="#0d1f16" />
        {space.control.map((row, gy) =>
          row.map((v, gx) => {
            const color = cellColor(v)
            if (!color) return null
            return (
              <rect
                key={`${gx}-${gy}`}
                x={gx * cellW}
                y={gy * cellH}
                width={cellW + 0.5}
                height={cellH + 0.5}
                fill={color}
              />
            )
          })
        )}
        <g stroke="rgba(255,255,255,0.25)" strokeWidth={1} fill="none">
          <rect x={4} y={4} width={W - 8} height={H - 8} rx={6} />
          <line x1={W / 2} y1={4} x2={W / 2} y2={H - 4} />
          <circle cx={W / 2} cy={H / 2} r={22} />
        </g>
        {space.zones.map((z, i) => (
          <text
            key={i}
            x={z.x * W}
            y={z.y * H + 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight={800}
            fill={z.type === 'danger' ? 'var(--error-color)' : 'var(--accent)'}
          >
            {z.type === 'danger' ? '!' : '↗'}
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'rgba(28,174,119,0.6)' }} />
          {teamAName}
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'rgba(230,103,103,0.6)' }} />
          {teamBName}
        </span>
      </div>
    </div>
  )
}

export default SpaceHeatmap

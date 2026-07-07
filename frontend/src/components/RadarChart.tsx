import { RadarData } from '../types'

interface RadarChartProps {
  data: RadarData
  size?: number
}

/**
 * スキル概要レーダーチャート（現在のレベル vs 前月）
 */
function RadarChart({ data, size = 300 }: RadarChartProps) {
  const cx = size / 2
  const cy = size / 2 + 6
  const radius = size * 0.34
  const n = data.axes.length
  const maxValue = 100

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

  const point = (i: number, value: number) => {
    const rr = (radius * Math.max(0, Math.min(maxValue, value))) / maxValue
    return [cx + rr * Math.cos(angle(i)), cy + rr * Math.sin(angle(i))]
  }

  const polygon = (values: number[]) =>
    values.map((v, i) => point(i, v).map((c) => c.toFixed(1)).join(',')).join(' ')

  const gridLevels = [25, 50, 75, 100]
  const hasPrevious = data.previous.some((v) => v > 0)

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`スキルレーダー: ${data.axes.map((a, i) => `${a} ${data.current[i]}点`).join('、')}`}
      >
        {/* グリッド */}
        {gridLevels.map((lvl) => (
          <polygon
            key={lvl}
            points={polygon(data.axes.map(() => lvl))}
            fill="none"
            stroke="var(--grid-line)"
            strokeWidth={1}
          />
        ))}
        {data.axes.map((_, i) => {
          const [x, y] = point(i, maxValue)
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="var(--grid-line)"
              strokeWidth={1}
            />
          )
        })}

        {/* 前月（比較系列） */}
        {hasPrevious && (
          <polygon
            points={polygon(data.previous)}
            fill="var(--series-2)"
            fillOpacity={0.12}
            stroke="var(--series-2)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* 現在 */}
        <polygon
          points={polygon(data.current)}
          fill="var(--series-1)"
          fillOpacity={0.18}
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {data.current.map((v, i) => {
          const [x, y] = point(i, v)
          return <circle key={i} cx={x} cy={y} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        })}

        {/* 軸ラベル + 現在値の直接ラベル */}
        {data.axes.map((axis, i) => {
          const [x, y] = point(i, maxValue * 1.22)
          return (
            <text
              key={axis}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--text-secondary)"
              fontSize={12}
            >
              {axis}
              <tspan x={x} dy={13} fill="var(--text-primary)" fontWeight={700} fontSize={12}>
                {data.current[i]}
              </tspan>
            </text>
          )
        })}
      </svg>

      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--series-1)' }} />
          現在のレベル
        </span>
        {hasPrevious && (
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: 'var(--series-2)' }} />
            前月
          </span>
        )}
      </div>
    </div>
  )
}

export default RadarChart

import { SpaceAnalysis } from '../types'
import ThermalField from './ThermalField'

interface SpaceHeatmapProps {
  space: SpaceAnalysis
  teamAName?: string
  teamBName?: string
}

const TEAM_HEX = ['#1cae77', '#3987e5']

/**
 * スペース分析のサーマル（熱分布）ヒートマップ。
 * control グリッドの絶対値を密度として青→赤の多段グラデ + ガウスぼかしで表現し、
 * 支配チームは薄いチーム色ティントで区別する。
 */
function SpaceHeatmap({ space, teamAName = 'チームA', teamBName = 'チームB' }: SpaceHeatmapProps) {
  const W = 300
  const H = 190
  const m = 4
  const fw = W - m * 2
  const fh = H - m * 2

  const project = (nx: number, ny: number): [number, number] => [m + nx * fw, m + ny * fh]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="スペース支配ヒートマップ" style={{ width: '100%', borderRadius: 10 }}>
        <rect x={0} y={0} width={W} height={H} rx={10} fill="#0d1f16" />

        <ThermalField
          control={space.control}
          gridW={space.grid_w}
          gridH={space.grid_h}
          project={project}
          blur={(fw / space.grid_w) * 0.95}
          teamAColor={TEAM_HEX[0]}
          teamBColor={TEAM_HEX[1]}
          idPrefix="card-thermal"
          threshold={0.1}
        />

        <g stroke="rgba(255,255,255,0.25)" strokeWidth={1} fill="none">
          <rect x={m} y={m} width={fw} height={fh} rx={6} />
          <line x1={W / 2} y1={m} x2={W / 2} y2={H - m} />
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
          <span className="thermal-bar" />
          密度 低→高
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: TEAM_HEX[0] }} />
          {teamAName}
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: TEAM_HEX[1] }} />
          {teamBName}
        </span>
      </div>
    </div>
  )
}

export default SpaceHeatmap

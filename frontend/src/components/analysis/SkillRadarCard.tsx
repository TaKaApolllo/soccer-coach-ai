import { SkillRadar } from '../../types/analysis'
import { Card } from './ui'

interface SkillRadarCardProps {
  radar: SkillRadar
}

const SIZE = 260
const CX = SIZE / 2
const CY = SIZE / 2 + 4
const R = SIZE * 0.32

/**
 * 右サイドバー: スキルレーダー（現在 vs 前月）。軽量 SVG 自作。
 */
function SkillRadarCard({ radar }: SkillRadarCardProps) {
  const n = radar.axes.length
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i: number, v: number): [number, number] => {
    const rr = (R * Math.max(0, Math.min(100, v))) / 100
    return [CX + rr * Math.cos(angle(i)), CY + rr * Math.sin(angle(i))]
  }
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((c) => c.toFixed(1)).join(',')).join(' ')

  return (
    <Card title="スキルレーダー">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label="スキルレーダーチャート">
        {[25, 50, 75, 100].map((lvl) => (
          <polygon key={lvl} points={poly(radar.axes.map(() => lvl))} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
        ))}
        {radar.axes.map((_, i) => {
          const [x, y] = pt(i, 100)
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
        })}

        {/* 前月 */}
        <polygon points={poly(radar.previous)} fill="rgba(120,180,255,0.1)" stroke="rgba(120,180,255,0.6)" strokeWidth="1.6" strokeLinejoin="round" strokeDasharray="4 3" />

        {/* 現在 */}
        <polygon points={poly(radar.current)} fill="rgba(57,255,136,0.16)" stroke="#39ff88" strokeWidth="2" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,136,0.4))' }} />
        {radar.current.map((v, i) => {
          const [x, y] = pt(i, v)
          return <circle key={i} cx={x} cy={y} r="3.2" fill="#39ff88" stroke="#06111f" strokeWidth="1.6" />
        })}

        {/* ラベル */}
        {radar.axes.map((axis, i) => {
          const [x, y] = pt(i, 128)
          return (
            <text key={axis} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="11" fill="rgba(203,213,225,0.8)">
              {axis}
              <tspan x={x} dy="12" fontWeight="700" fontSize="11" fill="#f8fafc">{radar.current[i]}</tspan>
            </text>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-[10px] font-semibold text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#39ff88' }} /> 今月
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'rgba(120,180,255,0.8)' }} /> 前月
        </span>
      </div>
    </Card>
  )
}

export default SkillRadarCard

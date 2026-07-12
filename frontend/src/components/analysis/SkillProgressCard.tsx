import { SkillProgress } from '../../types/analysis'
import { Card } from './ui'

interface SkillProgressCardProps {
  progress: SkillProgress
}

const W = 280
const H = 150
const PAD = { top: 12, right: 12, bottom: 22, left: 26 }

const COLORS = ['#39ff88', '#38bdf8', '#a78bfa']

/**
 * 右サイドバー: スキル推移（直近6ヶ月の折れ線）。軽量 SVG 自作。
 */
function SkillProgressCard({ progress }: SkillProgressCardProps) {
  const names = Object.keys(progress.series)
  const n = progress.months.length
  const xAt = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * i) / Math.max(1, n - 1)
  const yAt = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - 40) / 60)

  const path = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ')

  return (
    <Card title="スキル推移" action={<span className="text-[10px] font-semibold text-slate-500">直近6ヶ月</span>}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="スキル推移チャート">
        {[40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(v)} y2={yAt(v)} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
            <text x={PAD.left - 6} y={yAt(v)} textAnchor="end" dominantBaseline="central" fontSize="8.5" fill="rgba(148,163,184,0.6)">{v}</text>
          </g>
        ))}
        {progress.months.map((m, i) => (
          <text key={m} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize="8.5" fill="rgba(148,163,184,0.6)">{m}</text>
        ))}
        {names.map((name, si) => (
          <g key={name}>
            <path d={path(progress.series[name])} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              style={si === 0 ? { filter: 'drop-shadow(0 0 4px rgba(57,255,136,0.5))' } : undefined} />
            {progress.series[name].map((v, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2.4" fill={COLORS[si % COLORS.length]} stroke="#0b1220" strokeWidth="1.2" />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-3 text-[10px] font-semibold text-slate-400">
        {names.map((name, si) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: COLORS[si % COLORS.length] }} />
            {name}
          </span>
        ))}
      </div>
    </Card>
  )
}

export default SkillProgressCard

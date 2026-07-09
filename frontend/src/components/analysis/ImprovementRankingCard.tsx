import { ImprovementItem } from '../../types/analysis'
import { Card, TONE_COLOR } from './ui'

interface ImprovementRankingCardProps {
  items: ImprovementItem[]
}

const RANK_STYLE = [
  { bg: 'linear-gradient(135deg, rgba(239,68,68,0.16), transparent 70%)', badge: '#ef4444' },
  { bg: 'linear-gradient(135deg, rgba(250,204,21,0.14), transparent 70%)', badge: '#facc15' },
  { bg: 'linear-gradient(135deg, rgba(56,189,248,0.12), transparent 70%)', badge: '#38bdf8' }
]

/**
 * 改善優先度ランキング。各項目に改善効果予測（+n点）を表示する。
 */
function ImprovementRankingCard({ items }: ImprovementRankingCardProps) {
  return (
    <Card title="改善優先度ランキング" action={<span className="text-[10px] font-semibold text-slate-500">効果予測付き</span>}>
      <ol className="m-0 list-none space-y-2 p-0">
        {items.map((item, i) => {
          const style = RANK_STYLE[Math.min(i, RANK_STYLE.length - 1)]
          return (
            <li
              key={item.rank}
              className="flex items-center gap-3 rounded-xl p-2.5"
              style={{ background: style.bg, border: `1px solid ${style.badge}2b` }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                style={{ background: `${style.badge}1f`, color: style.badge, border: `1px solid ${style.badge}55` }}
              >
                {item.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-100">
                  {item.label}
                  <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{item.issue}</span>
                </p>
                <p className="text-[10px] text-slate-400">→ {item.advice}</p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-1 text-[11px] font-black tabular-nums"
                style={{
                  color: TONE_COLOR.good,
                  background: 'rgba(57,255,136,0.1)',
                  border: '1px solid rgba(57,255,136,0.3)'
                }}
                title="改善した場合のスコア上昇予測"
              >
                +{item.delta}点
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

export default ImprovementRankingCard

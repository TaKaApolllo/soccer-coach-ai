import { ImprovementItem } from '../../types/analysis'
import { Card, TONE_COLOR, btnReset } from './ui'

interface ImprovementRankingCardProps {
  items: ImprovementItem[]
  activeJoint?: string | null
  /** 項目クリックで関節強調 + AIコーチへスクロール */
  onSelect?: (joint: string | null) => void
}

const RANK_STYLE = [
  { bg: 'linear-gradient(135deg, rgba(239,68,68,0.16), transparent 70%)', badge: '#ef4444' },
  { bg: 'linear-gradient(135deg, rgba(250,204,21,0.14), transparent 70%)', badge: '#facc15' },
  { bg: 'linear-gradient(135deg, rgba(56,189,248,0.12), transparent 70%)', badge: '#38bdf8' }
]

/**
 * 改善優先度ランキング。各項目に改善効果予測（+n点）を表示する。
 */
function ImprovementRankingCard({ items, activeJoint, onSelect }: ImprovementRankingCardProps) {
  return (
    <Card title="改善優先度ランキング" action={<span className="text-[10px] font-semibold text-slate-500">タップで詳しく</span>}>
      <ol className="m-0 list-none space-y-2 p-0">
        {items.map((item, i) => {
          const style = RANK_STYLE[Math.min(i, RANK_STYLE.length - 1)]
          const isActive = !!item.joint && item.joint === activeJoint
          return (
            <li
              key={item.rank}
              data-testid={`improvement-${item.rank}`}
              onClick={() => onSelect?.(isActive ? null : item.joint ?? null)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left transition-all hover:translate-x-0.5"
              style={{
                ...btnReset,
                background: style.bg,
                border: `1px solid ${isActive ? style.badge : `${style.badge}2b`}`,
                boxShadow: isActive ? `0 0 18px -6px ${style.badge}` : 'none'
              }}
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

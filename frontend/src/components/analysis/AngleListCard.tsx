import { AngleRow } from '../../types/analysis'
import { Card, TONE_COLOR, btnReset } from './ui'

interface AngleListCardProps {
  angles: AngleRow[]
  /** 現在フォーカス中の関節（クロスハイライト） */
  activeJoint?: string | null
  /** 行の hover / click で関節をフォーカス */
  onHoverJoint?: (joint: string | null) => void
  onSelectJoint?: (joint: string | null) => void
}

/**
 * 左サイドバー: 主要角度一覧（各行に現在値と理想値）。
 * 行を hover / click するとビューワー内の該当関節が強調される。
 */
function AngleListCard({ angles, activeJoint, onHoverJoint, onSelectJoint }: AngleListCardProps) {
  return (
    <Card title="主要角度" action={<span className="text-[10px] font-semibold text-slate-500">行をタップで関節が光る</span>}>
      <ul className="m-0 list-none space-y-1.5 p-0" data-testid="angle-list">
        {angles.map((a) => {
          const color = TONE_COLOR[a.status]
          const deviation = Math.abs(a.current - a.ideal)
          const closeness = Math.max(0.08, 1 - deviation / Math.max(30, a.ideal * 0.35))
          const isActive = !!a.joint && a.joint === activeJoint
          return (
            <li key={a.key}>
              <button
                type="button"
                data-testid={`angle-row-${a.key}`}
                data-joint={a.joint ?? ''}
                onMouseEnter={() => a.joint && onHoverJoint?.(a.joint)}
                onMouseLeave={() => onHoverJoint?.(null)}
                onFocus={() => a.joint && onHoverJoint?.(a.joint)}
                onBlur={() => onHoverJoint?.(null)}
                onClick={() => onSelectJoint?.(isActive ? null : a.joint ?? null)}
                className="block w-full rounded-lg px-2 py-1.5 text-left transition-all"
                style={{
                  ...btnReset,
                  background: isActive ? `${color}1f` : 'transparent',
                  boxShadow: isActive ? `inset 0 0 0 1px ${color}66` : 'none'
                }}
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                    {a.label}
                  </span>
                  <span className="whitespace-nowrap font-bold tabular-nums text-slate-100">
                    {a.current}{a.unit}
                    <span className="ml-1 text-[10px] font-semibold text-slate-500">/ 理想 {a.ideal}{a.unit}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.12)' }}>
                  <div
                    className="kpro-grow-bar h-full rounded-full"
                    style={{ width: `${closeness * 100}%`, background: color, opacity: 0.85 }}
                  />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default AngleListCard

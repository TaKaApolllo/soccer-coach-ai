import { ComparisonBaseline, ComparisonItem, Tone } from '../../types/analysis'
import { Card, SegmentedControl, TONE_COLOR } from './ui'

interface IdealComparisonCardProps {
  items: ComparisonItem[]
  baseline: ComparisonBaseline
  onBaselineChange: (b: ComparisonBaseline) => void
  activeJoint?: string | null
  onHoverJoint?: (joint: string | null) => void
  onSelectJoint?: (joint: string | null) => void
}

const BASELINES: { id: ComparisonBaseline; label: string }[] = [
  { id: 'ideal', label: '理想フォーム' },
  { id: 'pro', label: 'プロ平均' },
  { id: 'previous', label: '前回平均' }
]

const BASELINE_NAME: Record<ComparisonBaseline, string> = {
  ideal: '理想',
  pro: 'プロ平均',
  previous: '前回'
}

function baselineValue(item: ComparisonItem, b: ComparisonBaseline): number {
  return b === 'ideal' ? item.ideal : b === 'pro' ? item.pro : item.previous
}

function toneForGap(gap: number): Tone {
  const a = Math.abs(gap)
  if (a <= 8) return 'good'
  if (a <= 20) return 'warn'
  return 'bad'
}

/**
 * 理想フォームとの比較（プロ比較モード付き）。
 * 各項目で基準値と現在値を横棒で比較し、差が小さいほど緑になる。
 * 基準は 理想 / プロ平均 / 前回平均 をセグメント UI で切り替え。
 */
function IdealComparisonCard({ items, baseline, onBaselineChange, activeJoint, onHoverJoint, onSelectJoint }: IdealComparisonCardProps) {
  return (
    <Card
      title="理想フォームとの比較"
      action={<SegmentedControl options={BASELINES} value={baseline} onChange={onBaselineChange} size="sm" />}
    >
      <ul className="m-0 list-none space-y-2 p-0" data-testid="comparison-list">
        {items.map((item) => {
          const base = baselineValue(item, baseline)
          const gap = item.current - base
          const tone = toneForGap(gap)
          const color = TONE_COLOR[tone]
          const isActive = !!item.joint && item.joint === activeJoint
          return (
            <li
              key={item.key}
              data-testid={`comparison-row-${item.key}`}
              onMouseEnter={() => item.joint && onHoverJoint?.(item.joint)}
              onMouseLeave={() => onHoverJoint?.(null)}
              onClick={() => onSelectJoint?.(isActive ? null : item.joint ?? null)}
              className="cursor-pointer rounded-lg px-2 py-1.5 transition-all"
              style={{ background: isActive ? `${color}1a` : 'transparent', boxShadow: isActive ? `inset 0 0 0 1px ${color}55` : 'none' }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="text-slate-300">{item.label}</span>
                <span className="whitespace-nowrap font-bold tabular-nums" style={{ color }}>
                  {gap >= 0 ? '+' : ''}{gap}{item.unit}
                  <span className="ml-1 text-[10px] font-semibold text-slate-500">vs {BASELINE_NAME[baseline]}</span>
                </span>
              </div>
              <div className="space-y-1">
                {/* 基準値バー */}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.1)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${base}%`, background: 'rgba(120,180,255,0.55)' }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-400">
                    {BASELINE_NAME[baseline]} {base}
                  </span>
                </div>
                {/* 現在値バー */}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.1)' }}>
                    <div
                      className="kpro-grow-bar h-full rounded-full"
                      style={{ width: `${item.current}%`, background: color, boxShadow: `0 0 8px ${color}66` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-100">
                    現在 {item.current}
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default IdealComparisonCard

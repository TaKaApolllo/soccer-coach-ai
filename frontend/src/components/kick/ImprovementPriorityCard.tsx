import { Card, Chip } from '../analysis/ui'
import { FeedbackPriority, FeedbackSeverity } from '../../types/kickAnalysis'
import { Tone } from '../../types/analysis'

// =====================================================================
// 改善優先度カード（API 契約 v1.0 の feedback.priorities を直接消費）
// =====================================================================

const SEVERITY_TONE: Record<FeedbackSeverity, Tone> = {
  high: 'bad',
  mid: 'warn',
  low: 'good'
}

const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  high: '最優先',
  mid: '要改善',
  low: '微調整'
}

interface ImprovementPriorityCardProps {
  priorities: FeedbackPriority[]
}

function ImprovementPriorityCard({ priorities }: ImprovementPriorityCardProps) {
  return (
    <Card title="改善の優先順位" glow>
      {priorities.length === 0 ? (
        <p className="m-0 text-xs leading-relaxed text-slate-400">
          大きな課題は検出されませんでした。動作スピードを上げても同じフォームを保てるか試しましょう。
        </p>
      ) : (
        <ol className="m-0 list-none space-y-2 p-0">
          {priorities.map((p) => (
            <li
              key={p.rank}
              className="rounded-xl p-2.5"
              style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(2,6,17,0.4)' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                  style={{ background: 'rgba(57,255,136,0.14)', color: '#39ff88' }}
                  aria-label={`優先度 ${p.rank} 位`}
                >
                  {p.rank}
                </span>
                <p className="m-0 min-w-0 flex-1 truncate text-xs font-bold text-slate-100">{p.label}</p>
                <Chip tone={SEVERITY_TONE[p.severity]}>{SEVERITY_LABEL[p.severity]}</Chip>
              </div>
              <p className="m-0 mt-1 pl-8 text-[11px] leading-relaxed text-slate-400">{p.issue}</p>
              <p className="m-0 mt-0.5 pl-8 text-[11px] font-semibold leading-relaxed" style={{ color: '#39ff88' }}>
                → {p.advice}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

export default ImprovementPriorityCard

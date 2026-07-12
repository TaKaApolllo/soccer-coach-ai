import { CoachComment } from '../../types/analysis'
import { Card } from './ui'

interface AICoachCommentCardProps {
  coach: CoachComment
}

const SECTIONS: { key: keyof CoachComment; label: string; color: string; icon: string }[] = [
  { key: 'good', label: '良い点', color: '#39ff88', icon: '◎' },
  { key: 'improvement', label: '改善点', color: '#facc15', icon: '△' },
  { key: 'next', label: '次回の意識ポイント', color: '#38bdf8', icon: '➤' }
]

/**
 * AI コーチコメントカード。良い点 / 改善点 / 次回の意識ポイントを自然文で表示。
 */
function AICoachCommentCard({ coach }: AICoachCommentCardProps) {
  return (
    <Card
      glow
      title="AIコーチのコメント"
      action={
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: 'rgba(57,255,136,0.12)', color: '#39ff88', border: '1px solid rgba(57,255,136,0.3)' }}
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#39ff88' }} />
          AI COACH
        </span>
      }
    >
      <div className="space-y-2.5">
        {SECTIONS.map((s) => (
          <div
            key={s.key}
            className="rounded-xl p-3"
            style={{
              border: `1px solid ${s.color}26`,
              background: `linear-gradient(135deg, ${s.color}0c, transparent 60%)`
            }}
          >
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: s.color }}>
              <span aria-hidden>{s.icon}</span>
              {s.label}
            </p>
            <p className="text-xs leading-relaxed text-slate-200">{coach[s.key]}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default AICoachCommentCard

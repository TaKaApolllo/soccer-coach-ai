import { TrainingRec } from '../../types/analysis'
import { Card, Chip, TONE_COLOR } from './ui'

interface TrainingRecommendationCardProps {
  recs: TrainingRec[]
}

/**
 * 右サイドバー: 今日のおすすめ練習
 */
function TrainingRecommendationCard({ recs }: TrainingRecommendationCardProps) {
  return (
    <Card title="今日のおすすめ練習" glow>
      <ul className="m-0 list-none space-y-2 p-0">
        {recs.map((r, i) => (
          <li
            key={r.id}
            className="rounded-xl p-2.5 transition-transform hover:translate-x-0.5"
            style={{
              border: `1px solid ${TONE_COLOR[r.tone]}30`,
              background: `linear-gradient(90deg, ${TONE_COLOR[r.tone]}0e, transparent 70%)`
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                style={{ background: `${TONE_COLOR[r.tone]}1f`, color: TONE_COLOR[r.tone] }}
              >
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-100">{r.title}</p>
              <Chip tone={r.tone}>{r.tag}</Chip>
            </div>
            <div className="mt-1 flex items-center justify-between pl-8 text-[10px] text-slate-400">
              <span>{r.focus}</span>
              <span className="font-semibold text-slate-300">{r.duration}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default TrainingRecommendationCard

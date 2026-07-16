import { Card, TONE_COLOR } from '../analysis/ui'
import { Tone } from '../../types/analysis'
import { KickScores } from '../../types/kickAnalysis'
import { BodyPartScores } from '../../types'

// =====================================================================
// 部位別スコア（旧 FormAnalysisPage から移植・schema 駆動で再実装）
// スコアが null の部位は「計測不可」と表示し、0 点として扱わない。
// =====================================================================

interface PartDef {
  key: keyof Omit<KickScores, 'overall'>
  label: string
  icon: string
  /** 現行 API の body_part_scores のキー（コメント参照用） */
  sourceKey: keyof BodyPartScores | null
}

const PARTS: PartDef[] = [
  { key: 'supportLeg', label: '軸足', icon: '🦵', sourceKey: 'plant_leg' },
  { key: 'kickingLeg', label: '蹴り足', icon: '🎯', sourceKey: 'kicking_leg' },
  { key: 'upperBody', label: '上半身', icon: '🧍', sourceKey: 'upper_body' },
  { key: 'balance', label: 'バランス', icon: '⚖️', sourceKey: 'balance' },
  { key: 'followThrough', label: 'フォロースルー', icon: '💨', sourceKey: null }
]

function toneForScore(score: number | null): Tone {
  if (score === null) return 'neutral'
  if (score >= 75) return 'good'
  if (score >= 50) return 'warn'
  return 'bad'
}

const TONE_TEXT: Record<Tone, string> = {
  good: '良好',
  warn: '要改善',
  bad: '重点課題',
  neutral: '計測不可'
}

interface BodyPartScoreCardsProps {
  scores: KickScores
  /** 現行 API の部位コメント（あれば表示） */
  partComments: BodyPartScores | null
}

/** 部位別スコアのカード列 */
function BodyPartScoreCards({ scores, partComments }: BodyPartScoreCardsProps) {
  return (
    <Card title="部位別スコア">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {PARTS.map((p) => {
          const score = scores[p.key]
          const tone = toneForScore(score)
          const comment = p.sourceKey ? partComments?.[p.sourceKey]?.comments?.[0] : undefined
          return (
            <div
              key={p.key}
              className="rounded-xl p-3"
              style={{
                border: `1px solid ${TONE_COLOR[tone]}30`,
                background: `linear-gradient(180deg, ${TONE_COLOR[tone]}0d, transparent 65%)`
              }}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                <span aria-hidden>{p.icon}</span>
                <span className="truncate">{p.label}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span
                  className="text-2xl font-black tabular-nums"
                  style={{ color: TONE_COLOR[tone] }}
                >
                  {score ?? '--'}
                </span>
                {score !== null && <span className="text-[10px] font-bold text-slate-500">/100</span>}
              </div>
              <div className="mt-0.5 text-[10px] font-bold" style={{ color: TONE_COLOR[tone] }}>
                {TONE_TEXT[tone]}
              </div>
              {comment && (
                <p className="m-0 mt-1.5 line-clamp-3 text-[10px] leading-relaxed text-slate-400">
                  {comment}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export default BodyPartScoreCards

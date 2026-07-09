import { BodyPartScore, BodyPartScores, ImprovementRanking, ImprovementSeverity } from '../../types'
import { STATUS_COLOR } from './GaugeRing'

const SEVERITY_COLOR: Record<ImprovementSeverity, string> = {
  high: STATUS_COLOR.bad,
  mid: STATUS_COLOR.warn,
  low: STATUS_COLOR.good
}

const SEVERITY_LABEL: Record<ImprovementSeverity, string> = {
  high: '優先度: 高',
  mid: '優先度: 中',
  low: '優先度: 低'
}

interface AdvicePanelProps {
  bodyPartScores: BodyPartScores
  rankings: ImprovementRanking[]
}

/**
 * 改善ポイントのランキング + 部位別コメント一覧。
 * 良い点は緑チェック、改善点は警告アイコンで色分けして表示する。
 */
function AdvicePanel({ bodyPartScores, rankings }: AdvicePanelProps) {
  const parts = (Object.values(bodyPartScores) as (BodyPartScore | undefined)[])
    .filter((p): p is BodyPartScore => !!p)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 改善ポイントランキング */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span aria-hidden>🏆</span> 改善ポイント ランキング
        </h3>
        <ol className="flex flex-col gap-3">
          {rankings.map((r) => {
            const color = SEVERITY_COLOR[r.severity]
            return (
              <li
                key={r.rank}
                className="rounded-2xl border border-white/10 bg-black/25 p-4 flex items-start gap-4"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-black"
                  style={{ backgroundColor: color }}
                >
                  {r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-white">{r.label}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color, backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
                    >
                      {SEVERITY_LABEL[r.severity]}
                    </span>
                    <span className="text-[11px] text-white/50">差分 {r.delta_deg}°</span>
                  </div>
                  <p className="text-sm text-white/70">
                    <span className="text-white/90">{r.issue}</span> ── {r.advice}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* 部位別コメント */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span aria-hidden>📝</span> 部位別アドバイス
        </h3>
        <ul className="flex flex-col gap-3">
          {parts.map((part) => {
            const isGood = part.status === 'good'
            const color = STATUS_COLOR[part.status]
            return (
              <li key={part.label} className="rounded-2xl border border-white/10 bg-black/25 p-4 flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
                  style={{ backgroundColor: `${color}22`, border: `1px solid ${color}55`, color }}
                  aria-hidden
                >
                  {isGood ? '✓' : '!'}
                </span>
                <div className="flex-1">
                  <div className="font-semibold text-white text-sm mb-0.5">{part.label}</div>
                  {part.comments.map((c, i) => (
                    <p key={i} className="text-sm text-white/70 leading-relaxed">
                      {c}
                    </p>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default AdvicePanel

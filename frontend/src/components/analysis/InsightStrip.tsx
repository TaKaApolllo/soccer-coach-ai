import { InsightSummary, InsightTarget } from '../../types/analysis'
import { btnReset, cardStyle } from './ui'

interface InsightStripProps {
  insights: InsightSummary
  onJump: (target: InsightTarget, joint?: string) => void
}

/** 小型スコアリング（総合スコアを円環で表現） */
function ScoreRing({ score, max }: { score: number; max: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, score / max))
  const color = pct >= 0.8 ? '#39ff88' : pct >= 0.6 ? '#facc15' : '#ef4444'
  return (
    <div className="relative shrink-0" style={{ width: 54, height: 54 }}>
      <svg width="54" height="54" viewBox="0 0 54 54">
        <circle cx="27" cy="27" r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="5" />
        <circle
          cx="27" cy="27" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 27 27)"
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black leading-none tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[7px] font-bold text-slate-500">SCORE</span>
      </div>
    </div>
  )
}

interface ChipDef {
  target: InsightTarget
  joint?: string
  icon: string
  kicker: string
  label: string
  color: string
  bg: string
}

/**
 * ヘッダー直下のインサイトサマリー。総合スコアリング + 3 チップ
 * （最も良い点 / 最優先の改善 / 次にやること）。各チップは該当カードへ
 * スムーズスクロール & 一瞬ハイライトするジャンプリンク。
 */
function InsightStrip({ insights, onJump }: InsightStripProps) {
  const chips: ChipDef[] = [
    { target: 'coach', joint: insights.best.joint, icon: '✅', kicker: '最も良い点', label: insights.best.label, color: '#39ff88', bg: 'rgba(57,255,136,0.10)' },
    { target: 'improvements', joint: insights.priority.joint, icon: '⚠️', kicker: '最優先の改善', label: insights.priority.label, color: '#facc15', bg: 'rgba(250,204,21,0.10)' },
    { target: 'recommendations', joint: insights.next.joint, icon: '🎯', kicker: '次にやること', label: insights.next.label, color: '#38bdf8', bg: 'rgba(56,189,248,0.10)' }
  ]

  return (
    <div
      className="mb-4 flex items-center gap-3 overflow-x-auto rounded-2xl px-3 py-2.5"
      style={{ ...cardStyle }}
      data-testid="insight-strip"
    >
      <ScoreRing score={insights.score} max={insights.max} />
      <div className="flex min-w-0 flex-1 items-stretch gap-2">
        {chips.map((c) => (
          <button
            key={c.target}
            type="button"
            data-testid={`insight-chip-${c.target}`}
            onClick={() => onJump(c.target, c.joint)}
            className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all hover:-translate-y-0.5"
            style={{ ...btnReset, background: c.bg, border: `1px solid ${c.color}33` }}
          >
            <span className="text-base leading-none" aria-hidden>{c.icon}</span>
            <span className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-wider" style={{ color: c.color }}>{c.kicker}</span>
              <span className="block truncate text-[13px] font-bold text-slate-100">{c.label}</span>
            </span>
            <svg className="ml-auto shrink-0 opacity-40 transition-opacity group-hover:opacity-90" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 8h8M8 4l4 4-4 4" stroke={c.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

export default InsightStrip

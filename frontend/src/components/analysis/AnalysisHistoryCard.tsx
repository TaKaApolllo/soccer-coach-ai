import { HistoryEntry, Tone } from '../../types/analysis'
import { Card, TONE_COLOR } from './ui'

interface AnalysisHistoryCardProps {
  history: HistoryEntry[]
}

function scoreTone(score: number): Tone {
  if (score >= 80) return 'good'
  if (score >= 65) return 'warn'
  return 'bad'
}

/** サムネイル画像が無い場合のミニプレースホルダ */
function MiniThumb({ seed }: { seed: number }) {
  return (
    <svg viewBox="0 0 48 32" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <rect width="48" height="32" fill="#06111f" />
      <rect y="20" width="48" height="12" fill="#0a2416" />
      <line x1="0" y1="20" x2="48" y2="20" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6" />
      <g stroke="rgba(57,255,136,0.7)" strokeWidth="1.1" strokeLinecap="round" fill="none" transform={`translate(${16 + (seed % 3) * 5}, 7)`}>
        <circle cx="4" cy="1.5" r="1.8" fill="rgba(57,255,136,0.7)" stroke="none" />
        <path d="M4 3.5v6M4 6l-3.4 2M4 6l4 .8M4 9.5l-2.6 6M4 9.5l4.6 3.4" />
      </g>
    </svg>
  )
}

/**
 * 右サイドバー: 解析履歴（日付・スコア・サムネイル）
 */
function AnalysisHistoryCard({ history }: AnalysisHistoryCardProps) {
  return (
    <Card title="解析履歴">
      <ul className="m-0 list-none space-y-2 p-0">
        {history.map((h, i) => {
          const tone = scoreTone(h.score)
          return (
            <li
              key={h.id}
              className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-white/5"
              style={{ border: '1px solid rgba(148,163,184,0.1)' }}
            >
              <div className="h-8 w-12 shrink-0 overflow-hidden rounded-md" style={{ border: '1px solid rgba(148,163,184,0.14)' }}>
                {h.thumbSrc ? <img src={h.thumbSrc} alt="" className="h-full w-full object-cover" /> : <MiniThumb seed={i} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-200">{h.date}</p>
                <p className="text-[10px] text-slate-500">キックフォーム解析</p>
              </div>
              <span
                className="shrink-0 rounded-lg px-2 py-0.5 text-sm font-black tabular-nums"
                style={{ color: TONE_COLOR[tone], background: `${TONE_COLOR[tone]}14` }}
              >
                {h.score}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default AnalysisHistoryCard

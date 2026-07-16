import { Link } from 'react-router-dom'
import { Card, btnReset } from '../analysis/ui'
import { KickHistoryEntry } from '../../types/kickAnalysis'

interface AnalysisHistoryPanelProps {
  entries: KickHistoryEntry[]
  activeId: string | null
  onSelect: (analysisId: string) => void
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '-'
    : d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * 解析履歴パネル。クリックで過去の解析を読み込む。
 */
function AnalysisHistoryPanel({ entries, activeId, onSelect }: AnalysisHistoryPanelProps) {
  return (
    <Card
      title="解析履歴"
      action={
        <Link
          to="/growth"
          className="text-[11px] font-semibold no-underline hover:underline"
          style={{ color: '#39ff88' }}
        >
          すべて見る ›
        </Link>
      }
    >
      {entries.length === 0 ? (
        <p className="m-0 text-xs text-slate-400">まだ履歴がありません</p>
      ) : (
        <ul className="m-0 list-none space-y-1.5 p-0">
          {entries.map((e) => {
            const active = e.analysisId === activeId
            return (
              <li key={e.analysisId}>
                <button
                  type="button"
                  onClick={() => onSelect(e.analysisId)}
                  aria-pressed={active}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
                  style={{
                    ...btnReset,
                    border: `1px solid ${active ? 'rgba(57,255,136,0.5)' : 'transparent'}`
                  }}
                >
                  <span
                    className="h-8 w-12 shrink-0 overflow-hidden rounded-md"
                    style={{ background: '#06111f', border: '1px solid rgba(148,163,184,0.14)' }}
                  >
                    {e.thumbnailUrl && (
                      <img src={e.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-100">キックフォーム分析</span>
                    <span className="block text-[10px] text-slate-500">{formatDateTime(e.createdAt)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums" style={{ color: '#39ff88' }}>
                    {e.overallScore ?? '--'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export default AnalysisHistoryPanel

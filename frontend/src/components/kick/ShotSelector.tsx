import { Card, btnReset } from '../analysis/ui'
import { KickHistoryEntry } from '../../types/kickAnalysis'

interface ShotSelectorProps {
  entries: KickHistoryEntry[]
  activeId: string | null
  onSelect: (analysisId: string) => void
  loadingId: string | null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '-'
    : d.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
}

/**
 * 分析対象ショットの切り替え（履歴サムネイル一覧）。
 * サムネイルは軽量エンドポイント /api/history/{id}/thumbnail を参照する。
 */
function ShotSelector({ entries, activeId, onSelect, loadingId }: ShotSelectorProps) {
  return (
    <Card title="分析中のショット">
      {entries.length === 0 ? (
        <p className="m-0 text-xs leading-relaxed text-slate-400">
          まだ解析履歴がありません。動画をアップロードするとここに並びます。
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 wide:grid-cols-1">
          {entries.map((e) => {
            const active = e.analysisId === activeId
            const loading = e.analysisId === loadingId
            return (
              <li key={e.analysisId}>
                <button
                  type="button"
                  onClick={() => onSelect(e.analysisId)}
                  aria-pressed={active}
                  aria-label={`${formatDate(e.createdAt)} のショットを読み込む`}
                  className="block w-full overflow-hidden rounded-xl text-left transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
                  style={{
                    ...btnReset,
                    border: `1px solid ${active ? 'rgba(57,255,136,0.6)' : 'rgba(148,163,184,0.18)'}`,
                    boxShadow: active ? '0 0 14px -4px rgba(57,255,136,0.5)' : 'none'
                  }}
                >
                  <div className="relative aspect-video w-full" style={{ background: '#06111f' }}>
                    {e.thumbnailUrl ? (
                      <img
                        src={e.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-lg" aria-hidden>⚽</div>
                    )}
                    {loading && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(2,6,17,0.6)' }}>
                        <span
                          className="h-5 w-5 animate-spin rounded-full"
                          style={{ border: '2px solid rgba(57,255,136,0.3)', borderTopColor: '#39ff88' }}
                          aria-label="読み込み中"
                        />
                      </div>
                    )}
                    {active && (
                      <span
                        className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{ background: 'rgba(57,255,136,0.9)', color: '#02120a' }}
                      >
                        表示中
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 text-[10px]">
                    <span className="font-semibold text-slate-300">{formatDate(e.createdAt)}</span>
                    <span className="font-black tabular-nums" style={{ color: '#39ff88' }}>
                      {e.overallScore ?? '--'}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export default ShotSelector

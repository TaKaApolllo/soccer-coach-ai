import { SessionInfo } from '../../types/analysis'
import { Card } from './ui'

interface SessionInfoCardProps {
  session: SessionInfo
}

/**
 * 左サイドバー: セッション情報（種別 / フェーズ / 時間 / 信頼度）
 */
function SessionInfoCard({ session }: SessionInfoCardProps) {
  const rows: { label: string; value: string }[] = [
    { label: 'フォーメーション', value: session.formation },
    { label: 'フェーズ', value: session.phase },
    { label: '時間', value: session.time }
  ]

  return (
    <Card title="セッション情報">
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 text-xs">
            <dt className="shrink-0 whitespace-nowrap text-slate-400">{r.label}</dt>
            <dd className="text-right font-bold text-slate-100">{r.value}</dd>
          </div>
        ))}
        <div className="pt-1">
          <div className="mb-1 flex items-center justify-between text-xs">
            <dt className="text-slate-400">信頼度</dt>
            <dd className="font-bold" style={{ color: '#39ff88' }}>{session.confidence}%</dd>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.14)' }}>
            <div
              className="kpro-grow-bar h-full rounded-full"
              style={{
                width: `${session.confidence}%`,
                background: 'linear-gradient(90deg, #22c55e, #39ff88)',
                boxShadow: '0 0 8px rgba(57,255,136,0.5)'
              }}
            />
          </div>
        </div>
      </dl>
    </Card>
  )
}

export default SessionInfoCard

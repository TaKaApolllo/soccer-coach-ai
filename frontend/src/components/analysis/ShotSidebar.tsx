import { useState } from 'react'
import { ShotInfo } from '../../types/analysis'
import { Card, btnReset } from './ui'

interface ShotSidebarProps {
  shot: ShotInfo
  currentTime: number
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

/** サムネイル用のミニスタジアム SVG（画像が無い場合のプレースホルダ） */
function ThumbArt({ seed, active }: { seed: number; active?: boolean }) {
  const hue = 150 + seed * 14
  return (
    <svg viewBox="0 0 80 48" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <rect width="80" height="48" fill="#06111f" />
      <rect y="28" width="80" height="20" fill={`hsl(${hue}, 45%, 12%)`} />
      <circle cx={18 + seed * 12} cy="10" r="7" fill="rgba(160,220,255,0.14)" />
      <line x1="0" y1="28" x2="80" y2="28" stroke="rgba(255,255,255,0.16)" strokeWidth="0.8" />
      {/* 選手シルエット */}
      <g stroke={active ? '#39ff88' : 'rgba(180,220,200,0.55)'} strokeWidth="1.6" strokeLinecap="round" fill="none"
        transform={`translate(${30 + seed * 6}, 12)`}>
        <circle cx="6" cy="2" r="2.6" fill={active ? '#39ff88' : 'rgba(180,220,200,0.55)'} stroke="none" />
        <path d="M6 5v9M6 9l-5 3M6 9l6 1M6 14l-4 9M6 14l7 5" />
      </g>
      <circle cx={52 + seed * 4} cy="34" r="2.4" fill="rgba(255,255,255,0.75)" />
    </svg>
  )
}

/**
 * 左サイドバー: 分析中のショット（メインサムネイル + 小サムネイル3つ + 再生時間）
 */
function ShotSidebar({ shot, currentTime }: ShotSidebarProps) {
  const [selected, setSelected] = useState(0)

  return (
    <Card title="分析中のショット" glow>
      <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9', border: '1px solid rgba(148,163,184,0.14)' }}>
        {shot.mainSrc ? (
          <img src={shot.mainSrc} alt="ショットのメインサムネイル" className="h-full w-full object-cover" />
        ) : (
          <ThumbArt seed={selected} active />
        )}
        <span
          className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white"
          style={{ background: 'rgba(2,6,17,0.78)', border: '1px solid rgba(148,163,184,0.2)' }}
        >
          {formatClock(currentTime)} / {formatClock(shot.duration)}
        </span>
        <span
          className="absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: 'rgba(57,255,136,0.16)', color: '#39ff88', border: '1px solid rgba(57,255,136,0.35)' }}
        >
          ● REC解析済み
        </span>
      </div>

      <p className="mt-2 text-xs font-semibold text-slate-200">{shot.title}</p>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {shot.thumbs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelected(i)}
            aria-label={`サムネイル ${t.time}`}
            className="relative overflow-hidden rounded-lg p-0 transition-transform hover:scale-[1.04]"
            style={{
              ...btnReset,
              aspectRatio: '16 / 10',
              border: selected === i ? '1px solid rgba(57,255,136,0.7)' : '1px solid rgba(148,163,184,0.16)',
              boxShadow: selected === i ? '0 0 12px rgba(57,255,136,0.25)' : 'none'
            }}
          >
            {t.src ? (
              <img src={t.src} alt="" className="h-full w-full object-cover" />
            ) : (
              <ThumbArt seed={i + 1} active={selected === i} />
            )}
            <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-white/80">{t.time}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

export default ShotSidebar

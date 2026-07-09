import { CSSProperties, ReactNode } from 'react'
import { Tone } from '../../types/analysis'

/**
 * Pro 画面共通のガラスカード。preflight を切っているため border-style は
 * インラインで明示する（Tailwind の border 幅だけでは描画されないため）。
 */
export const CARD_BORDER = '1px solid rgba(148, 163, 184, 0.18)'

export const cardStyle: CSSProperties = {
  border: CARD_BORDER,
  background: 'rgba(15, 23, 42, 0.72)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  boxShadow: '0 18px 40px -24px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.03)'
}

export const TONE_COLOR: Record<Tone, string> = {
  good: '#39ff88',
  warn: '#facc15',
  bad: '#ef4444',
  neutral: '#94a3b8'
}

export const TONE_SOFT: Record<Tone, string> = {
  good: 'rgba(57, 255, 136, 0.14)',
  warn: 'rgba(250, 204, 21, 0.14)',
  bad: 'rgba(239, 68, 68, 0.14)',
  neutral: 'rgba(148, 163, 184, 0.14)'
}

interface CardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  title?: string
  action?: ReactNode
  glow?: boolean
}

export function Card({ children, className = '', style, title, action, glow }: CardProps) {
  return (
    <section
      className={`rounded-2xl p-4 ${className}`}
      style={{
        ...cardStyle,
        ...(glow ? { boxShadow: `${cardStyle.boxShadow}, 0 0 24px -6px rgba(57,255,136,0.16)` } : {}),
        ...style
      }}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-[13px] font-bold tracking-wide text-slate-100">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: TONE_SOFT[tone], color: TONE_COLOR[tone], border: `1px solid ${TONE_COLOR[tone]}33` }}
    >
      {children}
    </span>
  )
}

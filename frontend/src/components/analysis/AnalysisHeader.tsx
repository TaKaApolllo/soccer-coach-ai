import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SegmentedControl, btnReset, cardStyle } from './ui'

export type ProTab = 'form' | 'angle' | 'skeleton' | 'compare' | '3d'

const TABS: { id: ProTab; label: string }[] = [
  { id: 'form', label: 'フォーム' },
  { id: 'angle', label: '角度' },
  { id: 'skeleton', label: '骨格' },
  { id: 'compare', label: '比較' },
  { id: '3d', label: '3Dビュー' }
]

interface AnalysisHeaderProps {
  tab: ProTab
  onTabChange: (t: ProTab) => void
}

/**
 * 画面上部のヘッダー: 戻る / タイトル / ビュータブ / 3Dビュー・メニュー
 */
function AnalysisHeader({ tab, onTabChange }: AnalysisHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div
      className="sticky top-0 z-30 -mx-1 mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
      style={{ ...cardStyle, background: 'rgba(2, 6, 17, 0.82)' }}
    >
      <Link
        to="/kick"
        aria-label="キック分析に戻る"
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-white"
        style={{ border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(15,23,42,0.6)', textDecoration: 'none' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      <div className="mr-2 min-w-0">
        <h2 className="truncate text-base font-extrabold tracking-wide text-white">
          キックフォーム分析
          <span className="ml-2 align-middle text-[10px] font-bold tracking-[0.2em]" style={{ color: '#39ff88' }}>PRO</span>
        </h2>
        <p className="text-[11px] text-slate-400">Kick Form Analysis Pro</p>
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <SegmentedControl options={TABS} value={tab} onChange={onTabChange} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => onTabChange('3d')}
          className="hidden items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all sm:flex"
          style={{
            ...btnReset,
            border: '1px solid rgba(57,255,136,0.4)',
            background: tab === '3d' ? 'rgba(34,197,94,0.9)' : 'rgba(34,197,94,0.12)',
            color: tab === '3d' ? '#02120a' : '#39ff88'
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 1.5 14 5v6l-6 3.5L2 11V5l6-3.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M8 8 14 5M8 8v6.5M8 8 2 5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          3Dビュー
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="メニュー"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-white"
            style={{ ...btnReset, border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(15,23,42,0.6)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <circle cx="3" cy="8" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="13" cy="8" r="1.4" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-xl py-1 text-xs"
              style={{ ...cardStyle, background: 'rgba(8, 15, 30, 0.96)' }}
            >
              {['レポートを書き出す', '動画を共有', 'コーチに送信', '解析をやり直す'].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-3.5 py-2 text-left text-slate-300 transition-colors hover:text-white"
                  style={{ ...btnReset, borderRadius: 0 }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnalysisHeader

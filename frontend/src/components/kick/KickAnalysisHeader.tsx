import { Link } from 'react-router-dom'
import { SegmentedControl, cardStyle } from '../analysis/ui'
import { VIEW_TABS, ViewTab } from '../../pages/kick/viewModel'

interface KickAnalysisHeaderProps {
  tab: ViewTab
  onTabChange: (t: ViewTab) => void
}

/**
 * /analysis/kick の画面ヘッダー: 戻る / タイトル / ビュータブ。
 */
function KickAnalysisHeader({ tab, onTabChange }: KickAnalysisHeaderProps) {
  return (
    <div
      className="sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
      style={{ ...cardStyle, background: 'rgba(2, 6, 17, 0.82)' }}
    >
      <Link
        to="/analysis"
        aria-label="分析ダッシュボードへ戻る"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
        style={{ border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(15,23,42,0.6)', textDecoration: 'none' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      <div className="mr-2 min-w-0">
        <h2 className="truncate text-base font-extrabold tracking-wide text-white">
          キックフォーム分析
        </h2>
        <p className="m-0 text-[11px] text-slate-400">Kick Form Analysis</p>
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <SegmentedControl options={VIEW_TABS} value={tab} onChange={onTabChange} />
      </div>
    </div>
  )
}

export default KickAnalysisHeader

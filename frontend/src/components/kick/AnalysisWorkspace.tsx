import { ReactNode } from 'react'

interface AnalysisWorkspaceProps {
  /** 左: ショット選択（1440px 以上でサイドバー、それ未満は折りたたみ） */
  shotSelector: ReactNode
  /** 中央: メインビューワー */
  main: ReactNode
  /** 右: 解析サマリー */
  summary: ReactNode
}

/**
 * 解析ワークスペースのレイアウト。
 * - 1440px 以上: 3カラム（ショット / ビューワー / サマリー）
 * - 1024–1439px: 中央 + 右（左は折りたたみ <details>）
 * - 768–1023px: ビューワー最上部 + サマリーカード2列
 * - 767px 以下: 1カラム
 * 横スクロールを発生させない（min-w-0 を必ず入れる）。
 */
function AnalysisWorkspace({ shotSelector, main, summary }: AnalysisWorkspaceProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] wide:grid-cols-[240px_minmax(0,1fr)_320px]">
      {/* 左サイドバー（1440px 以上のみ） */}
      <aside className="hidden min-w-0 wide:block" aria-label="ショット選択">
        {shotSelector}
      </aside>

      {/* 中央 */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* 1440px 未満: ショット選択は折りたたみ */}
        <details className="group rounded-2xl wide:hidden" style={{ border: '1px solid rgba(148,163,184,0.14)' }}>
          <summary
            className="cursor-pointer select-none rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
            style={{ background: 'rgba(15,23,42,0.6)' }}
          >
            📼 ショットを切り替える
            <span aria-hidden className="float-right transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="p-2">{shotSelector}</div>
        </details>
        {main}
      </div>

      {/* 右サマリー: 768-1023px ではカード2列、1024px 以上で1列サイドバー */}
      <aside className="min-w-0" aria-label="解析サマリー">
        {summary}
      </aside>
    </div>
  )
}

export default AnalysisWorkspace

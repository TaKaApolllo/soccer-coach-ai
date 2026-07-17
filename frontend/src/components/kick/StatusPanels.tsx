import { ReactNode } from 'react'
import { btnReset } from '../analysis/ui'

/**
 * 状態表示パネル群。
 * すべてのエラー/警告は「次に何をすべきか」を必ず提示する。
 * 色だけに依存せず、アイコン + 文言で状態を伝える。
 */

interface BannerShellProps {
  tone: 'warn' | 'error'
  icon: string
  title: string
  children: ReactNode
  testId: string
  action?: ReactNode
}

function BannerShell({ tone, icon, title, children, testId, action }: BannerShellProps) {
  const color = tone === 'warn' ? '#facc15' : '#ef4444'
  return (
    <div
      role="alert"
      data-testid={testId}
      className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3"
      style={{
        background: tone === 'warn' ? 'rgba(250,204,21,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${color}55`
      }}
    >
      <span aria-hidden className="text-lg leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-bold" style={{ color }}>{title}</p>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-300">{children}</div>
      </div>
      {action}
    </div>
  )
}

/** 再撮影ガイダンスの箇条書き（撮影品質評価 #22 由来） */
function RetakeList({ instructions }: { instructions: string[] }) {
  if (instructions.length === 0) return null
  return (
    <div data-testid="retake-instructions" className="mt-1">
      <p className="m-0 font-semibold text-slate-200">📷 再撮影のポイント:</p>
      <ul className="m-0 list-none space-y-0.5 p-0">
        {instructions.map((inst, i) => (
          <li key={i} className="pl-4 text-slate-200" style={{ textIndent: '-0.9em' }}>
            ・{inst}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface LowConfidenceBannerProps {
  warnings: string[]
  detectionScore: number | null
  /** 撮影品質評価による具体的な再撮影ガイダンス */
  instructions: string[]
}

/** 信頼度不足（low_confidence）: 結果は表示しつつ、警告と改善方法を示す */
export function LowConfidenceBanner({ warnings, detectionScore, instructions }: LowConfidenceBannerProps) {
  return (
    <BannerShell tone="warn" icon="⚠️" title="解析の信頼度が低い結果です" testId="low-confidence-banner">
      {detectionScore !== null && detectionScore < 50 && (
        <p className="m-0">骨格検出率: {detectionScore}%（数値は参考値としてご覧ください）</p>
      )}
      {warnings.map((w, i) => (
        <p key={i} className="m-0">{w}</p>
      ))}
      {instructions.length > 0 ? (
        <RetakeList instructions={instructions} />
      ) : (
        <p className="m-0 font-semibold text-slate-200">
          次にやること: 明るい場所で、横から全身（頭からつま先まで）が写るように撮影して再解析してください。
        </p>
      )}
    </BannerShell>
  )
}

interface FailedPanelProps {
  message: string
  hint: string
  onRetry: () => void
  /** 撮影品質評価による具体的な再撮影ガイダンス */
  instructions?: string[]
}

/** 解析失敗（failed）: エラー内容 + 再試行 + 次の行動 */
export function FailedPanel({ message, hint, onRetry, instructions = [] }: FailedPanelProps) {
  return (
    <BannerShell
      tone="error"
      icon="⛔"
      title="解析に失敗しました"
      testId="failed-panel"
      action={
        <button
          type="button"
          data-testid="retry-button"
          onClick={onRetry}
          className="shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kick-accent"
          style={{ ...btnReset, background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5' }}
        >
          ↻ 再試行する
        </button>
      }
    >
      <p className="m-0">{message}</p>
      {instructions.length > 0 ? (
        <RetakeList instructions={instructions} />
      ) : (
        <p className="m-0 font-semibold text-slate-200">次にやること: {hint}</p>
      )}
    </BannerShell>
  )
}

/** サンプルデータ表示の注記（idle 状態） */
export function SampleNotice() {
  return (
    <BannerShell tone="warn" icon="✨" title="サンプルデータを表示しています" testId="sample-notice">
      <p className="m-0">
        まだ解析結果がありません。中央のパネルにキック動画（横から全身が写るもの）をドロップすると、
        あなたのフォームで全カードが更新されます。
      </p>
    </BannerShell>
  )
}

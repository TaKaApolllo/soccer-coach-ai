export type ToastTone = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

const TONE: Record<ToastTone, { color: string; bg: string; icon: string }> = {
  success: { color: '#39ff88', bg: 'rgba(57,255,136,0.12)', icon: '✓' },
  error: { color: '#f87171', bg: 'rgba(239,68,68,0.14)', icon: '⚠' },
  info: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', icon: 'ℹ' }
}

/** 右下トースト表示。解析完了 / エラー / コピー完了などに使用。 */
function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2" data-testid="toast-stack">
      {toasts.map((t) => {
        const tone = TONE[t.tone]
        return (
          <div
            key={t.id}
            className="kpro-toast pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold shadow-lg"
            style={{ background: 'rgba(9,14,26,0.96)', border: `1px solid ${tone.color}55`, color: '#e2e8f0', boxShadow: `0 12px 32px -12px rgba(0,0,0,0.8), 0 0 20px -8px ${tone.color}` }}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]" style={{ background: tone.bg, color: tone.color }}>
              {tone.icon}
            </span>
            {t.message}
          </div>
        )
      })}
    </div>
  )
}

export default ToastStack

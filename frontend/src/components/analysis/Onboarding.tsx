import { useState } from 'react'
import { btnReset } from './ui'

const STEPS = [
  { icon: '🎬', title: '動画をドロップ', body: 'ビューワー中央にキック動画をドロップすると、AIが自動でフォームを解析します。' },
  { icon: '💡', title: '角度行をタップ', body: '左の「主要角度」の行をタップすると、選手の該当関節が光って対応が分かります。' },
  { icon: '🎯', title: '改善から練習へ', body: '「改善優先度ランキング」から、今日取り組むべき練習メニューへ繋がります。' }
]

export const ONBOARD_KEY = 'kpro_onboarded_v1'

/**
 * 初回訪問時のみ表示する 3 ステップのコーチマーク。
 * localStorage で既読管理し、スキップ可能。
 */
function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const s = STEPS[step]

  const finish = () => {
    try { localStorage.setItem(ONBOARD_KEY, '1') } catch { /* noop */ }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(2,6,17,0.8)', backdropFilter: 'blur(4px)' }}
      data-testid="onboarding"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{ background: 'rgba(9,14,26,0.98)', border: '1px solid rgba(57,255,136,0.3)', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.9), 0 0 40px -12px rgba(57,255,136,0.3)' }}
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ background: 'rgba(57,255,136,0.10)', border: '1px solid rgba(57,255,136,0.3)' }}>
          {s.icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">ステップ {step + 1} / {STEPS.length}</p>
        <h3 className="mt-1 text-lg font-extrabold text-white">{s.title}</h3>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-300">{s.body}</p>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === step ? 18 : 6, background: i === step ? '#39ff88' : 'rgba(148,163,184,0.3)' }} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" data-testid="onboard-skip" onClick={finish} className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-200" style={btnReset}>
            スキップ
          </button>
          <button
            type="button"
            data-testid="onboard-next"
            onClick={() => (last ? finish() : setStep((v) => v + 1))}
            className="rounded-full px-5 py-2 text-xs font-bold transition-transform hover:scale-105"
            style={{ ...btnReset, background: 'linear-gradient(135deg,#22c55e,#39ff88)', color: '#02120a', boxShadow: '0 0 18px rgba(57,255,136,0.4)' }}
          >
            {last ? 'はじめる' : '次へ'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Onboarding

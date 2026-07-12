import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FaceMode } from '../../services/profile'
import { btnReset } from './ui'

export type AnalyzeStep = 'upload' | 'skeleton' | 'angles' | 'scoring'
export const ANALYZE_STEPS: { key: AnalyzeStep; label: string; icon: string }[] = [
  { key: 'upload', label: 'アップロード', icon: '⬆' },
  { key: 'skeleton', label: '骨格を抽出中', icon: '🦴' },
  { key: 'angles', label: '角度を計測中', icon: '📐' },
  { key: 'scoring', label: 'スコアリング', icon: '⚡' }
]

interface AnalyzePanelProps {
  mode: 'dropzone' | 'progress'
  faceMode: FaceMode
  onFaceModeChange: (m: FaceMode) => void
  onFile: (file: File) => void
  /** progress モード時の現在ステップ index（0-3） */
  stepIndex: number
  error?: string | null
  onDismissError?: () => void
}

/**
 * ビューワー中央の解析パネル。
 * ・dropzone: キック動画をドロップして解析開始（顔モード切替つき）
 * ・progress: アップロード → 骨格抽出 → 角度計測 → スコアリング の段階的表示
 */
function AnalyzePanel({ mode, faceMode, onFaceModeChange, onFile, stepIndex, error, onDismissError }: AnalyzePanelProps) {
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) onFile(accepted[0])
  }, [onFile])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'video/*': [], 'image/*': [] },
    multiple: false,
    noClick: true,
    noKeyboard: true
  })

  if (mode === 'progress') {
    const pct = Math.min(100, ((stepIndex + 0.7) / ANALYZE_STEPS.length) * 100)
    return (
      <div
        data-testid="analyze-progress"
        className="absolute inset-0 z-20 flex items-center justify-center p-4"
        style={{ background: 'rgba(2,6,17,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-5"
          style={{ background: 'rgba(9,14,26,0.96)', border: '1px solid rgba(57,255,136,0.25)', boxShadow: '0 0 40px -12px rgba(57,255,136,0.35)' }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 animate-spin rounded-full" style={{ border: '3px solid rgba(57,255,136,0.2)', borderTopColor: '#39ff88' }} />
            <div>
              <p className="text-sm font-extrabold text-white">フォームを解析中…</p>
              <p className="text-[11px] text-slate-400">AI が骨格とキック動作を解析しています</p>
            </div>
          </div>

          <ol className="m-0 mb-4 list-none space-y-2 p-0">
            {ANALYZE_STEPS.map((s, i) => {
              const done = i < stepIndex
              const active = i === stepIndex
              const color = done ? '#39ff88' : active ? '#39ff88' : 'rgba(148,163,184,0.5)'
              return (
                <li key={s.key} className="flex items-center gap-2.5">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all"
                    style={{
                      background: done ? 'rgba(57,255,136,0.16)' : active ? 'rgba(57,255,136,0.10)' : 'rgba(148,163,184,0.08)',
                      border: `1px solid ${done || active ? 'rgba(57,255,136,0.5)' : 'rgba(148,163,184,0.2)'}`,
                      color
                    }}
                  >
                    {done ? '✓' : active ? <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#39ff88' }} /> : i + 1}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: done || active ? '#e2e8f0' : 'rgba(148,163,184,0.6)' }}>
                    {s.label}
                  </span>
                  {active && <span className="ml-auto text-[10px] font-bold text-emerald-300">処理中</span>}
                  {done && <span className="ml-auto text-[10px] font-bold text-emerald-400">完了</span>}
                </li>
              )
            })}
          </ol>

          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.14)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#22c55e,#39ff88)', boxShadow: '0 0 10px rgba(57,255,136,0.6)' }} />
          </div>
        </div>
      </div>
    )
  }

  // dropzone モード
  return (
    <div
      data-testid="analyze-dropzone"
      {...getRootProps()}
      className="absolute inset-0 z-20 flex items-center justify-center p-4"
      style={{ background: 'rgba(2,6,17,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
    >
      <input {...getInputProps()} data-testid="analyze-input" />
      <div
        className="w-full max-w-md rounded-2xl p-6 text-center transition-all"
        style={{
          border: `2px dashed ${isDragActive ? '#39ff88' : 'rgba(57,255,136,0.4)'}`,
          background: isDragActive ? 'rgba(57,255,136,0.12)' : 'rgba(9,14,26,0.85)',
          boxShadow: isDragActive ? '0 0 40px -8px rgba(57,255,136,0.5)' : '0 20px 50px -24px rgba(0,0,0,0.9)'
        }}
      >
        {/* 顔表示の切替（実写 / アバター） */}
        <div className="mb-4 flex items-center justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(57,255,136,0.10)', border: '1px solid rgba(57,255,136,0.3)' }}>
            {faceMode === 'real' ? (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="8" r="4" stroke="#39ff88" strokeWidth="1.6" />
                <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="#39ff88" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="6" y="4" width="12" height="12" rx="4" stroke="#39ff88" strokeWidth="1.6" />
                <circle cx="9.5" cy="10" r="1.1" fill="#39ff88" />
                <circle cx="14.5" cy="10" r="1.1" fill="#39ff88" />
                <path d="M6 20c0-2.5 2.7-4 6-4s6 1.5 6 4" stroke="#39ff88" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </div>
        </div>

        <p className="text-base font-extrabold text-white">
          {isDragActive ? 'ここにドロップして解析' : 'キック動画をドロップして解析開始'}
        </p>
        <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-slate-400">
          動画または画像をドラッグ＆ドロップ、またはファイルを選択。AIが骨格・角度・スコアを自動で算出します。
        </p>

        {/* 顔モードトグル */}
        <div className="mt-4 inline-flex items-center gap-1 rounded-full p-1" style={{ background: 'rgba(2,6,17,0.6)', border: '1px solid rgba(148,163,184,0.18)' }}>
          {(['real', 'avatar'] as FaceMode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`facemode-${m}`}
              onClick={(e) => { e.stopPropagation(); onFaceModeChange(m) }}
              className="rounded-full px-3 py-1 text-[11px] font-bold transition-all"
              style={{
                ...btnReset,
                background: faceMode === m ? 'rgba(34,197,94,0.9)' : 'transparent',
                color: faceMode === m ? '#02120a' : 'rgba(203,213,225,0.7)'
              }}
            >
              {m === 'real' ? '実写のまま' : 'アバターで隠す'}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <button
            type="button"
            data-testid="analyze-choose"
            onClick={(e) => { e.stopPropagation(); open() }}
            className="rounded-full px-5 py-2 text-xs font-bold transition-transform hover:scale-105"
            style={{ ...btnReset, background: 'linear-gradient(135deg,#22c55e,#39ff88)', color: '#02120a', boxShadow: '0 0 20px rgba(57,255,136,0.4)' }}
          >
            ファイルを選択
          </button>
        </div>

        {error && (
          <div
            className="mt-4 rounded-lg px-3 py-2 text-[11px] font-semibold"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5' }}
            onClick={(e) => { e.stopPropagation(); onDismissError?.() }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default AnalyzePanel

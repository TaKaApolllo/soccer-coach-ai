import { useMemo, useState } from 'react'
import { PoseLandmark } from '../../types'
import { IDEAL_LANDMARKS } from '../../mocks/formAnalysisMock'

interface AvatarViewerProps {
  landmarks?: PoseLandmark[] | null
  title?: string
  /** true の場合トグルを表示しない（比較ビューの片側などで使用） */
  hideToggle?: boolean
  /** 外部からビューを固定したい場合（比較ビュー用） */
  forceView?: 'current' | 'ideal'
  size?: number
}

const W = 300
const H = 420
const PAD_X = 46
const PAD_Y = 34
const PLOT_H = H - PAD_Y * 2 - 30

type Pt = [number, number]

function project(lm: PoseLandmark[], name: string): Pt | null {
  const p = lm.find((l) => l.name === name)
  if (!p) return null
  return [PAD_X + p.x * (W - PAD_X * 2), PAD_Y + p.y * PLOT_H]
}

const LIMBS: [string, string, number][] = [
  ['left_shoulder', 'left_elbow', 15],
  ['left_elbow', 'left_wrist', 11],
  ['right_shoulder', 'right_elbow', 15],
  ['right_elbow', 'right_wrist', 11],
  ['left_hip', 'left_knee', 22],
  ['left_knee', 'left_ankle', 16],
  ['left_ankle', 'left_foot_index', 10],
  ['right_hip', 'right_knee', 22],
  ['right_knee', 'right_ankle', 16],
  ['right_ankle', 'right_foot_index', 10]
]

const SKELETON_LINKS: [string, string][] = [
  ['nose', 'left_shoulder'],
  ['nose', 'right_shoulder'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['left_ankle', 'left_foot_index'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
  ['right_ankle', 'right_foot_index']
]

const JOINT_NAMES = [
  'nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip', 'left_knee',
  'right_knee', 'left_ankle', 'right_ankle', 'left_foot_index', 'right_foot_index'
]

/**
 * スタジアム風背景 + ボリュームのある選手シルエット + MediaPipe骨格ラインを
 * ネオングリーンで重ねて描画する 2D アバタービューア。
 * landmarks が無い場合は理想ポーズのデフォルト骨格を表示する。
 */
function AvatarViewer({ landmarks, title, hideToggle = false, forceView, size = 340 }: AvatarViewerProps) {
  const [view, setView] = useState<'current' | 'ideal'>('current')
  const hasCurrent = !!landmarks && landmarks.length > 0
  const effectiveView = forceView ?? view

  const activeLandmarks = useMemo(() => {
    if (effectiveView === 'ideal' || !hasCurrent) return IDEAL_LANDMARKS
    return landmarks as PoseLandmark[]
  }, [effectiveView, hasCurrent, landmarks])

  const joints = useMemo(() => {
    const out: Record<string, Pt> = {}
    for (const name of JOINT_NAMES) {
      const p = project(activeLandmarks, name)
      if (p) out[name] = p
    }
    return out
  }, [activeLandmarks])

  const shoulderL = joints.left_shoulder
  const shoulderR = joints.right_shoulder
  const hipL = joints.left_hip
  const hipR = joints.right_hip
  const nose = joints.nose

  const shoulderWidth = shoulderL && shoulderR
    ? Math.hypot(shoulderR[0] - shoulderL[0], shoulderR[1] - shoulderL[1])
    : 60
  const headR = Math.max(14, shoulderWidth * 0.42)
  const headCenter: Pt | null = nose ? [nose[0], nose[1] - headR * 0.25] : null

  const BODY_FILL = 'rgba(18, 26, 22, 0.92)'
  const BODY_STROKE = 'rgba(255,255,255,0.06)'
  const NEON = '#39ff8f'

  return (
    <div className="relative w-full" style={{ maxWidth: size, margin: '0 auto' }}>
      {!hideToggle && (
        <div className="absolute right-2 top-2 z-10 flex rounded-full border border-white/15 bg-black/40 backdrop-blur-md p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setView('current')}
            disabled={!hasCurrent}
            className={`rounded-full px-3 py-1 transition-colors ${
              effectiveView === 'current' || !hasCurrent
                ? 'bg-emerald-400/90 text-black'
                : 'text-white/60 hover:text-white'
            } ${!hasCurrent ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            現在フォーム
          </button>
          <button
            type="button"
            onClick={() => setView('ideal')}
            className={`rounded-full px-3 py-1 transition-colors ${
              effectiveView === 'ideal' && hasCurrent ? 'bg-emerald-400/90 text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            理想フォーム
          </button>
        </div>
      )}

      {title && (
        <div className="absolute left-3 top-3 z-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1 text-xs font-semibold text-white/80">
          {title}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="選手フォームのアバター表示">
        <defs>
          <linearGradient id="stadiumBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c2318" />
            <stop offset="55%" stopColor="#081a12" />
            <stop offset="100%" stopColor="#020604" />
          </linearGradient>
          <radialGradient id="lightGlowA" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(220,255,235,0.55)" />
            <stop offset="100%" stopColor="rgba(220,255,235,0)" />
          </radialGradient>
          <radialGradient id="lightGlowB" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(120,255,180,0.35)" />
            <stop offset="100%" stopColor="rgba(120,255,180,0)" />
          </radialGradient>
          <filter id="softBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id="neonGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* スタジアム背景 */}
        <rect x="0" y="0" width={W} height={H} rx="20" fill="url(#stadiumBg)" />
        <circle cx={W * 0.18} cy={H * 0.1} r="70" fill="url(#lightGlowA)" filter="url(#softBlur)" />
        <circle cx={W * 0.85} cy={H * 0.06} r="90" fill="url(#lightGlowB)" filter="url(#softBlur)" />

        {/* ピッチの芝ライン */}
        <g opacity="0.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <rect
              key={i}
              x={-20}
              y={H - 92 + i * 14}
              width={W + 40}
              height={7}
              fill={i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'}
              transform={`skewX(-18)`}
            />
          ))}
        </g>
        <rect x="0" y={H - 96} width={W} height="96" fill="url(#stadiumBg)" opacity="0.25" />
        <line x1="16" y1={H - 40} x2={W - 16} y2={H - 40} stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />

        {/* シルエット（ボリュームのある塗り） */}
        <g fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1">
          {LIMBS.map(([a, b, width], i) => {
            const pa = joints[a]
            const pb = joints[b]
            if (!pa || !pb) return null
            return (
              <line
                key={`limb-${i}`}
                x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                strokeWidth={width}
                stroke={BODY_FILL}
                strokeLinecap="round"
              />
            )
          })}
          {shoulderL && shoulderR && hipL && hipR && (
            <polygon
              points={`${shoulderL.join(',')} ${shoulderR.join(',')} ${hipR.join(',')} ${hipL.join(',')}`}
              fill={BODY_FILL}
            />
          )}
          {headCenter && <circle cx={headCenter[0]} cy={headCenter[1]} r={headR} fill={BODY_FILL} />}
        </g>

        {/* MediaPipe 骨格ライン（ネオングリーン） */}
        <g stroke={NEON} strokeWidth="2.2" opacity="0.95" filter="url(#neonGlow)">
          {SKELETON_LINKS.map(([a, b], i) => {
            const pa = joints[a]
            const pb = joints[b]
            if (!pa || !pb) return null
            return <line key={`sk-${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />
          })}
        </g>
        <g filter="url(#neonGlow)">
          {Object.entries(joints).map(([name, [x, y]]) => (
            <circle key={name} cx={x} cy={y} r={name === 'nose' ? 3.4 : 3} fill={NEON} />
          ))}
        </g>
      </svg>
    </div>
  )
}

export default AvatarViewer

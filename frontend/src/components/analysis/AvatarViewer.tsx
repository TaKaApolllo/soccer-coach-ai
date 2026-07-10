import { useMemo } from 'react'
import { PoseLandmark } from '../../types'
import { AngleLabel, AvatarMode, Tone } from '../../types/analysis'
import { IDEAL_LANDMARKS } from '../../mocks/formAnalysisMock'

interface AvatarViewerProps {
  landmarks?: PoseLandmark[] | null
  /** 表示モード。今は '2d' のみ実装。'3d' は将来 R3F 実装へ差し替える受け口 */
  mode?: AvatarMode
  /** 強調表示したい関節名（ネオンで拡大＋パルス） */
  highlightJoints?: string[]
  /** 関節に重ねる角度ラベル */
  angleLabels?: AngleLabel[]
  /** 理想フォームのゴースト重ね描画 */
  showGhost?: boolean
  /** 3D 風の傾き（擬似的な等角プロジェクション） */
  tilt?: boolean
  /**
   * フォトリアルなヒーロー画像の URL。指定時はベクターシルエットの代わりに
   * この画像を背景いっぱい（object-fit: cover 相当）に表示し、上に骨格を重ねる。
   */
  backdropUrl?: string | null
  /** ヒーロー画像モードで骨格オーバーレイを表示するか（トグル用） */
  showSkeleton?: boolean
}

const W = 340
const H = 470
const PAD_X = 60
const PAD_Y = 40
const PLOT_H = H - PAD_Y * 2 - 40

type Pt = [number, number]

const LIMBS: [string, string, number][] = [
  ['left_shoulder', 'left_elbow', 16],
  ['left_elbow', 'left_wrist', 12],
  ['right_shoulder', 'right_elbow', 16],
  ['right_elbow', 'right_wrist', 12],
  ['left_hip', 'left_knee', 24],
  ['left_knee', 'left_ankle', 17],
  ['left_ankle', 'left_foot_index', 11],
  ['right_hip', 'right_knee', 24],
  ['right_knee', 'right_ankle', 17],
  ['right_ankle', 'right_foot_index', 11]
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

const NEON = '#39ff88'

const TONE_COLOR: Record<Tone, string> = {
  good: '#39ff88',
  warn: '#facc15',
  bad: '#ef4444',
  neutral: '#94a3b8'
}

function buildJoints(lm: PoseLandmark[], tilt: boolean): Record<string, Pt> {
  const out: Record<string, Pt> = {}
  for (const name of JOINT_NAMES) {
    const p = lm.find((l) => l.name === name)
    if (!p) continue
    let x = p.x
    const y = p.y
    // 擬似 3D: 上に行くほど僅かに右へシアーして奥行き感を出す
    if (tilt) x += (0.5 - y) * 0.06
    out[name] = [PAD_X + x * (W - PAD_X * 2), PAD_Y + y * PLOT_H]
  }
  return out
}

/** ヒーロー画像用: 正規化座標をビューポート全面（0-1 → W×H）にマップ */
function buildJointsFull(lm: PoseLandmark[]): Record<string, Pt> {
  const out: Record<string, Pt> = {}
  for (const name of JOINT_NAMES) {
    const p = lm.find((l) => l.name === name)
    if (!p) continue
    out[name] = [p.x * W, p.y * H]
  }
  return out
}

/**
 * スタジアム風背景 + ボリュームのある選手シルエット + ネオン骨格ラインの
 * 2D アバタービューア。props は将来の Three.js / React Three Fiber 実装へ
 * そのまま渡せる形（landmarks / mode / highlightJoints / angleLabels）にしてある。
 */
function AvatarViewer({
  landmarks,
  mode = '2d',
  highlightJoints = [],
  angleLabels = [],
  showGhost = true,
  tilt = false,
  backdropUrl = null,
  showSkeleton = true
}: AvatarViewerProps) {
  const active = landmarks && landmarks.length ? landmarks : IDEAL_LANDMARKS

  const joints = useMemo(() => buildJoints(active, tilt), [active, tilt])
  const ghost = useMemo(() => buildJoints(IDEAL_LANDMARKS, tilt), [tilt])
  const fullJoints = useMemo(() => buildJointsFull(active), [active])

  // ---- ヒーロー画像モード（フォトリアル背景 + 骨格オーバーレイ）----
  if (backdropUrl) {
    const highlightSet = new Set(highlightJoints)
    return (
      <div className="relative h-full w-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label="選手ヒーロー画像とフォーム骨格" preserveAspectRatio="xMidYMid meet">
          <defs>
            <clipPath id="heroClip">
              <rect x="0" y="0" width={W} height={H} rx="0" />
            </clipPath>
            <linearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(2,6,13,0.30)" />
              <stop offset="42%" stopColor="rgba(2,6,13,0)" />
              <stop offset="78%" stopColor="rgba(2,6,13,0.55)" />
              <stop offset="100%" stopColor="rgba(2,6,13,0.92)" />
            </linearGradient>
            <filter id="heroNeon" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* フォトリアル背景（object-fit: cover 相当） */}
          <image
            href={backdropUrl}
            x="0"
            y="0"
            width={W}
            height={H}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#heroClip)"
          />
          {/* HUD 視認性確保の暗めグラデーション */}
          <rect x="0" y="0" width={W} height={H} fill="url(#heroFade)" />

          {showSkeleton && (
            <>
              {/* 骨格ライン */}
              <g stroke={NEON} strokeWidth="2.4" opacity="0.95" filter="url(#heroNeon)">
                {SKELETON_LINKS.map(([a, b], i) => {
                  const pa = fullJoints[a]
                  const pb = fullJoints[b]
                  if (!pa || !pb) return null
                  return <line key={`hsk-${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />
                })}
              </g>
              {/* 関節点 */}
              <g filter="url(#heroNeon)">
                {Object.entries(fullJoints).map(([name, [x, y]]) => {
                  const hot = highlightSet.has(name)
                  return (
                    <g key={name}>
                      {hot && (
                        <circle cx={x} cy={y} r={9} fill="none" stroke={NEON} strokeWidth="1.6" opacity="0.6">
                          <animate attributeName="r" values="6;12;6" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle cx={x} cy={y} r={hot ? 4.5 : name === 'nose' ? 3.6 : 3.2} fill={hot ? '#ffffff' : NEON} stroke={hot ? NEON : 'none'} strokeWidth="1.5" />
                    </g>
                  )
                })}
              </g>
              {/* 角度ラベル */}
              <g>
                {angleLabels.map((al) => {
                  const j = fullJoints[al.joint]
                  if (!j) return null
                  const color = TONE_COLOR[al.status ?? 'neutral']
                  const lx = j[0] + (j[0] > W / 2 ? 14 : -14)
                  const ly = j[1]
                  const anchor = j[0] > W / 2 ? 'start' : 'end'
                  const boxW = 52
                  const boxX = anchor === 'start' ? lx : lx - boxW
                  return (
                    <g key={al.joint}>
                      <line x1={j[0]} y1={j[1]} x2={lx} y2={ly} stroke={color} strokeWidth="1" opacity="0.6" />
                      <rect x={boxX} y={ly - 10} width={boxW} height={20} rx="5" fill="rgba(2,6,13,0.82)" stroke={color} strokeWidth="1" />
                      <text x={boxX + boxW / 2} y={ly + 1} textAnchor="middle" dominantBaseline="central" fontSize="9" fill={color} fontWeight="700">
                        {al.label} {Math.round(al.value)}{al.unit ?? '°'}
                      </text>
                    </g>
                  )
                })}
              </g>
            </>
          )}
        </svg>
      </div>
    )
  }

  const shoulderL = joints.left_shoulder
  const shoulderR = joints.right_shoulder
  const hipL = joints.left_hip
  const hipR = joints.right_hip
  const nose = joints.nose

  const shoulderWidth = shoulderL && shoulderR
    ? Math.hypot(shoulderR[0] - shoulderL[0], shoulderR[1] - shoulderL[1])
    : 60
  const headR = Math.max(16, shoulderWidth * 0.45)
  const headCenter: Pt | null = nose ? [nose[0], nose[1] - headR * 0.2] : null

  const BODY_FILL = 'url(#bodyGrad)'
  const BODY_STROKE = 'rgba(150, 240, 190, 0.28)'

  const highlight = new Set(highlightJoints)

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label="選手フォームのアバター表示" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="stadiumBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1f33" />
            <stop offset="45%" stopColor="#071626" />
            <stop offset="100%" stopColor="#02060d" />
          </linearGradient>
          <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e3b25" />
            <stop offset="100%" stopColor="#04160d" />
          </linearGradient>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#33506b" />
            <stop offset="100%" stopColor="#1c2f42" />
          </linearGradient>
          <radialGradient id="lightGlowA" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(210,255,235,0.55)" />
            <stop offset="100%" stopColor="rgba(210,255,235,0)" />
          </radialGradient>
          <radialGradient id="lightGlowB" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(120,200,255,0.4)" />
            <stop offset="100%" stopColor="rgba(120,200,255,0)" />
          </radialGradient>
          <radialGradient id="floorGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(57,255,136,0.28)" />
            <stop offset="100%" stopColor="rgba(57,255,136,0)" />
          </radialGradient>
          <filter id="softBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <filter id="neonGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* スタジアム背景 */}
        <rect x="0" y="0" width={W} height={H} fill="url(#stadiumBg)" />
        <circle cx={W * 0.16} cy={H * 0.1} r="80" fill="url(#lightGlowA)" filter="url(#softBlur)" />
        <circle cx={W * 0.86} cy={H * 0.06} r="95" fill="url(#lightGlowB)" filter="url(#softBlur)" />

        {/* ピッチ */}
        <g opacity="0.85">
          <polygon points={`-40,${H} ${W + 40},${H} ${W * 0.82},${H - 130} ${W * 0.18},${H - 130}`} fill="url(#pitchGrad)" />
          {Array.from({ length: 6 }).map((_, i) => (
            <line
              key={i}
              x1={-40 + (i / 5) * (W + 80)}
              y1={H}
              x2={W * 0.18 + (i / 5) * (W * 0.64)}
              y2={H - 130}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}
          <line x1={W * 0.18} y1={H - 130} x2={W * 0.82} y2={H - 130} stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
        </g>
        <ellipse cx={W / 2} cy={H - 42} rx="120" ry="26" fill="url(#floorGlow)" />

        {/* 理想フォームのゴースト */}
        {showGhost && (
          <g stroke="rgba(120,180,255,0.5)" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.55">
            {SKELETON_LINKS.map(([a, b], i) => {
              const pa = ghost[a]
              const pb = ghost[b]
              if (!pa || !pb) return null
              return <line key={`gh-${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />
            })}
          </g>
        )}

        {/* シルエットのリム */}
        <g opacity="0.9">
          {LIMBS.map(([a, b, width], i) => {
            const pa = joints[a]
            const pb = joints[b]
            if (!pa || !pb) return null
            return <line key={`rim-${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} strokeWidth={width + 4} stroke={BODY_STROKE} strokeLinecap="round" />
          })}
          {shoulderL && shoulderR && hipL && hipR && (
            <polygon points={`${shoulderL.join(',')} ${shoulderR.join(',')} ${hipR.join(',')} ${hipL.join(',')}`} fill="none" stroke={BODY_STROKE} strokeWidth="4" strokeLinejoin="round" />
          )}
          {headCenter && <circle cx={headCenter[0]} cy={headCenter[1]} r={headR + 2} fill="none" stroke={BODY_STROKE} strokeWidth="3" />}
        </g>

        {/* シルエット塗り */}
        <g>
          {LIMBS.map(([a, b, width], i) => {
            const pa = joints[a]
            const pb = joints[b]
            if (!pa || !pb) return null
            return <line key={`limb-${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} strokeWidth={width} stroke={BODY_FILL} strokeLinecap="round" />
          })}
          {shoulderL && shoulderR && hipL && hipR && (
            <polygon points={`${shoulderL.join(',')} ${shoulderR.join(',')} ${hipR.join(',')} ${hipL.join(',')}`} fill={BODY_FILL} />
          )}
          {headCenter && <circle cx={headCenter[0]} cy={headCenter[1]} r={headR} fill={BODY_FILL} />}
        </g>

        {/* ネオン骨格ライン */}
        <g stroke={NEON} strokeWidth="2.4" opacity="0.95" filter="url(#neonGlow)">
          {SKELETON_LINKS.map(([a, b], i) => {
            const pa = joints[a]
            const pb = joints[b]
            if (!pa || !pb) return null
            return <line key={`sk-${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />
          })}
        </g>

        {/* 関節点 */}
        <g filter="url(#neonGlow)">
          {Object.entries(joints).map(([name, [x, y]]) => {
            const hot = highlight.has(name)
            return (
              <g key={name}>
                {hot && (
                  <circle cx={x} cy={y} r={9} fill="none" stroke={NEON} strokeWidth="1.6" opacity="0.6">
                    <animate attributeName="r" values="6;12;6" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={y} r={hot ? 4.5 : name === 'nose' ? 3.6 : 3.2} fill={hot ? '#ffffff' : NEON} stroke={hot ? NEON : 'none'} strokeWidth="1.5" />
              </g>
            )
          })}
        </g>

        {/* 角度ラベル */}
        <g>
          {angleLabels.map((al) => {
            const j = joints[al.joint]
            if (!j) return null
            const color = TONE_COLOR[al.status ?? 'neutral']
            const lx = j[0] + (j[0] > W / 2 ? 14 : -14)
            const ly = j[1]
            const anchor = j[0] > W / 2 ? 'start' : 'end'
            const boxW = 52
            const boxX = anchor === 'start' ? lx : lx - boxW
            return (
              <g key={al.joint}>
                <line x1={j[0]} y1={j[1]} x2={lx} y2={ly} stroke={color} strokeWidth="1" opacity="0.6" />
                <rect x={boxX} y={ly - 10} width={boxW} height={20} rx="5" fill="rgba(2,6,13,0.82)" stroke={color} strokeWidth="1" />
                <text x={boxX + boxW / 2} y={ly + 1} textAnchor="middle" dominantBaseline="central" fontSize="9" fill={color} fontWeight="700">
                  {al.label} {Math.round(al.value)}{al.unit ?? '°'}
                </text>
              </g>
            )
          })}
        </g>

        {mode === '3d' && (
          <text x={W - 10} y={20} textAnchor="end" fontSize="9" fill="rgba(148,163,184,0.7)">3D BETA</text>
        )}
      </svg>
    </div>
  )
}

export default AvatarViewer

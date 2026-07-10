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
  /** クロスハイライトでフォーカスする関節。指定時は他をディムして一点を強調 */
  focusJoint?: string | null
  /** ゴースト（理想フォーム）の不透明度 0-1（比較スライダー用） */
  ghostOpacity?: number
  /** 自分の身体（塗り + 骨格）の不透明度 0-1（比較スライダー用） */
  bodyOpacity?: number
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
  showSkeleton = true,
  focusJoint = null,
  ghostOpacity = 0.55,
  bodyOpacity = 1
}: AvatarViewerProps) {
  const active = landmarks && landmarks.length ? landmarks : IDEAL_LANDMARKS

  const joints = useMemo(() => buildJoints(active, tilt), [active, tilt])
  const ghost = useMemo(() => buildJoints(IDEAL_LANDMARKS, tilt), [tilt])
  const fullJoints = useMemo(() => buildJointsFull(active), [active])

  // ---- ヒーロー画像モード（フォトリアル背景 + 骨格オーバーレイ）----
  if (backdropUrl) {
    const highlightSet = new Set(focusJoint ? [...highlightJoints, focusJoint] : highlightJoints)
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
                  const dim = focusJoint && name !== focusJoint
                  return (
                    <g key={name} opacity={dim ? 0.28 : 1}>
                      {(hot || name === focusJoint) && (
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
                  const lit = focusJoint === al.joint
                  const dim = focusJoint && !lit
                  const lx = j[0] + (j[0] > W / 2 ? 14 : -14)
                  const ly = j[1]
                  const anchor = j[0] > W / 2 ? 'start' : 'end'
                  const boxW = 52
                  const boxX = anchor === 'start' ? lx : lx - boxW
                  return (
                    <g key={al.joint} opacity={dim ? 0.25 : 1} style={lit ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}>
                      <line x1={j[0]} y1={j[1]} x2={lx} y2={ly} stroke={color} strokeWidth={lit ? 1.6 : 1} opacity="0.6" />
                      <rect x={boxX} y={ly - 10} width={boxW} height={20} rx="5" fill={lit ? 'rgba(2,6,13,0.95)' : 'rgba(2,6,13,0.82)'} stroke={color} strokeWidth={lit ? 1.8 : 1} />
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

  const BODY_STROKE = 'rgba(150, 240, 190, 0.28)'

  // 部位ごとの塗り分け（ユニフォーム / 肌 / ソックス / スパイク）
  const limbFill = (a: string, b: string): string => {
    if (b.endsWith('foot_index')) return 'url(#bootGrad)'
    if (a.includes('knee') && b.includes('ankle')) return 'url(#sockGrad)'
    if (a.includes('elbow') && b.includes('wrist')) return 'url(#skinGrad)'
    return 'url(#uniGrad)' // 袖・ショーツ
  }

  const highlight = new Set(focusJoint ? [...highlightJoints, focusJoint] : highlightJoints)

  // 接地している足元（影の中心）
  const feet = [joints.left_foot_index, joints.right_foot_index, joints.left_ankle, joints.right_ankle].filter(Boolean) as Pt[]
  const groundY = feet.length ? Math.max(...feet.map((p) => p[1])) : H - 60
  const groundX = feet.length ? feet.reduce((s, p) => s + p[0], 0) / feet.length : W / 2

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
          {/* ユニフォーム（ダークネイビー・立体シェーディング） */}
          <linearGradient id="uniGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2a3b63" />
            <stop offset="48%" stopColor="#1b2749" />
            <stop offset="100%" stopColor="#0f1830" />
          </linearGradient>
          {/* 肌トーン */}
          <linearGradient id="skinGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c69a76" />
            <stop offset="100%" stopColor="#9c6f4e" />
          </linearGradient>
          {/* ソックス */}
          <linearGradient id="sockGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7edf5" />
            <stop offset="100%" stopColor="#9fb0c6" />
          </linearGradient>
          {/* スパイク（ブーツ） */}
          <linearGradient id="bootGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2c3242" />
            <stop offset="100%" stopColor="#0b0e16" />
          </linearGradient>
          {/* 髪 */}
          <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3128" />
            <stop offset="100%" stopColor="#171310" />
          </linearGradient>
          {/* 観客席のボケ帯 */}
          <linearGradient id="standGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c2236" />
            <stop offset="100%" stopColor="#050d18" />
          </linearGradient>
          <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.55)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
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
        {/* 観客席（暗いボケ帯） */}
        <rect x="0" y={H * 0.18} width={W} height={H * 0.24} fill="url(#standGrad)" opacity="0.9" />
        <g opacity="0.5">
          {Array.from({ length: 46 }).map((_, i) => {
            const cx = ((i * 61) % (W - 12)) + 6
            const row = Math.floor(i / 12)
            const cy = H * 0.2 + row * 11 + ((i * 7) % 6)
            const warm = i % 3 === 0
            return (
              <circle
                key={`crowd-${i}`}
                cx={cx}
                cy={cy}
                r={(i % 4) * 0.4 + 1}
                fill={warm ? 'rgba(250,220,170,0.5)' : 'rgba(150,190,230,0.4)'}
              />
            )
          })}
        </g>
        {/* フラッドライトの光暈 */}
        <circle cx={W * 0.16} cy={H * 0.1} r="80" fill="url(#lightGlowA)" filter="url(#softBlur)" />
        <circle cx={W * 0.86} cy={H * 0.06} r="95" fill="url(#lightGlowB)" filter="url(#softBlur)" />
        <circle cx={W * 0.5} cy={H * 0.04} r="70" fill="url(#lightGlowA)" filter="url(#softBlur)" opacity="0.7" />

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
          <g stroke="rgba(120,180,255,0.7)" strokeWidth="1.8" strokeDasharray="4 4" opacity={ghostOpacity}>
            {SKELETON_LINKS.map(([a, b], i) => {
              const pa = ghost[a]
              const pb = ghost[b]
              if (!pa || !pb) return null
              return <line key={`gh-${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />
            })}
            <g fill="rgba(150,200,255,0.9)">
              {Object.values(ghost).map(([x, y], i) => (
                <circle key={`ghd-${i}`} cx={x} cy={y} r={2.4} />
              ))}
            </g>
          </g>
        )}

        {/* 接地の影 */}
        <ellipse cx={groundX} cy={groundY + 6} rx={shoulderWidth * 1.5} ry={14} fill="url(#shadowGrad)" opacity="0.7" />

        <g opacity={bodyOpacity} style={{ transition: 'opacity 0.15s ease' }}>
        {/* 選手のリム（輪郭） */}
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

        {/* 選手の塗り（部位ごとにユニフォーム / 肌 / ソックス / スパイク） */}
        <g>
          {/* 胴（ユニフォーム） */}
          {shoulderL && shoulderR && hipL && hipR && (
            <polygon points={`${shoulderL.join(',')} ${shoulderR.join(',')} ${hipR.join(',')} ${hipL.join(',')}`} fill="url(#uniGrad)" />
          )}
          {LIMBS.map(([a, b, width], i) => {
            const pa = joints[a]
            const pb = joints[b]
            if (!pa || !pb) return null
            return (
              <line
                key={`limb-${i}`}
                x1={pa[0]}
                y1={pa[1]}
                x2={pb[0]}
                y2={pb[1]}
                strokeWidth={b.endsWith('foot_index') ? width + 3 : width}
                stroke={limbFill(a, b)}
                strokeLinecap={b.endsWith('foot_index') ? 'butt' : 'round'}
              />
            )
          })}
          {/* 頭（肌 + 髪） */}
          {headCenter && (
            <>
              <circle cx={headCenter[0]} cy={headCenter[1]} r={headR} fill="url(#skinGrad)" />
              <path
                d={`M ${headCenter[0] - headR} ${headCenter[1]} A ${headR} ${headR} 0 0 1 ${headCenter[0] + headR} ${headCenter[1]} L ${headCenter[0] + headR * 0.7} ${headCenter[1] - headR * 0.2} A ${headR * 0.9} ${headR * 0.9} 0 0 0 ${headCenter[0] - headR * 0.7} ${headCenter[1] - headR * 0.2} Z`}
                fill="url(#hairGrad)"
              />
            </>
          )}
        </g>

        {/* リムライト（片側のエッジハイライト） */}
        <g opacity="0.55" strokeLinecap="round">
          {LIMBS.map(([a, b, width], i) => {
            const pa = joints[a]
            const pb = joints[b]
            if (!pa || !pb) return null
            return (
              <line
                key={`rl-${i}`}
                x1={pa[0] - width * 0.28}
                y1={pa[1]}
                x2={pb[0] - width * 0.28}
                y2={pb[1]}
                strokeWidth={Math.max(1.5, width * 0.22)}
                stroke="rgba(120,220,180,0.7)"
              />
            )
          })}
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
            const dim = focusJoint && name !== focusJoint
            return (
              <g key={name} opacity={dim ? 0.3 : 1}>
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
            const lit = focusJoint === al.joint
            const dim = focusJoint && !lit
            const lx = j[0] + (j[0] > W / 2 ? 14 : -14)
            const ly = j[1]
            const anchor = j[0] > W / 2 ? 'start' : 'end'
            const boxW = 52
            const boxX = anchor === 'start' ? lx : lx - boxW
            return (
              <g key={al.joint} opacity={dim ? 0.22 : 1} style={lit ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}>
                <line x1={j[0]} y1={j[1]} x2={lx} y2={ly} stroke={color} strokeWidth={lit ? 1.6 : 1} opacity="0.6" />
                <rect x={boxX} y={ly - 10} width={boxW} height={20} rx="5" fill={lit ? 'rgba(2,6,13,0.95)' : 'rgba(2,6,13,0.82)'} stroke={color} strokeWidth={lit ? 1.8 : 1} />
                <text x={boxX + boxW / 2} y={ly + 1} textAnchor="middle" dominantBaseline="central" fontSize="9" fill={color} fontWeight="700">
                  {al.label} {Math.round(al.value)}{al.unit ?? '°'}
                </text>
              </g>
            )
          })}
        </g>
        </g>

        {mode === '3d' && (
          <text x={W - 10} y={20} textAnchor="end" fontSize="9" fill="rgba(148,163,184,0.7)">3D BETA</text>
        )}
      </svg>
    </div>
  )
}

export default AvatarViewer

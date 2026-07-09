import { BodyPartStatus } from '../../types'

export const STATUS_COLOR: Record<BodyPartStatus, string> = {
  good: '#34d399',
  warn: '#fbbf24',
  bad: '#f87171'
}

export const STATUS_TEXT: Record<BodyPartStatus, string> = {
  good: '良好',
  warn: '要注意',
  bad: '要改善'
}

export function scoreToStatus(score: number): BodyPartStatus {
  if (score >= 75) return 'good'
  if (score >= 55) return 'warn'
  return 'bad'
}

interface GaugeRingProps {
  score: number
  size?: number
  status?: BodyPartStatus
  label?: string
}

/**
 * 部位別／総合スコア用のネオン風円形ゲージ（0-100）。
 * status に応じてリングの色とグロー（発光）を変える。
 */
function GaugeRing({ score, size = 120, status, label }: GaugeRingProps) {
  const resolvedStatus = status ?? scoreToStatus(score)
  const color = STATUS_COLOR[resolvedStatus]
  const stroke = Math.max(6, size * 0.075)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  const offset = c * (1 - clamped / 100)
  const gradId = `gauge-grad-${resolvedStatus}-${size}`

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label ?? 'スコア'} ${clamped}点`}
    >
      <defs>
        <filter id={`glow-${gradId}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={size * 0.03} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        filter={`url(#glow-${gradId})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text
        x="50%"
        y={label ? '45%' : '50%'}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#f5f9f7"
        fontSize={size * 0.28}
        fontWeight={800}
      >
        {Math.round(clamped)}
      </text>
      {label && (
        <text
          x="50%"
          y="68%"
          textAnchor="middle"
          fill="rgba(245,249,247,0.6)"
          fontSize={size * 0.095}
        >
          {label}
        </text>
      )}
    </svg>
  )
}

export default GaugeRing

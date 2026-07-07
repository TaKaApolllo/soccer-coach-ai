interface ScoreRingProps {
  score: number
  size?: number
  label?: string
}

/**
 * フォームスコア用のリングゲージ（0-100）
 */
function ScoreRing({ score, size = 110, label }: ScoreRingProps) {
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  const offset = c * (1 - clamped / 100)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label ?? 'スコア'} ${clamped}点`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--surface-3)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text
        x="50%"
        y={label ? '46%' : '50%'}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-primary)"
        fontSize={size * 0.3}
        fontWeight={800}
      >
        {clamped}
      </text>
      {label && (
        <text
          x="50%"
          y="68%"
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize={size * 0.1}
        >
          {label}
        </text>
      )}
    </svg>
  )
}

export default ScoreRing

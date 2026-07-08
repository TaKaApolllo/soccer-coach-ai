interface GaugeTileProps {
  title: string
  value: number | string
  unit?: string
  label: string
  detail: string
  /** 0-100。数値以外（"低" 等）のときは省略 */
  percent?: number
  good?: boolean
  icon?: string
}

/**
 * 半円ゲージ付きの統計タイル（推定シュート速度・インパクトの強さ等）
 */
function GaugeTile({ title, value, unit, label, detail, percent, good = true, icon }: GaugeTileProps) {
  const W = 120
  const H = 66
  const r = 48
  const cx = W / 2
  const cy = H - 6
  const semi = Math.PI * r

  const arc = (sweep: number, color: string, width: number, dash?: string) => (
    <path
      d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dash ?? `${semi * sweep} ${semi}`}
    />
  )

  return (
    <div className="card gauge-tile">
      <div className="gauge-title">{title}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label={`${title}: ${value}${unit ?? ''}`}>
        {arc(1, 'var(--surface-3)', 8)}
        {percent !== undefined && arc(Math.max(0.02, percent / 100), good ? 'var(--accent)' : 'var(--series-3)', 8)}
        {icon && percent === undefined && (
          <text x={cx} y={cy - r / 2} textAnchor="middle" fontSize={22}>{icon}</text>
        )}
      </svg>
      <div className="gauge-value">
        {value}
        {unit && <span className="gauge-unit">{unit}</span>}
      </div>
      <div className={`gauge-label ${good ? 'accent-text' : 'warn-text'}`}>{label}</div>
      <div className="gauge-detail">{detail}</div>
    </div>
  )
}

export default GaugeTile

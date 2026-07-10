import { PassAnalysis } from '../types'

interface PassMiniMapProps {
  passing: PassAnalysis
}

const CLASS_COLOR: Record<string, string> = {
  safe: 'var(--series-2)',
  progressive: 'var(--accent)',
  risky: 'var(--error-color)'
}

/**
 * パスコース候補のミニネットワーク図。小型ピッチ上に保持者ノードと
 * パス先ノードを配置し、安全=青 / 前進=緑 / リスク=赤破線 のエッジで結ぶ。
 */
function PassMiniMap({ passing }: PassMiniMapProps) {
  const W = 288
  const H = 168
  const m = 8
  const fw = W - m * 2
  const fh = H - m * 2
  const px = (nx: number) => m + nx * fw
  const py = (ny: number) => m + ny * fh

  const hx = px(passing.holder.x)
  const hy = py(passing.holder.y)
  const opts = passing.options.slice(0, 6)

  const counts = {
    safe: passing.options.filter((o) => o.class === 'safe').length,
    progressive: passing.options.filter((o) => o.class === 'progressive').length,
    risky: passing.options.filter((o) => o.class === 'risky').length
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="パスコース候補ネットワーク" style={{ width: '100%', borderRadius: 10 }}>
        <rect x={0} y={0} width={W} height={H} rx={10} fill="#0d1f16" />
        <g stroke="rgba(255,255,255,0.22)" strokeWidth={1} fill="none">
          <rect x={m} y={m} width={fw} height={fh} rx={6} />
          <line x1={W / 2} y1={m} x2={W / 2} y2={H - m} />
          <circle cx={W / 2} cy={H / 2} r={18} />
        </g>

        {/* エッジ */}
        {opts.map((o, i) => {
          const tx = px(o.x)
          const ty = py(o.y)
          const best = i === 0
          return (
            <g key={o.index}>
              <line
                x1={hx} y1={hy} x2={tx} y2={ty}
                stroke={CLASS_COLOR[o.class]}
                strokeWidth={best ? 2.6 : 1.5}
                strokeDasharray={o.class === 'risky' ? '4 4' : undefined}
                opacity={best ? 0.95 : 0.6}
              />
              <circle cx={tx} cy={ty} r={best ? 7 : 5.5} fill={CLASS_COLOR[o.class]} opacity={0.92}
                stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
              {best && (
                <text x={tx} y={ty - 9} textAnchor="middle" fontSize={8} fontWeight={800} fill={CLASS_COLOR[o.class]}>
                  {Math.round(o.success * 100)}%
                </text>
              )}
            </g>
          )
        })}

        {/* 保持者 */}
        <circle cx={hx} cy={hy} r={8} fill="var(--gold)" stroke="#0d1f16" strokeWidth={1.5} />
        <circle cx={hx} cy={hy} r={12} fill="none" stroke="var(--gold)" strokeWidth={1.3} strokeDasharray="3 3" />
      </svg>

      <div className="chart-legend" style={{ gap: 10 }}>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: CLASS_COLOR.safe }} />安全 {counts.safe}
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: CLASS_COLOR.progressive }} />前進 {counts.progressive}
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: CLASS_COLOR.risky }} />リスク {counts.risky}
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--gold)', borderRadius: '50%' }} />保持者
        </span>
      </div>
    </div>
  )
}

export default PassMiniMap

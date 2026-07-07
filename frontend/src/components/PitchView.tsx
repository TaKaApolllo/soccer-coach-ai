import { useState } from 'react'
import {
  FormationPlayer,
  OffsideTeam,
  PassAnalysis,
  SpaceAnalysis,
  TeamFormation
} from '../types'

interface PitchViewProps {
  teams: TeamFormation[]
  ball?: { x: number; y: number } | null
  /** true: 整形済み戦術ボード（チーム1は反転して対面配置） / false: 検出位置そのまま */
  useSnapped?: boolean
  /** ピッチ支配率ヒートマップ + 注目ゾーン（検出位置ビュー用） */
  space?: SpaceAnalysis | null
  /** パスコース分析（検出位置ビュー用） */
  passing?: PassAnalysis | null
  /** オフサイドライン（検出位置ビュー用） */
  offside?: OffsideTeam[] | null
}

const TEAM_COLORS = ['var(--series-1)', 'var(--series-2)']
const PASS_COLORS: Record<string, string> = {
  safe: 'var(--series-2)',
  progressive: 'var(--accent)',
  risky: 'var(--error-color)'
}

/**
 * 2D 戦術ボード。選手配置に加え、ヒートマップ・パスコース・
 * オフサイドラインなどの戦術レイヤーを重ねて描画する。
 */
function PitchView({ teams, ball, useSnapped = true, space, passing, offside }: PitchViewProps) {
  const W = 680
  const H = 440
  const m = 24
  const fw = W - m * 2
  const fh = H - m * 2
  const [hovered, setHovered] = useState<string | null>(null)

  const toXY = (p: FormationPlayer, teamIdx: number): [number, number] => {
    if (useSnapped) {
      // 整形配置: チーム0は左→右、チーム1は反転して対面させる
      const x = teamIdx === 0 ? p.board_x : 1 - p.board_x
      const y = teamIdx === 0 ? p.board_y : 1 - p.board_y
      return [m + x * fw, m + y * fh]
    }
    return [m + p.detected_x * fw, m + p.detected_y * fh]
  }

  const circle = Math.min(fw, fh) * 0.18

  // ヒートマップの色: 正 = チームA支配（青緑系）、負 = チームB支配（赤系）
  const cellColor = (v: number): string | null => {
    if (Math.abs(v) < 0.12) return null
    const alpha = Math.min(0.42, Math.abs(v) * 0.5)
    return v > 0 ? `rgba(28, 174, 119, ${alpha})` : `rgba(230, 103, 103, ${alpha})`
  }

  return (
    <div className="pitch-container">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="戦術ボード">
        <rect x={0} y={0} width={W} height={H} rx={14} fill="#0d1f16" />
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x={m + (fw / 8) * i}
            y={m}
            width={fw / 8}
            height={fh}
            fill={i % 2 === 0 ? 'rgba(57, 229, 140, 0.05)' : 'transparent'}
          />
        ))}

        {/* ヒートマップ（支配率グリッド） */}
        {!useSnapped && space &&
          space.control.map((row, gy) =>
            row.map((v, gx) => {
              const color = cellColor(v)
              if (!color) return null
              return (
                <rect
                  key={`${gx}-${gy}`}
                  x={m + (gx / space.grid_w) * fw}
                  y={m + (gy / space.grid_h) * fh}
                  width={fw / space.grid_w + 0.5}
                  height={fh / space.grid_h + 0.5}
                  fill={color}
                />
              )
            })
          )}

        {/* ピッチライン */}
        <g stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} fill="none">
          <rect x={m} y={m} width={fw} height={fh} />
          <line x1={W / 2} y1={m} x2={W / 2} y2={H - m} />
          <circle cx={W / 2} cy={H / 2} r={circle} />
          <circle cx={W / 2} cy={H / 2} r={2.5} fill="rgba(255,255,255,0.35)" />
          <rect x={m} y={H / 2 - fh * 0.22} width={fw * 0.16} height={fh * 0.44} />
          <rect x={W - m - fw * 0.16} y={H / 2 - fh * 0.22} width={fw * 0.16} height={fh * 0.44} />
          <rect x={m} y={H / 2 - fh * 0.1} width={fw * 0.06} height={fh * 0.2} />
          <rect x={W - m - fw * 0.06} y={H / 2 - fh * 0.1} width={fw * 0.06} height={fh * 0.2} />
        </g>

        {/* オフサイドライン */}
        {!useSnapped && offside?.map((ot) => {
          if (ot.line_x === null || ot.line_x === undefined) return null
          const lx = m + ot.line_x * fw
          const gx = ot.gk_x !== undefined ? m + ot.gk_x * fw : null
          const warn = ot.height_level === 'warning'
          return (
            <g key={ot.team}>
              {/* 裏のスペース（ラインとGKの間）をシェード */}
              {gx !== null && ot.runnable_behind && (
                <rect
                  x={Math.min(lx, gx)}
                  y={m}
                  width={Math.abs(gx - lx)}
                  height={fh}
                  fill="rgba(232, 194, 88, 0.12)"
                />
              )}
              <line
                x1={lx}
                y1={m}
                x2={lx}
                y2={H - m}
                stroke={warn ? 'var(--gold)' : TEAM_COLORS[ot.team % 2]}
                strokeWidth={2}
                strokeDasharray="8 5"
              />
              <text
                x={lx}
                y={m - 6}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={700}
                fill={warn ? 'var(--gold)' : TEAM_COLORS[ot.team % 2]}
              >
                {`オフサイドライン${warn ? ' ⚠' : ''}`}
              </text>
            </g>
          )
        })}

        {/* 注目ゾーン */}
        {!useSnapped && space?.zones.map((z, i) => (
          <g key={i}>
            <circle
              cx={m + z.x * fw}
              cy={m + z.y * fh}
              r={16}
              fill="none"
              stroke={z.type === 'danger' ? 'var(--error-color)' : 'var(--accent)'}
              strokeWidth={1.8}
              strokeDasharray="4 3"
            />
            <text
              x={m + z.x * fw}
              y={m + z.y * fh + 3.5}
              textAnchor="middle"
              fontSize={11}
              fontWeight={800}
              fill={z.type === 'danger' ? 'var(--error-color)' : 'var(--accent)'}
            >
              {z.type === 'danger' ? '!' : '↗'}
            </text>
          </g>
        ))}

        {/* パスコース */}
        {!useSnapped && passing && passing.options.slice(0, 6).map((o, i) => {
          const hx = m + passing.holder.x * fw
          const hy = m + passing.holder.y * fh
          const tx = m + o.x * fw
          const ty = m + o.y * fh
          const best = i === 0
          return (
            <g key={o.index}>
              <line
                x1={hx}
                y1={hy}
                x2={tx}
                y2={ty}
                stroke={PASS_COLORS[o.class]}
                strokeWidth={best ? 3 : 1.6}
                strokeDasharray={o.class === 'risky' ? '4 4' : best ? undefined : '8 4'}
                opacity={best ? 0.95 : 0.65}
              />
              <text
                x={(hx + tx) / 2}
                y={(hy + ty) / 2 - 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={PASS_COLORS[o.class]}
              >
                {Math.round(o.success * 100)}%
              </text>
            </g>
          )
        })}

        {/* 選手 */}
        {teams.map((team, ti) =>
          team.players.map((p, pi) => {
            const [x, y] = toXY(p, ti)
            const id = `${ti}-${p.index}`
            const isHolder =
              !useSnapped && passing != null &&
              passing.holder.team === ti &&
              Math.abs(p.detected_x - passing.holder.x) < 0.01 &&
              Math.abs(p.detected_y - passing.holder.y) < 0.01
            return (
              <g
                key={id}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={x} cy={y} r={18} fill="transparent" />
                {isHolder && (
                  <circle cx={x} cy={y} r={15} fill="none" stroke="var(--gold)" strokeWidth={2} strokeDasharray="3 3" />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={hovered === id ? 12 : 10}
                  fill={TEAM_COLORS[ti % 2]}
                  stroke={p.is_goalkeeper ? 'var(--gold)' : 'rgba(255,255,255,0.7)'}
                  strokeWidth={p.is_goalkeeper ? 2.5 : 1.5}
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontWeight={800}
                  fill="#fff"
                >
                  {p.is_goalkeeper ? 'GK' : pi + 1}
                </text>
                {hovered === id && (
                  <text
                    x={x}
                    y={y - 18}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="var(--text-primary)"
                  >
                    {team.name} / {p.role}
                  </text>
                )}
              </g>
            )
          })
        )}

        {/* ボール */}
        {ball && (
          <g>
            <circle cx={m + ball.x * fw} cy={m + ball.y * fh} r={6} fill="#fff" stroke="#0d1f16" strokeWidth={1.5} />
            <circle cx={m + ball.x * fw} cy={m + ball.y * fh} r={9} fill="none" stroke="var(--gold)" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      <div className="chart-legend">
        {teams.map((team, ti) => (
          <span key={ti} className="legend-item">
            <span className="legend-swatch" style={{ background: TEAM_COLORS[ti % 2], borderRadius: '50%' }} />
            {team.name}（{team.formation}）
          </span>
        ))}
        {ball && (
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#fff', borderRadius: '50%' }} />
            ボール
          </span>
        )}
        {!useSnapped && space && (
          <>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: 'rgba(28,174,119,0.5)' }} />
              {teams[0]?.name ?? 'チームA'}が支配
            </span>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: 'rgba(230,103,103,0.5)' }} />
              {teams[1]?.name ?? 'チームB'}が支配
            </span>
          </>
        )}
        {!useSnapped && passing && (
          <>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: PASS_COLORS.progressive }} />
              前進パス
            </span>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: PASS_COLORS.safe }} />
              安全なパス
            </span>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: PASS_COLORS.risky }} />
              危険なパス
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default PitchView

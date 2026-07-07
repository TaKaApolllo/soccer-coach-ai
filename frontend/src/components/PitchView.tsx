import { useState } from 'react'
import { FormationPlayer, TeamFormation } from '../types'

interface PitchViewProps {
  teams: TeamFormation[]
  ball?: { x: number; y: number } | null
  useSnapped?: boolean
}

const TEAM_COLORS = ['var(--series-1)', 'var(--series-2)']

/**
 * 2D 戦術ボード。検出された選手をコート上に配置する。
 * チーム 0 は左→右、チーム 1 は右→左に攻めるものとして描画。
 */
function PitchView({ teams, ball, useSnapped = true }: PitchViewProps) {
  const W = 680
  const H = 440
  const m = 24 // マージン
  const fw = W - m * 2
  const fh = H - m * 2
  const [hovered, setHovered] = useState<string | null>(null)

  // 正規化座標 (0-1, 自陣→敵陣) をピッチ描画座標へ
  const toXY = (p: FormationPlayer, teamIdx: number): [number, number] => {
    const px = useSnapped ? p.board_x : p.detected_x
    const py = useSnapped ? p.board_y : p.detected_y
    // チーム 1 は反対側から攻める
    const x = teamIdx === 0 ? px : 1 - px
    const y = teamIdx === 0 ? py : 1 - py
    return [m + x * fw, m + y * fh]
  }

  const circle = Math.min(fw, fh) * 0.18

  return (
    <div className="pitch-container">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="戦術ボード">
        {/* ピッチ背景 */}
        <rect x={0} y={0} width={W} height={H} rx={14} fill="#0d1f16" />
        {/* 芝の縞 */}
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

        {/* ピッチライン */}
        <g stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} fill="none">
          <rect x={m} y={m} width={fw} height={fh} />
          <line x1={W / 2} y1={m} x2={W / 2} y2={H - m} />
          <circle cx={W / 2} cy={H / 2} r={circle} />
          <circle cx={W / 2} cy={H / 2} r={2.5} fill="rgba(255,255,255,0.35)" />
          {/* ペナルティエリア */}
          <rect x={m} y={H / 2 - fh * 0.22} width={fw * 0.16} height={fh * 0.44} />
          <rect x={W - m - fw * 0.16} y={H / 2 - fh * 0.22} width={fw * 0.16} height={fh * 0.44} />
          {/* ゴールエリア */}
          <rect x={m} y={H / 2 - fh * 0.1} width={fw * 0.06} height={fh * 0.2} />
          <rect x={W - m - fw * 0.06} y={H / 2 - fh * 0.1} width={fw * 0.06} height={fh * 0.2} />
        </g>

        {/* 選手 */}
        {teams.map((team, ti) =>
          team.players.map((p, pi) => {
            const [x, y] = toXY(p, ti)
            const id = `${ti}-${p.index}`
            const color = team.jersey_color && !useSnapped ? team.jersey_color : TEAM_COLORS[ti % 2]
            return (
              <g
                key={id}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* ホバー用の大きめヒットエリア */}
                <circle cx={x} cy={y} r={18} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={hovered === id ? 12 : 10}
                  fill={color}
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
      </div>
    </div>
  )
}

export default PitchView

import { useEffect, useState } from 'react'
import {
  FormationPlayer,
  OffsideTeam,
  PassAnalysis,
  SpaceAnalysis,
  TeamFormation
} from '../types'
import ThermalField from './ThermalField'

export type PitchLayer = 'board' | 'metrics' | 'detected' | 'space' | 'pass' | 'offside'

interface PitchViewProps {
  teams: TeamFormation[]
  ball?: { x: number; y: number } | null
  /** 表示レイヤー。board/metrics は整形配置（ネットワーク）、他は検出位置ベース */
  layer?: PitchLayer
  /** ピッチ支配率ヒートマップ + 注目ゾーン */
  space?: SpaceAnalysis | null
  /** パスコース分析 */
  passing?: PassAnalysis | null
  /** オフサイドライン */
  offside?: OffsideTeam[] | null
  /** ピッチ実寸（m）。距離換算に使用 */
  pitch?: { length: number; width: number }
}

const TEAM_COLORS = ['var(--series-1)', 'var(--series-2)']
const TEAM_HEX = ['#1cae77', '#3987e5']
const PASS_COLORS: Record<string, string> = {
  safe: 'var(--series-2)',
  progressive: 'var(--accent)',
  risky: 'var(--error-color)'
}

/** 800px 以下かどうか（縦型ピッチ切替に使用） */
function useIsNarrow(maxWidth = 800): boolean {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= maxWidth : false
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])
  return narrow
}

interface Node {
  id: string
  x: number
  y: number
  nx: number
  ny: number
  player: FormationPlayer
  teamIdx: number
}

/**
 * 2D 戦術ボード。整形配置ではチームごとの選手コネクションネットワークを、
 * 検出位置ではヒートマップ・パスコース・オフサイドライン等の戦術レイヤーを描画する。
 * 縦長画面では座標系を 90 度回転した縦型ピッチで描画する（ラベルは正立）。
 */
function PitchView({ teams, ball, layer = 'board', space, passing, offside, pitch }: PitchViewProps) {
  const vertical = useIsNarrow(800)
  const useSnapped = layer === 'board' || layer === 'metrics'
  const showNetwork = useSnapped
  const showMetrics = layer === 'metrics'
  const showThermal = layer === 'space'

  const [hovered, setHovered] = useState<string | null>(null)
  const [teamFilter, setTeamFilter] = useState<'all' | 0 | 1>('all')

  const pitchL = pitch?.length ?? 105
  const pitchW = pitch?.width ?? 68

  // ビューポート（横向き=ランドスケープ / 縦向き=ポートレート）
  const W = vertical ? 440 : 680
  const H = vertical ? 660 : 440
  const m = 22
  const fw = W - m * 2
  const fh = H - m * 2

  // 正規化ピッチ座標 (nx=深さ/長辺, ny=幅) → 画面座標
  const project = (nx: number, ny: number): [number, number] => {
    if (vertical) return [m + ny * fw, m + nx * fh]
    return [m + nx * fw, m + ny * fh]
  }

  const toNorm = (p: FormationPlayer, teamIdx: number): [number, number] => {
    if (useSnapped) {
      const x = teamIdx === 0 ? p.board_x : 1 - p.board_x
      const y = teamIdx === 0 ? p.board_y : 1 - p.board_y
      return [x, y]
    }
    return [p.detected_x, p.detected_y]
  }

  const circleR = Math.min(fw, fh) * 0.13

  const rectFromNorm = (nx0: number, ny0: number, nx1: number, ny1: number) => {
    const [ax, ay] = project(nx0, ny0)
    const [bx, by] = project(nx1, ny1)
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
  }

  const jerseyOf = (p: FormationPlayer, fallback: number) =>
    p.jersey_number && p.jersey_number > 0 ? p.jersey_number : fallback

  // --- ノードとコネクション（整形配置ネットワーク用） ---
  const teamNodes: Node[][] = teams.map((team, ti) =>
    team.players.map((p) => {
      const [nx, ny] = toNorm(p, ti)
      const [sx, sy] = project(nx, ny)
      return { id: `${ti}-${p.index}`, x: sx, y: sy, nx, ny, player: p, teamIdx: ti }
    })
  )

  interface Link {
    a: Node
    b: Node
    teamIdx: number
    distM: number
  }

  const buildLinks = (nodes: Node[], teamIdx: number): Link[] => {
    const out = nodes.filter((n) => !n.player.is_goalkeeper)
    // board_x（深さ）でライン分割
    const lineMap = new Map<string, Node[]>()
    out.forEach((n) => {
      const key = n.player.board_x.toFixed(2)
      const arr = lineMap.get(key) ?? []
      arr.push(n)
      lineMap.set(key, arr)
    })
    const lines = [...lineMap.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, arr]) => arr.sort((p, q) => p.player.board_y - q.player.board_y))

    const seen = new Set<string>()
    const links: Link[] = []
    const distMeters = (a: Node, b: Node) => {
      const dx = (a.player.board_x - b.player.board_x) * pitchL
      const dy = (a.player.board_y - b.player.board_y) * pitchW
      return Math.hypot(dx, dy)
    }
    const push = (a: Node, b: Node) => {
      const key = a.player.index < b.player.index
        ? `${a.player.index}-${b.player.index}`
        : `${b.player.index}-${a.player.index}`
      if (seen.has(key)) return
      seen.add(key)
      links.push({ a, b, teamIdx, distM: distMeters(a, b) })
    }
    // ライン内の隣接接続
    lines.forEach((line) => {
      for (let i = 0; i < line.length - 1; i++) push(line[i], line[i + 1])
    })
    // 隣接ライン間の最近傍接続（両方向）
    const nearest = (n: Node, others: Node[]) =>
      others.reduce((best, o) =>
        Math.abs(o.player.board_y - n.player.board_y) < Math.abs(best.player.board_y - n.player.board_y) ? o : best
      )
    for (let li = 0; li < lines.length - 1; li++) {
      const cur = lines[li]
      const nxt = lines[li + 1]
      if (!cur.length || !nxt.length) continue
      cur.forEach((n) => push(n, nearest(n, nxt)))
      nxt.forEach((n) => push(n, nearest(n, cur)))
    }
    return links
  }

  const teamLinks: Link[][] = teamNodes.map((nodes, ti) => (showNetwork ? buildLinks(nodes, ti) : []))

  const visibleTeam = (ti: number) => teamFilter === 'all' || teamFilter === ti

  // --- パス角度扇形（metrics レイヤー・保持者からの方向分布） ---
  const passFan = (() => {
    if (!showMetrics || !passing || !passing.options.length) return null
    const [hx, hy] = project(passing.holder.x, passing.holder.y)
    const angles = passing.options.slice(0, 6).map((o) => {
      const [ox, oy] = project(o.x, o.y)
      return Math.atan2(oy - hy, ox - hx)
    })
    return { hx, hy, angles }
  })()

  return (
    <div className="pitch-container">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="戦術ボード">
        <rect x={0} y={0} width={W} height={H} rx={14} fill="#0d1f16" />

        {/* サーマル（スペース）レイヤー */}
        {showThermal && space && (
          <ThermalField
            control={space.control}
            gridW={space.grid_w}
            gridH={space.grid_h}
            project={project}
            blur={Math.max(fw, fh) / space.grid_w * 0.9}
            teamAColor={TEAM_HEX[0]}
            teamBColor={TEAM_HEX[1]}
            idPrefix="pitch-thermal"
          />
        )}

        {/* ピッチライン */}
        <g stroke="rgba(255,255,255,0.32)" strokeWidth={1.4} fill="none">
          {(() => {
            const b = rectFromNorm(0, 0, 1, 1)
            const pa = rectFromNorm(0, 0.28, 0.16, 0.72)
            const pb = rectFromNorm(0.84, 0.28, 1, 0.72)
            const ga = rectFromNorm(0, 0.4, 0.06, 0.6)
            const gb = rectFromNorm(0.94, 0.4, 1, 0.6)
            const [h0x, h0y] = project(0.5, 0)
            const [h1x, h1y] = project(0.5, 1)
            const [cx, cy] = project(0.5, 0.5)
            return (
              <>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} />
                <line x1={h0x} y1={h0y} x2={h1x} y2={h1y} />
                <circle cx={cx} cy={cy} r={circleR} />
                <circle cx={cx} cy={cy} r={2.5} fill="rgba(255,255,255,0.35)" />
                <rect x={pa.x} y={pa.y} width={pa.w} height={pa.h} />
                <rect x={pb.x} y={pb.y} width={pb.w} height={pb.h} />
                <rect x={ga.x} y={ga.y} width={ga.w} height={ga.h} />
                <rect x={gb.x} y={gb.y} width={gb.w} height={gb.h} />
              </>
            )
          })()}
        </g>

        {/* オフサイドライン */}
        {layer === 'offside' && offside?.map((ot) => {
          if (ot.line_x === null || ot.line_x === undefined) return null
          const [lx, ly0] = project(ot.line_x, 0)
          const [, ly1] = project(ot.line_x, 1)
          const [lx2] = project(ot.line_x, 1)
          const warn = ot.height_level === 'warning'
          const gx = ot.gk_x !== undefined ? project(ot.gk_x, 0)[vertical ? 1 : 0] : null
          const lineCoord = vertical ? ly0 : lx
          return (
            <g key={ot.team}>
              {gx !== null && ot.runnable_behind && (
                vertical ? (
                  <rect x={m} y={Math.min(lineCoord, gx)} width={fw} height={Math.abs(gx - lineCoord)} fill="rgba(232, 194, 88, 0.12)" />
                ) : (
                  <rect x={Math.min(lineCoord, gx)} y={m} width={Math.abs(gx - lineCoord)} height={fh} fill="rgba(232, 194, 88, 0.12)" />
                )
              )}
              <line
                x1={lx} y1={ly0} x2={lx2} y2={ly1}
                stroke={warn ? 'var(--gold)' : TEAM_COLORS[ot.team % 2]}
                strokeWidth={2}
                strokeDasharray="8 5"
              />
              <text
                x={vertical ? W - m + 2 : lx}
                y={vertical ? ly0 + 3 : m - 6}
                textAnchor={vertical ? 'end' : 'middle'}
                fontSize={9}
                fontWeight={700}
                fill={warn ? 'var(--gold)' : TEAM_COLORS[ot.team % 2]}
              >
                {`オフサイド${warn ? ' ⚠' : ''}`}
              </text>
            </g>
          )
        })}

        {/* 注目ゾーン（スペース） */}
        {showThermal && space?.zones.map((z, i) => {
          const [zx, zy] = project(z.x, z.y)
          return (
            <g key={i}>
              <circle cx={zx} cy={zy} r={15} fill="none"
                stroke={z.type === 'danger' ? 'var(--error-color)' : 'var(--accent)'}
                strokeWidth={1.8} strokeDasharray="4 3" />
              <text x={zx} y={zy + 3.5} textAnchor="middle" fontSize={11} fontWeight={800}
                fill={z.type === 'danger' ? 'var(--error-color)' : 'var(--accent)'}>
                {z.type === 'danger' ? '!' : '↗'}
              </text>
            </g>
          )
        })}

        {/* パス角度扇形（metrics レイヤー） */}
        {passFan && (
          <g>
            {(() => {
              const R = Math.min(fw, fh) * 0.42
              const min = Math.min(...passFan.angles)
              const max = Math.max(...passFan.angles)
              const p0 = [passFan.hx + Math.cos(min) * R, passFan.hy + Math.sin(min) * R]
              const p1 = [passFan.hx + Math.cos(max) * R, passFan.hy + Math.sin(max) * R]
              const large = max - min > Math.PI ? 1 : 0
              return (
                <>
                  <path
                    d={`M ${passFan.hx} ${passFan.hy} L ${p0[0]} ${p0[1]} A ${R} ${R} 0 ${large} 1 ${p1[0]} ${p1[1]} Z`}
                    fill="var(--gold)"
                    opacity={0.1}
                  />
                  {passFan.angles.map((a, i) => (
                    <line key={i} x1={passFan.hx} y1={passFan.hy}
                      x2={passFan.hx + Math.cos(a) * R} y2={passFan.hy + Math.sin(a) * R}
                      stroke="var(--gold)" strokeWidth={1} opacity={0.28} strokeDasharray="3 4" />
                  ))}
                </>
              )
            })()}
          </g>
        )}

        {/* パスコース（pass レイヤー） */}
        {layer === 'pass' && passing && passing.options.slice(0, 6).map((o, i) => {
          const [hx, hy] = project(passing.holder.x, passing.holder.y)
          const [tx, ty] = project(o.x, o.y)
          const best = i === 0
          return (
            <g key={o.index}>
              <line x1={hx} y1={hy} x2={tx} y2={ty}
                stroke={PASS_COLORS[o.class]} strokeWidth={best ? 3 : 1.6}
                strokeDasharray={o.class === 'risky' ? '4 4' : best ? undefined : '8 4'}
                opacity={best ? 0.95 : 0.65} />
              <text x={(hx + tx) / 2} y={(hy + ty) / 2 - 4} textAnchor="middle"
                fontSize={9} fontWeight={700} fill={PASS_COLORS[o.class]}>
                {Math.round(o.success * 100)}%
              </text>
            </g>
          )
        })}

        {/* コネクションネットワーク（整形配置 / 角度・距離レイヤー） */}
        {showNetwork && teamLinks.map((links, ti) =>
          visibleTeam(ti) && links.map((lk, i) => (
            <g key={`${ti}-lk-${i}`}>
              <line
                x1={lk.a.x} y1={lk.a.y} x2={lk.b.x} y2={lk.b.y}
                stroke={TEAM_COLORS[ti % 2]}
                strokeWidth={1.4}
                strokeLinecap="round"
                opacity={0.55}
                style={{ filter: `drop-shadow(0 0 3px ${TEAM_HEX[ti % 2]})` }}
              />
              {showMetrics && (
                <text
                  x={(lk.a.x + lk.b.x) / 2}
                  y={(lk.a.y + lk.b.y) / 2 - 2}
                  textAnchor="middle"
                  fontSize={7.5}
                  fontWeight={700}
                  fill="rgba(255,255,255,0.82)"
                >
                  {lk.distM.toFixed(0)}m
                </text>
              )}
            </g>
          ))
        )}

        {/* 選手ノード */}
        {teamNodes.map((nodes, ti) =>
          visibleTeam(ti) && nodes.map((n, pi) => {
            const p = n.player
            const num = jerseyOf(p, pi + 1)
            const isHolder =
              layer === 'pass' && passing != null &&
              passing.holder.team === ti &&
              Math.abs(p.detected_x - passing.holder.x) < 0.01 &&
              Math.abs(p.detected_y - passing.holder.y) < 0.01
            const r = hovered === n.id ? 14 : 12
            return (
              <g key={n.id}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}>
                <circle cx={n.x} cy={n.y} r={20} fill="transparent" />
                {isHolder && (
                  <circle cx={n.x} cy={n.y} r={r + 4} fill="none" stroke="var(--gold)" strokeWidth={2} strokeDasharray="3 3" />
                )}
                <circle
                  cx={n.x} cy={n.y} r={r}
                  fill={TEAM_COLORS[ti % 2]}
                  stroke={p.is_goalkeeper ? 'var(--gold)' : 'rgba(255,255,255,0.8)'}
                  strokeWidth={p.is_goalkeeper ? 2.5 : 1.5}
                />
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={showNetwork ? 11 : 9} fontWeight={800} fill="#fff">
                  {p.is_goalkeeper ? (num || 'GK') : num}
                </text>
                {showNetwork && (
                  <text x={n.x} y={n.y + r + 8} textAnchor="middle"
                    fontSize={7} fontWeight={700} fill="rgba(255,255,255,0.7)">
                    {p.role}
                  </text>
                )}
                {hovered === n.id && (
                  <text x={n.x} y={n.y - r - 6} textAnchor="middle"
                    fontSize={10} fontWeight={700} fill="var(--text-primary)">
                    {teams[ti].name} / {p.role}
                  </text>
                )}
              </g>
            )
          })
        )}

        {/* ボール */}
        {ball && (() => {
          const [bx, by] = project(ball.x, ball.y)
          return (
            <g>
              <circle cx={bx} cy={by} r={6} fill="#fff" stroke="#0d1f16" strokeWidth={1.5} />
              <circle cx={bx} cy={by} r={9} fill="none" stroke="var(--gold)" strokeWidth={1.5} />
            </g>
          )
        })()}
      </svg>

      {/* チーム表示トグル（ネットワーク時） */}
      {showNetwork && (
        <div className="view-toggle pitch-team-toggle" role="tablist" aria-label="チーム表示">
          <button className={teamFilter === 'all' ? 'active' : ''} onClick={() => setTeamFilter('all')}>両チーム</button>
          <button className={teamFilter === 0 ? 'active' : ''} onClick={() => setTeamFilter(0)}>{teams[0]?.name ?? 'チームA'}</button>
          <button className={teamFilter === 1 ? 'active' : ''} onClick={() => setTeamFilter(1)}>{teams[1]?.name ?? 'チームB'}</button>
        </div>
      )}

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
        {showMetrics && (
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: 'var(--gold)' }} />
            選手間距離・パス角度
          </span>
        )}
        {showThermal && space && (
          <>
            <span className="legend-item thermal-legend">
              <span className="thermal-bar" />
              密度 低→高
            </span>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: TEAM_HEX[0] }} />
              {teams[0]?.name ?? 'チームA'}支配
            </span>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: TEAM_HEX[1] }} />
              {teams[1]?.name ?? 'チームB'}支配
            </span>
          </>
        )}
        {layer === 'pass' && passing && (
          <>
            <span className="legend-item"><span className="legend-swatch" style={{ background: PASS_COLORS.progressive }} />前進パス</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: PASS_COLORS.safe }} />安全なパス</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: PASS_COLORS.risky }} />危険なパス</span>
          </>
        )}
      </div>
    </div>
  )
}

export default PitchView

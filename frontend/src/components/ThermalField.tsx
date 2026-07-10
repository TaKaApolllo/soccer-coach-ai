/**
 * サーマル（熱分布）ヒートマップの共有描画。
 * control グリッド（-1〜1）の絶対値を「密度」として青→シアン→緑→黄→赤の
 * 多段グラデーションで表現し、feGaussianBlur で滑らかな熱分布に見せる。
 * 正負（どちらのチームが支配するセルか）は薄いチーム色のティントを重ねて区別する。
 */

interface ThermalFieldProps {
  control: number[][]
  gridW: number
  gridH: number
  /** 正規化ピッチ座標 (0-1, 0-1) → 画面座標 [x, y] */
  project: (nx: number, ny: number) => [number, number]
  /** ガウスぼかしの stdDeviation（画面 px 目安） */
  blur: number
  teamAColor: string
  teamBColor: string
  /** filter / id 衝突回避用の接頭辞（インスタンスごとに一意にする） */
  idPrefix: string
  /** この値未満のセルは描画しない（背景を見せる） */
  threshold?: number
}

const THERMAL_STOPS: [number, [number, number, number]][] = [
  [0.0, [30, 58, 138]], // 青
  [0.25, [6, 182, 212]], // シアン
  [0.5, [34, 197, 94]], // 緑
  [0.75, [234, 179, 8]], // 黄
  [1.0, [239, 68, 68]] // 赤
]

/** 密度 t(0-1) を青→シアン→緑→黄→赤の多段グラデーションへ変換 */
export function thermalColor(t: number): string {
  const v = Math.max(0, Math.min(1, t))
  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const [t0, c0] = THERMAL_STOPS[i]
    const [t1, c1] = THERMAL_STOPS[i + 1]
    if (v <= t1) {
      const f = t1 === t0 ? 0 : (v - t0) / (t1 - t0)
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f)
      return `rgb(${r}, ${g}, ${b})`
    }
  }
  return 'rgb(239, 68, 68)'
}

/** セル (gx,gy) を投影して画面上の矩形 [x,y,w,h] を得る（縦横どちらの向きでも可） */
function cellRect(
  gx: number,
  gy: number,
  gridW: number,
  gridH: number,
  project: (nx: number, ny: number) => [number, number]
): [number, number, number, number] {
  const [ax, ay] = project(gx / gridW, gy / gridH)
  const [bx, by] = project((gx + 1) / gridW, (gy + 1) / gridH)
  const x = Math.min(ax, bx)
  const y = Math.min(ay, by)
  return [x, y, Math.abs(bx - ax), Math.abs(by - ay)]
}

function ThermalField({
  control,
  gridW,
  gridH,
  project,
  blur,
  teamAColor,
  teamBColor,
  idPrefix,
  threshold = 0.12
}: ThermalFieldProps) {
  const blurId = `${idPrefix}-blur`
  const tintId = `${idPrefix}-tint`

  const cells: { key: string; rect: [number, number, number, number]; mag: number; sign: number }[] = []
  control.forEach((row, gy) =>
    row.forEach((v, gx) => {
      const mag = Math.abs(v)
      if (mag < threshold) return
      cells.push({
        key: `${gx}-${gy}`,
        rect: cellRect(gx, gy, gridW, gridH, project),
        mag,
        sign: v > 0 ? 1 : -1
      })
    })
  )

  return (
    <g>
      <defs>
        <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
        <filter id={tintId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={blur * 0.85} />
        </filter>
      </defs>

      {/* 熱分布本体（密度＝|v| を多段グラデで表現） */}
      <g filter={`url(#${blurId})`}>
        {cells.map((c) => (
          <rect
            key={`m-${c.key}`}
            x={c.rect[0] - 1}
            y={c.rect[1] - 1}
            width={c.rect[2] + 2}
            height={c.rect[3] + 2}
            fill={thermalColor(c.mag)}
            opacity={Math.min(0.85, 0.25 + c.mag * 0.75)}
          />
        ))}
      </g>

      {/* 支配チームのティント（正=チームA / 負=チームB） */}
      <g filter={`url(#${tintId})`} opacity={0.32} style={{ mixBlendMode: 'overlay' }}>
        {cells.map((c) => (
          <rect
            key={`t-${c.key}`}
            x={c.rect[0] - 1}
            y={c.rect[1] - 1}
            width={c.rect[2] + 2}
            height={c.rect[3] + 2}
            fill={c.sign > 0 ? teamAColor : teamBColor}
            opacity={Math.min(0.9, c.mag)}
          />
        ))}
      </g>
    </g>
  )
}

export default ThermalField

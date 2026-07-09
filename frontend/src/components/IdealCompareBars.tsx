import { KeyAngle } from '../types'

interface IdealCompareBarsProps {
  angles: KeyAngle[]
}

/**
 * 理想フォームとの比較: 角度項目ごとに理想値と自分の値を
 * 水平バーで並べて表示する。バー長は理想値に対する比率。
 */
function IdealCompareBars({ angles }: IdealCompareBarsProps) {
  if (angles.length === 0) {
    return <p className="note-text">角度データがありません</p>
  }

  // バー長: 理想値を 78% とし、自分の値を比率でスケール（最大100%）
  const widthFor = (value: number, ideal: number) =>
    Math.min(100, Math.max(6, (value / Math.max(1, ideal)) * 78))

  const closeness = (value: number, ideal: number) =>
    Math.abs(value - ideal) <= Math.max(4, ideal * 0.08)

  return (
    <div className="ideal-compare">
      <div className="chart-legend" style={{ marginTop: 0, marginBottom: 10 }}>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)' }} />
          理想フォーム
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--series-1)' }} />
          あなたのフォーム
        </span>
      </div>

      {angles.map((a) => (
        <div key={a.key} className="ic-row">
          <div className="ic-label">{a.label.replace(/（.*）/, '')}</div>
          <div className="ic-bars">
            <div className="ic-bar-line">
              <span className="ic-value muted">{a.ideal}°</span>
              <div className="ic-bar ideal" style={{ width: '78%' }} />
            </div>
            <div className="ic-bar-line">
              <span className={`ic-value ${closeness(a.value, a.ideal) ? 'accent-text' : 'warn-text'}`}>
                {Math.round(a.value)}°
              </span>
              <div
                className={`ic-bar ${closeness(a.value, a.ideal) ? 'mine' : 'mine off'}`}
                style={{ width: `${widthFor(a.value, a.ideal)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default IdealCompareBars

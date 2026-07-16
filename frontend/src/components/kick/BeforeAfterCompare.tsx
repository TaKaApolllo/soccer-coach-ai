import { PoseLandmark } from '../../types'
import { KickMetric } from '../../types/kickAnalysis'
import { IDEAL_LANDMARKS } from '../../constants/idealForm'
import AvatarViewer from '../analysis/AvatarViewer'
import { Card, TONE_COLOR } from '../analysis/ui'
import { toneFromMetricStatus } from '../../pages/kick/viewModel'

// =====================================================================
// Before / After 比較（旧 FormAnalysisPage の ComparisonView を再実装）
//
// 差分表の「理想」は KickMetric.idealRange（単一ソース constants/idealForm
// 由来。TODO: API 契約 v1.1 で配布されたら API 値へ置換）のみを使用する。
// 旧実装の frontend 固定 IDEAL_ANGLES は参照しない。
// =====================================================================

interface BeforeAfterCompareProps {
  currentLandmarks: PoseLandmark[]
  overallScore: number | null
  metrics: KickMetric[]
}

/** レンジ外のときだけ差分（レンジ境界までの距離）を返す */
function rangeDelta(m: KickMetric): number | null {
  if (m.value === null || !m.idealRange) return null
  if (m.value < m.idealRange.min) return m.value - m.idealRange.min
  if (m.value > m.idealRange.max) return m.value - m.idealRange.max
  return 0
}

function BeforeAfterCompare({ currentLandmarks, overallScore, metrics }: BeforeAfterCompareProps) {
  const rows = metrics.filter((m) => m.unit === 'deg' && m.idealRange)

  return (
    <Card title="Before / After 比較">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <figure className="m-0 rounded-2xl p-2" style={{ background: 'rgba(2,6,17,0.45)', border: '1px solid rgba(148,163,184,0.14)' }}>
          <div style={{ height: 260 }}>
            <AvatarViewer landmarks={currentLandmarks} showGhost={false} />
          </div>
          <figcaption className="mt-2 text-center text-xs font-bold text-slate-200">
            自分のフォーム
            <span className="ml-2 text-lg font-black tabular-nums" style={{ color: '#39ff88' }}>
              {overallScore ?? '--'}
            </span>
            <span className="text-[10px] text-slate-500"> /100</span>
          </figcaption>
        </figure>
        <figure className="m-0 rounded-2xl p-2" style={{ background: 'rgba(2,6,17,0.45)', border: '1px solid rgba(148,163,184,0.14)' }}>
          <div style={{ height: 260 }}>
            <AvatarViewer landmarks={IDEAL_LANDMARKS} showGhost={false} />
          </div>
          <figcaption className="mt-2 text-center text-xs font-bold text-slate-200">
            理想フォーム
            <span className="ml-2 text-[10px] font-semibold text-slate-500">（基準モデル）</span>
          </figcaption>
        </figure>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="border-b py-2 pr-3 font-semibold" style={{ borderColor: 'rgba(148,163,184,0.14)' }}>項目</th>
              <th className="border-b px-3 py-2 text-right font-semibold" style={{ borderColor: 'rgba(148,163,184,0.14)' }}>自分</th>
              <th className="border-b px-3 py-2 text-right font-semibold" style={{ borderColor: 'rgba(148,163,184,0.14)' }}>理想レンジ</th>
              <th className="border-b py-2 pl-3 text-right font-semibold" style={{ borderColor: 'rgba(148,163,184,0.14)' }}>差分</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const delta = rangeDelta(m)
              const tone = toneFromMetricStatus(m.status)
              return (
                <tr key={m.id}>
                  <td className="border-b py-2 pr-3 text-slate-200" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    {m.label}
                  </td>
                  <td className="border-b px-3 py-2 text-right font-bold tabular-nums text-slate-100" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    {m.value === null ? '計測不可' : `${Math.round(m.value)}°`}
                  </td>
                  <td className="border-b px-3 py-2 text-right tabular-nums text-slate-400" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    {m.idealRange ? `${m.idealRange.min}–${m.idealRange.max}°` : '-'}
                  </td>
                  <td
                    className="border-b py-2 pl-3 text-right font-black tabular-nums"
                    style={{ borderColor: 'rgba(148,163,184,0.08)', color: TONE_COLOR[tone] }}
                  >
                    {delta === null ? '-' : delta === 0 ? '✓ 理想内' : `${delta > 0 ? '+' : ''}${Math.round(delta)}°`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default BeforeAfterCompare

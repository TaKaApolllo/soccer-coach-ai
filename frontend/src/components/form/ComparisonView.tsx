import { BodyPartScores, PoseLandmark } from '../../types'
import { IDEAL_ANGLES } from '../../mocks/formAnalysisMock'
import AvatarViewer from './AvatarViewer'

interface ComparisonViewProps {
  currentLandmarks?: PoseLandmark[] | null
  bodyPartScores: BodyPartScores
  overallScore?: number
  idealScore?: number
}

function diffColor(absDiff: number): string {
  if (absDiff <= 6) return '#34d399'
  if (absDiff <= 15) return '#fbbf24'
  return '#f87171'
}

/**
 * Before/After（現在フォーム vs 理想フォーム）の並び比較 + 関節角度の差分テーブル。
 */
function ComparisonView({ currentLandmarks, bodyPartScores, overallScore, idealScore = 92 }: ComparisonViewProps) {
  const rows = Object.values(bodyPartScores)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .flatMap((part) =>
      Object.entries(part.angles).map(([key, value]) => {
        const ref = IDEAL_ANGLES[key]
        const ideal = ref?.ideal ?? value
        const diff = value - ideal
        return {
          key: `${part.label}-${key}`,
          part: part.label,
          label: ref?.label ?? key,
          mine: value,
          ideal,
          diff
        }
      })
    )

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-6">
      <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
        <span aria-hidden>⚖️</span> Before / After 比較
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl bg-black/25 border border-white/10 p-4">
          <AvatarViewer landmarks={currentLandmarks} title="自分のフォーム" hideToggle forceView="current" />
          <div className="mt-3 text-center">
            <span className="text-3xl font-extrabold text-white">{overallScore ?? '-'}</span>
            <span className="text-white/50 text-sm"> / 100</span>
          </div>
        </div>
        <div className="rounded-2xl bg-black/25 border border-white/10 p-4">
          <AvatarViewer landmarks={currentLandmarks} title="理想フォーム" hideToggle forceView="ideal" />
          <div className="mt-3 text-center">
            <span className="text-3xl font-extrabold text-emerald-300">{idealScore}</span>
            <span className="text-white/50 text-sm"> / 100</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[420px]">
          <thead>
            <tr className="text-white/50 text-left border-b border-white/10">
              <th className="py-2 pr-3 font-semibold">項目</th>
              <th className="py-2 px-3 font-semibold text-right">自分</th>
              <th className="py-2 px-3 font-semibold text-right">理想</th>
              <th className="py-2 pl-3 font-semibold text-right">差分</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const color = diffColor(Math.abs(row.diff))
              return (
                <tr key={row.key} className="border-b border-white/5">
                  <td className="py-2.5 pr-3 text-white/85">
                    {row.label}
                    <span className="text-white/40 text-xs ml-1">({row.part})</span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-white font-semibold">{Math.round(row.mine)}°</td>
                  <td className="py-2.5 px-3 text-right text-white/60">{Math.round(row.ideal)}°</td>
                  <td className="py-2.5 pl-3 text-right font-bold" style={{ color }}>
                    {row.diff > 0 ? '+' : ''}
                    {Math.round(row.diff)}°
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ComparisonView

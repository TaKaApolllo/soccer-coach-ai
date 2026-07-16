import { useState } from 'react'
import { Card, SegmentedControl, TONE_COLOR } from '../analysis/ui'
import { KickMetric } from '../../types/kickAnalysis'
import { ComparisonBaselineValues } from '../../mocks/kickAnalysis.mock'
import { toneFromMetricStatus } from '../../pages/kick/viewModel'

// =====================================================================
// 理想フォーム比較カード。
// ベースライン: 理想値（idealRange の中央 = 単一ソース constants/idealForm
// 由来）/ プロ平均 / 前回平均。
// プロ平均・前回平均はバックエンド未実装のためモック値（props で受け取り、
// サンプル基準であることを明示する）。
// TODO(api-contract-v1.1): baselines を API 配布値に置換する。
// =====================================================================

type BaselineKind = 'ideal' | 'pro' | 'previous'

const BASELINE_OPTIONS: { id: BaselineKind; label: string }[] = [
  { id: 'ideal', label: '理想' },
  { id: 'pro', label: 'プロ平均' },
  { id: 'previous', label: '前回' }
]

interface IdealFormComparisonCardProps {
  metrics: KickMetric[]
  /** プロ平均・前回平均の基準値（現状はモック） */
  baselines: ComparisonBaselineValues[]
  /** baselines がサンプル値かどうか（真ならバッジ表示） */
  baselinesAreSample: boolean
}

function IdealFormComparisonCard({ metrics, baselines, baselinesAreSample }: IdealFormComparisonCardProps) {
  const [baseline, setBaseline] = useState<BaselineKind>('ideal')

  const rows = metrics.filter((m) => m.unit === 'deg' && m.idealRange && m.value !== null)

  const baselineValue = (m: KickMetric): number | null => {
    if (baseline === 'ideal') {
      return m.idealRange ? (m.idealRange.min + m.idealRange.max) / 2 : null
    }
    const b = baselines.find((x) => x.metricId === m.id)
    if (!b) return null
    return baseline === 'pro' ? b.pro : b.previous
  }

  return (
    <Card
      title="理想フォームとの比較"
      action={
        <div className="flex items-center gap-2">
          {baselinesAreSample && baseline !== 'ideal' && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold"
              style={{ background: 'rgba(250,204,21,0.14)', border: '1px solid rgba(250,204,21,0.4)', color: '#facc15' }}
            >
              サンプル基準値
            </span>
          )}
          <SegmentedControl options={BASELINE_OPTIONS} value={baseline} onChange={setBaseline} size="sm" />
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="m-0 text-xs text-slate-400">比較できる角度データがありません</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {rows.map((m) => {
            const bv = baselineValue(m)
            if (bv === null || m.value === null) return null
            const maxV = Math.max(m.value, bv) * 1.15 || 1
            const tone = toneFromMetricStatus(m.status)
            return (
              <li key={m.id}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-300">{m.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    基準 {Math.round(bv)}° / 自分{' '}
                    <strong style={{ color: TONE_COLOR[tone] }}>{Math.round(m.value)}°</strong>
                  </span>
                </div>
                {/* 基準バー */}
                <div className="mb-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.1)' }} aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(bv / maxV) * 100}%`, background: 'rgba(120,180,255,0.55)' }}
                  />
                </div>
                {/* 自分バー */}
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.1)' }} aria-hidden>
                  <div
                    className="kpro-grow-bar h-full rounded-full"
                    style={{
                      width: `${(m.value / maxV) * 100}%`,
                      background: TONE_COLOR[tone],
                      boxShadow: `0 0 8px ${TONE_COLOR[tone]}66`
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-1 w-4 rounded" style={{ background: 'rgba(120,180,255,0.55)' }} />
          基準値
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-1 w-4 rounded" style={{ background: '#39ff88' }} />
          あなたのフォーム
        </span>
      </div>
    </Card>
  )
}

export default IdealFormComparisonCard

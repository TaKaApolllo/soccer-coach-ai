import { Card, Chip, TONE_COLOR } from '../analysis/ui'
import {
  CaptureQuality,
  KickAnalysisResult,
  KickMetric,
  MeasurementStatus,
  PHASE_LABEL_BY_TYPE
} from '../../types/kickAnalysis'
import {
  METRIC_STATUS_LABEL,
  PHASE_COLOR,
  toneFromMetricStatus
} from '../../pages/kick/viewModel'

// =====================================================================
// 右カラム: 解析サマリー
//   - AnalysisConfidenceCard: 撮影品質・信頼度
//   - PhaseSummary: 検出フェーズ
//   - KeyMetricList: 主要計測値（理想レンジバー付き）
// すべて API 契約 v1.0 のデータのみを消費する（固定値なし）。
// =====================================================================

const MEASUREMENT_LABEL: Record<MeasurementStatus, string> = {
  available: '計測済み',
  low_confidence: '参考値',
  unavailable: '計測不可'
}

function ConfidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <dt className="m-0 shrink-0 text-slate-400">{label}</dt>
      <dd className="m-0 text-right font-bold text-slate-100">{value}</dd>
    </div>
  )
}

export function AnalysisConfidenceCard({ quality }: { quality: CaptureQuality }) {
  const score = quality.score
  const color = score === null ? '#94a3b8' : score >= 50 ? '#39ff88' : '#facc15'
  return (
    <Card title="解析の信頼度">
      <div className="mb-2 flex items-baseline gap-1">
        <span className="text-3xl font-black tabular-nums" style={{ color }}>
          {score ?? '--'}
        </span>
        <span className="text-xs font-bold text-slate-400">%（骨格検出率）</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.14)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${score ?? 0}%`, background: `linear-gradient(90deg, #22c55e, ${color})` }}
        />
      </div>
      <dl className="m-0 space-y-1.5">
        <ConfidenceRow
          label="全身の写り"
          value={quality.fullBodyVisible ? '✓ 良好' : '△ 一部のみ'}
        />
        <ConfidenceRow
          label="被写体"
          value={quality.singlePersonDetected ? '✓ 1人を検出' : '－ 未検出'}
        />
        <ConfidenceRow
          label="撮影アングル"
          value={
            quality.cameraView === 'unknown'
              ? '判定なし'
              : { side: '横から', front: '正面', rear: '後方', diagonal: '斜め' }[quality.cameraView]
          }
        />
      </dl>
      {quality.warnings.length > 0 && (
        <ul className="m-0 mt-2 list-none space-y-1 p-0">
          {quality.warnings.map((w, i) => (
            <li key={i} className="text-[11px] leading-relaxed" style={{ color: '#facc15' }}>
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function PhaseSummaryCard({ analysis }: { analysis: KickAnalysisResult }) {
  return (
    <Card title="検出フェーズ">
      {analysis.phases.length === 0 ? (
        <p className="m-0 text-xs text-slate-400">フェーズを検出できませんでした</p>
      ) : (
        <ol className="m-0 list-none space-y-1.5 p-0">
          {analysis.phases.map((p, i) => (
            <li key={`${p.type}-${i}`} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: PHASE_COLOR[p.type] }}
              />
              <span className="min-w-0 flex-1 font-semibold text-slate-100">
                {PHASE_LABEL_BY_TYPE[p.type]}
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">
                F{p.startFrame}–{p.endFrame}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/** 理想レンジに対する現在値の位置を示すミニバー */
function RangeBar({ metric }: { metric: KickMetric }) {
  const range = metric.idealRange
  if (!range || metric.value === null) return null
  const width = range.max - range.min
  // 表示域: レンジの前後 60% ずつ余白
  const lo = range.min - width * 0.6
  const hi = range.max + width * 0.6
  const pos = Math.max(0, Math.min(1, (metric.value - lo) / (hi - lo)))
  const rangeStart = (range.min - lo) / (hi - lo)
  const rangeEnd = (range.max - lo) / (hi - lo)
  const tone = toneFromMetricStatus(metric.status)
  return (
    <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.12)' }} aria-hidden>
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          left: `${rangeStart * 100}%`,
          width: `${(rangeEnd - rangeStart) * 100}%`,
          background: 'rgba(57,255,136,0.22)'
        }}
      />
      <div
        className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full"
        style={{ left: `calc(${pos * 100}% - 2px)`, background: TONE_COLOR[tone], boxShadow: `0 0 6px ${TONE_COLOR[tone]}` }}
      />
    </div>
  )
}

interface KeyMetricListProps {
  metrics: KickMetric[]
  /** ボール初速の比較キャプション（例: 'リーグ平均+8'）。null なら非表示 */
  ballSpeedCaption: string | null
}

export function KeyMetricList({ metrics, ballSpeedCaption }: KeyMetricListProps) {
  return (
    <Card title="主要計測値">
      <ul className="m-0 list-none space-y-2.5 p-0">
        {metrics.map((m) => {
          const tone = toneFromMetricStatus(m.status)
          const unavailable = m.measurementStatus === 'unavailable' || m.value === null
          return (
            <li key={m.id}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-300">{m.label}</span>
                <span className="shrink-0 font-black tabular-nums text-slate-100">
                  {unavailable ? '計測不可' : `${Math.round(m.value as number)}${m.unit === 'deg' ? '°' : ` ${m.unit}`}`}
                </span>
                {!unavailable && (
                  <Chip tone={tone}>{METRIC_STATUS_LABEL[m.status]}</Chip>
                )}
                {m.measurementStatus === 'low_confidence' && !unavailable && (
                  <span className="shrink-0 text-[9px] font-bold text-slate-500">{MEASUREMENT_LABEL.low_confidence}</span>
                )}
              </div>
              {m.idealRange && !unavailable && (
                <>
                  <RangeBar metric={m} />
                  <div className="mt-0.5 flex justify-between text-[9px] text-slate-500">
                    <span>理想 {m.idealRange.min}–{m.idealRange.max}{m.unit === 'deg' ? '°' : ''}</span>
                    {m.id === 'ball_speed' && ballSpeedCaption && <span>{ballSpeedCaption}</span>}
                  </div>
                </>
              )}
              {m.id === 'ball_speed' && !m.idealRange && !unavailable && ballSpeedCaption && (
                <div className="mt-0.5 text-right text-[9px] text-slate-500">{ballSpeedCaption}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

interface AnalysisSummaryPanelProps {
  analysis: KickAnalysisResult
  ballSpeedCaption: string | null
}

/** 右カラム: 信頼度 / フェーズ / 主要計測値 */
function AnalysisSummaryPanel({ analysis, ballSpeedCaption }: AnalysisSummaryPanelProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1">
      <AnalysisConfidenceCard quality={analysis.captureQuality} />
      <PhaseSummaryCard analysis={analysis} />
      <KeyMetricList metrics={analysis.metrics} ballSpeedCaption={ballSpeedCaption} />
    </div>
  )
}

export default AnalysisSummaryPanel

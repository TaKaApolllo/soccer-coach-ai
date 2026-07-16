import AICoachCommentCard from '../analysis/AICoachCommentCard'
import MotionTimeline from '../analysis/MotionTimeline'
import SkillRadarCard from '../analysis/SkillRadarCard'
import TrainingRecommendationCard from '../analysis/TrainingRecommendationCard'
import { Card } from '../analysis/ui'
import { BodyPartScores } from '../../types'
import { SkillRadar } from '../../types/analysis'
import { KickAnalysisResult, KickHistoryEntry } from '../../types/kickAnalysis'
import { ComparisonBaselineValues } from '../../mocks/kickAnalysis.mock'
import { KickViewModel } from '../../pages/kick/viewModel'
import AnalysisHistoryPanel from './AnalysisHistoryPanel'
import BeforeAfterCompare from './BeforeAfterCompare'
import BodyPartScoreCards from './BodyPartScoreCards'
import IdealFormComparisonCard from './IdealFormComparisonCard'
import ImprovementPriorityCard from './ImprovementPriorityCard'

interface AnalysisDetailGridProps {
  vm: KickViewModel
  analysis: KickAnalysisResult
  /** 現行 API の部位別コメント（あれば表示） */
  partComments: BodyPartScores | null
  /** スキルレーダー（成長記録 API 由来）。未取得なら非表示 */
  radar: SkillRadar | null
  baselines: ComparisonBaselineValues[]
  baselinesAreSample: boolean
  history: KickHistoryEntry[]
  activeAnalysisId: string | null
  onSelectHistory: (id: string) => void
  /** タイムライン再生位置 0-1 */
  progress: number
  onSeek: (p: number) => void
}

/**
 * 下段の詳細グリッド。
 * モーションタイムライン / 改善優先度 / AIコーチ / 理想比較 /
 * 部位別スコア / Before・After / レーダー / おすすめ練習 / 履歴。
 */
function AnalysisDetailGrid({
  vm,
  analysis,
  partComments,
  radar,
  baselines,
  baselinesAreSample,
  history,
  activeAnalysisId,
  onSelectHistory,
  progress,
  onSeek
}: AnalysisDetailGridProps) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 wide:grid-cols-3">
      {/* モーションタイムライン（全幅） */}
      <div className="min-w-0 md:col-span-2 wide:col-span-3">
        {vm.timelinePhases.length > 0 ? (
          <MotionTimeline phases={vm.timelinePhases} progress={progress} onSeek={onSeek} />
        ) : (
          <Card title="モーションタイムライン">
            <p className="m-0 text-xs text-slate-400">
              動画を解析するとキック動作のフェーズがここに表示されます
            </p>
          </Card>
        )}
      </div>

      {/* 改善優先度 / AIコーチ / 理想比較 */}
      <div className="min-w-0">
        <ImprovementPriorityCard priorities={analysis.feedback.priorities} />
      </div>
      <div className="min-w-0">
        <AICoachCommentCard coach={vm.coach} />
      </div>
      <div className="min-w-0 md:col-span-2 wide:col-span-1">
        <IdealFormComparisonCard
          metrics={analysis.metrics}
          baselines={baselines}
          baselinesAreSample={baselinesAreSample}
        />
      </div>

      {/* 部位別スコア（全幅） */}
      <div className="min-w-0 md:col-span-2 wide:col-span-3">
        <BodyPartScoreCards scores={analysis.scores} partComments={partComments} />
      </div>

      {/* Before/After + 右列（レーダー / 練習 / 履歴） */}
      <div className="min-w-0 md:col-span-2 wide:col-span-2">
        <BeforeAfterCompare
          currentLandmarks={vm.landmarks}
          overallScore={analysis.scores.overall}
          metrics={analysis.metrics}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4 md:col-span-2 md:grid md:grid-cols-2 wide:col-span-1 wide:flex wide:flex-col">
        {radar && <SkillRadarCard radar={radar} />}
        {vm.recs.length > 0 && <TrainingRecommendationCard recs={vm.recs} />}
        <AnalysisHistoryPanel
          entries={history}
          activeId={activeAnalysisId}
          onSelect={onSelectHistory}
        />
      </div>
    </div>
  )
}

export default AnalysisDetailGrid

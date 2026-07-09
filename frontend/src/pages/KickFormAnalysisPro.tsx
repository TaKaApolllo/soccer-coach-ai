import { useEffect, useMemo, useRef, useState } from 'react'
import AICoachCommentCard from '../components/analysis/AICoachCommentCard'
import AnalysisHeader, { ProTab } from '../components/analysis/AnalysisHeader'
import AnalysisHistoryCard from '../components/analysis/AnalysisHistoryCard'
import AngleListCard from '../components/analysis/AngleListCard'
import IdealComparisonCard from '../components/analysis/IdealComparisonCard'
import ImprovementRankingCard from '../components/analysis/ImprovementRankingCard'
import MainFormViewer from '../components/analysis/MainFormViewer'
import MetricGaugeCard from '../components/analysis/MetricGaugeCard'
import MotionTimeline from '../components/analysis/MotionTimeline'
import SessionInfoCard from '../components/analysis/SessionInfoCard'
import ShotSidebar from '../components/analysis/ShotSidebar'
import SkillProgressCard from '../components/analysis/SkillProgressCard'
import SkillRadarCard from '../components/analysis/SkillRadarCard'
import TrainingRecommendationCard from '../components/analysis/TrainingRecommendationCard'
import { MOCK_PRO_ANALYSIS } from '../data/mockAnalysisData'
import { api } from '../services/api'
import { PoseAnalysisResponse } from '../types'
import { ComparisonBaseline, HistoryEntry, ProAnalysis, proFromPoseResponse } from '../types/analysis'

/** ゲージ・バーのマウント時アニメーション（この画面専用の軽量 CSS） */
const PAGE_CSS = `
@keyframes kproGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.kpro-grow-bar { transform-origin: left center; animation: kproGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) { .kpro-grow-bar { animation: none; } }
`

/**
 * Kick Form Analysis Pro — プロクラブ仕様のキックフォーム分析ダッシュボード。
 * モックデータで完結し、実 API（pose 解析）があれば該当フィールドが差し替わる。
 */
function KickFormAnalysisPro() {
  const [tab, setTab] = useState<ProTab>('form')
  const [baseline, setBaseline] = useState<ComparisonBaseline>('ideal')
  const [data, setData] = useState<ProAnalysis>(MOCK_PRO_ANALYSIS)

  // 再生状態
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const rafRef = useRef<number>(0)
  const lastTick = useRef<number>(0)

  const duration = data.shot.duration

  // 再生ループ（requestAnimationFrame でタイムラインと連動）
  useEffect(() => {
    if (!playing) return
    lastTick.current = performance.now()
    const loop = (t: number) => {
      const dt = (t - lastTick.current) / 1000
      lastTick.current = t
      setCurrentTime((prev) => {
        const next = prev + dt * speed
        return next >= duration ? next - duration : next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed, duration])

  // 実データがあればモックへ上書きマージ
  useEffect(() => {
    api.getLatestAnalysis<PoseAnalysisResponse>('pose').then((latest) => {
      if (!latest) return
      const resp = latest.analysis
      const partial = proFromPoseResponse(resp)
      setData((prev) => {
        const merged: ProAnalysis = { ...prev, ...partial }
        const pose = resp.pose
        if (pose?.score) {
          merged.overall = {
            ...prev.overall,
            score: Math.round(pose.score),
            headline: pose.score_message?.headline ?? prev.overall.headline
          }
        }
        return merged
      })
    })

    // 履歴（pose 系のみ・サムネイル API を利用）
    api.getHistory().then((h) => {
      const entries: HistoryEntry[] = h.analyses
        .filter((a) => a.analysis_type !== 'formation' && a.score != null)
        .slice(0, 4)
        .map((a) => ({
          id: a.id,
          date: new Date(a.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
          score: Math.round(a.score as number),
          thumbSrc: a.media_type === 'video' || a.media_type === 'image' ? `/api/history/${a.id}/thumbnail` : null
        }))
      if (entries.length) setData((prev) => ({ ...prev, history: entries }))
    }).catch(() => undefined)
  }, [])

  const progress = duration > 0 ? currentTime / duration : 0

  // ズレの大きい関節を強調
  const highlightJoints = useMemo(
    () => data.angleLabels.filter((a) => a.status === 'bad').map((a) => a.joint),
    [data.angleLabels]
  )

  return (
    <div className="relative">
      <style>{PAGE_CSS}</style>

      {/* この画面専用の多層グラデーション背景 */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: -1,
          background: [
            'radial-gradient(1100px 480px at 85% -8%, rgba(34, 197, 94, 0.09), transparent 60%)',
            'radial-gradient(800px 420px at -5% 30%, rgba(56, 189, 248, 0.07), transparent 60%)',
            'radial-gradient(900px 500px at 50% 115%, rgba(11, 18, 32, 0.9), transparent 70%)',
            'linear-gradient(180deg, #020617 0%, #06111f 45%, #0b1220 100%)'
          ].join(', ')
        }}
      />

      <AnalysisHeader tab={tab} onTabChange={setTab} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[236px_minmax(0,1fr)] lg:grid-cols-[236px_minmax(0,1fr)_280px]">
        {/* 左サイドバー */}
        <aside className="flex min-w-0 flex-col gap-4">
          <ShotSidebar shot={data.shot} currentTime={currentTime} />
          <SessionInfoCard session={data.session} />
          <AngleListCard angles={data.angles} />
        </aside>

        {/* 中央メイン */}
        <div className="flex min-w-0 flex-col gap-4">
          <MainFormViewer
            tab={tab}
            landmarks={data.landmarks}
            angleLabels={data.angleLabels}
            highlightJoints={highlightJoints}
            overall={data.overall}
            isSample={data.isSample}
            playing={playing}
            onTogglePlay={() => setPlaying((v) => !v)}
            currentTime={currentTime}
            duration={duration}
            onSeek={(t) => setCurrentTime(Math.max(0, Math.min(duration, t)))}
            speed={speed}
            onSpeedChange={setSpeed}
          />

          <MotionTimeline
            phases={data.phases}
            progress={progress}
            onSeek={(p) => setCurrentTime(p * duration)}
          />

          <IdealComparisonCard items={data.comparisons} baseline={baseline} onBaselineChange={setBaseline} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AICoachCommentCard coach={data.coach} />
            <ImprovementRankingCard items={data.improvements} />
          </div>
        </div>

        {/* 右サイドバー（md では下段に 2 カラムで折り返し） */}
        <aside className="grid min-w-0 grid-cols-1 gap-4 self-start sm:grid-cols-2 md:col-span-2 lg:col-span-1 lg:grid-cols-1">
          <SkillRadarCard radar={data.radar} />
          <SkillProgressCard progress={data.progress} />
          <AnalysisHistoryCard history={data.history} />
          <TrainingRecommendationCard recs={data.recommendations} />
        </aside>
      </div>

      {/* 下部メトリクスカード列 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.metrics.map((m) => (
          <MetricGaugeCard key={m.key} metric={m} />
        ))}
      </div>
    </div>
  )
}

export default KickFormAnalysisPro

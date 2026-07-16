/**
 * @deprecated このページは /analysis/kick（pages/kick/KickAnalysisPage.tsx）へ
 * 統合されたため、ルーティングから除外されている。旧ルートは
 * /analysis/kick へリダイレクトされる。参照実装として残置しているのみで、
 * 新機能はここに追加しないこと。
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AdvicePanel from '../../components/form/AdvicePanel'
import AvatarViewer from '../../components/form/AvatarViewer'
import ComparisonView from '../../components/form/ComparisonView'
import ScoreCard from '../../components/form/ScoreCard'
import { api } from '../../services/api'
import {
  MOCK_BODY_PART_SCORES,
  MOCK_CENTER_OF_GRAVITY,
  MOCK_IMPROVEMENT_RANKINGS,
  MOCK_OVERALL_SCORE
} from '../../mocks/formAnalysisMock'
import {
  BodyPartScore,
  BodyPartScores,
  CenterOfGravity,
  ImprovementRanking,
  PoseAnalysisResponse,
  PoseLandmark
} from '../../types'

const PART_ORDER: (keyof BodyPartScores)[] = ['plant_leg', 'kicking_leg', 'upper_body', 'balance']

function overallHeadline(score: number): { headline: string; detail: string } {
  if (score >= 80) return { headline: '素晴らしいフォームです', detail: 'この調子で反復練習を続けましょう。' }
  if (score >= 60) return { headline: '良い土台ができています', detail: '重点ポイントを直せば大きく伸びます。' }
  return { headline: '伸びしろが大きいフォームです', detail: '改善ランキングの上位から取り組みましょう。' }
}

/**
 * プロスポーツ分析アプリ風のフォーム分析画面。
 * バックエンドの body_part_scores が存在すれば実データ、
 * なければモックデータを「サンプルデータ」バッジ付きで表示する。
 */
function FormAnalysisPage() {
  const [result, setResult] = useState<PoseAnalysisResponse | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api
      .getLatestAnalysis<PoseAnalysisResponse>('pose')
      .then((latest) => {
        if (latest) {
          const res = latest.analysis as PoseAnalysisResponse
          const score = (latest as unknown as { score?: number }).score ?? res.pose?.score ?? null
          setResult({ ...res, id: latest.id, score })
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [])

  const pose = result?.pose ?? null
  const isSample = !pose?.body_part_scores

  const bodyPartScores: BodyPartScores = pose?.body_part_scores ?? MOCK_BODY_PART_SCORES
  const rankings: ImprovementRanking[] = pose?.improvement_rankings ?? MOCK_IMPROVEMENT_RANKINGS
  const cog: CenterOfGravity = pose?.center_of_gravity ?? MOCK_CENTER_OF_GRAVITY
  const overallScore = isSample ? MOCK_OVERALL_SCORE : (result?.score ?? pose?.score ?? MOCK_OVERALL_SCORE)

  const landmarks: PoseLandmark[] | null = useMemo(() => {
    if (!pose || pose.frames.length === 0) return null
    const frame = pose.frames[pose.key_frame_index] ?? pose.frames[0]
    return frame?.landmarks?.length ? frame.landmarks : null
  }, [pose])

  const parts = PART_ORDER
    .map((key) => bodyPartScores[key])
    .filter((p): p is BodyPartScore => !!p)

  const message = overallHeadline(overallScore)

  return (
    <div
      className="rounded-[28px] border border-white/[0.07] p-4 sm:p-6 lg:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      style={{
        background:
          'radial-gradient(ellipse 80% 50% at 20% -10%, rgba(16, 90, 56, 0.5), transparent), ' +
          'radial-gradient(ellipse 60% 40% at 90% 0%, rgba(20, 120, 70, 0.25), transparent), ' +
          'linear-gradient(180deg, #071510 0%, #050d09 45%, #020503 100%)'
      }}
    >
      <div className="mx-auto max-w-6xl flex flex-col gap-6">
        {/* 1. ヘッダー行 */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/kick"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/80 no-underline text-lg backdrop-blur-md hover:text-white"
            aria-label="キックフォーム分析へ戻る"
          >
            ‹
          </Link>
          <h2 className="text-2xl font-extrabold text-white tracking-wide m-0">フォーム分析</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/80 mt-1">
            Form Lab
          </span>
          {loaded && isSample && (
            <span className="ml-auto rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
              サンプルデータ表示中
            </span>
          )}
        </div>

        {/* 2. ヒーロー行: AvatarViewer + 総合スコア */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
          <div className="lg:col-span-3 rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-5">
            <AvatarViewer landmarks={landmarks} size={380} />
            <p className="text-center text-xs text-white/50 mt-3">
              {cog.over_plant_foot ? '重心は軸足の上に乗っています' : cog.comment}
            </p>
          </div>
          <div className="lg:col-span-2">
            <ScoreCard
              label="総合スコア"
              score={overallScore}
              headline={pose?.score_message?.headline ?? message.headline}
              detail={pose?.score_message?.detail ?? message.detail}
              variant="hero"
            />
          </div>
        </div>

        {/* 3. 部位別スコア行 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {parts.map((part) => (
            <ScoreCard
              key={part.label}
              label={part.label}
              score={part.score}
              status={part.status}
              angles={part.angles}
            />
          ))}
        </div>

        {/* 4. アドバイスパネル */}
        <AdvicePanel bodyPartScores={bodyPartScores} rankings={rankings} />

        {/* 5. Before/After 比較 */}
        <ComparisonView
          currentLandmarks={landmarks}
          bodyPartScores={bodyPartScores}
          overallScore={overallScore}
        />
      </div>
    </div>
  )
}

export default FormAnalysisPage

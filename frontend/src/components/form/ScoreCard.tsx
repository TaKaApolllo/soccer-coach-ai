import { BodyPartStatus } from '../../types'
import GaugeRing, { STATUS_COLOR, STATUS_TEXT, scoreToStatus } from './GaugeRing'

const ANGLE_LABELS: Record<string, string> = {
  knee: '膝',
  backswing: 'バックスイング',
  knee_impact: 'インパクト時の膝',
  lean: '上体の傾き',
  pelvis: '骨盤の回旋',
  arm: '腕の開き'
}

interface ScoreCardProps {
  label: string
  score: number
  status?: BodyPartStatus
  angles?: Record<string, number>
  headline?: string
  detail?: string
  variant?: 'hero' | 'compact'
}

/**
 * 部位別・総合スコアカード。ガラス風（半透明+ぼかし）＋円形ゲージ。
 * variant="hero" で総合スコア用の大型カードになる。
 */
function ScoreCard({ label, score, status, angles, headline, detail, variant = 'compact' }: ScoreCardProps) {
  const resolvedStatus = status ?? scoreToStatus(score)
  const color = STATUS_COLOR[resolvedStatus]
  const isHero = variant === 'hero'

  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] ${
        isHero ? 'p-8 justify-center' : 'p-5'
      } flex flex-col items-center ${isHero ? 'gap-5' : 'gap-3'} h-full`}
    >
      <GaugeRing score={score} size={isHero ? 176 : 96} status={resolvedStatus} />

      <div className="w-full text-center">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isHero ? 'mb-3' : 'mb-2'
          }`}
          style={{ color, backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {STATUS_TEXT[resolvedStatus]}
        </div>

        <h3 className={`font-bold text-white ${isHero ? 'text-2xl mb-1' : 'text-base mb-1'}`}>{label}</h3>

        {isHero && headline && <p className="text-emerald-300 font-semibold text-lg mb-1">{headline}</p>}
        {isHero && detail && <p className="text-white/60 text-sm leading-relaxed">{detail}</p>}

        {angles && Object.keys(angles).length > 0 && (
          <div className={`flex flex-wrap justify-center gap-1.5 ${isHero ? 'mt-4' : 'mt-2'}`}>
            {Object.entries(angles).map(([key, value]) => (
              <span
                key={key}
                className="rounded-full bg-black/30 border border-white/10 px-2 py-0.5 text-[11px] text-white/70"
              >
                {ANGLE_LABELS[key] ?? key} {Math.round(value)}°
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ScoreCard

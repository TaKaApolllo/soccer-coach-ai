import { useEffect, useState } from 'react'
import { PoseAnalysisResponse } from '../types'
import IdealModelFigure, { IDEAL_MODEL_SCORE } from './IdealModelFigure'

type PoseTab = 'form' | 'angle' | 'skeleton' | 'compare'

const TABS: { id: PoseTab; label: string }[] = [
  { id: 'form', label: 'フォーム' },
  { id: 'angle', label: '角度' },
  { id: 'skeleton', label: '骨格' },
  { id: 'compare', label: '比較' }
]

interface PoseViewerProps {
  result: PoseAnalysisResponse
}

/**
 * キックフォーム解析ビューア。
 * フォーム（元映像）/ 角度（AR注釈）/ 骨格（スケルトンのみ）/
 * 比較（理想モデルとの並列）の4タブを切り替える。
 */
function PoseViewer({ result }: PoseViewerProps) {
  const pose = result.pose
  const [tab, setTab] = useState<PoseTab>('angle')
  const [activeFrame, setActiveFrame] = useState(0)

  useEffect(() => {
    setActiveFrame(pose?.key_frame_index ?? 0)
  }, [pose])

  if (!pose || pose.annotated_images.length === 0) {
    return (
      <div className="empty-state">
        <p>{result.pose_error ?? '骨格を検出できませんでした。全身が写る映像で再解析してください。'}</p>
      </div>
    )
  }

  const imageFor = (i: number): string | null => {
    if (tab === 'form') return pose.clean_images?.[i] ?? pose.annotated_images[i]
    if (tab === 'skeleton') return pose.skeleton_images?.[i] ?? null
    return pose.annotated_images[i]
  }

  const active = imageFor(activeFrame)

  return (
    <div className="pose-viewer">
      <div className="view-toggle" role="tablist" aria-label="フォーム表示切り替え">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'compare' ? (
        <div className="compare-grid">
          <div className="compare-side">
            <img
              src={`data:image/jpeg;base64,${pose.annotated_images[activeFrame]}`}
              alt="自分のフォーム"
            />
            <div className="compare-label">自分</div>
            <div className="compare-score">{result.score ?? '-'}</div>
          </div>
          <div className="compare-vs">VS</div>
          <div className="compare-side">
            <IdealModelFigure />
            <div className="compare-label">理想モデル（ロナウド風）</div>
            <div className="compare-score">{IDEAL_MODEL_SCORE}</div>
          </div>
        </div>
      ) : (
        <div className="pose-stage">
          {active ? (
            <img
              src={`data:image/jpeg;base64,${active}`}
              alt={`解析フレーム ${activeFrame + 1}（${pose.phases[activeFrame] ?? ''}）`}
            />
          ) : (
            <div className="empty-state"><p>このフレームでは骨格を検出できませんでした</p></div>
          )}
          {tab !== 'form' && result.ball_speed && (
            <div className="hud-chip bottom-left">
              <div className="hud-label">推定初速</div>
              <div className="hud-value">
                {result.ball_speed.speed_kmh} <span className="hud-unit">km/h ※概算</span>
              </div>
            </div>
          )}
          {tab === 'angle' && result.kick_angle_range && (
            <div className="hud-chip top-left">
              <div className="hud-label">蹴り足の膝角度</div>
              <div className="hud-value">
                {result.kick_angle_range.min}°<span className="hud-unit">〜</span>{result.kick_angle_range.max}°
              </div>
            </div>
          )}
          {pose.phases[activeFrame] && (
            <div className="hud-chip top-right">
              <div className="hud-label">フェーズ</div>
              <div className="hud-value" style={{ fontSize: '0.9rem' }}>{pose.phases[activeFrame]}</div>
            </div>
          )}
        </div>
      )}

      {pose.annotated_images.length > 1 && tab !== 'compare' && (
        <div className="frame-strip">
          {pose.annotated_images.map((img, i) => (
            <button
              key={i}
              className={i === activeFrame ? 'active' : ''}
              onClick={() => setActiveFrame(i)}
              aria-label={`フレーム ${i + 1}`}
            >
              <img src={`data:image/jpeg;base64,${img}`} alt="" />
              {pose.phases[i] && <span className="phase-tag">{pose.phases[i]}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default PoseViewer

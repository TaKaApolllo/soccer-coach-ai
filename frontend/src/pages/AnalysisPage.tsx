import { useEffect, useState } from 'react'
import ScoreRing from '../components/ScoreRing'
import UploadCard from '../components/UploadCard'
import { api } from '../services/api'
import { AnalysisType, PoseAnalysisResponse } from '../types'

const METRIC_LABELS: Record<string, string> = {
  backswing_knee_angle: 'バックスイング膝角度',
  torso_lean_at_impact: '体幹の傾き',
  plant_leg_knee_angle: '軸足の膝角度',
  kicking_leg_knee_angle: '蹴り足の膝角度',
  arm_extension: '腕の開き'
}

function AnalysisPage() {
  const [file, setFile] = useState<File | null>(null)
  const [analysisTypes, setAnalysisTypes] = useState<AnalysisType[]>([])
  const [selectedType, setSelectedType] = useState('kick')
  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PoseAnalysisResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeFrame, setActiveFrame] = useState(0)

  useEffect(() => {
    api
      .getAnalysisTypes()
      .then((data) => setAnalysisTypes(data.types))
      .catch((err) => console.error('Failed to load analysis types:', err))
  }, [])

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await api.analyzePose(file, selectedType, context)
      setResult(res)
      setActiveFrame(res.pose?.key_frame_index ?? 0)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? (err instanceof Error ? err.message : 'AI解析に失敗しました'))
    } finally {
      setLoading(false)
    }
  }

  const pose = result?.pose ?? null
  const sections = result?.ai_feedback?.sections

  const inRange = (value: number, range: [number, number]) =>
    value >= range[0] && value <= range[1]

  return (
    <div>
      <h2 className="greeting">フォーム解析</h2>
      <p className="section-label">AI 骨格推定 × プロコーチング</p>

      <div className="card">
        <h3 className="card-title">動画・画像をアップロード</h3>
        <UploadCard
          file={file}
          onFileChange={(f) => {
            setFile(f)
            setResult(null)
            setError(null)
          }}
          hint="キックやドリブルの動画（横からの撮影がおすすめ）"
        />
      </div>

      {file && (
        <div className="card">
          <h3 className="card-title">解析タイプを選択</h3>
          <div className="analysis-type-select">
            {analysisTypes.map((type) => (
              <button
                key={type.id}
                className={`analysis-type-btn ${selectedType === type.id ? 'selected' : ''}`}
                onClick={() => setSelectedType(type.id)}
              >
                {type.name}
              </button>
            ))}
          </div>

          <textarea
            className="context-input"
            placeholder="追加情報（任意）例: インサイドキックの練習中です。ボールが浮いてしまう原因を知りたいです。"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />

          <button
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                骨格を解析中...
              </>
            ) : (
              'AI 解析を開始'
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="card error-card">
          <p style={{ color: 'var(--error-color)' }}>{error}</p>
        </div>
      )}

      {result && (
        <>
          {/* スコア */}
          <div className="card">
            <div className="score-hero">
              <ScoreRing score={result.score ?? 0} label="スコア" />
              <div className="score-hero-text">
                <h3>キックフォーム分析</h3>
                <p>
                  骨格推定 AI が関節角度を計測し、理想フォームと比較しました。
                  {result.pose_error && ` （${result.pose_error}）`}
                </p>
              </div>
            </div>

            {pose && pose.score_breakdown.length > 0 && (
              <div className="metric-grid">
                {pose.score_breakdown.map((item) => (
                  <div
                    key={item.key}
                    className={`metric-tile ${inRange(item.value, item.ideal_range) ? 'ok' : 'warn'}`}
                    title={item.description}
                  >
                    <div className="metric-label">{item.label}</div>
                    <div className="metric-value">{item.value}°</div>
                    <div className="metric-range">
                      理想 {item.ideal_range[0]}°〜{item.ideal_range[1]}°
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 骨格オーバーレイ */}
          {pose && pose.annotated_images.length > 0 && (
            <div className="card pose-viewer">
              <h3 className="card-title">骨格解析ビュー</h3>
              <div className="pose-stage">
                <img
                  src={`data:image/jpeg;base64,${pose.annotated_images[activeFrame]}`}
                  alt={`解析フレーム ${activeFrame + 1}（${pose.phases[activeFrame] ?? ''}）`}
                />
                {result.ball_speed && (
                  <div className="hud-chip bottom-left">
                    <div className="hud-label">推定初速</div>
                    <div className="hud-value">
                      {result.ball_speed.speed_kmh} <span className="hud-unit">km/h ※概算</span>
                    </div>
                  </div>
                )}
                {result.kick_angle_range && (
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
                    <div className="hud-value" style={{ fontSize: '0.95rem' }}>
                      {pose.phases[activeFrame]}
                    </div>
                  </div>
                )}
              </div>
              {pose.annotated_images.length > 1 && (
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

              {/* 計測値の一覧（表ビュー） */}
              {pose.metrics && Object.keys(pose.metrics).length > 0 && (
                <div className="table-scroll" style={{ marginTop: 12 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>計測項目</th>
                        <th>値</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(pose.metrics)
                        .filter(([k]) => METRIC_LABELS[k])
                        .map(([k, v]) => (
                          <tr key={k}>
                            <td>{METRIC_LABELS[k]}</td>
                            <td>{v}°</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* AI コーチング */}
          {sections && (
            <div className="card">
              <h3 className="card-title">AI コーチング</h3>

              {sections.good_points && (
                <div className="result-section">
                  <h3>✅ 素晴らしい点</h3>
                  <p>{sections.good_points}</p>
                </div>
              )}
              {sections.improvements && (
                <div className="result-section">
                  <h3>🎯 改善点</h3>
                  <p>{sections.improvements}</p>
                </div>
              )}
              {sections.advice && (
                <div className="result-section">
                  <h3>💡 具体的アドバイス</h3>
                  <p>{sections.advice}</p>
                </div>
              )}
              {sections.reference_player && (
                <div className="result-section">
                  <h3>⭐ プロ選手比較</h3>
                  <p>{sections.reference_player}</p>
                </div>
              )}
              {sections.practice_menu && (
                <div className="result-section">
                  <h3>🏃 おすすめドリル</h3>
                  <p>{sections.practice_menu}</p>
                </div>
              )}

              {result.ai_feedback.note && (
                <p className="note-text">{result.ai_feedback.note}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default AnalysisPage

/** 理想フォームモデルの参照スコア（コーチング上の基準値） */
export const IDEAL_MODEL_SCORE = 92

/**
 * 理想的なインステップキックの骨格モデル（オリジナルのスケルトン図）。
 * 実在選手の写真は権利上使用できないため、比較タブでは
 * 理想フォームを抽象化したスケルトンモデルを表示する。
 */
function IdealModelFigure() {
  // インパクト直前の理想姿勢: 軸足が伸び、蹴り足の膝が畳まれ、上体が前傾
  const joints: Record<string, [number, number]> = {
    head: [118, 38],
    neck: [113, 62],
    shoulderL: [96, 68],
    shoulderR: [130, 66],
    elbowL: [70, 88],
    elbowR: [156, 84],
    wristL: [52, 118],
    wristR: [178, 62],
    hip: [108, 128],
    hipL: [100, 130],
    hipR: [116, 126],
    kneeL: [86, 176],   // 軸足（左）
    kneeR: [148, 158],  // 蹴り足（右）: 膝が畳まれている
    ankleL: [80, 224],
    ankleR: [166, 196],
    toeL: [92, 232],
    toeR: [184, 214]
  }

  const bones: [string, string][] = [
    ['head', 'neck'],
    ['neck', 'shoulderL'], ['neck', 'shoulderR'],
    ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
    ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
    ['neck', 'hip'],
    ['hip', 'hipL'], ['hip', 'hipR'],
    ['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'toeL'],
    ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['ankleR', 'toeR']
  ]

  return (
    <svg viewBox="0 0 236 260" role="img" aria-label="理想フォームモデル">
      <defs>
        <linearGradient id="idealBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#122019" />
          <stop offset="100%" stopColor="#0a1410" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="236" height="260" rx="10" fill="url(#idealBg)" />

      {/* 地面とボール */}
      <line x1="12" y1="232" x2="224" y2="232" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      <circle cx="196" cy="222" r="10" fill="#fff" />
      <circle cx="196" cy="222" r="10" fill="none" stroke="#0a1410" strokeWidth="1" />
      <path d="M191 218 l5 3 5-3 -2 6 h-6 z" fill="#0a1410" />

      {/* グロー層 */}
      {bones.map(([a, b], i) => (
        <line
          key={`g${i}`}
          x1={joints[a][0]} y1={joints[a][1]}
          x2={joints[b][0]} y2={joints[b][1]}
          stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" opacity="0.22"
        />
      ))}
      {/* 本線 */}
      {bones.map(([a, b], i) => (
        <line
          key={`b${i}`}
          x1={joints[a][0]} y1={joints[a][1]}
          x2={joints[b][0]} y2={joints[b][1]}
          stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round"
        />
      ))}
      {/* 関節 */}
      {Object.entries(joints).map(([name, [x, y]]) => (
        <g key={name}>
          <circle cx={x} cy={y} r={name === 'head' ? 9 : 4} fill="none" stroke="var(--accent)" strokeWidth="1.4" />
          {name !== 'head' && <circle cx={x} cy={y} r={2} fill="#fff" />}
        </g>
      ))}

      {/* 理想角度の注釈 */}
      <text x="150" y="150" fontSize="11" fontWeight="700" fill="var(--accent)">95°</text>
      <text x="60" y="170" fontSize="11" fontWeight="700" fill="var(--accent)">168°</text>
      <text x="118" y="24" fontSize="10" fill="rgba(255,255,255,0.55)" textAnchor="middle">
        理想インパクト姿勢
      </text>
    </svg>
  )
}

export default IdealModelFigure

/** 理想フォームモデルの参照スコア（コーチング上の基準値） */
export const IDEAL_MODEL_SCORE = 92

/**
 * 理想的なインステップキックのアバターモデル（オリジナル描画）。
 * 実在選手の写真は権利上使用できないため、比較タブでは
 * 体にボリュームのあるアバターで理想フォームを表現する。
 */
function IdealModelFigure() {
  // インパクト直前の理想姿勢: 軸足が伸び、蹴り足の膝が畳まれ、上体が前傾
  const j: Record<string, [number, number]> = {
    head: [118, 36],
    neck: [113, 60],
    shoulderL: [96, 68],
    shoulderR: [130, 66],
    elbowL: [70, 88],
    elbowR: [156, 84],
    wristL: [52, 118],
    wristR: [178, 62],
    hipL: [100, 130],
    hipR: [116, 126],
    kneeL: [86, 176],   // 軸足（左）
    kneeR: [148, 158],  // 蹴り足（右）: 膝が畳まれている
    ankleL: [80, 224],
    ankleR: [166, 196],
    toeL: [92, 232],
    toeR: [184, 214]
  }

  // 手足: [始点, 終点, 太さ]
  const limbs: [string, string, number][] = [
    ['hipL', 'kneeL', 13], ['kneeL', 'ankleL', 10], ['ankleL', 'toeL', 7],
    ['hipR', 'kneeR', 13], ['kneeR', 'ankleR', 10], ['ankleR', 'toeR', 7],
    ['shoulderL', 'elbowL', 9], ['elbowL', 'wristL', 7],
    ['shoulderR', 'elbowR', 9], ['elbowR', 'wristR', 7],
    ['neck', 'head', 8]
  ]

  const BODY = '#34423a'
  const RIM = 'var(--accent)'

  const capsule = ([a, b, wd]: [string, string, number], i: number, shade = false) => (
    <line
      key={`${a}-${b}-${i}`}
      x1={j[a][0]} y1={j[a][1]} x2={j[b][0]} y2={j[b][1]}
      stroke={shade ? '#2a362f' : BODY}
      strokeWidth={wd}
      strokeLinecap="round"
    />
  )

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
      <path d="M191 218 l5 3 5-3 -2 6 h-6 z" fill="#0a1410" />

      {/* リムライト（少し太い輪郭層） */}
      <g opacity="0.5">
        {limbs.map(([a, b, wd], i) => (
          <line
            key={`rim${i}`}
            x1={j[a][0]} y1={j[a][1]} x2={j[b][0]} y2={j[b][1]}
            stroke={RIM} strokeWidth={wd + 2.5} strokeLinecap="round"
          />
        ))}
        <polygon
          points={`${j.shoulderL.join(',')} ${j.shoulderR.join(',')} ${j.hipR.join(',')} ${j.hipL.join(',')}`}
          stroke={RIM} strokeWidth="3" fill="none" strokeLinejoin="round"
        />
        <circle cx={j.head[0]} cy={j.head[1]} r="13.5" stroke={RIM} strokeWidth="2.5" fill="none" />
      </g>

      {/* ボディ（塗り） */}
      {limbs.map((l, i) => capsule(l, i, i % 3 === 1))}
      <polygon
        points={`${j.shoulderL.join(',')} ${j.shoulderR.join(',')} ${j.hipR.join(',')} ${j.hipL.join(',')}`}
        fill={BODY} strokeLinejoin="round"
      />
      <circle cx={j.head[0]} cy={j.head[1]} r="12.5" fill={BODY} />

      {/* 骨格ライン + 関節 */}
      <g stroke={RIM} strokeWidth="1.4" opacity="0.9">
        {limbs.map(([a, b], i) => (
          <line key={`sk${i}`} x1={j[a][0]} y1={j[a][1]} x2={j[b][0]} y2={j[b][1]} />
        ))}
        <line x1={j.shoulderL[0]} y1={j.shoulderL[1]} x2={j.shoulderR[0]} y2={j.shoulderR[1]} />
        <line x1={j.hipL[0]} y1={j.hipL[1]} x2={j.hipR[0]} y2={j.hipR[1]} />
      </g>
      {Object.entries(j).map(([name, [x, y]]) =>
        name === 'head' ? null : <circle key={name} cx={x} cy={y} r="2.2" fill="#fff" />
      )}

      {/* 理想角度の注釈 */}
      <path d="M 140 168 A 14 14 0 0 1 156 150" fill="none" stroke={RIM} strokeWidth="1.5" />
      <text x="152" y="146" fontSize="11" fontWeight="700" fill={RIM}>95°</text>
      <path d="M 78 186 A 14 14 0 0 0 96 182" fill="none" stroke={RIM} strokeWidth="1.5" />
      <text x="52" y="172" fontSize="11" fontWeight="700" fill={RIM}>168°</text>
      <text x="118" y="22" fontSize="10" fill="rgba(255,255,255,0.55)" textAnchor="middle">
        理想インパクト姿勢
      </text>
    </svg>
  )
}

export default IdealModelFigure

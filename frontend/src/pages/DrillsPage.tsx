import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { GrowthSummary } from '../types'

interface Drill {
  category: string
  icon: string
  title: string
  duration: string
  description: string
  skills: string[]
}

const DRILLS: Drill[] = [
  {
    category: '個人技術',
    icon: '🎯',
    title: '壁当てインサイドキック 100本',
    duration: '15分',
    description: '軸足の位置を毎回確認しながら壁当てを繰り返す。ボールの中心を捉え、返ってきたボールをワンタッチでコントロールする。',
    skills: ['シュート', 'パス']
  },
  {
    category: '個人技術',
    icon: '⚡',
    title: 'コーンジグザグドリブル',
    duration: '15分',
    description: '2m 間隔のコーンを顔を上げたままドリブル。減速からの一気の加速で緩急をつける。',
    skills: ['ドリブル']
  },
  {
    category: '個人技術',
    icon: '🧱',
    title: '壁当てパス → ターン練習',
    duration: '10分',
    description: 'ワンタッチコントロールから前を向く。受ける前に肩越しの確認（スキャン）を必ず入れる。',
    skills: ['パス', 'ポジショニング']
  },
  {
    category: 'チーム戦術',
    icon: '🛡',
    title: 'ライン間圧縮ドリル',
    duration: '15分',
    description: 'DF-MF 2ライン + フリーマン。ライン間パスを通されたら守備側の負け。ライン間 10〜15m の維持を体で覚える。',
    skills: ['守備ブロック', 'コンパクトネス']
  },
  {
    category: 'チーム戦術',
    icon: '🌀',
    title: 'シャドープレー（ブロックスライド）',
    duration: '20分',
    description: 'ボールなしで 11人がポジション移動。コーチの合図でブロック全体を 10 秒以内にスライドさせる。',
    skills: ['コンパクトネス', '守備ブロック']
  },
  {
    category: 'チーム戦術',
    icon: '↔️',
    title: 'ワイドポゼッション 8対8',
    duration: '20分',
    description: 'ピッチ幅いっぱいを使う 8対8。両サイドレーンにタッチ制限ゾーンを設け、幅を取る習慣をつける。',
    skills: ['攻撃の幅']
  },
  {
    category: '判断・認知',
    icon: '🔺',
    title: '3人目の動きドリル',
    duration: '15分',
    description: '3対1 ロンドから前進。レイオフ → 3人目が前向きで受ける形を繰り返し、サポート角度を作り直す。',
    skills: ['パス選択', 'ポジショニング']
  },
  {
    category: '判断・認知',
    icon: '🎲',
    title: 'パス優先順位ロンド 6対3',
    duration: '15分',
    description: '前進パス2点・横パス1点のスコア制。「前進できるときは前進する」判断を鍛える。',
    skills: ['パス選択']
  },
  {
    category: '守備',
    icon: '⏱',
    title: '即時奪回ゲーム',
    duration: '15分',
    description: '5対5 + GK。ボールロスト後 6 秒間のカウンタープレスを義務化し、プレス強度を高める。',
    skills: ['プレス強度', 'フィジカル']
  },
  {
    category: '守備',
    icon: '📏',
    title: 'ラインコントロール練習',
    duration: '15分',
    description: 'DF4枚 + GK でラインの上下動。コーチのボール位置に連動して「アップ」「ステイ」「ドロップ」をコールする。',
    skills: ['守備ブロック', 'ポジショニング']
  }
]

function DrillsPage() {
  const [summary, setSummary] = useState<GrowthSummary | null>(null)
  const [filter, setFilter] = useState<string>('すべて')

  useEffect(() => {
    api.getGrowthSummary().then(setSummary).catch(() => undefined)
  }, [])

  const categories = ['すべて', ...Array.from(new Set(DRILLS.map((d) => d.category)))]
  const visible = filter === 'すべて' ? DRILLS : DRILLS.filter((d) => d.category === filter)

  return (
    <div>
      <h2 className="greeting">練習メニュー</h2>
      <p className="section-label">解析結果に基づくおすすめドリル</p>

      {summary && (
        <div className="drill-banner" style={{ cursor: 'default' }}>
          <div>
            <div className="drill-label">今日のおすすめ</div>
            <div className="drill-menu">{summary.today_drill.menu}</div>
          </div>
        </div>
      )}

      <div className="view-toggle" style={{ marginBottom: 16 }}>
        {categories.map((c) => (
          <button key={c} className={filter === c ? 'active' : ''} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="drill-grid">
        {visible.map((d) => (
          <div key={d.title} className="card drill-card">
            <div className="drill-card-head">
              <span className="drill-icon" aria-hidden>{d.icon}</span>
              <div>
                <div className="drill-title">{d.title}</div>
                <div className="drill-meta">{d.category} ・ {d.duration}</div>
              </div>
            </div>
            <p className="drill-desc">{d.description}</p>
            <div className="drill-skills">
              {d.skills.map((s) => (
                <span key={s} className="drill-skill-tag">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DrillsPage

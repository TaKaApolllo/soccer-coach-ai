import { useState } from 'react'
import { loadProfile, saveProfile } from '../services/profile'
import { CoachLevel } from '../types'

const LEVELS: { id: CoachLevel; label: string; description: string }[] = [
  { id: 'beginner', label: '初心者', description: 'サッカー用語を使わず、やさしい言葉で説明します' },
  { id: 'intermediate', label: '中級者', description: '基本的な戦術用語を使って具体的に説明します' },
  { id: 'advanced', label: '上級者', description: 'ポジショナルプレー等の高度な概念で説明します' }
]

function SettingsPage() {
  const [profile, setProfile] = useState(loadProfile())
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    saveProfile(profile)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <h2 className="greeting">設定</h2>
      <p className="section-label">プロフィールとコーチング設定</p>

      <div className="card">
        <h3 className="card-title">プロフィール</h3>
        <label className="section-label" htmlFor="profile-name">名前</label>
        <input
          id="profile-name"
          className="text-input"
          style={{ marginBottom: 20 }}
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          placeholder="例: ケンタ"
        />

        <h3 className="card-title">AIコーチの説明レベル</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {LEVELS.map((lv) => (
            <button
              key={lv.id}
              className={`analysis-type-btn ${profile.coachLevel === lv.id ? 'selected' : ''}`}
              style={{ textAlign: 'left', borderRadius: 12 }}
              onClick={() => setProfile({ ...profile, coachLevel: lv.id })}
            >
              <strong>{lv.label}</strong>
              <div style={{ fontSize: '0.78rem', opacity: 0.8 }}>{lv.description}</div>
            </button>
          ))}
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSave}>
          {saved ? '保存しました ✓' : '保存する'}
        </button>
      </div>

      <div className="card">
        <h3 className="card-title">このアプリについて</h3>
        <p className="note-text">
          TACTICA AI COACH — 骨格推定によるフォーム解析、フォーメーション自動判定、
          戦術分析、AIコーチングを備えたサッカー分析アプリです。
          解析データはローカルの SQLite に保存されます。
        </p>
      </div>
    </div>
  )
}

export default SettingsPage

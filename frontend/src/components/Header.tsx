import { NavLink } from 'react-router-dom'

export const NAV_ITEMS = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/analysis', icon: '📊', label: '分析' },
  { to: '/growth', icon: '📈', label: '成長記録' },
  { to: '/drills', icon: '⚽', label: '練習メニュー' },
  { to: '/settings', icon: '⚙️', label: '設定' }
]

function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <h1>
          <span role="img" aria-label="tactica">🧠</span>
          TACTICA <span className="brand-ai">AI COACH</span>
        </h1>
        <nav className="top-nav" aria-label="メインナビゲーション">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
              end={item.to === '/'}
            >
              <span aria-hidden>{item.icon}</span> {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

export default Header

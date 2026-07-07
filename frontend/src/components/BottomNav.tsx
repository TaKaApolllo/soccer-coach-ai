import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/analysis', icon: '📹', label: 'フォーム解析' },
  { to: '/formation', icon: '🧭', label: '戦術ボード' },
  { to: '/growth', icon: '📈', label: '成長記録' }
]

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? 'active' : '')}
          end={item.to === '/'}
        >
          <span className="nav-icon" aria-hidden>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default BottomNav

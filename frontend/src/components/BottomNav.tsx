import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './Header'

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="モバイルナビゲーション">
      {NAV_ITEMS.map((item) => (
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

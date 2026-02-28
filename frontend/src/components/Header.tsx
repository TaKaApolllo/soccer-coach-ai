import { Link } from 'react-router-dom'

function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <h1>
          <span role="img" aria-label="soccer">⚽</span>
          Soccer Coach AI
        </h1>
        <nav className="nav-links">
          <Link to="/">ホーム</Link>
          <Link to="/history">履歴</Link>
        </nav>
      </div>
    </header>
  )
}

export default Header

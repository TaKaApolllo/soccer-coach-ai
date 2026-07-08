import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import DashboardPage from './pages/DashboardPage'
import AnalysisDashboardPage from './pages/AnalysisDashboardPage'
import KickAnalysisPage from './pages/KickAnalysisPage'
import GrowthPage from './pages/GrowthPage'
import DrillsPage from './pages/DrillsPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/analysis" element={<AnalysisDashboardPage />} />
          <Route path="/kick" element={<KickAnalysisPage />} />
          <Route path="/formation" element={<Navigate to="/analysis" replace />} />
          <Route path="/growth" element={<GrowthPage />} />
          <Route path="/drills" element={<DrillsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default App

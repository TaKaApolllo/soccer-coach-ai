import { Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import DashboardPage from './pages/DashboardPage'
import AnalysisDashboardPage from './pages/AnalysisDashboardPage'
import KickAnalysisPage from './pages/kick/KickAnalysisPage'
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
          {/* キックフォーム分析（統合後の正式ルート） */}
          <Route path="/analysis/kick" element={<KickAnalysisPage />} />
          {/* 旧ルート（/kick, /kick-pro, /form-analysis）は統合先へリダイレクト */}
          <Route path="/kick" element={<Navigate to="/analysis/kick" replace />} />
          <Route path="/kick-pro" element={<Navigate to="/analysis/kick" replace />} />
          <Route path="/form-analysis" element={<Navigate to="/analysis/kick" replace />} />
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

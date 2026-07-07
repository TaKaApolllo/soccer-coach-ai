import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import DashboardPage from './pages/DashboardPage'
import AnalysisPage from './pages/AnalysisPage'
import FormationPage from './pages/FormationPage'
import GrowthPage from './pages/GrowthPage'

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/formation" element={<FormationPage />} />
          <Route path="/growth" element={<GrowthPage />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default App

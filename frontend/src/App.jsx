import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ForecastExplorer from './pages/ForecastExplorer.jsx';
import AccuracyAnalysis from './pages/AccuracyAnalysis.jsx';

export default function App() {
  return (
    <div className="dark min-h-screen bg-[#0f172a]">
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/forecasts" element={<ForecastExplorer />} />
          <Route path="/accuracy" element={<AccuracyAnalysis />} />
        </Routes>
      </Layout>
    </div>
  );
}

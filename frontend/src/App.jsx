import { Routes, Route, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NotFound from './pages/NotFound.jsx';
import StockDetail from './pages/StockDetail.jsx';
import TechnicalAnalysis from './pages/TechnicalAnalysis.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Trading from './pages/Trading.jsx';
import News from './pages/News.jsx';

export default function App() {
  const location = useLocation();

  return (
    // resetKey lets the boundary recover as soon as the user navigates somewhere else.
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="stock/:symbol" element={<StockDetail />} />
          <Route path="analysis/:symbol" element={<TechnicalAnalysis />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="trading" element={<Trading />} />
          <Route path="news" element={<News />} />
          {/* Unknown addresses get a real page: it lists the routes that are not built yet. */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

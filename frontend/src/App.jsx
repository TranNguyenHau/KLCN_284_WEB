import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NotFound from './pages/NotFound.jsx';
import StockDetail from './pages/StockDetail.jsx';
import TechnicalAnalysis from './pages/TechnicalAnalysis.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Trading from './pages/Trading.jsx';
import News from './pages/News.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Users from './pages/Users.jsx';
import AdminModels from './pages/AdminModels.jsx';
import ModelPerformance from './pages/ModelPerformance.jsx';
import AdminShell from './components/AdminShell.jsx';
import ProtectedRoute, { AdminRoute } from './components/ProtectedRoute.jsx';

export default function App() {
  const location = useLocation();

  return (
    // resetKey lets the boundary recover as soon as the user navigates somewhere else.
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        {/* Public pages: everything else needs a session (the server enforces this too). */}
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="stock/:symbol" element={<StockDetail />} />
            <Route path="analysis/:symbol" element={<TechnicalAnalysis />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="trading" element={<Trading />} />
            <Route path="news" element={<News />} />
            {/* Read-only model performance report for every signed-in user. */}
            <Route path="models" element={<ModelPerformance />} />
            {/* Old address kept alive. */}
            <Route path="users" element={<Navigate to="/admin/users" replace />} />
            {/* Administration area: admins only (AdminRoute here, and Flask answers 403 to everybody else). */}
            <Route path="admin" element={<AdminRoute />}>
              <Route element={<AdminShell />}>
                <Route index element={<Navigate to="/admin/users" replace />} />
                <Route path="users" element={<Users />} />
                <Route path="models" element={<AdminModels />} />
              </Route>
            </Route>
            {/* Unknown addresses get a real page: it lists the routes that are not built yet. */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

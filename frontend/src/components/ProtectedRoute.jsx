import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import { Card } from './Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Gate for every page except /login and /register. Unauthenticated visitors go to /login and come
 * back to where they were. This is a convenience: Flask rejects unauthenticated API calls anyway.
 */
export default function ProtectedRoute() {
  const { t } = useI18n();
  const { status, refresh } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center p-6" role="status" aria-label={t('a11y.loading')}>
        <p className="text-sm text-muted">{t('auth.checkingSession')}</p>
      </div>
    );
  }
  if (status === 'unavailable') {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-md p-6 text-center">
          <div role="alert">
            <p className="font-semibold">{t('auth.sessionUnavailable')}</p>
            <button type="button" className="btn mt-4 inline-flex items-center gap-2" onClick={refresh}>
              <RefreshCw size={14} aria-hidden="true" />{t('common.retry')}
            </button>
          </div>
        </Card>
      </div>
    );
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

/** Only administrators see the page. The server enforces this too (403 on the API). */
export function AdminRoute() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  if (isAdmin) return <Outlet />;
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <div role="alert">
        <ShieldAlert size={22} className="mx-auto text-warn" aria-hidden="true" />
        <h1 className="mt-2 text-lg font-bold">{t('auth.forbiddenTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auth.forbiddenBody')}</p>
        <Link className="btn mt-4 inline-flex items-center gap-2" to="/">
          <Lock size={14} aria-hidden="true" />{t('notFound.goHome')}
        </Link>
      </div>
    </Card>
  );
}

import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { Card } from '../components/Card.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import { authErrorMessage, useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';

export default function Login() {
  const { t } = useI18n();
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const target = typeof location.state?.from === 'string' && location.state.from.startsWith('/') ? location.state.from : '/';
  if (status === 'authenticated') return <Navigate to={target} replace />;

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!identifier.trim() || !password) {
      setError(t('auth.validation.required'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(identifier.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(authErrorMessage(t, err, { 401: 'auth.errors.invalidCredentials' }));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="ambient" aria-hidden="true" />
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-end"><LanguageSwitcher /></div>
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white dark:text-bg">α</span>
            {t('app.name')}
          </div>
          <h1 className="text-xl font-bold">{t('auth.login.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('auth.login.subtitle')}</p>

          {location.state?.registered && (
            <p className="mt-4 rounded-lg border border-up/35 bg-up/10 px-3 py-2 text-sm text-up" role="status">{t('auth.login.registered')}</p>
          )}

          <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
            <label className="block">
              <span className="stat-label">{t('auth.login.identifier')}</span>
              <input className="input mt-1 w-full" name="identifier" autoComplete="username" autoFocus
                value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </label>
            <label className="block">
              <span className="stat-label">{t('auth.login.password')}</span>
              <input className="input mt-1 w-full" name="password" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="text-sm text-down" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
              <LogIn size={15} aria-hidden="true" />{busy ? t('auth.login.submitting') : t('auth.login.submit')}
            </button>
          </form>

          <p className="mt-5 text-sm text-muted">
            {t('auth.login.noAccount')}{' '}
            <Link className="text-accent hover:underline" to="/register">{t('auth.login.registerLink')}</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

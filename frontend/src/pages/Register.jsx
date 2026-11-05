import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Card } from '../components/Card.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import { authErrorMessage, useAuth, validateEmail, validatePassword, validateUsername } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';

export default function Register() {
  const { t } = useI18n();
  const { status, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', fullName: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  if (status === 'authenticated') return <Navigate to="/" replace />;

  function validate() {
    if (!validateUsername(form.username.trim())) return t('auth.validation.username');
    if (!validateEmail(form.email.trim())) return t('auth.validation.email');
    if (!validatePassword(form.password)) return t('auth.validation.password');
    if (form.password !== form.confirm) return t('auth.validation.mismatch');
    if (form.fullName.trim().length > 100) return t('auth.validation.fullName');
    return '';
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      // The role is never sent: the server always creates a standard user.
      await register({
        username: form.username.trim(), email: form.email.trim().toLowerCase(),
        password: form.password, fullName: form.fullName.trim()
      });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (err) {
      setError(authErrorMessage(t, err, { 400: 'auth.errors.invalidInput', 409: 'auth.errors.duplicate' }));
      setBusy(false);
    }
  }

  const field = (name, label, props = {}) => (
    <label className="block">
      <span className="stat-label">{label}</span>
      <input className="input mt-1 w-full" name={name} value={form[name]} onChange={set(name)} {...props} />
    </label>
  );

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="ambient" aria-hidden="true" />
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-end"><LanguageSwitcher /></div>
        <Card className="p-6">
          <h1 className="text-xl font-bold">{t('auth.register.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('auth.register.subtitle')}</p>
          <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
            {field('username', t('auth.register.username'), { autoComplete: 'username', autoFocus: true })}
            <p className="-mt-3 text-xs text-muted">{t('auth.register.usernameHint')}</p>
            {field('email', t('auth.register.email'), { type: 'email', autoComplete: 'email' })}
            {field('fullName', t('auth.register.fullName'), { autoComplete: 'name' })}
            {field('password', t('auth.register.password'), { type: 'password', autoComplete: 'new-password' })}
            <p className="-mt-3 text-xs text-muted">{t('auth.register.passwordHint')}</p>
            {field('confirm', t('auth.register.confirm'), { type: 'password', autoComplete: 'new-password' })}
            {error && <p className="text-sm text-down" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
              <UserPlus size={15} aria-hidden="true" />{busy ? t('auth.register.submitting') : t('auth.register.submit')}
            </button>
          </form>
          <p className="mt-5 text-sm text-muted">
            {t('auth.register.haveAccount')}{' '}
            <Link className="text-accent hover:underline" to="/login">{t('auth.register.loginLink')}</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

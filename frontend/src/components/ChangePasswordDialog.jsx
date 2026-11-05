import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { authErrorMessage, useAuth, validatePassword } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useToast } from '../hooks/useToast.jsx';

export default function ChangePasswordDialog({ open, onClose }) {
  const { t } = useI18n();
  const { changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ old: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firstField = useRef(null);
  // onClose is usually an inline arrow; keep it in a ref so a parent re-render never resets the form.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    setForm({ old: '', next: '', confirm: '' });
    setError('');
    setBusy(false);
    firstField.current?.focus();
    const onKey = (event) => event.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!form.old) return setError(t('auth.validation.required'));
    if (!validatePassword(form.next)) return setError(t('auth.validation.password'));
    if (form.next === form.old) return setError(t('auth.validation.sameAsOld'));
    if (form.next !== form.confirm) return setError(t('auth.validation.mismatch'));
    setBusy(true);
    setError('');
    try {
      await changePassword(form.old, form.next);
      toast.push({ title: t('auth.changePassword.success'), tone: 'success' });
      onClose();
    } catch (err) {
      setError(authErrorMessage(t, err, { 400: 'auth.errors.oldPasswordWrong' }));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="change-password-title"
        className="glass w-full max-w-sm rounded-xl p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 id="change-password-title" className="text-base font-bold">{t('auth.changePassword.title')}</h2>
          <button type="button" className="btn btn-ghost btn-icon px-1.5 py-1.5" onClick={onClose} aria-label={t('auth.changePassword.cancel')}>
            <X size={16} />
          </button>
        </div>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <label className="block">
            <span className="stat-label">{t('auth.changePassword.old')}</span>
            <input ref={firstField} className="input mt-1 w-full" type="password" name="old" autoComplete="current-password"
              value={form.old} onChange={set('old')} />
          </label>
          <label className="block">
            <span className="stat-label">{t('auth.changePassword.new')}</span>
            <input className="input mt-1 w-full" type="password" name="next" autoComplete="new-password"
              value={form.next} onChange={set('next')} />
          </label>
          <label className="block">
            <span className="stat-label">{t('auth.changePassword.confirm')}</span>
            <input className="input mt-1 w-full" type="password" name="confirm" autoComplete="new-password"
              value={form.confirm} onChange={set('confirm')} />
          </label>
          {error && <p className="text-sm text-down" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>{t('auth.changePassword.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{t('auth.changePassword.submit')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

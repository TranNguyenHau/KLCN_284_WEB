import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Card, CardHeader } from '../components/Card.jsx';
import { authErrorMessage, useAuth, validateEmail, validatePassword, validateUsername } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useToast } from '../hooks/useToast.jsx';

const EMPTY = { username: '', email: '', fullName: '', password: '', role: 'user' };

/** Administrator-only user management. Accounts are never deleted, only disabled. The server enforces every rule. */
export default function Users() {
  const { t, locale } = useI18n();
  const { user: me, listUsers, createUser, updateUser } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRows(await listUsers());
    } catch (err) {
      setLoadError(authErrorMessage(t, err));
    }
  }, [listUsers, t]);

  useEffect(() => { load(); }, [load]);

  async function patch(id, change) {
    setPending(id);
    try {
      const updated = await updateUser(id, change);
      setRows((list) => list.map((row) => (row.ma_nguoi_dung === id ? updated : row)));
      toast.push({ title: t('auth.users.updated'), tone: 'success' });
    } catch (err) {
      toast.push({ title: authErrorMessage(t, err, { 409: 'auth.errors.lastAdmin' }), tone: 'error' });
    } finally {
      setPending(null);
    }
  }

  async function onCreate(event) {
    event.preventDefault();
    if (creating) return;
    if (!validateUsername(form.username.trim())) return setFormError(t('auth.validation.username'));
    if (!validateEmail(form.email.trim())) return setFormError(t('auth.validation.email'));
    if (!validatePassword(form.password)) return setFormError(t('auth.validation.password'));
    setCreating(true);
    setFormError('');
    try {
      const created = await createUser({
        username: form.username.trim(), email: form.email.trim().toLowerCase(),
        password: form.password, fullName: form.fullName.trim(), role: form.role
      });
      setRows((list) => [...(list || []), created]);
      setForm(EMPTY);
      toast.push({ title: t('auth.users.created'), tone: 'success' });
    } catch (err) {
      setFormError(authErrorMessage(t, err, { 400: 'auth.errors.invalidInput', 409: 'auth.errors.duplicate' }));
    } finally {
      setCreating(false);
    }
  }

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString(locale) : t('auth.users.never'));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{t('auth.users.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auth.users.subtitle')}</p>
      </div>

      <Card>
        <CardHeader title={t('auth.users.listTitle')} />
        {loadError && (
          <div className="p-4" role="alert">
            <p className="text-sm text-down">{loadError}</p>
            <button type="button" className="btn mt-3" onClick={load}>{t('common.retry')}</button>
          </div>
        )}
        {!loadError && rows === null && <p className="p-4 text-sm text-muted" role="status">{t('common.loading')}</p>}
        {rows && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2">{t('auth.users.username')}</th>
                  <th className="px-4 py-2">{t('auth.users.email')}</th>
                  <th className="px-4 py-2">{t('auth.users.role')}</th>
                  <th className="px-4 py-2">{t('auth.users.status')}</th>
                  <th className="px-4 py-2">{t('auth.users.lastLogin')}</th>
                  <th className="px-4 py-2">{t('auth.users.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {rows.map((row) => (
                  <tr key={row.ma_nguoi_dung} data-testid={`user-row-${row.ten_dang_nhap}`}>
                    <td className="px-4 py-2 font-medium">
                      {row.ten_dang_nhap}
                      {row.ma_nguoi_dung === me?.ma_nguoi_dung && <span className="chip ml-2 bg-raised text-muted">{t('auth.users.you')}</span>}
                      {row.ho_ten && <span className="block text-xs text-muted">{row.ho_ten}</span>}
                    </td>
                    <td className="px-4 py-2">{row.email}</td>
                    <td className="px-4 py-2">
                      <select className="input py-1" aria-label={`${t('auth.users.role')} ${row.ten_dang_nhap}`}
                        value={row.vai_tro} disabled={pending === row.ma_nguoi_dung}
                        onChange={(e) => patch(row.ma_nguoi_dung, { vai_tro: e.target.value })}>
                        <option value="user">{t('auth.menu.role_user')}</option>
                        <option value="admin">{t('auth.menu.role_admin')}</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`chip ${row.dang_hoat_dong ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                        {row.dang_hoat_dong ? t('auth.users.active') : t('auth.users.disabled')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted">{fmt(row.dang_nhap_lan_cuoi)}</td>
                    <td className="px-4 py-2">
                      <button type="button" className="btn" disabled={pending === row.ma_nguoi_dung}
                        onClick={() => patch(row.ma_nguoi_dung, { dang_hoat_dong: !row.dang_hoat_dong })}>
                        {row.dang_hoat_dong ? t('auth.users.disable') : t('auth.users.enable')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={t('auth.users.createTitle')} icon={UserPlus} />
        <form className="grid gap-4 p-4 sm:grid-cols-2" onSubmit={onCreate} noValidate>
          <label className="block">
            <span className="stat-label">{t('auth.register.username')}</span>
            <input className="input mt-1 w-full" name="username" value={form.username} onChange={set('username')} autoComplete="off" />
          </label>
          <label className="block">
            <span className="stat-label">{t('auth.register.email')}</span>
            <input className="input mt-1 w-full" name="email" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
          </label>
          <label className="block">
            <span className="stat-label">{t('auth.register.fullName')}</span>
            <input className="input mt-1 w-full" name="fullName" value={form.fullName} onChange={set('fullName')} autoComplete="off" />
          </label>
          <label className="block">
            <span className="stat-label">{t('auth.register.password')}</span>
            <input className="input mt-1 w-full" name="password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </label>
          <label className="block">
            <span className="stat-label">{t('auth.users.role')}</span>
            <select className="input mt-1 w-full" name="role" value={form.role} onChange={set('role')}>
              <option value="user">{t('auth.menu.role_user')}</option>
              <option value="admin">{t('auth.menu.role_admin')}</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? t('auth.users.creating') : t('auth.users.create')}</button>
          </div>
          {formError && <p className="text-sm text-down sm:col-span-2" role="alert">{formError}</p>}
        </form>
      </Card>
    </div>
  );
}

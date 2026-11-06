import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { Card, CardHeader } from '../components/Card.jsx';
import { authErrorMessage, useAuth, validateEmail, validatePassword, validateUsername } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useToast } from '../hooks/useToast.jsx';

const EMPTY = { username: '', email: '', fullName: '', password: '', role: 'user' };

/**
 * Turn a failed admin call into text. The server's own message is never shown: the machine-readable `reason`
 * (set by Flask for business-rule refusals) or the HTTP status picks a translated message.
 */
function adminErrorMessage(t, error, { deleting = false } = {}) {
  const byReason = {
    LAST_ADMIN: deleting ? 'admin.errors.lastAdminDelete' : 'auth.errors.lastAdmin',
    SELF_DELETE: 'admin.errors.selfDelete',
    HAS_RELATED_DATA: 'admin.errors.hasRelated',
    EMAIL_TAKEN: 'admin.errors.emailTaken',
    DUPLICATE: 'auth.errors.duplicate'
  };
  if (error?.reason && byReason[error.reason]) return t(byReason[error.reason]);
  return authErrorMessage(t, error, { 400: 'auth.errors.invalidInput', 404: 'admin.errors.notFound', 409: 'auth.errors.generic' });
}

/** Small accessible modal used by the edit and delete dialogs. */
function Modal({ title, onClose, children }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="glass w-full max-w-md rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Administrator-only user management (Use Case: phân quyền người dùng). The server enforces every rule. */
export default function Users() {
  const { t, locale } = useI18n();
  const { user: me, listUsers, createUser, updateUser, deleteUser } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // { row, ho_ten, email, error, busy }
  const [confirming, setConfirming] = useState(null); // { row, error, busy }

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRows(await listUsers());
    } catch (err) {
      setLoadError(authErrorMessage(t, err));
    }
  }, [listUsers, t]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (roleFilter !== 'all' && row.vai_tro !== roleFilter) return false;
      if (!q) return true;
      return [row.ten_dang_nhap, row.ho_ten, row.email].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, query, roleFilter]);

  async function patch(id, change) {
    setPending(id);
    try {
      await updateUser(id, change);
      toast.push({ title: t('auth.users.updated'), tone: 'success' });
      await load(); // refresh from the server after every successful change
    } catch (err) {
      toast.push({ title: adminErrorMessage(t, err), tone: 'error' });
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
      await createUser({
        username: form.username.trim(), email: form.email.trim().toLowerCase(),
        password: form.password, fullName: form.fullName.trim(), role: form.role
      });
      setForm(EMPTY);
      toast.push({ title: t('auth.users.created'), tone: 'success' });
      await load();
    } catch (err) {
      setFormError(adminErrorMessage(t, err));
    } finally {
      setCreating(false);
    }
  }

  async function onSaveEdit(event) {
    event.preventDefault();
    if (!editing || editing.busy) return;
    const email = editing.email.trim().toLowerCase();
    const name = editing.ho_ten.trim();
    if (!validateEmail(email)) return setEditing({ ...editing, error: t('auth.validation.email') });
    if (name.length > 100) return setEditing({ ...editing, error: t('auth.validation.fullName') });
    setEditing({ ...editing, busy: true, error: '' });
    try {
      await updateUser(editing.row.ma_nguoi_dung, { ho_ten: name, email });
      setEditing(null);
      toast.push({ title: t('admin.users.saved'), tone: 'success' });
      await load();
    } catch (err) {
      setEditing((e) => (e ? { ...e, busy: false, error: adminErrorMessage(t, err) } : e));
    }
  }

  async function onConfirmDelete() {
    if (!confirming || confirming.busy) return;
    setConfirming({ ...confirming, busy: true, error: '' });
    try {
      await deleteUser(confirming.row.ma_nguoi_dung);
      setConfirming(null);
      toast.push({ title: t('admin.users.deleted'), tone: 'success' });
      await load();
    } catch (err) {
      setConfirming((c) => (c ? { ...c, busy: false, error: adminErrorMessage(t, err, { deleting: true }) } : c));
    }
  }

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(locale) : '—');
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString(locale) : t('auth.users.never'));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t('admin.tabs.users')}</h2>
        <p className="mt-1 text-sm text-muted">{t('auth.users.subtitle')}</p>
      </div>

      <Card>
        <CardHeader title={t('auth.users.listTitle')} right={rows && <span className="text-xs text-muted">{t('admin.users.count', { shown: visible.length, total: rows.length })}</span>} />
        <div className="flex flex-wrap gap-3 border-b border-line/70 p-4">
          <input className="input min-w-[14rem] flex-1" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')} aria-label={t('admin.users.searchLabel')} />
          <select className="input w-44" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label={t('admin.users.roleFilter')}>
            <option value="all">{t('admin.users.allRoles')}</option>
            <option value="user">{t('auth.menu.role_user')}</option>
            <option value="admin">{t('auth.menu.role_admin')}</option>
          </select>
        </div>
        {loadError && (
          <div className="p-4" role="alert">
            <p className="text-sm text-down">{loadError}</p>
            <button type="button" className="btn mt-3" onClick={load}>{t('common.retry')}</button>
          </div>
        )}
        {!loadError && rows === null && <p className="p-4 text-sm text-muted" role="status">{t('common.loading')}</p>}
        {rows && visible.length === 0 && <p className="p-4 text-sm text-muted">{t('admin.users.noMatch')}</p>}
        {rows && visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2">{t('auth.users.username')}</th>
                  <th className="px-4 py-2">{t('admin.users.fullName')}</th>
                  <th className="px-4 py-2">{t('auth.users.email')}</th>
                  <th className="px-4 py-2">{t('auth.users.role')}</th>
                  <th className="px-4 py-2">{t('auth.users.status')}</th>
                  <th className="px-4 py-2">{t('admin.users.created')}</th>
                  <th className="px-4 py-2">{t('auth.users.lastLogin')}</th>
                  <th className="px-4 py-2">{t('auth.users.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {visible.map((row) => {
                  const isMe = row.ma_nguoi_dung === me?.ma_nguoi_dung;
                  const busy = pending === row.ma_nguoi_dung;
                  return (
                    <tr key={row.ma_nguoi_dung} data-testid={`user-row-${row.ten_dang_nhap}`}>
                      <td className="px-4 py-2 font-medium">
                        {row.ten_dang_nhap}
                        {isMe && <span className="chip ml-2 bg-raised text-muted">{t('auth.users.you')}</span>}
                      </td>
                      <td className="px-4 py-2">{row.ho_ten || '—'}</td>
                      <td className="px-4 py-2">{row.email}</td>
                      <td className="px-4 py-2">
                        <select className="input py-1" aria-label={`${t('auth.users.role')} ${row.ten_dang_nhap}`}
                          value={row.vai_tro} disabled={busy}
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
                      <td className="px-4 py-2 text-muted">{fmtDate(row.ngay_tao)}</td>
                      <td className="px-4 py-2 text-muted">{fmt(row.dang_nhap_lan_cuoi)}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className="btn" disabled={busy}
                            onClick={() => setEditing({ row, ho_ten: row.ho_ten || '', email: row.email, error: '', busy: false })}>
                            <Pencil size={13} aria-hidden="true" />{t('admin.users.edit')}
                          </button>
                          <button type="button" className="btn" disabled={busy}
                            onClick={() => patch(row.ma_nguoi_dung, { dang_hoat_dong: !row.dang_hoat_dong })}>
                            {row.dang_hoat_dong ? t('auth.users.disable') : t('auth.users.enable')}
                          </button>
                          <button type="button" className="btn" disabled={busy || isMe}
                            title={isMe ? t('admin.errors.selfDelete') : undefined}
                            onClick={() => setConfirming({ row, error: '', busy: false })}>
                            <Trash2 size={13} aria-hidden="true" />{t('admin.users.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {editing && (
        <Modal title={t('admin.users.editTitle')} onClose={() => setEditing(null)}>
          <form className="space-y-4" onSubmit={onSaveEdit} noValidate>
            <p className="text-sm text-muted">{editing.row.ten_dang_nhap}</p>
            <label className="block">
              <span className="stat-label">{t('admin.users.fullName')}</span>
              <input className="input mt-1 w-full" name="ho_ten" value={editing.ho_ten}
                onChange={(e) => setEditing({ ...editing, ho_ten: e.target.value })} />
            </label>
            <label className="block">
              <span className="stat-label">{t('auth.users.email')}</span>
              <input className="input mt-1 w-full" name="email" type="email" value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </label>
            {editing.error && <p className="text-sm text-down" role="alert">{editing.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setEditing(null)}>{t('admin.users.cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={editing.busy}>{editing.busy ? t('admin.users.saving') : t('admin.users.save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {confirming && (
        <Modal title={t('admin.users.deleteTitle')} onClose={() => setConfirming(null)}>
          <p className="text-sm">{t('admin.users.deleteBody', { name: confirming.row.ten_dang_nhap })}</p>
          {confirming.error && <p className="mt-3 text-sm text-down" role="alert">{confirming.error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>{t('admin.users.cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={confirming.busy} onClick={onConfirmDelete}>
              {confirming.busy ? t('admin.users.deleting') : t('admin.users.deleteConfirm')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

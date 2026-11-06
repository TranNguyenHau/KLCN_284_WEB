import { NavLink, Outlet } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';

/** Frame that makes /admin/* look like a separate administration area. Access is enforced by AdminRoute and by Flask. */
export default function AdminShell() {
  const { t } = useI18n();
  const tab = ({ isActive }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raised hover:text-ink'}`;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck size={18} className="text-accent" aria-hidden="true" />
          <h1 className="text-lg font-bold">{t('admin.title')}</h1>
          <span className="chip bg-accent/15 text-accent">{t('admin.badge')}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{t('admin.subtitle')}</p>
        <nav className="mt-3 flex flex-wrap gap-1" aria-label={t('admin.title')}>
          <NavLink to="/admin/users" className={tab}>{t('admin.tabs.users')}</NavLink>
          <NavLink to="/admin/models" className={tab}>{t('admin.tabs.models')}</NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}

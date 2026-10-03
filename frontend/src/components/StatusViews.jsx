import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';

export function Spinner({ className = 'h-4 w-4' }) {
  const { t } = useI18n();
  return <span className={`inline-block animate-spin rounded-full border-2 border-line border-t-accent ${className}`} role="status" aria-label={t('a11y.loading')} />;
}

export function LoadingBlock({ label, height = 'h-40' }) {
  const { t } = useI18n();
  return (
    <div className={`flex ${height} items-center justify-center gap-2 text-sm text-muted`} role="status">
      <Spinner />
      {label || t('common.loading')}
    </div>
  );
}

export function ErrorBox({ error, onRetry, title }) {
  const { t } = useI18n();
  return (
    <div className="m-4 rounded-lg border border-down/40 bg-down/10 p-3 text-sm" role="alert">
      <div className="flex items-center gap-2 font-medium text-down">
        <TriangleAlert size={16} />
        {title || t('common.errorTitle')}
      </div>
      <p className="mt-1 text-ink">{error?.message || String(error)}</p>
      {onRetry && (
        <button className="btn mt-2" onClick={onRetry}>
          <RefreshCw size={14} />
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function Empty({ children }) {
  const { t } = useI18n();
  return <div className="px-4 py-8 text-center text-sm text-muted">{children || t('common.empty')}</div>;
}

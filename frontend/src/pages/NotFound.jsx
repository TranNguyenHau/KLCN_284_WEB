import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, Construction, Home, Search, TrendingUp } from 'lucide-react';
import { Card, CardHeader } from '../components/Card.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';

/**
 * Addresses that are referenced by the product plan but have no page yet. They are
 * listed here on purpose so the missing routes are visible instead of silently
 * redirecting to the dashboard.
 */
const PLANNED = [
  { path: '/technical', labelKey: 'notFound.plannedTechnical', instead: { to: '/analysis/VIC', label: '/analysis/VIC' } },
  { path: '/screener', labelKey: 'notFound.plannedScreener' },
  { path: '/compare', labelKey: 'notFound.plannedCompare' },
  { path: '/reports', labelKey: 'notFound.plannedReports' },
  { path: '/settings', labelKey: 'notFound.plannedSettings' }
];

const LIVE = [
  { to: '/', labelKey: 'nav.dashboard' },
  { to: '/portfolio', labelKey: 'nav.portfolio' },
  { to: '/trading', labelKey: 'nav.trading' },
  { to: '/news', labelKey: 'nav.news' },
  { to: '/analysis/VIC', labelKey: 'nav.analysis' }
];

export default function NotFound() {
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const stocks = useApi(() => api.searchStocks(''), []);

  const attempted = `${pathname}${search}`;
  // /stocks/MWG, /stock/mwg/… and /analysis/mwg all point at one of the two deep-link routes.
  const deepLink = pathname.match(/^\/(stocks?|analysis)\/([^/]+)/i);
  const attemptedSymbol = deepLink ? decodeURIComponent(deepLink[2]).toUpperCase() : null;
  const symbols = (stocks.data || []).map((stock) => stock.symbol);
  const isKnownSymbol = attemptedSymbol ? symbols.includes(attemptedSymbol) : false;

  // history.state.idx is 0 on the first entry of the tab, so there is nothing to go back to.
  const index = window.history.state?.idx;
  const canGoBack = index != null ? index > 0 : window.history.length > 1;
  const goBack = () => (canGoBack ? navigate(-1) : navigate('/'));

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="fade-in-up space-y-4 p-6">
          <p className="font-mono text-5xl font-bold tracking-tight text-accent">404</p>
          <div className="flex items-start gap-3">
            <Compass size={20} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold">{t('notFound.title')}</h1>
              <p className="mt-1 text-sm text-muted">{t('notFound.subtitle')}</p>
            </div>
          </div>

          <div className="min-w-0">
            <p className="stat-label">{t('notFound.attempted')}</p>
            <code className="mt-1 block break-all rounded-lg border border-line/70 bg-surface/60 px-3 py-2 font-mono text-sm text-ink">{attempted}</code>
          </div>

          {attemptedSymbol && (
            <p className={`rounded-lg border px-3 py-2 text-sm ${isKnownSymbol ? 'border-up/35 bg-up/10 text-up' : 'border-warn/35 bg-warn/10 text-warn'}`}>
              {t(isKnownSymbol ? 'notFound.symbolKnown' : 'notFound.symbolUnknown', { symbol: attemptedSymbol })}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={goBack}>
              <ArrowLeft size={14} />
              {t('notFound.goBack')}
            </button>
            {attemptedSymbol && (
              <Link className="btn btn-primary" to={`/stock/${attemptedSymbol}`}>
                <TrendingUp size={14} />
                {t('notFound.openSymbol', { symbol: attemptedSymbol })}
              </Link>
            )}
            <Link className="btn" to="/">
              <Home size={14} />
              {t('notFound.goHome')}
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('notFound.liveTitle')} subtitle={t('notFound.liveSubtitle')} />
          <ul className="divide-y divide-line/60">
            {LIVE.map((page) => (
              <li key={page.to} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link className="min-w-0 truncate text-sm font-medium hover:text-accent" to={page.to}>
                  {t(page.labelKey)}
                </Link>
                <code className="shrink-0 font-mono text-xs text-muted">{page.to}</code>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={t('notFound.plannedTitle')}
            subtitle={t('notFound.plannedSubtitle')}
            right={
              <span className="chip shrink-0 bg-warn/15 text-warn">
                <Construction size={12} />
                {t('notFound.plannedTag')}
              </span>
            }
          />
          <ul className="divide-y divide-line/60">
            {PLANNED.map((route) => (
              <li key={route.path} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <code className="break-all font-mono text-sm text-muted line-through">{route.path}</code>
                  <span className="chip shrink-0 bg-raised text-muted">{t('notFound.plannedTag')}</span>
                </div>
                <p className="mt-1 text-sm">{t(route.labelKey)}</p>
                {route.instead && (
                  <p className="mt-1 text-xs text-muted">
                    {t('notFound.useInstead')}{' '}
                    <Link className="text-accent hover:underline" to={route.instead.to}>
                      {route.instead.label}
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('notFound.stockPagesTitle')} subtitle={t('notFound.stockPagesSubtitle', { example: '/stock/MWG' })} />
        <div className="p-4">
          {stocks.loading && !stocks.data && (
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <Skeleton key={key} className="h-7 w-16" />
              ))}
            </div>
          )}
          {stocks.error && <p className="text-sm text-muted">{t('common.empty')}</p>}
          {stocks.data && (
            <div className="flex flex-wrap gap-2">
              {stocks.data.map((stock) => (
                <Link
                  key={stock.symbol}
                  to={`/stock/${stock.symbol}`}
                  className="chip border border-line/70 bg-raised transition-colors hover:border-accent/50 hover:text-accent"
                  title={stock.name}
                >
                  {stock.symbol}
                </Link>
              ))}
            </div>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <Search size={13} className="shrink-0" />
            {t('notFound.searchHint')}
          </p>
        </div>
      </Card>
    </div>
  );
}

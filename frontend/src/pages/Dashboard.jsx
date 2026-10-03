import { Plus, Star, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader } from '../components/Card.jsx';
import { ErrorBox } from '../components/StatusViews.jsx';
import StockTable from '../components/StockTable.jsx';
import SearchBox from '../components/SearchBox.jsx';
import SentimentBadge from '../components/SentimentBadge.jsx';
import PriceChange from '../components/PriceChange.jsx';
import Sparkline from '../components/charts/Sparkline.jsx';
import { Skeleton, SkeletonTable } from '../components/Skeleton.jsx';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { fmtPct, fmtPrice, trendClass } from '../utils/format.js';

function SentimentCard({ sentiment, breadth }) {
  const { t } = useI18n();
  const position = Math.round(((sentiment.score + 1) / 2) * 100);

  return (
    <Card hover>
      <CardHeader title={t('dashboard.sentiment')} subtitle={t('dashboard.sentimentMethod')} right={<SentimentBadge label={sentiment.label} score={sentiment.score} />} />
      <div className="space-y-4 p-4">
        <div>
          <div className="relative h-2 rounded-full bg-gradient-to-r from-down via-raised to-up">
            <span className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded bg-ink transition-[left] duration-500" style={{ left: `calc(${position}% - 2px)` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{t('dashboard.bearish')}</span>
            <span>{t('dashboard.neutral')}</span>
            <span>{t('dashboard.bullish')}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-up">{breadth.advancers}</div>
            <div className="break-words text-xs leading-snug text-muted">{t('dashboard.advancing')}</div>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-muted">{breadth.unchanged}</div>
            <div className="break-words text-xs leading-snug text-muted">{t('dashboard.unchanged')}</div>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-down">{breadth.decliners}</div>
            <div className="break-words text-xs leading-snug text-muted">{t('dashboard.declining')}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function WatchlistCard() {
  const { t } = useI18n();
  const list = useApi(api.watchlist, []);
  const all = useApi(() => api.searchStocks(''), []);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const inList = new Set((list.data || []).map((stock) => stock.symbol));

  const mutate = async (fn) => {
    setBusy(true);
    try {
      await fn();
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('dashboard.watchlist')}
        icon={Star}
        right={
          <div className="flex gap-2">
            <select className="input w-32 py-1" value={pick} onChange={(event) => setPick(event.target.value)} aria-label={t('dashboard.addToWatchlist')}>
              <option value="">{t('dashboard.addStock')}</option>
              {(all.data || [])
                .filter((stock) => !inList.has(stock.symbol))
                .map((stock) => (
                  <option key={stock.symbol} value={stock.symbol}>
                    {stock.symbol}
                  </option>
                ))}
            </select>
            <button
              className="btn btn-icon px-2"
              disabled={!pick || busy}
              onClick={() => mutate(async () => { await api.addWatch(pick); setPick(''); })}
              aria-label={t('common.add')}
            >
              <Plus size={14} />
            </button>
          </div>
        }
      />
      {list.loading && !list.data && <SkeletonTable rows={4} columns={3} />}
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && (
        // The watchlist grows without limit, so it scrolls instead of pushing the row taller.
        <div className="max-h-[440px] overflow-y-auto">
          <StockTable
            rows={list.data}
            showVolume={false}
            stickyHeader
            action={(row) => (
              <button className="text-muted transition-colors hover:text-down" onClick={() => mutate(() => api.removeWatch(row.symbol))} aria-label={t('dashboard.removeFromWatchlist', { symbol: row.symbol })}>
                <X size={14} />
              </button>
            )}
          />
        </div>
      )}
    </Card>
  );
}

/**
 * One mover column: a header, a capped scrolling table and a summary line. The card keeps
 * its own height - nothing about a neighbouring column may stretch this list.
 */
function MoversCard({ title, icon: Icon, tone, rows }) {
  const { t } = useI18n();
  const average = rows?.length ? rows.reduce((sum, row) => sum + (row.changePercent || 0), 0) / rows.length : null;
  /*
   * The body is 400px so the whole card lands on the same height as the watchlist card once
   * that one starts scrolling: 56px header + 440px body for the watchlist, versus 56px header
   * + 400px body + 41px summary line here. A full six-row list shares the fixed height between
   * its rows; a short list keeps natural rows instead of stretching two entries into giant
   * bands, and a longer list scrolls.
   */
  const full = (rows?.length || 0) >= 5;

  return (
    <Card>
      <CardHeader title={title} subtitle={t('dashboard.moversByChange')} right={<Icon size={16} className={`shrink-0 ${tone}`} />} />
      <div className={`${full ? 'h-[400px]' : 'max-h-[400px]'} overflow-y-auto`}>
        <StockTable rows={rows} showVolume={false} stickyHeader fill={full} />
      </div>
      {average != null && (
        <p className="flex items-center justify-between gap-3 border-t border-line/70 px-4 py-3 text-xs text-muted">
          {t('dashboard.moversAverage')}
          <span className={`font-semibold tabular-nums ${trendClass(average)}`}>{fmtPct(average)}</span>
        </p>
      )}
    </Card>
  );
}

/*
 * The simulated-account summary used to sit in the mover/watchlist row. It is gone from
 * the dashboard on purpose: the portfolio page owns those numbers, and the space goes to
 * the two mover tables.
 */

export default function Dashboard() {
  const { t } = useI18n();
  const { data, loading, error, reload } = useApi(api.overview, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('dashboard.title')}</h1>
          {data && (
            <p className="text-sm text-muted">
              {t('market.asOf', { date: data.asOf })} {data.isRealtime ? t('market.liveData') : t('market.sampleData')}
            </p>
          )}
          {!data && !error && <Skeleton className="mt-2 h-4 w-64" />}
        </div>
        <SearchBox className="w-full sm:w-80" />
      </div>

      {loading && !data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <Card key={key} className="p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-32" />
                <Skeleton className="mt-4 h-10 w-full" />
              </Card>
            ))}
          </div>
          {/* Mirrors the loaded layout: two mover columns side by side plus the right rail. */}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
            {[0, 1].map((key) => (
              <Card key={key}>
                <div className="p-4">
                  <Skeleton className="h-4 w-32" />
                </div>
                <SkeletonTable rows={6} columns={3} />
              </Card>
            ))}
            <div className="grid content-start gap-4">
              {[0, 1].map((key) => (
                <Card key={key}>
                  <div className="p-4">
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <SkeletonTable rows={3} columns={3} />
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {error && (
        <Card>
          <ErrorBox error={error} onRetry={reload} />
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {data.indices.map((index) => (
              // The change chip used to be pinned beside a text-2xl value, so at five
              // columns it spilled out of the card. It may wrap to its own line now, and
              // the value sits on the line below where it always fits.
              <Card key={index.symbol} className="overflow-hidden p-4" glass hover>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                  <p className="min-w-0 truncate text-sm text-muted" title={index.name}>
                    {index.name}
                  </p>
                  <PriceChange className="shrink-0 text-xs sm:text-sm" change={index.change} percent={index.changePercent} digits={2} />
                </div>
                <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{fmtPrice(index.value, 2)}</p>
                <div className="mt-2">
                  <Sparkline data={index.spark} positive={index.changePercent >= 0} />
                </div>
              </Card>
            ))}
          </div>

          {/*
           * Gainers and losers sit next to each other and keep their own height (items-start):
           * a long watchlist must not stretch them. Their bodies have a fixed height (see
           * MoversCard) so the three cards end on the same line. Below xl everything stacks
           * in one column.
           */}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
            <MoversCard title={t('dashboard.topGainers')} icon={TrendingUp} tone="text-up" rows={data.topGainers} />
            <MoversCard title={t('dashboard.topLosers')} icon={TrendingDown} tone="text-down" rows={data.topLosers} />

            <div className="grid content-start gap-4">
              <SentimentCard sentiment={data.sentiment} breadth={data.breadth} />
              <WatchlistCard />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

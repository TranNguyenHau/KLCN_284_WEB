import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, Sparkles, Star } from 'lucide-react';
import AiInsightsDrawer from '../components/AiInsightsDrawer.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import PriceAlertWidget from '../components/PriceAlertWidget.jsx';
import PriceChange from '../components/PriceChange.jsx';
import PredictionPanel from '../components/PredictionPanel.jsx';
import SentimentBadge from '../components/SentimentBadge.jsx';
import Stat from '../components/Stat.jsx';
import { Skeleton, SkeletonChart } from '../components/Skeleton.jsx';
import { Card, CardHeader } from '../components/Card.jsx';
import { ErrorBox, LoadingBlock } from '../components/StatusViews.jsx';
import CandleChart from '../components/charts/CandleChart.jsx';
import PriceChart from '../components/charts/PriceChart.jsx';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../i18n/index.jsx';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { useToast } from '../hooks/useToast.jsx';
import { api } from '../services/api.js';
import { downloadHistoryCsv, openSummaryReport } from '../utils/export.js';
import { fmtCompact, fmtPrice, timeAgo } from '../utils/format.js';
import { rememberSymbol } from '../utils/recents.js';

const RANGES = ['1M', '3M', '6M', '1Y'];

function Segmented({ options, value, onChange, format = (option) => option, label }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${value === option ? 'bg-accent text-white dark:text-bg' : 'text-muted hover:text-ink'}`}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}

export default function StockDetail() {
  const { symbol: raw } = useParams();
  const symbol = raw.toUpperCase();
  const { t } = useI18n();
  const { push } = useToast();
  const [range, setRange] = useState('3M');
  const [days, setDays] = useState(7);
  // Remembered across pages: whoever prefers candles gets candles everywhere.
  const [mode, setMode] = useLocalStorage('alpha.chart-mode', 'line');
  const [insightsOpen, setInsightsOpen] = useLocalStorage('alpha.insights-open', true);

  // Six requests leave this page at once, so each one is cancellable: pressing back
  // aborts them instead of letting them finish against a page that is already gone.
  const quote = useApi((signal) => api.stock(symbol, { signal }), [symbol]);
  const history = useApi((signal) => api.history(symbol, range, { signal }), [symbol, range]);
  const prediction = useApi((signal) => api.prediction(symbol, days, { signal }), [symbol, days]);
  const indicators = useApi((signal) => api.indicators(symbol, range, { signal }), [symbol, range]);
  const news = useApi((signal) => api.news({ symbol }, { signal }), [symbol]);
  const watchlist = useApi(api.watchlist, []);

  useEffect(() => rememberSymbol(symbol), [symbol]);

  const quoteData = quote.data;
  const watched = (watchlist.data || []).some((item) => item.symbol === symbol);
  const lastPrediction = prediction.data?.predictions?.at(-1);
  const lastActual = prediction.data?.meta?.last_actual_close;
  const trend =
    lastPrediction && lastActual
      ? { direction: lastPrediction.predicted_price > lastActual ? 'up' : lastPrediction.predicted_price < lastActual ? 'down' : 'flat' }
      : null;

  const askAlpha = () => window.dispatchEvent(new CustomEvent('alpha:ask', { detail: { prompt: t('stock.askPrompt', { symbol }) } }));

  const exportCsv = () => {
    downloadHistoryCsv({ symbol, history: history.data?.history || [], predictions: prediction.data?.predictions || [] });
    push({ tone: 'success', title: t('export.csvDone') });
  };

  const exportPdf = () => {
    const opened = openSummaryReport({
      symbol,
      name: quoteData?.name,
      quote: quoteData,
      prediction: prediction.data,
      indicators: indicators.data,
      history: history.data?.history || [],
      labels: {
        title: t('export.reportTitle'),
        generated: t('export.reportGenerated'),
        quote: t('export.reportQuote'),
        metric: t('export.metric'),
        value: t('common.value'),
        open: t('stock.open'),
        high: t('stock.high'),
        low: t('stock.low'),
        previousClose: t('stock.previousClose'),
        price: t('common.price'),
        change: t('common.change'),
        volume: t('stock.volume'),
        date: t('common.date'),
        currency: t('stock.currency'),
        prediction: t('export.reportPrediction'),
        predictedPrice: t('prediction.predictedPrice'),
        range: t('prediction.range'),
        indicators: t('export.reportIndicators'),
        indicator: t('export.indicator'),
        signal: t('export.signal'),
        note: t('export.note'),
        history: t('export.reportHistory'),
        disclaimer: t('export.reportDisclaimer')
      }
    });
    if (!opened) push({ tone: 'error', title: t('export.popupBlocked') });
  };

  // The command palette can trigger the same export without knowing the page internals.
  const exportRef = useRef({ csv: exportCsv, pdf: exportPdf });
  exportRef.current = { csv: exportCsv, pdf: exportPdf };
  useEffect(() => {
    const handler = (event) => exportRef.current[event.detail?.format === 'pdf' ? 'pdf' : 'csv']();
    window.addEventListener('alpha:export', handler);
    return () => window.removeEventListener('alpha:export', handler);
  }, []);

  const addToWatchlist = async () => {
    await api.addWatch(symbol);
    watchlist.reload();
  };

  const stats = quoteData
    ? [
        [t('stock.open'), fmtPrice(quoteData.open)],
        [t('stock.high'), fmtPrice(quoteData.high)],
        [t('stock.low'), fmtPrice(quoteData.low)],
        [t('stock.previousClose'), fmtPrice(quoteData.previousClose)],
        [t('stock.volume'), fmtCompact(quoteData.volume)]
      ]
    : [];

  if (quote.error) {
    return (
      <Card>
        <ErrorBox error={quote.error} title={t('common.errorTitleNamed', { name: symbol })} onRetry={quote.reload} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {!quoteData ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-3 w-64" />
          </div>
        ) : (
          <div className="fade-in-up">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{quoteData.symbol}</h1>
              <span className="text-sm text-muted">
                {quoteData.name}, {quoteData.exchange}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="break-words text-2xl font-semibold tabular-nums sm:text-3xl">{fmtPrice(quoteData.price)}</span>
              <span className="text-sm text-muted">{t('stock.currency')}</span>
              <PriceChange change={quoteData.change} percent={quoteData.changePercent} />
            </div>
            <div className="mt-1 text-xs text-muted">
              {t('stock.closeOn', { date: quoteData.asOf })} {quoteData.isRealtime ? t('market.liveData') : t('market.sampleData')}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={addToWatchlist} disabled={watched}>
            <Star size={14} className={watched ? 'fill-warn text-warn' : ''} />
            {t(watched ? 'stock.inWatchlist' : 'stock.addToWatchlist')}
          </button>
          <Link className="btn" to={`/analysis/${symbol}`}>
            <Activity size={14} />
            {t('stock.technicalAnalysis')}
          </Link>
          <ExportMenu onCsv={exportCsv} onPdf={exportPdf} disabled={!history.data} />
          <button className="btn btn-primary" onClick={askAlpha}>
            <Sparkles size={14} />
            {t('stock.askAlpha')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {quoteData
          ? stats.map(([label, value]) => (
              <Card key={label} className="overflow-hidden px-4 py-3" hover>
                <Stat label={label} value={value} />
              </Card>
            ))
          : [0, 1, 2, 3, 4].map((key) => (
              <Card key={key} className="overflow-hidden px-4 py-3">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="mt-3 h-5 w-full max-w-24" />
              </Card>
            ))}
      </div>

      <div className="flex flex-col gap-5 xl:flex-row">
        <Card className="min-w-0 flex-1">
          <CardHeader
            title={t(mode === 'line' ? 'stock.chartLineTitle' : 'stock.chartCandleTitle')}
            subtitle={t(mode === 'line' ? 'stock.chartLineSubtitle' : 'stock.chartCandleSubtitle')}
            right={
              <div className="flex flex-wrap justify-end gap-2">
                <Segmented options={['line', 'candle']} value={mode} onChange={setMode} label={t('stock.chartMode')} format={(value) => t(value === 'line' ? 'stock.modeLine' : 'stock.modeCandle')} />
                <Segmented options={RANGES} value={range} onChange={setRange} label={t('common.range')} format={(value) => t(`stock.range${value}`)} />
                {mode === 'line' && <Segmented options={[7, 30]} value={days} onChange={setDays} label={t('stock.forecastRange')} format={(value) => t('stock.forecastDays', { days: value })} />}
              </div>
            }
          />
          <div className="p-3">
            {history.loading && !history.data && <SkeletonChart height="h-[380px]" />}
            {history.error && <ErrorBox error={history.error} onRetry={history.reload} />}
            {history.data && (mode === 'line' ? <PriceChart history={history.data.history} predictions={prediction.data?.predictions} /> : <CandleChart history={history.data.history} />)}
            {mode === 'line' && prediction.loading && <p className="px-2 text-xs text-muted">{t('stock.predictionPending')}</p>}
            {mode === 'line' && prediction.error && <p className="px-2 text-xs text-warn">{t('stock.noForecastOnChart', { message: prediction.error.message })}</p>}
          </div>
        </Card>

        <div className={`w-full transition-[width] duration-200 ${insightsOpen ? 'xl:w-[344px] xl:shrink-0' : 'xl:w-[54px] xl:shrink-0'}`}>
          <AiInsightsDrawer open={insightsOpen} onToggle={() => setInsightsOpen((value) => !value)} state={indicators} symbol={symbol} trend={trend} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <PredictionPanel state={prediction} days={days} onRetry={prediction.reload} />
        <PriceAlertWidget symbol={symbol} price={quoteData?.price} />
        <Card>
          <CardHeader title={t('stock.newsTitle', { symbol })} right={news.data && <SentimentBadge label={news.data.summary.label} score={news.data.summary.averageScore} />} />
          {news.loading && !news.data && <LoadingBlock height="h-32" />}
          {news.error && <ErrorBox error={news.error} onRetry={news.reload} />}
          {news.data && (
            <ul className="divide-y divide-line/60">
              {news.data.articles.slice(0, 5).map((article) => (
                <li key={article.id} className="px-4 py-3">
                  <div className="text-sm font-medium">{article.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    {timeAgo(article.publishedAt, t)} <SentimentBadge label={article.sentiment.label} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

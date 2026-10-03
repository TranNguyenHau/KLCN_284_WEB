import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader } from '../components/Card.jsx';
import { ErrorBox, LoadingBlock } from '../components/StatusViews.jsx';
import SentimentBadge from '../components/SentimentBadge.jsx';
import { BollingerChart, MacdChart, MovingAverageChart, RsiChart, VolumeChart } from '../components/charts/IndicatorCharts.jsx';
import { useApi } from '../hooks/useApi.js';
import { INDICATOR_KEYS, useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { fmtPrice } from '../utils/format.js';

const RANGES = ['1M', '3M', '6M', '1Y', '2Y'];

export default function TechnicalAnalysis() {
  const { t } = useI18n();
  const { symbol: raw } = useParams();
  const symbol = raw.toUpperCase();
  const navigate = useNavigate();
  const [range, setRange] = useState('6M');
  const stocks = useApi(() => api.searchStocks(''), []);
  // The indicator payload is the heaviest response in the app, so it is cancellable.
  const { data, loading, error, reload } = useApi((signal) => api.indicators(symbol, range, { signal }), [symbol, range]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('analysis.title', { symbol })}</h1>
          <p className="text-sm text-muted">{t('analysis.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-32" value={symbol} onChange={(event) => navigate(`/analysis/${event.target.value}`)} aria-label={t('common.stock')}>
            {(stocks.data || [{ symbol }]).map((stock) => (
              <option key={stock.symbol} value={stock.symbol}>
                {stock.symbol}
              </option>
            ))}
          </select>
          <select className="input w-28" value={range} onChange={(event) => setRange(event.target.value)} aria-label={t('common.range')}>
            {RANGES.map((option) => (
              <option key={option} value={option}>
                {t(`stock.range${option}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !data && <LoadingBlock label={t('status.calculatingIndicators')} height="h-64" />}
      {error && (
        <Card>
          <ErrorBox error={error} onRetry={reload} />
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader
              title={t('analysis.signalSummary')}
              right={<SentimentBadge label={data.bias} />}
              subtitle={t('analysis.signalCounts', { bullish: data.counts.bullish, bearish: data.counts.bearish, neutral: data.counts.neutral })}
            />
            <div className="grid gap-px bg-line/60 sm:grid-cols-2 lg:grid-cols-5">
              {data.signals.map((signal) => (
                <div key={signal.indicator} className="min-w-0 bg-surface p-4 transition-colors hover:bg-raised/50">
                  <p className="break-words text-xs leading-snug text-muted">{INDICATOR_KEYS[signal.indicator] ? t(INDICATOR_KEYS[signal.indicator]) : signal.indicator}</p>
                  <p className="stat-value">{fmtPrice(signal.value, signal.value < 100 ? 2 : 0)}</p>
                  <div className="mt-1">
                    <SentimentBadge label={signal.signal} />
                  </div>
                  <p className="mt-2 break-words text-xs leading-snug text-muted">{signal.detail}</p>
                </div>
              ))}
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('analysis.movingAverages')} subtitle={t('analysis.movingAveragesSubtitle')} />
              <div className="p-3">
                <MovingAverageChart data={data.series} />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('analysis.bollinger')} subtitle={t('analysis.bollingerSubtitle')} />
              <div className="p-3">
                <BollingerChart data={data.series} />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('analysis.rsi')} subtitle={t('analysis.rsiSubtitle')} />
              <div className="p-3">
                <RsiChart data={data.series} />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('analysis.macd')} subtitle={t('analysis.macdSubtitle')} />
              <div className="p-3">
                <MacdChart data={data.series} />
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title={t('analysis.volume')} subtitle={t('analysis.volumeSubtitle')} />
            <div className="p-3">
              <VolumeChart data={data.series} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

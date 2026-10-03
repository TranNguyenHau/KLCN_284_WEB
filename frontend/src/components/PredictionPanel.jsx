import { Cpu } from 'lucide-react';
import { Card, CardHeader } from './Card.jsx';
import { ErrorBox } from './StatusViews.jsx';
import PriceChange from './PriceChange.jsx';
import { SkeletonLines } from './Skeleton.jsx';
import { useI18n } from '../i18n/index.jsx';
import { fmtPrice } from '../utils/format.js';

// Errors that mean "the ML service is not serving a model yet", not "this request was wrong".
const ML_CODES = ['ML_SERVICE_UNAVAILABLE', 'ML_MODEL_NOT_READY', 'ML_SERVICE_TIMEOUT', 'ML_SERVICE_ERROR', 'ML_INVALID_REQUEST'];

export default function PredictionPanel({ state, days, onRetry }) {
  const { t } = useI18n();
  const { data, error, loading } = state;
  const last = data?.predictions?.at(-1);
  const base = data?.meta?.last_actual_close;
  const change = last && base ? last.predicted_price - base : null;
  const percent = change != null ? (change / base) * 100 : null;

  return (
    <Card>
      <CardHeader title={t('prediction.title', { days })} subtitle={t('prediction.subtitle')} right={<Cpu size={16} className="text-forecast" />} />
      {loading && !data && (
        <div className="p-4">
          <SkeletonLines lines={4} />
          <p className="mt-3 text-xs text-muted">{t('status.runningInference')}…</p>
        </div>
      )}
      {error && (
        <>
          <ErrorBox error={error} title={t('prediction.unavailable')} onRetry={onRetry} />
          {ML_CODES.includes(error.code) && <p className="px-4 pb-4 text-xs text-muted">{t('prediction.fallback')}</p>}
        </>
      )}
      {data && (
        <div className={loading ? 'opacity-60' : ''}>
          <div className="border-b border-line/70 px-4 py-3">
            <div className="break-words text-xs leading-snug text-muted">{t('prediction.estimatedClose', { date: last.date })}</div>
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="break-words text-2xl font-semibold tabular-nums text-forecast text-glow">{fmtPrice(last.predicted_price)}</span>
              <PriceChange change={change} percent={percent} />
            </div>
            <div className="mt-1 text-xs text-muted">{t('prediction.comparedWith', { price: fmtPrice(base), date: data.meta.last_actual_date })}</div>
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line/70">
                  <th className="th">{t('prediction.date')}</th>
                  <th className="th text-right">{t('prediction.predictedPrice')}</th>
                  {data.predictions[0].lower != null && <th className="th text-right">{t('prediction.range')}</th>}
                </tr>
              </thead>
              <tbody>
                {data.predictions.map((point) => (
                  <tr key={point.date} className="border-b border-line/40 last:border-0">
                    <td className="td">{point.date}</td>
                    <td className="td text-right font-medium">{fmtPrice(point.predicted_price)}</td>
                    {point.lower != null && <td className="td text-right text-muted">{t('prediction.rangeValue', { lower: fmtPrice(point.lower), upper: fmtPrice(point.upper) })}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line/70 px-4 py-3 text-xs text-muted">
            {t('prediction.footnote', { model: data.meta.model_name, window: data.meta.sequence_length, features: data.meta.features.join(', ') })}{' '}
            {data.meta.has_confidence_interval ? t('prediction.footnoteBand') : t('prediction.footnoteNoBand')} {t('prediction.disclaimer')}
          </p>
        </div>
      )}
    </Card>
  );
}

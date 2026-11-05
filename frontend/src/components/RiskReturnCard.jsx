import { useEffect } from 'react';
import { Activity, RefreshCw, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from './Card.jsx';
import { SkeletonLines } from './Skeleton.jsx';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { fmtPercentValue, fmtPrice } from '../utils/format.js';
import {
  E02_SHARED_FIELDS, classifyRequestError, classifyRiskReturnPayload, sharedE02Fields
} from '../utils/riskReturnState.js';

// The title and single-value copy path retain the original, unrounded payload number.
function Value({ value, mode = 'raw' }) {
  const { t } = useI18n();
  if (value == null) return <span className="text-muted" title={String(value)}>{t('riskReturn.missing')}</span>;
  const original = String(value);
  const shown = typeof value === 'number'
    ? (mode === 'percent' ? fmtPercentValue(value, 2) : mode === 'decimal' ? fmtPrice(value, 2) : original)
    : original;
  const copyOriginal = (event) => {
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', original);
      event.preventDefault();
    }
  };
  return <span className="break-words tabular-nums" title={original} onCopy={copyOriginal}>{shown}</span>;
}

function Field({ label, value, mode = 'raw' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink"><Value value={value} mode={mode} /></dd>
    </div>
  );
}

function WarningList({ warnings }) {
  const { t } = useI18n();
  if (!Array.isArray(warnings) || warnings.length === 0) return null;
  return (
    <div className="mt-2 text-xs text-warn">
      <p className="font-medium">{t('riskReturn.warnings')}</p>
      <ul className="list-disc space-y-1 pl-4">
        {warnings.map((warning, index) => (
          <li key={index}>
            {warning && typeof warning === 'object' && !Array.isArray(warning)
              ? Object.entries(warning).map(([key, value], i) => (
                  <span key={key}>
                    {i > 0 ? ' · ' : ''}{key}: <Value value={value} />
                  </span>
                ))
              : <Value value={warning} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DescriptiveRisk({ value }) {
  const { t } = useI18n();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return <Field label={t('riskReturn.fields.descriptive_risk')} value={value} />;
  }
  return (
    <details className="mt-2 rounded-lg border border-line/70 p-2 text-xs">
      <summary className="cursor-pointer font-medium text-ink">{t('riskReturn.fields.descriptive_risk')}</summary>
      <dl className="mt-2 space-y-2">
        {Object.entries(value).map(([key, entry]) => (
          <div key={key} className="break-words">
            <dt className="text-muted">{key}</dt>
            <dd className="text-ink"><Value value={entry} /></dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function DatesCompared({ shared, e10, hasRows }) {
  const { t } = useI18n();
  const e02Date = shared.as_of?.shared ? shared.as_of.value : hasRows ? t('riskReturn.perModel') : null;
  const e02Trained = shared.trained_until?.shared ? shared.trained_until.value : hasRows ? t('riskReturn.perModel') : null;
  return (
    <div className="grid gap-3 rounded-lg border border-line/70 p-3 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-semibold">E02</p>
        <dl className="grid gap-2">
          <Field label={t('riskReturn.fields.as_of')} value={e02Date} />
          <Field label={t('riskReturn.fields.trained_until')} value={e02Trained} />
        </dl>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">E10</p>
        <dl className="grid gap-2">
          <Field label={t('riskReturn.fields.as_of')} value={e10?.as_of} />
          <Field label={t('riskReturn.fields.trained_until')} value={e10?.trained_until} />
        </dl>
      </div>
    </div>
  );
}

function E02Block({ e02, e10 }) {
  const { t } = useI18n();
  const rows = Array.isArray(e02?.predictions) ? e02.predictions : [];
  const shared = sharedE02Fields(rows);
  const otherShared = E02_SHARED_FIELDS.filter((key) => key !== 'as_of' && key !== 'trained_until');
  return (
    <section aria-label="E02" className="space-y-3">
      <h3 className="text-sm font-semibold">E02 · {t('riskReturn.e02')}</h3>
      <DatesCompared shared={shared} e10={e10} hasRows={rows.length > 0} />
      {rows.length === 0 ? <p className="text-sm text-muted">{t('riskReturn.missing')}</p> : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            {otherShared.filter((key) => shared[key].shared && key !== 'descriptive_risk').map((key) => (
              <Field key={key} label={t(`riskReturn.fields.${key}`)} value={shared[key].value} />
            ))}
          </dl>
          {shared.descriptive_risk.shared && <DescriptiveRisk value={shared.descriptive_risk.value} />}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead><tr className="border-b border-line/70">
                <th className="th">{t('riskReturn.fields.model')}</th>
                <th className="th">{t('riskReturn.fields.trend')}</th>
                <th className="th text-right">{t('riskReturn.fields.predicted_return_percent')}</th>
                <th className="th">{t('riskReturn.fields.risk_level')}</th>
                <th className="th">{t('riskReturn.fields.target_date')}</th>
              </tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row?.model || 'model'}-${index}`} className="border-b border-line/40 last:border-0">
                    <td className="td align-top text-xs">
                      <span className="font-semibold"><Value value={row?.model} /></span>
                      {otherShared.filter((key) => !shared[key].shared && key !== 'descriptive_risk').map((key) => (
                        <div key={key} className="mt-2"><Field label={t(`riskReturn.fields.${key}`)} value={row?.[key]} /></div>
                      ))}
                      {(['as_of', 'trained_until']).filter((key) => !shared[key].shared).map((key) => (
                        <div key={key} className="mt-2"><Field label={`E02 ${t(`riskReturn.fields.${key}`)}`} value={row?.[key]} /></div>
                      ))}
                      {!shared.descriptive_risk.shared && <DescriptiveRisk value={row?.descriptive_risk} />}
                      <WarningList warnings={row?.warnings} />
                    </td>
                    <td className="td align-top text-xs">
                      <span className="inline-flex rounded border border-line bg-bg px-2 py-0.5 font-medium text-ink">
                        <Value value={row?.trend} />
                      </span>
                    </td>
                    <td className="td align-top text-right font-semibold"><Value value={row?.predicted_return_percent} mode="percent" /></td>
                    <td className="td align-top"><Value value={row?.risk_level} /></td>
                    <td className="td align-top">
                      <Value value={row?.target_date} />
                      {row?.target_date_estimated === true && (
                        <span className="ml-1 text-xs text-muted">({t('riskReturn.estimated')})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function E10Block({ e10 }) {
  const { t } = useI18n();
  if (!e10) return (
    <section aria-label="E10"><h3 className="text-sm font-semibold">E10 · {t('riskReturn.e10')}</h3>
      <p className="mt-2 text-sm text-muted">{t('riskReturn.missing')}</p></section>
  );
  return (
    <section aria-label="E10" className="space-y-3">
      <h3 className="text-sm font-semibold">E10 · {t('riskReturn.e10')}</h3>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('riskReturn.fields.model_name')} value={e10.model_name} />
        <div>
          <dt className="text-xs text-muted">{t('riskReturn.fields.predicted_volatility')}</dt>
          <dd className="mt-0.5 text-sm text-ink">
            <Value value={e10.predicted_volatility} />{' '}
            <Value value={e10.volatility_unit} />
          </dd>
        </div>
        <Field label={t('riskReturn.fields.record_status')} value={e10.record_status} />
      </dl>
      <WarningList warnings={e10.warnings} />
    </section>
  );
}

const CONTEXT_FIELDS = ['e10_over_vol20', 'historical_percentile', 'volatility_20_pct'];
const DERIVED_FIELDS = [
  'return_min_pct', 'return_median_pct', 'return_max_pct',
  'sigma_daily_pct', 'sigma_5d_pct', 'sigma_annualized_pct',
  'z_score', 'horizon_sessions'
];

function ContextBlock({ context }) {
  const { t } = useI18n();
  return (
    <section aria-label={t('riskReturn.context')} className="space-y-2">
      <h3 className="text-sm font-semibold">{t('riskReturn.context')}</h3>
      {context == null ? <p className="text-sm text-muted">{t('riskReturn.missing')}</p> : (
        <dl className="grid gap-3 sm:grid-cols-3">
          {CONTEXT_FIELDS.map((key) => (
            <Field key={key} label={t(`riskReturn.fields.${key}`)} value={context?.[key]}
              mode={key.endsWith('_pct') ? 'percent' : 'decimal'} />
          ))}
        </dl>
      )}
    </section>
  );
}

function Band({ label, band }) {
  const { t } = useI18n();
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">
        {Array.isArray(band) && band.length === 2
          ? <><Value value={band[0]} mode="percent" /> – <Value value={band[1]} mode="percent" /></>
          : t('riskReturn.missing')}
      </dd>
    </div>
  );
}

function DerivedBlock({ derived }) {
  const { t } = useI18n();
  return (
    <section aria-label={t('riskReturn.derived')} className="space-y-3">
      <h3 className="text-sm font-semibold">{t('riskReturn.derived')}</h3>
      {derived == null ? <p className="text-sm text-muted">{t('riskReturn.missing')}</p> : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DERIVED_FIELDS.map((key) => (
              <Field key={key} label={t(`riskReturn.fields.${key}`)} value={derived?.[key]}
                mode={key.endsWith('_pct') ? 'percent' : key === 'z_score' ? 'decimal' : 'raw'} />
            ))}
            <Band label={t('riskReturn.fields.band_1sigma_pct')} band={derived.band_1sigma_pct} />
            <Band label={t('riskReturn.fields.band_2sigma_pct')} band={derived.band_2sigma_pct} />
            <Field label={t('riskReturn.fields.model_agreement')}
              value={derived.model_agreement == null ? null
                : `${derived.model_agreement.same_sign_as_median ?? t('riskReturn.missing')} / ${derived.model_agreement.total ?? t('riskReturn.missing')}`} />
          </dl>
          {Array.isArray(derived.assumptions) && derived.assumptions.length > 0 && (
            <div className="text-xs text-muted">
              <h4 className="mb-1 font-medium">{t('riskReturn.assumptions')}</h4>
              <ul className="list-disc space-y-1 pl-4">
                {derived.assumptions.map((line, index) => <li key={index}><Value value={line} /></li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Meta({ data }) {
  const { t } = useI18n();
  const researchStatus = data?.meta?.research_status ?? data?.e10?.research_status;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md border border-warn/50 bg-warn/10 px-2 py-1 font-semibold text-warn">
          <Value value={researchStatus} />
        </span>
        <span className="text-muted">{t('riskReturn.notAccepted')}</span>
        <span className="text-muted">{t('riskReturn.payloadAsOf')}: <Value value={data?.as_of} /></span>
      </div>
      {Array.isArray(data?.meta?.notes) && data.meta.notes.length > 0 && (
        <div className="text-xs text-muted">
          <p className="font-semibold">{t('riskReturn.notes')}</p>
          <ul className="list-disc space-y-1 pl-4">
            {data.meta.notes.map((note, index) => <li key={index}><Value value={note} /></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  const { t } = useI18n();
  const { kind, status } = classifyRequestError(error);
  // Retrying cannot fix a bad request, an expired session (401) or a denied access (403); a 429 passes with time.
  const canRetry = kind !== 'badRequest' && kind !== 'unauthorized' && kind !== 'forbidden';
  return (
    <div className="m-4 rounded-lg border border-line/70 p-3 text-sm" role="alert">
      <div className="flex items-center gap-2 font-semibold text-ink">
        <TriangleAlert size={16} aria-hidden="true" />
        {t(`riskReturn.errors.${kind}`)}
      </div>
      {status !== null && kind !== 'badRequest' && (
        <p className="mt-1 text-xs text-muted">{t('riskReturn.httpCode', { code: status })}</p>
      )}
      {canRetry && (
        <button type="button" className="btn mt-3 inline-flex items-center gap-2" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" />{t('common.retry')}
        </button>
      )}
    </div>
  );
}

function RiskReturnCardContent({ symbol }) {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi(
    (signal) => api.riskReturnLatest(symbol, { signal }), [symbol]
  );
  const classification = classifyRiskReturnPayload(data);
  const defensiveStale = !loading && !error && classification.kind === 'defensiveStale';
  useEffect(() => {
    if (defensiveStale) console.warn(`RiskReturnCard: aligned:true + e10.is_stale:true; symbol=${symbol}`);
  }, [defensiveStale, symbol]);

  return (
    <Card>
      <CardHeader title={t('riskReturn.title', { symbol })}
        subtitle={t('riskReturn.subtitle')} icon={Activity} />
      {loading ? (
        <div className="p-4" role="status" aria-label={t('a11y.loading')}>
          <SkeletonLines lines={4} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : classification.kind === 'empty' ? (
        <p className="p-4 text-sm text-muted">{t('riskReturn.empty')}</p>
      ) : (
        <div className="space-y-5 p-4">
          <Meta data={data} />
          {classification.kind !== 'success' && (
            <div role="status" className="rounded-lg border border-line/70 p-3 text-sm text-ink">
              {t(`riskReturn.reasons.${classification.reason}`)}
              {classification.reason === 'UNKNOWN' && (
                <span className="ml-2 text-xs text-muted" title={String(classification.rawReason)}>
                  {String(classification.rawReason ?? t('riskReturn.missing'))}
                </span>
              )}
            </div>
          )}
          {classification.kind === 'success' && (
            <>
              {data.used_latest_e10 === false && (
                <p className="text-xs text-muted">{t('riskReturn.notLatestE10')}</p>
              )}
              {data.e10?.is_stale === false && Number.isInteger(data.e10.age_weekdays) && data.e10.age_weekdays >= 1 && (
                <div className="text-xs text-muted">
                  <p>{t('riskReturn.ageWeekdays', { count: data.e10.age_weekdays })}</p>
                  <p>{t('riskReturn.ageBasis', { basis: data.e10.stale_basis ?? t('riskReturn.missing') })}</p>
                </div>
              )}
            </>
          )}
          <E02Block e02={data.e02} e10={data.e10} />
          <E10Block e10={data.e10} />
          {classification.kind === 'success' && (
            <>
              <ContextBlock context={data.context} />
              <DerivedBlock derived={data.derived} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// Remount on symbol change: useApi temporarily keeps previous data while loading.
// The key ensures a new symbol never paints the old symbol's numeric data.
export default function RiskReturnCard({ symbol }) {
  return <RiskReturnCardContent key={symbol} symbol={symbol} />;
}

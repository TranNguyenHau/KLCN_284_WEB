import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from './Card.jsx';
import { authErrorMessage, useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';

const METRICS = ['mae', 'mse', 'rmse', 'r2'];
const DATASETS = ['TRAIN', 'VAL', 'TEST'];
const SORTABLE = ['ky_hieu', 'loai_mo_hinh', 'mae', 'mse', 'rmse', 'r2', 'so_mau', 'ngay_danh_gia'];
const EMPTY_FILTERS = { symbol: '', model: '', metric: '', threshold: '', hideNoData: false };

const fmtMetric = (value) => (value === null || value === undefined ? '—' : Number(value).toFixed(4));

/** Rows that pass the filters. Error metrics keep values <= threshold, R2 keeps values >= threshold. */
export function filterRows(rows, f) {
  const threshold = f.threshold === '' ? null : Number(f.threshold);
  return rows.filter((row) => {
    if (f.symbol && row.ky_hieu !== f.symbol) return false;
    if (f.model && row.loai_mo_hinh !== f.model) return false;
    if (f.hideNoData && !row.co_du_lieu) return false;
    if (f.metric && threshold !== null && Number.isFinite(threshold)) {
      const value = row[f.metric];
      if (value === null || value === undefined) return false;
      return f.metric === 'r2' ? value >= threshold : value <= threshold;
    }
    return true;
  });
}

/** Sort by a column; rows without a value always go last. With only a metric chosen: best first (R2 high, errors low). */
export function sortRows(rows, sort, metric) {
  const effective = sort.key ? sort : metric ? { key: metric, dir: metric === 'r2' ? 'desc' : 'asc' } : null;
  if (!effective) return rows;
  const sign = effective.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[effective.key];
    const y = b[effective.key];
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
}

export function toCsv(rows, t) {
  const head = [t('modelReport.columns.symbol'), t('modelReport.columns.model'), t('modelReport.dataset'),
    'MAE', 'MSE', 'RMSE', 'R2', t('modelReport.columns.samples'), t('modelReport.columns.source'),
    t('modelReport.columns.evaluated'), t('modelReport.columns.trained')];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.ky_hieu, r.loai_mo_hinh ? t(`modelReport.models.${r.loai_mo_hinh}`) : '', r.tap_du_lieu,
    r.mae, r.mse, r.rmse, r.r2, r.so_mau, r.nguon ? t(`modelReport.sources.${r.nguon}`) : '',
    r.ngay_danh_gia || '', r.ngay_huan_luyen || ''].map(cell).join(','));
  return [head.map(cell).join(','), ...lines].join('\r\n');
}

/**
 * Model performance report (MAE, MSE, RMSE, R2) per stock and model. `admin` adds the administration extras
 * (training date, best-model flag, CSV export) and uses the admin endpoint; everything is read-only.
 */
export default function ModelPerformanceReport({ admin = false }) {
  const { t, locale } = useI18n();
  const { modelPerformance } = useAuth();
  const [tap, setTap] = useState('TEST');
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const data = await modelPerformance({ admin, params: { tap_du_lieu: tap } });
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }, [modelPerformance, admin, tap]);

  useEffect(() => { load(); }, [load]);

  const allRows = state.data?.rows || [];
  const symbols = useMemo(() => [...new Set(allRows.map((r) => r.ky_hieu))].sort(), [allRows]);
  const visible = useMemo(() => sortRows(filterRows(allRows, filters), sort, filters.metric), [allRows, filters, sort]);
  const setFilter = (field) => (event) => setFilters((f) => ({ ...f, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(locale) : '—');
  const hasDerived = visible.some((r) => r.mse_tinh_tu_rmse);
  const hasComputed = visible.some((r) => r.nguon === 'tinh_tu_du_bao');
  const minSamples = state.data?.so_mau_toi_thieu ?? 5;

  function exportCsv() {
    const blob = new Blob(['﻿', toCsv(visible, t)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `model-performance-${tap.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const Th = ({ label, sortKey, align = '' }) => (
    <th className={`px-3 py-2 ${align}`} aria-sort={sort.key === sortKey ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {SORTABLE.includes(sortKey) ? (
        <button type="button" className="font-semibold uppercase tracking-wider hover:text-ink" onClick={() => toggleSort(sortKey)}>
          {label}{sort.key === sortKey ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
        </button>
      ) : label}
    </th>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t('modelReport.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t(admin ? 'modelReport.subtitleAdmin' : 'modelReport.subtitleUser')}</p>
      </div>

      <Card>
        <CardHeader
          title={`${t('modelReport.dataset')}: ${t(`modelReport.datasets.${tap}`)}`}
          right={state.data && <span className="text-xs text-muted">{t('modelReport.summary', { withData: state.data.so_dong_co_du_lieu, total: state.data.tong_so_dong })}</span>}
        />
        <div className="flex flex-wrap items-end gap-3 border-b border-line/70 p-4">
          <label className="block text-xs text-muted">
            {t('modelReport.dataset')}
            <select className="input mt-1 block w-36" value={tap} onChange={(e) => setTap(e.target.value)}>
              {DATASETS.map((d) => <option key={d} value={d}>{t(`modelReport.datasets.${d}`)}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">
            {t('modelReport.symbol')}
            <select className="input mt-1 block w-36" value={filters.symbol} onChange={setFilter('symbol')}>
              <option value="">{t('modelReport.allSymbols')}</option>
              {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">
            {t('modelReport.model')}
            <select className="input mt-1 block w-44" value={filters.model} onChange={setFilter('model')}>
              <option value="">{t('modelReport.allModels')}</option>
              {['LINEAR_REGRESSION', 'RANDOM_FOREST', 'XGBOOST', 'SVR', 'LSTM'].map((m) => <option key={m} value={m}>{t(`modelReport.models.${m}`)}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">
            {t('modelReport.metric')}
            <select className="input mt-1 block w-44" value={filters.metric} onChange={setFilter('metric')}>
              <option value="">{t('modelReport.noMetric')}</option>
              {METRICS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">
            {t('modelReport.threshold')}
            <input className="input mt-1 block w-28" type="number" step="any" value={filters.threshold} disabled={!filters.metric}
              onChange={setFilter('threshold')} title={filters.metric === 'r2' ? t('modelReport.thresholdR2') : t('modelReport.thresholdError')} />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={filters.hideNoData} onChange={setFilter('hideNoData')} />
            {t('modelReport.hideNoData')}
          </label>
          <button type="button" className="btn" onClick={() => { setFilters(EMPTY_FILTERS); setSort({ key: null, dir: 'asc' }); }}>
            {t('modelReport.reset')}
          </button>
          {admin && (
            <button type="button" className="btn" onClick={exportCsv} disabled={visible.length === 0}>
              <Download size={14} aria-hidden="true" />{t('modelReport.exportCsv')}
            </button>
          )}
        </div>

        {state.status === 'loading' && !state.data && <p className="p-4 text-sm text-muted" role="status">{t('common.loading')}</p>}
        {state.status === 'error' && (
          <div className="p-4" role="alert">
            <p className="text-sm text-down">{authErrorMessage(t, state.error)}</p>
            <button type="button" className="btn mt-3 inline-flex items-center gap-2" onClick={load}>
              <RefreshCw size={14} aria-hidden="true" />{t('common.retry')}
            </button>
          </div>
        )}
        {state.status === 'ready' && visible.length === 0 && <p className="p-4 text-sm text-muted">{t('modelReport.empty')}</p>}
        {state.status === 'ready' && visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <Th label={t('modelReport.columns.symbol')} sortKey="ky_hieu" />
                  <Th label={t('modelReport.columns.model')} sortKey="loai_mo_hinh" />
                  {METRICS.map((m) => <Th key={m} label={m.toUpperCase()} sortKey={m} align="text-right" />)}
                  <Th label={t('modelReport.columns.samples')} sortKey="so_mau" align="text-right" />
                  <Th label={t('modelReport.columns.source')} />
                  <Th label={t('modelReport.columns.evaluated')} sortKey="ngay_danh_gia" />
                  {admin && <Th label={t('modelReport.columns.trained')} />}
                  {admin && <Th label={t('modelReport.columns.best')} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {visible.map((row) => (
                  <tr key={`${row.ky_hieu}-${row.ma_mo_hinh ?? 'none'}`} data-testid={`perf-row-${row.ky_hieu}-${row.loai_mo_hinh ?? 'none'}`}>
                    <td className="px-3 py-2 font-medium" title={row.ten_cong_ty}>{row.ky_hieu}</td>
                    <td className="px-3 py-2">{row.loai_mo_hinh ? t(`modelReport.models.${row.loai_mo_hinh}`) : '—'}</td>
                    {row.co_du_lieu ? (
                      METRICS.map((m) => (
                        <td key={m} className="px-3 py-2 text-right font-mono">
                          {fmtMetric(row[m])}{m === 'mse' && row.mse_tinh_tu_rmse ? '*' : ''}
                        </td>
                      ))
                    ) : (
                      <td colSpan={METRICS.length} className="px-3 py-2 text-center text-muted">
                        {row.so_mau != null && row.so_mau < minSamples
                          ? t('modelReport.notEnough', { n: row.so_mau, min: minSamples })
                          : t('modelReport.noData')}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono">{row.so_mau ?? '—'}</td>
                    <td className="px-3 py-2 text-muted">{row.nguon ? t(`modelReport.sources.${row.nguon}`) : '—'}</td>
                    <td className="px-3 py-2 text-muted">{fmtDate(row.ngay_danh_gia)}</td>
                    {admin && <td className="px-3 py-2 text-muted">{fmtDate(row.ngay_huan_luyen)}</td>}
                    {admin && <td className="px-3 py-2">{row.la_mo_hinh_tot_nhat ? <span className="chip bg-up/15 text-up">{t('modelReport.best')}</span> : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {hasDerived && <p className="border-t border-line/70 px-4 py-2 text-xs text-muted">* {t('modelReport.derivedMse')}</p>}
            {hasComputed && (
              <div className="space-y-1 border-t border-line/70 px-4 py-3 text-xs text-muted">
                <p>{t('modelReport.computedNote', { min: minSamples })}</p>
                <p>{t('modelReport.formula')}</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

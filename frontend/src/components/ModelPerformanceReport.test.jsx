import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import ModelPerformanceReport, { filterRows, sortRows, toCsv } from './ModelPerformanceReport.jsx';
import { ADMIN, USER, fakeClient, httpError, ok, renderWithAuth } from '../test/authTestUtils.jsx';

const R = (o) => ({
  ma_co_phieu: 1, ky_hieu: 'FPT', ten_cong_ty: 'FPT Corp', ma_mo_hinh: 1, loai_mo_hinh: 'LSTM', la_mo_hinh_tot_nhat: false,
  ngay_huan_luyen: '2026-10-01T08:00:00+00:00', tap_du_lieu: 'TEST', mae: 0.03, mse: 0.0016, rmse: 0.04, r2: 0.31,
  do_chinh_xac_huong: 55.5, ngay_danh_gia: '2026-10-02T08:00:00+00:00', mse_tinh_tu_rmse: false, co_du_lieu: true, ...o
});
const NONE = { mae: null, mse: null, rmse: null, r2: null, ngay_danh_gia: null, co_du_lieu: false };
const ROWS = [
  R({ ma_mo_hinh: 1, loai_mo_hinh: 'LSTM' }),
  R({ ma_mo_hinh: 2, loai_mo_hinh: 'XGBOOST', mae: 0.01, rmse: 0.02, mse: 0.0004, r2: 0.5, la_mo_hinh_tot_nhat: true, mse_tinh_tu_rmse: true }),
  R({ ma_co_phieu: 2, ky_hieu: 'HPG', ten_cong_ty: 'Hoa Phat', ma_mo_hinh: 3, loai_mo_hinh: 'LSTM', mae: 0.02, rmse: 0.03, mse: 0.0009, r2: -0.1 }),
  R({ ma_co_phieu: 3, ky_hieu: 'VNM', ten_cong_ty: 'Vinamilk', ma_mo_hinh: null, loai_mo_hinh: null, ngay_huan_luyen: null, ...NONE })
];
const payload = (rows, tap = 'TEST') => ({ tap_du_lieu: tap, tong_so_dong: rows.length, so_dong_co_du_lieu: rows.filter((r) => r.co_du_lieu).length, rows });

function mount({ admin = false, me = admin ? ADMIN : USER, rows = ROWS, extra = {}, lang } = {}) {
  const endpoint = admin ? 'GET /admin/models/performance' : 'GET /model-performance';
  const client = fakeClient({
    'GET /auth/me': ok(me),
    [endpoint]: (config) => ok(payload(rows, config?.params?.tap_du_lieu)),
    ...extra
  });
  renderWithAuth(<ModelPerformanceReport admin={admin} />, { client, lang });
  return client;
}
const order = () => screen.getAllByTestId(/^perf-row-/).map((el) => el.dataset.testid.replace('perf-row-', ''));
const reportCalls = (client) => client.calls.filter((c) => /performance/.test(c.url));
afterEach(() => vi.restoreAllMocks());

describe('ModelPerformanceReport: user (read-only)', () => {
  it('reads GET /model-performance for TEST, shows metrics, a "No data yet" row and no administration tools', async () => {
    const client = mount();
    expect(await screen.findByTestId('perf-row-FPT-LSTM')).toBeInTheDocument();
    expect(reportCalls(client)).toHaveLength(1);
    expect(reportCalls(client)[0]).toMatchObject({ url: '/model-performance', body: { params: { tap_du_lieu: 'TEST' } } });
    const lstm = within(screen.getByTestId('perf-row-FPT-LSTM'));
    expect(lstm.getByText('0.0300')).toBeInTheDocument();
    expect(lstm.getByText('0.3100')).toBeInTheDocument();
    expect(within(screen.getByTestId('perf-row-VNM-none')).getByText('No data yet')).toBeInTheDocument();
    expect(screen.getByText('3 of 4 rows have metrics')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Trained' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Best model' })).not.toBeInTheDocument();
  });

  it('shows a loading status first', async () => {
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await screen.findByTestId('perf-row-FPT-LSTM');
  });

  it('403 or 500 → an alert with a working retry', async () => {
    let answer = httpError(403);
    mount({ extra: { 'GET /model-performance': () => answer } });
    expect(await screen.findByRole('alert')).toHaveTextContent('access denied');
    answer = ok(payload(ROWS));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('perf-row-FPT-LSTM')).toBeInTheDocument();
    expect(screen.queryByText('server text that must never be shown')).not.toBeInTheDocument();
  });

  it('Vietnamese texts', async () => {
    mount({ lang: 'vi' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Báo cáo hiệu suất mô hình dự báo' })).toBeInTheDocument();
    expect(within(screen.getByTestId('perf-row-VNM-none')).getByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('3/4 dòng đã có chỉ số')).toBeInTheDocument();
  });
});

describe('ModelPerformanceReport: administration', () => {
  it('uses the admin endpoint and adds the export button, training date and best-model columns', async () => {
    const client = mount({ admin: true });
    expect(await screen.findByTestId('perf-row-FPT-XGBOOST')).toBeInTheDocument();
    expect(reportCalls(client)[0].url).toBe('/admin/models/performance');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    expect(screen.getByRole('columnheader', { name: 'Trained' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Best model' })).toBeInTheDocument();
    expect(within(screen.getByTestId('perf-row-FPT-XGBOOST')).getByText('Best')).toBeInTheDocument();
  });

  it('Export CSV downloads the rows that are currently visible', async () => {
    mount({ admin: true });
    await screen.findByTestId('perf-row-FPT-LSTM');
    const parts = [];
    const RealBlob = globalThis.Blob;
    globalThis.Blob = class extends RealBlob { constructor(p, o) { super(p, o); parts.push(...p); } };
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'HPG' } });
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    } finally {
      globalThis.Blob = RealBlob;
    }
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const text = parts.join('');
    expect(text.startsWith('﻿')).toBe(true); // BOM so Excel reads UTF-8
    expect(text).toContain('HPG');
    expect(text).not.toContain('VNM');
  });
});

describe('ModelPerformanceReport: filters and sorting', () => {
  it('filters by stock and by model, and says so when nothing matches', async () => {
    mount();
    await screen.findByTestId('perf-row-FPT-LSTM');
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'FPT' } });
    expect(order()).toEqual(['FPT-LSTM', 'FPT-XGBOOST']);
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'XGBOOST' } });
    expect(order()).toEqual(['FPT-XGBOOST']);
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'HPG' } });
    expect(await screen.findByText('No rows match the filters.')).toBeInTheDocument();
  });

  it('metric + threshold: errors keep values <= threshold, R2 keeps values >= threshold; rows without data drop out', async () => {
    mount();
    await screen.findByTestId('perf-row-FPT-LSTM');
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'mae' } });
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '0.02' } });
    expect(order()).toEqual(['FPT-XGBOOST', 'HPG-LSTM']); // 0.01 and 0.02 pass, 0.03 fails, VNM has no value
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'r2' } });
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '0.4' } });
    expect(order()).toEqual(['FPT-XGBOOST']);
  });

  it('choosing only a metric ranks best first (errors ascending, R2 descending) with no-data rows last', async () => {
    mount();
    await screen.findByTestId('perf-row-FPT-LSTM');
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'rmse' } });
    expect(order()).toEqual(['FPT-XGBOOST', 'HPG-LSTM', 'FPT-LSTM', 'VNM-none']);
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'r2' } });
    expect(order()).toEqual(['FPT-XGBOOST', 'FPT-LSTM', 'HPG-LSTM', 'VNM-none']);
  });

  it('clicking a column header sorts ascending, then descending, and sets aria-sort', async () => {
    mount();
    await screen.findByTestId('perf-row-FPT-LSTM');
    const header = () => screen.getByRole('columnheader', { name: /MAE/ });
    fireEvent.click(within(header()).getByRole('button'));
    expect(order()).toEqual(['FPT-XGBOOST', 'HPG-LSTM', 'FPT-LSTM', 'VNM-none']);
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(within(header()).getByRole('button'));
    expect(order()).toEqual(['FPT-LSTM', 'HPG-LSTM', 'FPT-XGBOOST', 'VNM-none']); // missing values stay last
    expect(header()).toHaveAttribute('aria-sort', 'descending');
  });

  it('"Hide rows without data" and "Reset filters"', async () => {
    mount();
    await screen.findByTestId('perf-row-FPT-LSTM');
    fireEvent.click(screen.getByLabelText('Hide rows without data'));
    expect(screen.queryByTestId('perf-row-VNM-none')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'HPG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(order()).toEqual(['FPT-LSTM', 'FPT-XGBOOST', 'HPG-LSTM', 'VNM-none']);
  });

  it('changing the dataset asks the server again with that dataset', async () => {
    const client = mount();
    await screen.findByTestId('perf-row-FPT-LSTM');
    fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'VAL' } });
    await waitFor(() => expect(reportCalls(client)).toHaveLength(2));
    expect(reportCalls(client)[1].body).toEqual({ params: { tap_du_lieu: 'VAL' } });
  });

  it('a MSE computed from RMSE is marked with an asterisk and explained', async () => {
    mount();
    await screen.findByTestId('perf-row-FPT-XGBOOST');
    expect(within(screen.getByTestId('perf-row-FPT-XGBOOST')).getByText('0.0004*')).toBeInTheDocument();
    expect(screen.getByText('* MSE computed as RMSE²')).toBeInTheDocument();
  });
});

describe('ModelPerformanceReport: pure helpers', () => {
  it('filterRows and sortRows', () => {
    expect(filterRows(ROWS, { symbol: '', model: '', metric: 'mae', threshold: 'abc', hideNoData: false })).toHaveLength(4); // not a number: ignored
    expect(filterRows(ROWS, { symbol: 'FPT', model: '', metric: '', threshold: '', hideNoData: false })).toHaveLength(2);
    expect(sortRows(ROWS, { key: null, dir: 'asc' }, '')).toBe(ROWS); // untouched when nothing is chosen
  });

  it('toCsv quotes every cell, escapes quotes and leaves metrics blank for a no-data row', () => {
    const t = (key) => key;
    const csv = toCsv([R({ ten_cong_ty: 'x', ky_hieu: 'A"B' }), ROWS[3]], t);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"A""B"');
    expect(lines[2]).toBe('"VNM","","TEST","","","","","",""');
  });
});

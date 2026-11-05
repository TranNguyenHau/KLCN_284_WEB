// G7b-3: test cho RiskReturnCard.
//
// GIỚI HẠN (ghi vào báo cáo):
// - Chỉ mock api.riskReturnLatest. Mock KHÔNG kiểm interceptor axios, proxy Vite, Express hay Flask.
// - Lỗi được dựng bằng Object.assign(new Error('x'), { status, code }), không có response, đúng
//   hình dạng mà classifyRequestError đọc (error.status, error.code).
// - Payload ở đây do ta viết theo hợp đồng suy từ code. Khối "fixture thật" cuối file chỉ chạy
//   smoke test trên các file rr_*.json; ca 504, timeout 90s, lỗi mạng và 3 reason trên DB sao
//   chỉ có ở mức fixture/mock này.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RiskReturnCard from './RiskReturnCard.jsx';
import { I18nProvider } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { classifyRequestError, classifyRiskReturnPayload, deepEqualRiskValue } from '../utils/riskReturnState.js';

vi.mock('../services/api.js', () => ({ api: { riskReturnLatest: vi.fn() } }));

// ---------- dữ liệu và tiện ích ----------
const row = (over = {}) => ({
  model: 'XGBoost',
  trend: 'UP',
  predicted_return_percent: 1.1749,
  risk_level: 'MEDIUM',
  target_date: '2026-10-29',
  target_date_estimated: false,
  experiment_id: 'E02_X',
  as_of: '2026-10-22',
  trained_until: '2026-10-21',
  risk_notice: 'risk-notice-shared',
  target_notice: 'target-notice-shared',
  descriptive_risk: { volatility_unit: 'daily_pct' },
  warnings: [],
  ...over
});

const e10 = (over = {}) => ({
  model_name: 'HAR_OLS',
  predicted_volatility: 6.84,
  volatility_unit: 'percent',
  record_status: 'research_only',
  as_of: '2026-10-22',
  trained_until: '2026-10-21',
  is_stale: false,
  age_weekdays: 4,
  stale_basis: 'weekday_heuristic',
  research_status: 'RESEARCH_ONLY',
  warnings: [],
  ...over
});

const context = (over = {}) => ({
  e10_over_vol20: 1.2,
  historical_percentile: 62.3,
  volatility_20_pct: 6.8412,
  ...over
});

const derived = (over = {}) => ({
  return_min_pct: -0.5,
  return_median_pct: 0.2,
  return_max_pct: 1.1749,
  sigma_daily_pct: 1.5,
  sigma_5d_pct: 3.3541,
  sigma_annualized_pct: 23.8,
  z_score: 0.962,
  horizon_sessions: 5,
  band_1sigma_pct: [-1.2, 3.4],
  band_2sigma_pct: [-4.5, 6.7],
  model_agreement: { same_sign_as_median: 2, total: 2 },
  assumptions: ['assumption-one', 'assumption-two'],
  ...over
});

const payload = (over = {}) => ({
  aligned: true,
  reason: null,
  used_latest_e10: true,
  as_of: '2026-10-22',
  e02: { predictions: [row({ model: 'ModelA' }), row({ model: 'ModelB', trend: 'DOWN', predicted_return_percent: -0.5 })] },
  e10: e10(),
  context: context(),
  derived: derived(),
  meta: { research_status: 'RESEARCH_ONLY', notes: ['note-from-backend'] },
  ...over
});

const httpError = (status, code) => Object.assign(new Error('internal /api/risk-return secret'), { status, code });

function renderCard(symbol = 'FPT', lang = 'en') {
  localStorage.setItem('alpha.lang', lang);
  const ui = (s) => (
    <I18nProvider>
      <RiskReturnCard symbol={s} />
    </I18nProvider>
  );
  const view = render(ui(symbol));
  return { ...view, rerenderSymbol: (s) => view.rerender(ui(s)) };
}

// Chờ hết trạng thái loading (role="status" có aria-label); khối reason cũng là role="status" nhưng không có aria-label.
const settle = () => waitFor(() => expect(document.querySelector('[role="status"][aria-label]')).toBeNull());

const mockOk = (body) => api.riskReturnLatest.mockResolvedValue(body);
const mockFail = (error) => api.riskReturnLatest.mockRejectedValue(error);

const region = (name) => screen.getByRole('region', { name });
const queryRegion = (name) => screen.queryByRole('region', { name });
const dd = (scope, label, index = 0) => within(scope).getAllByText(label, { selector: 'dt' })[index].nextElementSibling;

beforeEach(() => {
  api.riskReturnLatest.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---------- hàm thuần ----------
describe('classifyRequestError / classifyRiskReturnPayload / deepEqualRiskValue', () => {
  it('phân loại lỗi theo status và code', () => {
    expect(classifyRequestError({ status: 400 })).toEqual({ kind: 'badRequest', status: 400 });
    expect(classifyRequestError({ status: 404 })).toEqual({ kind: 'client', status: 404 });
    expect(classifyRequestError({ status: 504 })).toEqual({ kind: 'server', status: 504 });
    expect(classifyRequestError({ code: 'ECONNABORTED' })).toEqual({ kind: 'timeout', status: null });
    expect(classifyRequestError({ code: 'ETIMEDOUT', status: 504 })).toEqual({ kind: 'timeout', status: null });
    expect(classifyRequestError(new Error('x'))).toEqual({ kind: 'network', status: null });
    expect(classifyRequestError(undefined)).toEqual({ kind: 'network', status: null });
    expect(classifyRequestError({ status: 302 })).toEqual({ kind: 'unknown', status: 302 });
  });

  it('401/403/429 có loại riêng (MỚI, theo quyết định auth); 404 và 422 vẫn là client', () => {
    expect(classifyRequestError({ status: 401 })).toEqual({ kind: 'unauthorized', status: 401 });
    expect(classifyRequestError({ status: 403 })).toEqual({ kind: 'forbidden', status: 403 });
    expect(classifyRequestError({ status: 429 })).toEqual({ kind: 'rateLimited', status: 429 });
    expect(classifyRequestError({ status: 404 })).toEqual({ kind: 'client', status: 404 });
    expect(classifyRequestError({ status: 422 })).toEqual({ kind: 'client', status: 422 });
    expect(classifyRequestError({ status: 400 })).toEqual({ kind: 'badRequest', status: 400 });
    expect(classifyRequestError({ status: 500 })).toEqual({ kind: 'server', status: 500 });
  });

  it('phân loại payload', () => {
    expect(classifyRiskReturnPayload(null).kind).toBe('empty');
    expect(classifyRiskReturnPayload([]).kind).toBe('empty');
    expect(classifyRiskReturnPayload({ aligned: 'true' }).kind).toBe('empty');
    expect(classifyRiskReturnPayload({ aligned: true, e02: { predictions: [] } }).kind).toBe('empty');
    expect(classifyRiskReturnPayload({ aligned: false, reason: 'NO_E10_PREDICTION' })).toEqual({
      kind: 'unaligned', reason: 'NO_E10_PREDICTION', rawReason: 'NO_E10_PREDICTION'
    });
    expect(classifyRiskReturnPayload({ aligned: false, reason: 'NEW' })).toMatchObject({ reason: 'UNKNOWN', rawReason: 'NEW' });
    expect(classifyRiskReturnPayload(payload()).kind).toBe('success');
    expect(classifyRiskReturnPayload(payload({ e10: e10({ is_stale: true }) }))).toEqual({ kind: 'defensiveStale', reason: 'E10_STALE' });
  });

  it('deepEqual bỏ qua thứ tự khóa, giữ thứ tự mảng', () => {
    expect(deepEqualRiskValue({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(deepEqualRiskValue([1, 2], [2, 1])).toBe(false);
    expect(deepEqualRiskValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqualRiskValue(null, undefined)).toBe(false);
  });
});

// ---------- loading, rỗng ----------
describe('loading và dữ liệu rỗng', () => {
  it('hiện trạng thái loading có nhãn, và gọi api với symbol và signal', () => {
    api.riskReturnLatest.mockReturnValue(new Promise(() => {}));
    renderCard('FPT');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(api.riskReturnLatest).toHaveBeenCalledTimes(1);
    expect(api.riskReturnLatest).toHaveBeenCalledWith('FPT', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it.each([
    ['null', null],
    ['object rỗng', {}],
    ['mảng', []],
    ['aligned không phải boolean', { aligned: 'true' }],
    ['aligned:true thiếu e02', { aligned: true }],
    ['aligned:true e02 rỗng', { aligned: true, e02: { predictions: [] } }]
  ])('payload %s hiện thông điệp rỗng', async (_name, body) => {
    mockOk(body);
    renderCard();
    expect(await screen.findByText('No valid Risk/Return data to display.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(queryRegion('E02')).toBeNull();
  });
});

// ---------- reason ----------
describe('aligned:false: mỗi reason một test, không đọc context/derived', () => {
  const REASONS = [
    ['AS_OF_MISMATCH', 'No matching data date was found across E02 and E10.'],
    ['E10_STALE', 'E10 data is stale; combined metrics are hidden.'],
    ['NO_E10_PREDICTION', 'No E10 forecast is available for this symbol.'],
    ['NO_E02_PREDICTION', 'No E02 forecast is available for this symbol.'],
    ['E10_TABLE_NOT_FOUND', 'The E10 predictions table was not found.']
  ];

  it.each(REASONS)('%s', async (reason, text) => {
    mockOk(payload({
      aligned: false,
      reason,
      context: context({ volatility_20_pct: 77.77 }),
      derived: derived({ return_min_pct: 88.88 })
    }));
    renderCard();
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(queryRegion('Volatility context')).toBeNull();
    expect(queryRegion('Combined E02 and E10 metrics')).toBeNull();
    expect(screen.queryByText('77.77%')).toBeNull();
    expect(screen.queryByText('88.88%')).toBeNull();
    expect(screen.queryByText('assumption-one')).toBeNull();
  });

  it('reason lạ hiện "Unknown reason" kèm chuỗi gốc trong title', async () => {
    mockOk({ aligned: false, reason: 'BRAND_NEW_REASON' });
    renderCard();
    await settle();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Unknown reason:');
    expect(within(status).getByText('BRAND_NEW_REASON')).toHaveAttribute('title', 'BRAND_NEW_REASON');
  });

  it('reason null hiện "Unknown reason" và "not available"', async () => {
    mockOk({ aligned: false, reason: null });
    renderCard();
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Unknown reason:');
    expect(screen.getByRole('status')).toHaveTextContent('not available');
  });

  it('NO_E02_PREDICTION với e02.predictions rỗng: không hiện "per model" (nhánh hasRows=false)', async () => {
    mockOk({ aligned: false, reason: 'NO_E02_PREDICTION', e02: { predictions: [] }, e10: e10() });
    renderCard();
    await settle();
    const e02 = region('E02');
    expect(within(e02).queryByText('per model')).toBeNull();
    expect(dd(e02, 'as_of', 0)).toHaveTextContent('not available');
    expect(dd(e02, 'Trained until', 0)).toHaveTextContent('not available');
    expect(e02).toHaveTextContent('not available');
  });

  it('vi: thông điệp reason bằng tiếng Việt', async () => {
    mockOk({ aligned: false, reason: 'NO_E10_PREDICTION' });
    renderCard('FPT', 'vi');
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Chưa có dự báo E10 cho mã này.');
  });
});

// ---------- phòng thủ stale ----------
describe('aligned:true + is_stale:true (phòng thủ)', () => {
  it('ẩn derived/context, hiện reason E10_STALE và console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockOk(payload({
      e10: e10({ is_stale: true, age_weekdays: 6 }),
      derived: derived({ return_min_pct: 88.88 }),
      context: context({ volatility_20_pct: 77.77 })
    }));
    renderCard('FPT');
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('E10 data is stale; combined metrics are hidden.');
    expect(queryRegion('Volatility context')).toBeNull();
    expect(queryRegion('Combined E02 and E10 metrics')).toBeNull();
    expect(screen.queryByText('88.88%')).toBeNull();
    expect(screen.queryByText(/weekdays behind/)).toBeNull();
    expect(region('E10')).toBeInTheDocument();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('symbol=FPT');
  });

  it('ca thành công bình thường không console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockOk(payload());
    renderCard();
    await settle();
    expect(queryRegion('Volatility context')).toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------- derived / context null ----------
describe('derived và context', () => {
  it('derived:null và context:null hiện "not available" trong từng khối', async () => {
    mockOk(payload({ derived: null, context: null }));
    renderCard();
    await settle();
    expect(region('Volatility context')).toHaveTextContent('not available');
    expect(region('Combined E02 and E10 metrics')).toHaveTextContent('not available');
  });

  it('vi: "không có"', async () => {
    mockOk(payload({ derived: null, context: null }));
    renderCard('FPT', 'vi');
    await settle();
    expect(region('Bối cảnh biến động')).toHaveTextContent('không có');
    expect(region('Chỉ số kết hợp E02 và E10')).toHaveTextContent('không có');
  });

  it('band thiếu/sai độ dài và model_agreement null đều hiện "not available"', async () => {
    mockOk(payload({ derived: derived({ band_1sigma_pct: null, band_2sigma_pct: [1], model_agreement: null }) }));
    renderCard();
    await settle();
    const d = region('Combined E02 and E10 metrics');
    expect(dd(d, '±1σ band (%)')).toHaveTextContent('not available');
    expect(dd(d, '±2σ band (%)')).toHaveTextContent('not available');
    expect(dd(d, 'Models matching median sign')).toHaveTextContent('not available');
  });

  it('assumptions hiện nguyên văn', async () => {
    mockOk(payload());
    renderCard();
    await settle();
    const d = region('Combined E02 and E10 metrics');
    expect(d).toHaveTextContent('Calculation assumptions');
    expect(within(d).getByText('assumption-one')).toBeInTheDocument();
    expect(within(d).getByText('assumption-two')).toBeInTheDocument();
  });
});

// ---------- tuổi E10 (5g) ----------
describe('nhãn tuổi E10 (age_weekdays)', () => {
  it('hiện nhãn theo age_weekdays của fixture, không phụ thuộc đồng hồ', async () => {
    const body = payload({ e10: e10({ is_stale: false, age_weekdays: 4, stale_basis: 'weekday_heuristic' }) });
    const expected = `E10 is ${body.e10.age_weekdays} weekdays behind`;
    mockOk(body);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T09:00:00Z'));
    const first = renderCard();
    await settle();
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByText(/Age basis: weekday_heuristic/)).toBeInTheDocument();
    first.unmount();

    vi.setSystemTime(new Date('2026-11-20T09:00:00Z'));
    renderCard();
    await settle();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('thiếu stale_basis hiện "not available" ở dòng Age basis', async () => {
    mockOk(payload({ e10: e10({ stale_basis: undefined }) }));
    renderCard();
    await settle();
    expect(screen.getByText(/Age basis:/)).toHaveTextContent('Age basis: not available');
  });

  it('vi: nhãn tiếng Việt', async () => {
    mockOk(payload());
    renderCard('FPT', 'vi');
    await settle();
    expect(screen.getByText('E10 lùi 4 ngày làm việc')).toBeInTheDocument();
    expect(screen.getByText(/Cách đếm: weekday_heuristic/)).toBeInTheDocument();
  });

  it.each([
    ['age_weekdays = 0', { is_stale: false, age_weekdays: 0 }],
    ['age_weekdays không nguyên', { is_stale: false, age_weekdays: 4.5 }],
    ['age_weekdays là chuỗi', { is_stale: false, age_weekdays: '4' }],
    ['age_weekdays null', { is_stale: false, age_weekdays: null }],
    ['is_stale thiếu', { is_stale: undefined, age_weekdays: 4 }],
    ['is_stale null', { is_stale: null, age_weekdays: 4 }]
  ])('không hiện nhãn khi %s', async (_name, over) => {
    mockOk(payload({ e10: e10(over) }));
    renderCard();
    await settle();
    expect(screen.queryByText(/weekdays behind/)).toBeNull();
    expect(screen.queryByText(/Age basis/)).toBeNull();
  });

  it('used_latest_e10:false hiện nhãn, true thì không', async () => {
    mockOk(payload({ used_latest_e10: false }));
    const a = renderCard();
    await settle();
    expect(screen.getByText('E10 is not the latest available record')).toBeInTheDocument();
    a.unmount();

    mockOk(payload({ used_latest_e10: true }));
    renderCard();
    await settle();
    expect(screen.queryByText('E10 is not the latest available record')).toBeNull();
  });
});

// ---------- lỗi request ----------
describe('trạng thái lỗi', () => {
  it('400: có role=alert, không nút thử lại, không dòng mã HTTP', async () => {
    mockFail(httpError(400));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid request (HTTP 400). Check the symbol.');
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(screen.queryByText(/HTTP status/)).toBeNull();
  });

  it.each([
    [404, 'The Risk/Return request was rejected.'],
    [422, 'The Risk/Return request was rejected.'],
    [500, 'The Risk/Return service is temporarily unavailable.'],
    [502, 'The Risk/Return service is temporarily unavailable.'],
    [503, 'The Risk/Return service is temporarily unavailable.'],
    [504, 'The Risk/Return service is temporarily unavailable.']
  ])('%i: nêu mã HTTP và có nút thử lại', async (status, text) => {
    mockFail(httpError(status));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).toHaveTextContent(`HTTP status: ${status}`);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  // ---- 401 / 403 / 429: hành vi 401/403 đổi theo quyết định auth ----
  // Trước đây 401 và 403 nằm trong it.each ở trên (thông điệp chung "request was rejected" + nút thử lại).
  // Hành vi 401/403 đổi theo quyết định auth: mỗi mã có thông điệp riêng, và 401/403 KHÔNG còn nút thử lại.
  it('401 (ĐỔI, tách khỏi it.each; hành vi 401/403 đổi theo quyết định auth): thông điệp "phiên hết hạn" và dòng mã HTTP', async () => {
    mockFail(httpError(401));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your session has expired. Sign in again to see Risk/Return.');
    expect(alert).toHaveTextContent('HTTP status: 401');
    expect(alert).not.toHaveTextContent('The Risk/Return request was rejected.');
    expect(document.body).not.toHaveTextContent('internal /api/risk-return secret'); // card never shows error.message
  });

  it('401 (MỚI): không có nút thử lại', async () => {
    mockFail(httpError(401));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(api.riskReturnLatest).toHaveBeenCalledTimes(1);
  });

  it('403 (ĐỔI, tách khỏi it.each; hành vi 401/403 đổi theo quyết định auth): thông điệp "không có quyền", dòng mã HTTP và KHÔNG có nút thử lại', async () => {
    mockFail(httpError(403));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You do not have access to the Risk/Return data.');
    expect(alert).toHaveTextContent('HTTP status: 403');
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(document.body).not.toHaveTextContent('internal /api/risk-return secret');
  });

  it('429 (MỚI): thông điệp "quá nhiều yêu cầu", dòng mã HTTP, CÓ nút thử lại và bấm thì gọi lại api', async () => {
    api.riskReturnLatest.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(payload());
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many requests. Wait a moment, then try again.');
    expect(alert).toHaveTextContent('HTTP status: 429');
    expect(document.body).not.toHaveTextContent('internal /api/risk-return secret');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'E02' })).toBeInTheDocument();
    expect(api.riskReturnLatest).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    [401, 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để xem Risk/Return.', false],
    [403, 'Bạn không có quyền xem dữ liệu Risk/Return.', false],
    [429, 'Quá nhiều yêu cầu. Hãy chờ một lúc rồi thử lại.', true]
  ])('vi %i (MỚI): thông điệp tiếng Việt, "Mã HTTP" và nút "Thử lại" = %s', async (status, text, hasRetry) => {
    mockFail(httpError(status));
    renderCard('FPT', 'vi');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).toHaveTextContent(`Mã HTTP: ${status}`);
    expect(within(alert).queryByRole('button', { name: 'Thử lại' }) !== null).toBe(hasRetry);
  });

  it('vi 502: thông điệp, "Mã HTTP: 502" và nút "Thử lại"', async () => {
    mockFail(httpError(502));
    renderCard('FPT', 'vi');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Dịch vụ Risk/Return đang gặp sự cố.');
    expect(alert).toHaveTextContent('Mã HTTP: 502');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])('timeout (%s): thông điệp 90 giây, không dòng mã HTTP, có nút', async (code) => {
    mockFail(httpError(undefined, code));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The Risk/Return request timed out after 90 seconds.');
    expect(alert).not.toHaveTextContent('HTTP status');
    expect(within(alert).getByRole('button')).toBeInTheDocument();
  });

  it('timeout thắng status khi có cả hai', async () => {
    mockFail(httpError(504, 'ECONNABORTED'));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('timed out after 90 seconds');
    expect(alert).not.toHaveTextContent('HTTP status');
  });

  it('lỗi mạng không status: thông điệp khác timeout, không dòng mã HTTP', async () => {
    mockFail(new Error('Network Error'));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot connect to the Risk/Return service.');
    expect(alert).not.toHaveTextContent('timed out');
    expect(alert).not.toHaveTextContent('HTTP status');
    expect(within(alert).getByRole('button')).toBeInTheDocument();
  });

  it('status ngoài dải (302) rơi vào "unknown" và nêu mã', async () => {
    mockFail(httpError(302));
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An unknown Risk/Return error occurred.');
    expect(alert).toHaveTextContent('HTTP status: 302');
  });

  it('không lộ message nội bộ của Error', async () => {
    mockFail(httpError(500));
    renderCard();
    await screen.findByRole('alert');
    expect(document.body).not.toHaveTextContent('internal /api/risk-return secret');
  });

  it('bấm "Try again" gọi lại api và hiện dữ liệu', async () => {
    api.riskReturnLatest.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(payload());
    renderCard();
    fireEvent.click(await within(await screen.findByRole('alert')).findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'E02' })).toBeInTheDocument();
    expect(api.riskReturnLatest).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ---------- E02 gộp / tách ----------
describe('E02: trường chung và trường tách theo mô hình', () => {
  const FIELDS = [
    // [khóa, nhãn dt trong khối chung, giá trị A, giá trị B]
    ['experiment_id', 'E02 experiment', 'exp-a', 'exp-b'],
    ['risk_notice', 'E02 risk notice', 'rn-a', 'rn-b'],
    ['target_notice', 'Target date notice', 'tn-a', 'tn-b']
  ];

  it('ca gộp: as_of/trained_until một lần, các trường chung hiện một lần ngoài bảng', async () => {
    mockOk(payload());
    renderCard();
    await settle();
    const e02 = region('E02');
    expect(dd(e02, 'as_of', 0)).toHaveTextContent('2026-10-22');
    expect(dd(e02, 'Trained until', 0)).toHaveTextContent('2026-10-21');
    expect(within(e02).queryByText('per model')).toBeNull();
    expect(within(e02).queryByText('E02 as_of')).toBeNull();
    expect(within(e02).queryByText('E02 Trained until')).toBeNull();
    for (const [, label] of FIELDS) expect(within(e02).getAllByText(label, { selector: 'dt' })).toHaveLength(1);
    expect(within(e02).getAllByText('E02 descriptive risk')).toHaveLength(1);
  });

  it.each(FIELDS)('tách riêng %s: hiện theo từng hàng, không hiện ở khối chung', async (key, label, a, b) => {
    mockOk(payload({ e02: { predictions: [row({ model: 'ModelA', [key]: a }), row({ model: 'ModelB', [key]: b })] } }));
    renderCard();
    await settle();
    const e02 = region('E02');
    const dts = within(e02).getAllByText(label, { selector: 'dt' });
    expect(dts).toHaveLength(2);
    expect(dts[0].nextElementSibling).toHaveTextContent(a);
    expect(dts[1].nextElementSibling).toHaveTextContent(b);
    const [, rowA, rowB] = within(e02).getAllByRole('row');
    expect(rowA).toHaveTextContent(a);
    expect(rowB).toHaveTextContent(b);
  });

  it('tách as_of: E02 hiện "per model", hàng hiện "E02 as_of"; trained_until vẫn chung', async () => {
    mockOk(payload({ e02: { predictions: [row({ model: 'ModelA', as_of: '2026-10-21' }), row({ model: 'ModelB', as_of: '2026-10-22' })] } }));
    renderCard();
    await settle();
    const e02 = region('E02');
    expect(dd(e02, 'as_of', 0)).toHaveTextContent('per model');
    expect(dd(e02, 'Trained until', 0)).toHaveTextContent('2026-10-21');
    expect(within(e02).getAllByText('E02 as_of', { selector: 'dt' })).toHaveLength(2);
    expect(within(e02).queryByText('E02 Trained until')).toBeNull();
  });

  it('LỖI B: tách hết (as_of, trained_until và mọi trường khác) vẫn hiện "per model" và từng hàng', async () => {
    mockOk(payload({
      e02: {
        predictions: [
          row({ model: 'ModelA', experiment_id: 'exp-a', as_of: '2026-10-20', trained_until: '2026-10-19', risk_notice: 'rn-a', target_notice: 'tn-a', descriptive_risk: { k: 'va' } }),
          row({ model: 'ModelB', experiment_id: 'exp-b', as_of: '2026-10-22', trained_until: '2026-10-21', risk_notice: 'rn-b', target_notice: 'tn-b', descriptive_risk: { k: 'vb' } })
        ]
      }
    }));
    renderCard();
    await settle();
    const e02 = region('E02');
    expect(dd(e02, 'as_of', 0)).toHaveTextContent('per model');
    expect(dd(e02, 'Trained until', 0)).toHaveTextContent('per model');
    expect(within(e02).getAllByText('E02 as_of', { selector: 'dt' })).toHaveLength(2);
    expect(within(e02).getAllByText('E02 Trained until', { selector: 'dt' })).toHaveLength(2);
    for (const [, label] of FIELDS) expect(within(e02).getAllByText(label, { selector: 'dt' })).toHaveLength(2);
    expect(within(e02).getAllByText('E02 descriptive risk')).toHaveLength(2);
    for (const v of ['2026-10-20', '2026-10-19', 'exp-a', 'exp-b', 'rn-a', 'rn-b', 'tn-a', 'tn-b', 'va', 'vb']) {
      expect(within(e02).getByText(v)).toBeInTheDocument();
    }
  });

  it('descriptive_risk khác nhau giữa các hàng: một khối chi tiết cho mỗi hàng', async () => {
    mockOk(payload({ e02: { predictions: [row({ model: 'ModelA', descriptive_risk: { k: 'va' } }), row({ model: 'ModelB', descriptive_risk: { k: 'vb' } })] } }));
    renderCard();
    await settle();
    const e02 = region('E02');
    expect(within(e02).getAllByText('E02 descriptive risk')).toHaveLength(2);
    const [, rowA, rowB] = within(e02).getAllByRole('row');
    expect(rowA).toHaveTextContent('va');
    expect(rowB).toHaveTextContent('vb');
  });

  it('descriptive_risk chỉ khác thứ tự khóa vẫn coi là chung', async () => {
    mockOk(payload({ e02: { predictions: [row({ model: 'ModelA', descriptive_risk: { a: 1, b: 2 } }), row({ model: 'ModelB', descriptive_risk: { b: 2, a: 1 } })] } }));
    renderCard();
    await settle();
    expect(within(region('E02')).getAllByText('E02 descriptive risk')).toHaveLength(1);
  });

  it('một hàng duy nhất: mọi trường đều chung', async () => {
    mockOk(payload({ e02: { predictions: [row({ model: 'Solo' })] } }));
    renderCard();
    await settle();
    const e02 = region('E02');
    expect(within(e02).queryByText('per model')).toBeNull();
    expect(within(e02).getAllByRole('row')).toHaveLength(2);
  });

  it('E02 as_of khác E10 as_of: hai cột hiển thị hai ngày khác nhau (mismatch dates)', async () => {
    mockOk(payload({ e10: e10({ as_of: '2026-10-15', trained_until: '2026-10-14' }) }));
    renderCard();
    await settle();
    const e02 = region('E02');
    expect(dd(e02, 'as_of', 0)).toHaveTextContent('2026-10-22');
    expect(dd(e02, 'as_of', 1)).toHaveTextContent('2026-10-15');
    expect(dd(e02, 'Trained until', 1)).toHaveTextContent('2026-10-14');
  });
});

// ---------- thứ tự, nguyên văn, trường không được hiện ----------
describe('thứ tự dòng, trend nguyên văn, trường bị cấm', () => {
  it('giữ nguyên thứ tự dòng của payload', async () => {
    const names = ['Zeta', 'Alpha', 'Mid', 'Beta'];
    mockOk(payload({ e02: { predictions: names.map((model) => row({ model })) } }));
    renderCard();
    await settle();
    const rows = within(region('E02')).getAllByRole('row').slice(1);
    expect(rows.map((r) => names.find((n) => r.textContent.includes(n)))).toEqual(names);
  });

  it('trend hiện nguyên văn, không đổi chữ, không dấu "+" ở phần trăm', async () => {
    mockOk(payload({
      e02: {
        predictions: [
          row({ model: 'ModelA', trend: 'DOWN', predicted_return_percent: 0.1755 }),
          row({ model: 'ModelB', trend: 'weird_Trend-9', predicted_return_percent: -0.5 })
        ]
      }
    }));
    renderCard();
    await settle();
    const [, rowA, rowB] = within(region('E02')).getAllByRole('row');
    expect(within(rowA).getByText('DOWN')).toBeInTheDocument();
    expect(within(rowA).getByText('0.18%')).toBeInTheDocument();
    expect(rowA).not.toHaveTextContent('+0.18%');
    expect(within(rowB).getByText('weird_Trend-9')).toBeInTheDocument();
    expect(within(rowB).getByText('-0.50%')).toBeInTheDocument();
  });

  it('không render predicted_return dạng phân số và mọi trường *_sha256', async () => {
    mockOk(payload({
      e02: {
        predictions: [row({ model: 'ModelA', predicted_return: 0.001755, model_sha256: 'abc123deadbeefA', feature_sha256: 'feedface01' })],
        checkpoint_sha256: 'cafebabe99'
      },
      e10: e10({ input_sha256: 'e10hashvalue77' }),
      context: { ...context(), source_sha256: 'ctxhash55' },
      derived: { ...derived(), assumptions_sha256: 'dervhash66' }
    }));
    renderCard();
    await settle();
    const text = document.body.textContent;
    for (const hidden of ['0.001755', '0,001755', 'abc123deadbeefA', 'feedface01', 'cafebabe99', 'e10hashvalue77', 'ctxhash55', 'dervhash66', 'sha256']) {
      expect(text).not.toContain(hidden);
    }
    expect(screen.queryByText('predicted_return')).toBeNull();
  });

  it('target_date_estimated:true hiện nhãn "estimated"', async () => {
    mockOk(payload({ e02: { predictions: [row({ model: 'ModelA', target_date_estimated: true }), row({ model: 'ModelB', target_date_estimated: false })] } }));
    renderCard();
    await settle();
    const [, rowA, rowB] = within(region('E02')).getAllByRole('row');
    expect(rowA).toHaveTextContent('(estimated)');
    expect(rowB).not.toHaveTextContent('(estimated)');
  });

  it('chuỗi backend (notes, warnings) hiện nguyên văn, không dịch, kể cả ở vi', async () => {
    mockOk(payload({
      e02: { predictions: [row({ model: 'ModelA', warnings: [{ code: 'CALENDAR_GAP', note: 'Calendar note in English' }, 'plain warning'] })] },
      meta: { research_status: 'RESEARCH_ONLY', notes: ['Ghi chú gốc từ backend'] }
    }));
    renderCard('FPT', 'vi');
    await settle();
    expect(screen.getByText('Ghi chú gốc từ backend')).toBeInTheDocument();
    const e02 = region('E02');
    expect(within(e02).getByText('Cảnh báo')).toBeInTheDocument();
    expect(e02).toHaveTextContent('code: CALENDAR_GAP · note: Calendar note in English');
    expect(within(e02).getByText('plain warning')).toBeInTheDocument();
  });

  it('research_status lấy từ meta, nếu thiếu thì từ e10; có nhãn "not approved"', async () => {
    mockOk(payload({ meta: { notes: [] }, e10: e10({ research_status: 'E10_ONLY_STATUS' }) }));
    renderCard();
    await settle();
    expect(screen.getByText('E10_ONLY_STATUS')).toBeInTheDocument();
    expect(screen.getByText('not approved for production')).toBeInTheDocument();
  });
});

// ---------- số theo locale ----------
describe('định dạng số theo locale', () => {
  const body = () => payload({
    e02: { predictions: [row({ model: 'ModelA', predicted_return_percent: 1.1749 })] },
    context: context({ e10_over_vol20: 1.2, historical_percentile: 62.3, volatility_20_pct: 6.8412 }),
    derived: derived({ z_score: 0.962, sigma_5d_pct: 3.3541, band_1sigma_pct: [-1.2, 3.4] })
  });

  it('en: dấu thập phân là chấm', async () => {
    mockOk(body());
    renderCard('FPT', 'en');
    await settle();
    const [, r] = within(region('E02')).getAllByRole('row');
    expect(within(r).getByText('1.17%')).toBeInTheDocument();
    const c = region('Volatility context');
    expect(dd(c, '20-day volatility (%)')).toHaveTextContent('6.84%');
    expect(dd(c, 'E10/Volatility_20 ratio')).toHaveTextContent('1.20');
    expect(dd(c, 'Historical percentile (0–100)')).toHaveTextContent('62.30');
    const d = region('Combined E02 and E10 metrics');
    expect(dd(d, 'Z-score')).toHaveTextContent('0.96');
    expect(dd(d, '5-session sigma (%)')).toHaveTextContent('3.35%');
    expect(dd(d, '±1σ band (%)')).toHaveTextContent('-1.20% – 3.40%');
    expect(dd(d, 'Forecast sessions')).toHaveTextContent('5');
    expect(dd(d, 'Models matching median sign')).toHaveTextContent('2 / 2');
  });

  it('vi: dấu thập phân là phẩy', async () => {
    mockOk(body());
    renderCard('FPT', 'vi');
    await settle();
    const [, r] = within(region('E02')).getAllByRole('row');
    expect(within(r).getByText('1,17%')).toBeInTheDocument();
    const c = region('Bối cảnh biến động');
    expect(dd(c, 'Biến động 20 ngày (%)')).toHaveTextContent('6,84%');
    expect(dd(c, 'Tỷ số E10/Volatility_20')).toHaveTextContent('1,20');
    expect(dd(c, 'Phân vị lịch sử (0–100)')).toHaveTextContent('62,30');
    const d = region('Chỉ số kết hợp E02 và E10');
    expect(dd(d, 'Z-score')).toHaveTextContent('0,96');
    expect(dd(d, 'Sigma 5 phiên (%)')).toHaveTextContent('3,35%');
    expect(dd(d, 'Dải ±1σ (%)')).toHaveTextContent('-1,20% – 3,40%');
    expect(screen.queryByText('1.17%')).toBeNull();
  });

  it('tiêu đề card theo ngôn ngữ và symbol', async () => {
    mockOk(payload());
    renderCard('HPG', 'vi');
    await settle();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Lợi nhuận và biến động 5 phiên · HPG');
  });

  it('title giữ số gốc chưa làm tròn; sao chép trả số gốc', async () => {
    mockOk(payload({ e02: { predictions: [row({ model: 'ModelA', predicted_return_percent: 0.1755 })] } }));
    renderCard('HPG', 'en');
    await settle();
    const shown = screen.getByText('0.18%');
    expect(shown).toHaveAttribute('title', '0.1755');
    const setData = vi.fn();
    const notCancelled = fireEvent.copy(shown, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith('text/plain', '0.1755');
    expect(notCancelled).toBe(false);
  });
});

// ---------- đổi symbol ----------
describe('đổi symbol', () => {
  it('không giữ số của symbol cũ trong lúc tải symbol mới', async () => {
    const fpt = payload({ e02: { predictions: [row({ model: 'FPT_ONLY_MODEL', predicted_return_percent: 4.4444 })] } });
    // useApi gọi api trong effect, tức là sau khi khung render đầu tiên của symbol mới đã commit.
    // Chụp DOM đúng lúc đó để bắt khung trung gian mà `key={symbol}` có nhiệm vụ chặn.
    let domWhenNewSymbolRequested = null;
    api.riskReturnLatest.mockImplementation((symbol) => {
      if (symbol === 'FPT') return Promise.resolve(fpt);
      domWhenNewSymbolRequested = document.body.textContent;
      return new Promise(() => {});
    });
    const view = renderCard('FPT');
    await settle();
    expect(screen.getByText('FPT_ONLY_MODEL')).toBeInTheDocument();
    expect(screen.getByText('4.44%')).toBeInTheDocument();

    view.rerenderSymbol('HPG');
    expect(domWhenNewSymbolRequested).not.toBeNull();
    expect(domWhenNewSymbolRequested).not.toContain('FPT_ONLY_MODEL');
    expect(domWhenNewSymbolRequested).not.toContain('4.44%');
    expect(screen.queryByText('FPT_ONLY_MODEL')).toBeNull();
    expect(screen.queryByText('4.44%')).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('HPG');
    expect(api.riskReturnLatest).toHaveBeenLastCalledWith('HPG', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('lỗi của symbol mới không giữ dữ liệu cũ', async () => {
    api.riskReturnLatest.mockImplementation((symbol) =>
      (symbol === 'FPT' ? Promise.resolve(payload({ e02: { predictions: [row({ model: 'FPT_ONLY_MODEL' })] } })) : Promise.reject(httpError(404))));
    const view = renderCard('FPT');
    await settle();
    view.rerenderSymbol('XXX');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('HTTP status: 404');
    expect(screen.queryByText('FPT_ONLY_MODEL')).toBeNull();
  });
});

// ---------- fixture thật (rr_*.json) ----------
describe('smoke test trên các fixture rr_*.json', () => {
  const files = import.meta.glob('../test/fixtures/risk-return/rr_*.json', { eager: true, import: 'default' });
  const entries = Object.entries(files);

  it('tìm thấy fixture', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s render được, không rơi vào lỗi', async (_path, body) => {
    mockOk(body);
    renderCard();
    await settle();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

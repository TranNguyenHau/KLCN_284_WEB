import { e02Symbol } from './stocktrainClient.js';
import { config } from '../config.js';
import { requestContext } from '../middleware/requireAuth.js';

const PATHS = Object.freeze({ predictions: '/api/predictions/latest', riskReturn: '/api/risk-return/latest', volatility: '/api/volatility/latest' });
const MESSAGES = Object.freeze({
  STORED_INVALID_SYMBOL: 'Mã cổ phiếu thiếu hoặc không hợp lệ. Vui lòng chọn FPT, HPG, VCB, VNM hoặc SSI.',
  E02_UNSUPPORTED_SYMBOL: 'Mã cổ phiếu thiếu hoặc không hợp lệ. Vui lòng chọn FPT, HPG, VCB, VNM hoặc SSI.',
  STORED_UNAVAILABLE: 'Không kết nối được dịch vụ dự báo đã lưu. Vui lòng thử lại sau.',
  STORED_FORBIDDEN: 'Bạn chưa có quyền truy cập dữ liệu dự báo đã lưu hoặc phiên đăng nhập đã hết hạn.',
  STORED_EMPTY: 'Không có dữ liệu dự báo đã lưu cho mã này.',
  STORED_INVALID_RESPONSE: 'Dịch vụ dự báo đã lưu trả dữ liệu không đúng định dạng. Vui lòng thử lại sau.',
  STORED_HTTP_ERROR: 'Dịch vụ dự báo đã lưu chưa xử lý được yêu cầu. Vui lòng thử lại sau.',
  DEADLINE_EXCEEDED: 'Đã quá thời gian lấy dự báo đã lưu. Vui lòng thử lại sau.'
});
export const storedForecastErrorMessage = (code) => Object.hasOwn(MESSAGES, code || '') ? MESSAGES[code] : undefined;
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const number = (x) => typeof x === 'number' && Number.isFinite(x);
const date = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const sameSymbol = (x, symbol) => record(x) && x.symbol === symbol && date(x.as_of);
const volatilityRow = (x, symbol) => sameSymbol(x, symbol) && number(x.predicted_volatility) && x.predicted_volatility >= 0 && typeof x.volatility_unit === 'string' && x.volatility_unit.startsWith('daily_log_return_rms (fraction');
const predictionRow = (x, symbol) => sameSymbol(x, symbol) && typeof x.model === 'string' && number(x.predicted_return) && ['UP', 'HOLD', 'DOWN', 'SIDEWAYS'].includes(x.trend);
function listPayload(payload, validate) {
  return record(payload) && Number.isInteger(payload.count) && Array.isArray(payload.predictions) && payload.count === payload.predictions.length && payload.predictions.every(validate);
}
function validPayload(kind, payload, symbol) {
  if (kind !== 'riskReturn') return listPayload(payload, (row) => (kind === 'volatility' ? volatilityRow : predictionRow)(row, symbol));
  if (!record(payload) || payload.symbol !== symbol || typeof payload.aligned !== 'boolean' || !(payload.as_of === null || date(payload.as_of))) return false;
  if (!listPayload(payload.e02, (row) => predictionRow(row, symbol)) || !(payload.e10 === null || volatilityRow(payload.e10, symbol))) return false;
  if (payload.aligned) return date(payload.as_of) && payload.e02.count > 0 && payload.e10 !== null && record(payload.derived) && number(payload.derived.return_median_pct) && number(payload.derived.sigma_5d_pct);
  return payload.derived === null;
}

export function createStoredForecastService({ baseUrl = config.stocktrainApiUrl, fetchImpl = globalThis.fetch, logger = console } = {}) {
  return async function getStoredForecast(kind, symbol, { signal } = {}) {
    const sym = e02Symbol(symbol);
    if (!Object.hasOwn(PATHS, kind)) throw new Error('Unsupported stored forecast');
    const path = PATHS[kind];
    let status;
    function failure(code, reason) {
      // Do not log bodies, headers, cookies, URL credentials or raw exception messages.
      logger.error('[stored-forecast]', { kind, path, symbol: sym, status: status ?? null, reason });
      return Object.assign(new Error(MESSAGES[code]), { code });
    }
    let response;
    try {
      const url = new URL(path, new URL(baseUrl).origin);
      url.searchParams.set('symbol', sym);
      const cookie = requestContext.getStore()?.cookie;
      response = await fetchImpl(url, {
        method: 'GET', headers: { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]), redirect: 'error'
      });
      status = response.status;
    } catch (err) {
      const timedOut = signal?.aborted || ['AbortError', 'TimeoutError'].includes(err?.name);
      const networkCode = err?.cause?.code ?? err?.code;
      const reason = timedOut ? 'timeout_or_cancelled' : ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(networkCode) ? networkCode : 'connection_failed';
      throw failure(timedOut ? 'DEADLINE_EXCEEDED' : 'STORED_UNAVAILABLE', reason);
    }
    if ([401, 403].includes(status)) throw failure('STORED_FORBIDDEN', 'access_denied');
    if (status === 400) throw failure('STORED_INVALID_SYMBOL', 'invalid_symbol');
    if (status >= 500) throw failure('STORED_UNAVAILABLE', 'upstream_failure');
    if (status !== 200) throw failure('STORED_HTTP_ERROR', 'http_error');
    let payload;
    try { payload = await response.json(); }
    catch { throw failure('STORED_INVALID_RESPONSE', 'invalid_json'); }
    if (!validPayload(kind, payload, sym)) throw failure('STORED_INVALID_RESPONSE', 'schema_mismatch');
    const empty = kind === 'riskReturn' ? payload.e02.count === 0 && payload.e10 === null : payload.count === 0;
    if (empty) throw failure('STORED_EMPTY', 'no_data');
    return { ...payload, source: kind === 'predictions' ? 'du_doan' : 'daily_pipeline' };
  };
}
export const getStoredForecast = createStoredForecastService();

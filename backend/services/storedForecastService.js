import { e02Get, e02Symbol } from './stocktrainClient.js';
import { config } from '../config.js';
import { requestContext } from '../middleware/requireAuth.js';

// Fixed existing Flask GET endpoints; preserve the caller's cookie and rate-limit verdicts.
export async function getStoredForecast(kind, symbol, { signal } = {}) {
  const sym = e02Symbol(symbol);
  if (kind === 'predictions') {
    const payload = await e02Get('/predictions/latest', { symbol: sym }, { signal });
    return { source: 'du_doan', ...payload };
  }
  const paths = { riskReturn: '/api/risk-return/latest', volatility: '/api/volatility/latest' };
  if (!paths[kind]) throw new Error('Unsupported stored forecast');
  const cookie = requestContext.getStore()?.cookie;
  const response = await fetch(new URL(paths[kind], new URL(config.stocktrainApiUrl).origin), {
    headers: cookie ? { Cookie: cookie } : {}, signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]), redirect: 'error'
  });
  if (!response.ok) throw new Error('Dữ liệu dự báo đã lưu hiện chưa sẵn sàng.');
  return { source: 'daily_pipeline', ...(await response.json()) };
}

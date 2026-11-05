import axios from 'axios';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { requestContext } from '../middleware/requireAuth.js';

export const E02_SYMBOLS = new Set(['FPT', 'HPG', 'VCB', 'VNM', 'SSI']);
const client = axios.create({ baseURL: config.stocktrainApiUrl, timeout: config.stocktrainTimeoutMs });

export function e02Symbol(raw) {
  const symbol = String(raw || '').trim().toUpperCase();
  if (!E02_SYMBOLS.has(symbol)) {
    throw new AppError(400, 'E02_UNSUPPORTED_SYMBOL', 'E02 hiện chỉ hỗ trợ FPT, HPG, VCB, VNM, SSI');
  }
  return symbol;
}

export async function e02Get(path, params) {
  try {
    // Calls made on behalf of a logged-in user carry that user's session cookie; Flask authenticates it.
    const cookie = requestContext.getStore()?.cookie;
    const { data } = await client.get(path, { params, headers: cookie ? { Cookie: cookie } : undefined });
    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.response) {
      const message = typeof error.response.data?.error === 'string'
        ? error.response.data.error : 'Flask E02 API returned an error';
      throw new AppError(error.response.status >= 500 ? 502 : error.response.status,
        'E02_API_ERROR', message);
    }
    throw new AppError(error.code === 'ECONNABORTED' ? 504 : 503,
      'E02_API_UNAVAILABLE', `Không kết nối được Flask E02 tại ${config.stocktrainApiUrl}. Hãy bật Flask ở cổng 5001.`);
  }
}

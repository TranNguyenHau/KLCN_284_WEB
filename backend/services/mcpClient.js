import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from '../config.js';
import { bounded, timeoutError } from './deadline.js';

export const MCP_TOOLS = Object.freeze(['list_models_and_symbols', 'predict_stock', 'rank_stocks', 'get_recent_prices', 'get_model_metrics']);
export const MCP_TIMEOUTS = Object.freeze({ list_models_and_symbols: 10000, predict_stock: 45000, rank_stocks: 60000, get_recent_prices: 10000, get_model_metrics: 10000 });
const symbols = ['VNM', 'VCB', 'FPT', 'HPG', 'SSI'];
const models = ['LinearRegression', 'RandomForest', 'XGBoost', 'SVM (SVR)', 'LSTM'];
const fail = (code, message) => Object.assign(new Error(message), { code });

function argumentsFor(name, args) {
  if (!MCP_TOOLS.includes(name)) throw fail('MCP_TOOL_DENIED', 'Công cụ MCP không được phép.');
  const out = {};
  if (['predict_stock', 'get_recent_prices', 'get_model_metrics'].includes(name)) {
    out.symbol = String(args.symbol || '').toUpperCase();
    if (!symbols.includes(out.symbol)) throw fail('MCP_INVALID_ARGUMENT', 'MCP chỉ hỗ trợ VNM, VCB, FPT, HPG, SSI.');
  }
  if (['predict_stock', 'rank_stocks', 'get_model_metrics'].includes(name)) {
    out.model = args.model || 'all';
    if (!models.includes(out.model) && !(out.model === 'all' && name !== 'get_model_metrics')) throw fail('MCP_INVALID_ARGUMENT', 'Mô hình MCP không hợp lệ.');
  }
  if (name === 'get_recent_prices') {
    out.limit = args.limit ?? 10;
    if (!Number.isInteger(out.limit) || out.limit < 1 || out.limit > 250) throw fail('MCP_INVALID_ARGUMENT', 'Số phiên không hợp lệ.');
  }
  // No user-controlled refresh, custom prices, URL or headers.
  return out;
}

export function createMcpClient({ url = config.mcpUrl, token = config.mcpAuthToken, maxConcurrent = 2, cacheTtlMs = 180000, timeouts = MCP_TIMEOUTS, now = Date.now, transportFactory = (u, options) => new StreamableHTTPClientTransport(u, options), clientFactory = () => new Client({ name: 'stocktrain-express', version: '1.0.0' }) } = {}) {
  let active = 0;
  const queue = [];
  const cache = new Map();
  async function acquire(signal) {
    if (signal.aborted) throw timeoutError();
    if (active < maxConcurrent) { active++; return; }
    if (queue.length >= 20) throw fail('MCP_BUSY', 'MCP đang bận. Vui lòng thử lại sau.');
    await new Promise((resolve, reject) => {
      const entry = { resolve: () => { signal.removeEventListener('abort', abort); resolve(); } };
      const abort = () => { const i = queue.indexOf(entry); if (i >= 0) queue.splice(i, 1); reject(timeoutError()); };
      signal.addEventListener('abort', abort, { once: true });
      queue.push(entry);
    });
  }
  function release() {
    const next = queue.shift();
    if (next) next.resolve(); else active--;
  }
  return {
    async call(name, args = {}, { signal } = {}) {
      const input = argumentsFor(name, args);
      if (!url || !token) throw fail('MCP_NOT_CONFIGURED', 'Chưa cấu hình kết nối MCP.');
      const endpoint = new URL(url);
      if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/mcp' || endpoint.search || endpoint.username || endpoint.password) throw fail('MCP_INVALID_URL', 'MCP phải dùng địa chỉ loopback /mcp.');
      const key = JSON.stringify([name, input]);
      const hit = cache.get(key);
      if (signal?.aborted) throw timeoutError();
      if (hit && now() - hit.at < cacheTtlMs) return structuredClone(hit.data);
      try {
        return await bounded(async (localSignal) => {
          await acquire(localSignal);
          let client;
          try {
            if (localSignal.aborted) throw timeoutError();
            client = clientFactory();
            const transport = transportFactory(endpoint, { requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' }, fetch: (u, options) => fetch(u, { ...options, signal: AbortSignal.any([localSignal, ...(options?.signal ? [options.signal] : [])]) }) });
            // Closing the SDK also cancels pending I/O on timeout/disconnect.
            const close = () => { Promise.resolve(client.close()).catch(() => {}); };
            localSignal.addEventListener('abort', close, { once: true });
            let result;
            try {
              result = await bounded(async () => {
                await client.connect(transport, { signal: localSignal, timeout: timeouts[name] });
                return client.callTool({ name, arguments: input }, undefined, { signal: localSignal, timeout: timeouts[name], resetTimeoutOnProgress: false });
              }, { signal: localSignal, timeoutMs: timeouts[name] });
            } finally { localSignal.removeEventListener('abort', close); close(); }
            if (result.isError) throw fail('MCP_RESULT_ERROR', 'MCP chưa cung cấp được kết quả hợp lệ.');
            const data = result.structuredContent ?? JSON.parse(result.content.find((x) => x.type === 'text').text);
            if (!data || typeof data !== 'object' || JSON.stringify(data).length > 1000000) throw new Error('Invalid result');
            if (name === 'predict_stock' && !Array.isArray(data.results)) throw new Error('Invalid prediction');
            if (name === 'rank_stocks' && (!Array.isArray(data.ranking) || !Array.isArray(data.failed))) throw new Error('Invalid ranking');
            if (['predict_stock', 'rank_stocks'].includes(name)) {
              if (cache.size >= 100) cache.delete(cache.keys().next().value);
              cache.set(key, { at: now(), data: structuredClone(data) });
            }
            return data;
          } finally { release(); }
        }, { signal, timeoutMs: timeouts[name] });
      } catch (err) {
        if (err.code === 'DEADLINE_EXCEEDED') throw timeoutError();
        if (['MCP_BUSY', 'MCP_RESULT_ERROR'].includes(err.code)) throw err;
        // Never propagate transport exceptions (may contain credentials or tool text).
        throw fail('MCP_UNAVAILABLE', 'Không kết nối được MCP. Các phần không cần dự báo vẫn hoạt động.');
      }
    }
  };
}
export const mcpClient = createMcpClient();

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
process.env.DOTENV_CONFIG_PATH = '__no_test_env__';
const { createStoredForecastService, storedForecastErrorMessage } = await import('../services/storedForecastService.js');
const { requestContext } = await import('../middleware/requireAuth.js');
const { createAgent } = await import('../services/agent/agentService.js');
const risk = JSON.parse(readFileSync(new URL('./fixtures/rr_HPG.json', import.meta.url)));
const vol = JSON.parse(readFileSync(new URL('./fixtures/e10_latest_FPT.json', import.meta.url)));
vol.predictions[0].symbol = 'HPG';
const bodies = { volatility: vol, riskReturn: risk, predictions: risk.e02 };
const paths = { volatility: '/api/volatility/latest', riskReturn: '/api/risk-return/latest', predictions: '/api/predictions/latest' };
function setup(fetchImpl) {
  const logs = [];
  return { logs, get: createStoredForecastService({ baseUrl: 'http://127.0.0.1:5012/api', fetchImpl, logger: { error: (...args) => logs.push(args) } }) };
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
for (const kind of Object.keys(bodies)) {
  test(`${kind}: correct GET, symbol, isolated caller cookie and 200 schema`, async () => {
    const seen = [];
    const { get } = setup(async (url, options) => { seen.push({ url, options }); return response(bodies[kind]); });
    const [a, b] = await Promise.all(['session-a', 'session-b'].map(cookie => requestContext.run({ cookie }, () => get(kind, ' hpg '))));
    assert.deepEqual(a.predictions ?? a.e02.predictions, bodies[kind].predictions ?? bodies[kind].e02.predictions);
    assert.equal(b.source, kind === 'predictions' ? 'du_doan' : 'daily_pipeline');
    assert.deepEqual(seen.map(x => x.options.headers.Cookie), ['session-a', 'session-b']);
    for (const { url, options } of seen) {
      assert.equal(url.origin, 'http://127.0.0.1:5012'); assert.equal(url.pathname, paths[kind]);
      assert.equal(url.search, '?symbol=HPG'); assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error'); assert.equal(options.headers['X-Requested-With'], undefined);
    }
  });
  test(`${kind}: 200 empty is no data, not outage`, async () => {
    const empty = kind === 'riskReturn' ? { ...risk, aligned: false, as_of: null, e02: { count: 0, predictions: [] }, e10: null, derived: null } : { count: 0, predictions: [] };
    const { get, logs } = setup(async () => response(empty));
    await assert.rejects(get(kind, 'HPG'), { code: 'STORED_EMPTY' });
    assert.equal(logs[0][1].status, 200); assert.equal(logs[0][1].reason, 'no_data');
  });
  for (const status of [401, 403, 400, 503]) test(`${kind}: HTTP ${status} logged without response secrets`, async () => {
    const { get, logs } = setup(async () => response({ error: 'private token must not appear' }, status));
    await assert.rejects(get(kind, 'HPG'), { code: status === 401 || status === 403 ? 'STORED_FORBIDDEN' : status === 400 ? 'STORED_INVALID_SYMBOL' : 'STORED_UNAVAILABLE' });
    assert.equal(logs[0][1].status, status); assert.ok(!JSON.stringify(logs).includes('private token'));
  });
  test(`${kind}: connection error is distinct and sanitized`, async () => {
    const { get, logs } = setup(async () => { throw Object.assign(new Error('cookie=secret; password=secret'), { cause: { code: 'ECONNREFUSED' } }); });
    await assert.rejects(get(kind, 'HPG'), { code: 'STORED_UNAVAILABLE' });
    assert.equal(logs[0][1].reason, 'ECONNREFUSED'); assert.ok(!JSON.stringify(logs).includes('secret'));
  });
  test(`${kind}: unexpected JSON envelope rejected`, async () => {
    const { get } = setup(async () => response({ data: bodies[kind] }));
    await assert.rejects(get(kind, 'HPG'), { code: 'STORED_INVALID_RESPONSE' });
  });
}
test('wrong symbol/field names/units are rejected rather than silently rendered', async () => {
  for (const patch of [{ symbol: 'FPT' }, { predicted_volatility: '0.01' }, { volatility_unit: 'percent' }, { as_of: null }]) {
    const body = { ...vol, predictions: [{ ...vol.predictions[0], ...patch }] };
    await assert.rejects(setup(async () => response(body)).get('volatility', 'HPG'), { code: 'STORED_INVALID_RESPONSE' });
  }
});
test('actual HTTP transport sends symbol and cookie without a CSRF header on GET', async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const status = req.headers.cookie !== 'test-session' ? 401 : url.searchParams.get('symbol') !== 'HPG' ? 400 : 200;
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(status === 200 ? vol : { error: 'invalid request' }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const get = createStoredForecastService({ baseUrl: `http://127.0.0.1:${server.address().port}/api` });
    const data = await requestContext.run({ cookie: 'test-session' }, () => get('volatility', 'HPG'));
    assert.equal(data.count, 1);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
test('agent preserves distinct safe service errors, never raw upstream message', async () => {
  for (const code of ['STORED_EMPTY', 'STORED_FORBIDDEN', 'STORED_UNAVAILABLE', 'STORED_INVALID_RESPONSE']) {
    const agent = createAgent({ hasLlm: () => false, tool: async () => ({ ok: false, error: { code, message: 'private cookie' } }) });
    const result = await agent({ message: 'HPG dự đoán biến động sắp tới', language: 'vi' });
    assert.ok(result.reply.includes(storedForecastErrorMessage(code)));
    assert.doesNotMatch(result.reply, /private cookie|5012|HTTP 401/);
  }
});

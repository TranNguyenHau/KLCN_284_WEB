'use strict';
// G6 tests: fake Flask upstream, no database, no real Flask. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createFlaskForwarder } from '../routes/flaskForward.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const LATEST = fx('e10_latest_FPT.json');
const HISTORY = fx('e10_history_FPT.json');
const BAD400 = fx('e10_400.json');
const EMPTY = JSON.stringify({ count: 0, predictions: [], reason: 'NO_E10_PREDICTION', meta: JSON.parse(LATEST).meta });
const silent = { error() {} };
const FLASK_HEADERS = {
  'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:3000',
  Server: 'Werkzeug/3.1.9 Python/3.13.7', Connection: 'close',
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
async function fakeFlask(handler) {
  const calls = [];
  const server = http.createServer((req, res) => { calls.push(req.url); handler(req, res); });
  const baseUrl = await listen(server);
  return { server, calls, baseUrl, close: () => { server.closeAllConnections(); return new Promise((r) => server.close(r)); } };
}
async function appFor(baseUrl, extra = {}) {
  const app = express();
  app.get('/api/stocks', (req, res) => res.json({ stocks: [{ symbol: 'FPT' }] })); // stand-in for an existing E02 route
  app.use('/api', createFlaskForwarder({ baseUrl, timeoutMs: 400, logger: silent, ...extra }));
  const server = http.createServer(app);
  const url = await listen(server);
  return { url, close: () => { server.closeAllConnections(); return new Promise((r) => server.close(r)); } };
}
const reply = (status, body, headers = FLASK_HEADERS) => (req, res) => { res.writeHead(status, headers); res.end(body); };
async function withStack(handler, fn, extra) {
  const flask = await fakeFlask(handler);
  const app = await appFor(flask.baseUrl, extra);
  try { await fn({ flask, app }); } finally { await app.close(); await flask.close(); }
}

test('latest: status and raw body are forwarded unchanged', () =>
  withStack(reply(200, LATEST), async ({ flask, app }) => {
    const r = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`);
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.equal(text, LATEST);
    assert.deepEqual(JSON.parse(text), JSON.parse(LATEST));
    assert.equal(flask.calls[0], '/api/volatility/latest?symbol=FPT');
    assert.match(r.headers.get('content-type'), /application\/json/);
  }));

test('history: symbol and limit are forwarded', () =>
  withStack(reply(200, HISTORY), async ({ flask, app }) => {
    const r = await fetch(`${app.url}/api/volatility/history?symbol=FPT&limit=2`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), HISTORY);
    assert.equal(flask.calls[0], '/api/volatility/history?symbol=FPT&limit=2');
  }));

test('200 empty response keeps reason and meta', () =>
  withStack(reply(200, EMPTY), async ({ app }) => {
    const r = await fetch(`${app.url}/api/volatility/latest?symbol=HPG`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.reason, 'NO_E10_PREDICTION');
    assert.equal(j.count, 0);
    assert.equal(j.meta.research_status, 'dev_pass_unconfirmed');
  }));

test('400 from Flask is preserved (status and body)', () =>
  withStack(reply(400, BAD400), async ({ app }) => {
    const r = await fetch(`${app.url}/api/volatility/history?symbol=FPT&limit=0`);
    assert.equal(r.status, 400);
    assert.equal(await r.text(), BAD400);
  }));

test('503 database_unavailable from Flask is preserved', () =>
  withStack(reply(503, '{"error":"database_unavailable"}\n'), async ({ app }) => {
    const r = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`);
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { error: 'database_unavailable' });
  }));

test('unknown query parameters are dropped; repeated limit uses the first value', () =>
  withStack(reply(200, HISTORY), async ({ flask, app }) => {
    await fetch(`${app.url}/api/volatility/history?symbol=FPT&limit=1&limit=2&admin=1&x[a]=b`);
    assert.equal(flask.calls[0], '/api/volatility/history?symbol=FPT&limit=1');
  }));

test('odd limit values reach Flask URL-encoded so Flask can reject them', () =>
  withStack(reply(400, BAD400), async ({ flask, app }) => {
    await fetch(`${app.url}/api/volatility/history?symbol=FPT&limit=%2B5`); // "+5" literal plus
    await fetch(`${app.url}/api/volatility/history?symbol=FPT&limit=1_0`);
    assert.equal(new URL(flask.calls[0], 'http://x').searchParams.get('limit'), '+5');
    assert.equal(new URL(flask.calls[1], 'http://x').searchParams.get('limit'), '1_0');
  }));

test('Flask headers (CORS, Server, Connection) are not copied', () =>
  withStack(reply(200, LATEST), async ({ app }) => {
    const r = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    assert.equal(r.headers.get('server'), null);
  }));

test('Flask down: 502 upstream_unavailable without leaking host, port or error text', async () => {
  const flask = await fakeFlask(reply(200, LATEST));
  const baseUrl = flask.baseUrl;
  await flask.close(); // port is now closed
  const app = await appFor(baseUrl);
  try {
    const r = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`);
    assert.equal(r.status, 502);
    const text = await r.text();
    assert.deepEqual(JSON.parse(text), { error: 'upstream_unavailable' });
    assert.doesNotMatch(text, /ECONNREFUSED|127\.0\.0\.1|fetch failed|localhost/i);
  } finally { await app.close(); }
});

test('Flask too slow: 504 upstream_timeout', () =>
  withStack((req, res) => { setTimeout(() => { try { res.end('{}'); } catch (e) { /* closed */ } }, 3000); }, async ({ app }) => {
    const r = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`);
    assert.equal(r.status, 504);
    assert.deepEqual(await r.json(), { error: 'upstream_timeout' });
  }));

test('unexpected upstream responses become a generic 502 (no HTML or stack traces leak)', async () => {
  const cases = [
    [500, '<html>Traceback (most recent call last) secret</html>', { 'Content-Type': 'text/html' }],
    [404, '<html>Not Found</html>', { 'Content-Type': 'text/html' }],
    [200, 'not json', { 'Content-Type': 'text/plain' }],
    [500, '{"error":"boom"}', { 'Content-Type': 'application/json' }],
  ];
  for (const [status, body, headers] of cases) {
    await withStack(reply(status, body, headers), async ({ app }) => {
      const r = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`);
      assert.equal(r.status, 502);
      const text = await r.text();
      assert.deepEqual(JSON.parse(text), { error: 'upstream_unavailable' });
      assert.doesNotMatch(text, /Traceback|secret|boom|html/i);
    });
  }
});

test('combined route is forwarded with the same rules (symbol only)', () =>
  withStack(reply(200, '{"aligned":true}'), async ({ flask, app }) => {
    const r = await fetch(`${app.url}/api/risk-return/latest?symbol=FPT&limit=9`);
    assert.equal(r.status, 200);
    assert.equal(flask.calls[0], '/api/risk-return/latest?symbol=FPT');
  }));

test('only GET is forwarded; other methods and unrelated paths are untouched', () =>
  withStack(reply(200, LATEST), async ({ flask, app }) => {
    const post = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`, { method: 'POST' });
    assert.equal(post.status, 404);
    const stocks = await fetch(`${app.url}/api/stocks`);
    assert.deepEqual(await stocks.json(), { stocks: [{ symbol: 'FPT' }] }); // existing route not shadowed
    assert.equal(flask.calls.length, 0);
  }));

// ── Authentication (auth session): the session cookie is relayed; Flask's 401/403/429 pass through unchanged ──
test('auth: the session cookie is forwarded to Flask, and only the cookie (no Authorization or other headers)', async () => {
  let seenHeaders;
  await withStack((req, res) => { seenHeaders = req.headers; res.writeHead(200, FLASK_HEADERS); res.end(LATEST); }, async ({ app }) => {
    const r = await fetch(`${app.url}/api/volatility/latest?symbol=FPT`, {
      headers: { Cookie: 'access_token_cookie=sess', Authorization: 'Bearer nope', 'X-Evil': '1' },
    });
    assert.equal(r.status, 200);
    assert.equal(seenHeaders.cookie, 'access_token_cookie=sess');
    assert.equal(seenHeaders.authorization, undefined);
    assert.equal(seenHeaders['x-evil'], undefined);
  });
});

test('auth: without a cookie no Cookie header is sent upstream', async () => {
  let seenHeaders;
  await withStack((req, res) => { seenHeaders = req.headers; res.writeHead(200, FLASK_HEADERS); res.end(LATEST); }, async ({ app }) => {
    await fetch(`${app.url}/api/risk-return/latest?symbol=FPT`);
    assert.equal(seenHeaders.cookie, undefined);
  });
});

test('auth: 401, 403 and 429 from Flask are forwarded with status and bytes intact (not turned into 502)', async () => {
  const cases = [
    [401, '{"data":null,"error":"Cần đăng nhập"}', {}],
    [403, '{"data":null,"error":"Bạn không có quyền admin"}', {}],
    [429, '{"data":null,"error":"Quá nhiều lần thử. Vui lòng thử lại sau."}', { 'Retry-After': '120' }],
  ];
  for (const [status, body, extra] of cases) {
    await withStack(reply(status, body, { ...FLASK_HEADERS, ...extra }), async ({ app }) => {
      for (const path of ['/api/volatility/latest?symbol=FPT', '/api/risk-return/latest?symbol=FPT']) {
        const r = await fetch(`${app.url}${path}`);
        assert.equal(r.status, status);
        assert.equal(await r.text(), body);
        assert.equal(r.headers.get('retry-after'), extra['Retry-After'] ?? null);
        assert.equal(r.headers.get('set-cookie'), null);
      }
    });
  }
});

test('model-performance (any signed-in user) is forwarded with ky_hieu and tap_du_lieu only, cookie included', async () => {
  let seenHeaders;
  await withStack((req, res) => { seenHeaders = req.headers; res.writeHead(200, FLASK_HEADERS); res.end('{"data":{"rows":[]},"error":null}'); },
    async ({ flask, app }) => {
      const r = await fetch(`${app.url}/api/model-performance?ky_hieu=FPT&tap_du_lieu=TEST&evil=1`, { headers: { Cookie: 'c=1' } });
      assert.equal(r.status, 200);
      assert.equal(flask.calls[0], '/api/model-performance?ky_hieu=FPT&tap_du_lieu=TEST');
      assert.equal(seenHeaders.cookie, 'c=1');
    });
});

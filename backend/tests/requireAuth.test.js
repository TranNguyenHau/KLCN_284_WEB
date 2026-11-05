'use strict';
// requireAuth / CSRF tests: fake Flask /api/auth/me, no database, no .env. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createAuthCache, createRequireAuth, requestContext, requireCsrfHeader } from '../middleware/requireAuth.js';
import { errorHandler } from '../middleware/errorHandler.js';

const silent = { error() {} };
const JSON_TYPE = { 'Content-Type': 'application/json' };

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
const closer = (server) => () => { server.closeAllConnections(); return new Promise((r) => server.close(r)); };

async function fakeFlask(handler) {
  const seen = [];
  const server = http.createServer((req, res) => { seen.push({ url: req.url, headers: req.headers }); handler(req, res, seen.length); });
  const baseUrl = await listen(server);
  return { seen, baseUrl, close: closer(server) };
}
const ME_OK = '{"data":{"ma_nguoi_dung":7,"vai_tro":"user"},"error":null}';
const okMe = (req, res) => { res.writeHead(200, JSON_TYPE); res.end(ME_OK); };

async function stack(flaskHandler, { cacheOptions, authOptions } = {}) {
  const flask = await fakeFlask(flaskHandler);
  const clock = { t: 0 };
  const cache = createAuthCache({ ttlMs: 3000, now: () => clock.t, ...cacheOptions });
  const app = express();
  app.use(express.json());
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', createRequireAuth({ baseUrl: flask.baseUrl, cache, logger: silent, timeoutMs: 400, ...authOptions }));
  app.use('/api', requireCsrfHeader({ value: 'StockTrain' }));
  app.get('/api/data', (req, res) => res.json({ user: req.user, cookie: requestContext.getStore()?.cookie ?? null }));
  app.post('/api/watchlist', (req, res) => res.json({ written: true }));
  app.use(errorHandler);
  const server = http.createServer(app);
  const url = await listen(server);
  return { flask, cache, clock, url, close: async () => { await closer(server)(); await flask.close(); } };
}
const withCookie = { Cookie: 'access_token_cookie=sess' };

test('no cookie: 401 UNAUTHENTICATED and Flask is never asked', async () => {
  const s = await stack(okMe);
  try {
    const r = await fetch(`${s.url}/api/data`);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error.code, 'UNAUTHENTICATED');
    assert.equal(s.flask.seen.length, 0);
  } finally { await s.close(); }
});

test('valid session: request continues, req.user is set and the cookie is available downstream', async () => {
  const s = await stack(okMe);
  try {
    const r = await fetch(`${s.url}/api/data`, { headers: withCookie });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.user.ma_nguoi_dung, 7);
    assert.equal(body.cookie, 'access_token_cookie=sess');
    assert.equal(s.flask.seen[0].url, '/api/auth/me');
    assert.equal(s.flask.seen[0].headers.cookie, 'access_token_cookie=sess');
  } finally { await s.close(); }
});

test('cache: second call inside the TTL is served locally, a call after the TTL asks Flask again', async () => {
  const s = await stack(okMe);
  try {
    await fetch(`${s.url}/api/data`, { headers: withCookie });
    s.clock.t = 2999;
    await fetch(`${s.url}/api/data`, { headers: withCookie });
    assert.equal(s.flask.seen.length, 1);
    s.clock.t = 3000;
    await fetch(`${s.url}/api/data`, { headers: withCookie });
    assert.equal(s.flask.seen.length, 2);
  } finally { await s.close(); }
});

test('cache TTL can never be stretched beyond 5000 ms, and ttl 0 disables caching', async () => {
  assert.equal(createAuthCache({ ttlMs: 60000 }).ttl, 5000);
  const s = await stack(okMe, { cacheOptions: { ttlMs: 0 } });
  try {
    await fetch(`${s.url}/api/data`, { headers: withCookie });
    await fetch(`${s.url}/api/data`, { headers: withCookie });
    assert.equal(s.flask.seen.length, 2);
  } finally { await s.close(); }
});

test('expired/disabled session (Flask 401) is passed through, never cached, and recovers when Flask says OK', async () => {
  let mode = 401;
  const s = await stack((req, res) => {
    res.writeHead(mode, JSON_TYPE);
    res.end(mode === 200 ? ME_OK : '{"data":null,"error":"Cần đăng nhập"}');
  });
  try {
    const r1 = await fetch(`${s.url}/api/data`, { headers: withCookie });
    assert.equal(r1.status, 401);
    assert.equal(await r1.text(), '{"data":null,"error":"Cần đăng nhập"}');
    mode = 200;
    assert.equal((await fetch(`${s.url}/api/data`, { headers: withCookie })).status, 200);
    mode = 401; // account disabled after being cached: still honoured once the TTL passes
    s.clock.t = 10_000;
    assert.equal((await fetch(`${s.url}/api/data`, { headers: withCookie })).status, 401);
  } finally { await s.close(); }
});

test('403 and 429 (with Retry-After) from Flask pass through unchanged', async () => {
  for (const [status, extra] of [[403, {}], [429, { 'Retry-After': '42' }]]) {
    const s = await stack((req, res) => { res.writeHead(status, { ...JSON_TYPE, ...extra }); res.end('{"data":null,"error":"x"}'); });
    try {
      const r = await fetch(`${s.url}/api/data`, { headers: withCookie });
      assert.equal(r.status, status);
      assert.equal(r.headers.get('retry-after'), extra['Retry-After'] ?? null);
    } finally { await s.close(); }
  }
});

test('Flask unavailable / slow / broken: generic 502 or 504, no leak', async () => {
  const cases = [[500, 502], [200, 502]];
  for (const [status, expected] of cases) {
    const s = await stack((req, res) => { res.writeHead(status, JSON_TYPE); res.end(status === 200 ? 'garbage' : '{"error":"boom"}'); });
    try {
      const r = await fetch(`${s.url}/api/data`, { headers: withCookie });
      assert.equal(r.status, expected);
      assert.doesNotMatch(await r.text(), /boom|garbage|127\.0\.0\.1/);
    } finally { await s.close(); }
  }
  const slow = await stack((req, res) => { setTimeout(() => { try { res.end('{}'); } catch { /* closed */ } }, 3000); });
  try {
    assert.equal((await fetch(`${slow.url}/api/data`, { headers: withCookie })).status, 504);
  } finally { await slow.close(); }
});

test('public path /health needs no session; OPTIONS is never blocked', async () => {
  const s = await stack(okMe);
  try {
    assert.equal((await fetch(`${s.url}/api/health`)).status, 200);
    const pre = await fetch(`${s.url}/api/data`, { method: 'OPTIONS' });
    assert.notEqual(pre.status, 401);
    assert.equal(s.flask.seen.length, 0);
  } finally { await s.close(); }
});

test('simulated write routes: 401 without session, 403 without the CSRF header, 200 with both', async () => {
  const s = await stack(okMe);
  try {
    assert.equal((await fetch(`${s.url}/api/watchlist`, { method: 'POST' })).status, 401);
    const noHeader = await fetch(`${s.url}/api/watchlist`, { method: 'POST', headers: withCookie });
    assert.equal(noHeader.status, 403);
    assert.equal((await noHeader.json()).error.code, 'CSRF_HEADER_REQUIRED');
    const wrong = await fetch(`${s.url}/api/watchlist`, { method: 'POST', headers: { ...withCookie, 'X-Requested-With': 'other' } });
    assert.equal(wrong.status, 403);
    const ok = await fetch(`${s.url}/api/watchlist`, { method: 'POST', headers: { ...withCookie, 'X-Requested-With': 'StockTrain' } });
    assert.equal(ok.status, 200);
    assert.equal((await fetch(`${s.url}/api/data`, { headers: withCookie })).status, 200); // GET needs no header
  } finally { await s.close(); }
});

test('cache.invalidate(cookie) forces the next request to ask Flask (logout)', async () => {
  const s = await stack(okMe);
  try {
    await fetch(`${s.url}/api/data`, { headers: withCookie });
    s.cache.invalidate('access_token_cookie=sess');
    await fetch(`${s.url}/api/data`, { headers: withCookie });
    assert.equal(s.flask.seen.length, 2);
  } finally { await s.close(); }
});

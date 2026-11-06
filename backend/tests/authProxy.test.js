'use strict';
// Auth proxy tests: fake Flask upstream, no database, no real Flask, no .env. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { ADMIN_ROUTES, createAuthProxy } from '../routes/authProxy.js';
import { createAuthCache, createRequireAuth, requireCsrfHeader } from '../middleware/requireAuth.js';
import { errorHandler } from '../middleware/errorHandler.js';

const silent = { error() {} };
const JSON_TYPE = { 'Content-Type': 'application/json' };

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
const closer = (server) => () => { server.closeAllConnections(); return new Promise((r) => server.close(r)); };

async function fakeFlask(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      handler(req, res);
    });
  });
  const baseUrl = await listen(server);
  return { seen, baseUrl, close: closer(server) };
}

async function stack(handler, extra = {}) {
  const flask = await fakeFlask(handler);
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use('/api', createAuthProxy({ baseUrl: flask.baseUrl, timeoutMs: 400, logger: silent, ...extra }));
  app.use(errorHandler);
  const server = http.createServer(app);
  const url = await listen(server);
  return { flask, url, close: async () => { await closer(server)(); await flask.close(); } };
}
const reply = (status, body, headers = JSON_TYPE) => (req, res) => { res.writeHead(status, headers); res.end(body); };
const post = (url, body, headers = {}) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('login: body, cookie, CSRF header and client IP reach Flask; Set-Cookie and body come back intact', async () => {
  const cookies = ['access_token_cookie=abc; HttpOnly; Path=/; SameSite=Lax', 'extra=1; Path=/'];
  const body = '{"data":{"ten_dang_nhap":"alice"},"error":null}';
  const s = await stack((req, res) => { res.writeHead(200, { ...JSON_TYPE, 'Set-Cookie': cookies }); res.end(body); });
  try {
    const r = await post(`${s.url}/api/auth/login`, { ten_dang_nhap: 'alice', password: 'pw-123456' },
      { 'X-Requested-With': 'StockTrain', Cookie: 'old=1', Authorization: 'Bearer should-not-pass', 'X-Evil': 'x' });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), body);
    assert.deepEqual(r.headers.getSetCookie(), cookies);
    const seen = s.flask.seen[0];
    assert.equal(seen.method, 'POST');
    assert.equal(seen.url, '/api/auth/login');
    assert.deepEqual(JSON.parse(seen.body), { ten_dang_nhap: 'alice', password: 'pw-123456' });
    assert.equal(seen.headers['x-requested-with'], 'StockTrain');
    assert.equal(seen.headers.cookie, 'old=1');
    assert.match(seen.headers['x-forwarded-for'], /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
    assert.equal(seen.headers.authorization, undefined); // only the allowlisted headers are relayed
    assert.equal(seen.headers['x-evil'], undefined);
  } finally { await s.close(); }
});

test('401, 403, 409 and 429 pass through unchanged (status, body, Retry-After)', async () => {
  const cases = [
    [401, '{"data":null,"error":"Sai tên đăng nhập hoặc mật khẩu"}', {}],
    [403, '{"data":null,"error":"Thiếu hoặc sai header chống CSRF"}', {}],
    [409, '{"data":null,"error":"Không thể tạo tài khoản với thông tin này"}', {}],
    [429, '{"data":null,"error":"Quá nhiều lần thử. Vui lòng thử lại sau."}', { 'Retry-After': '321' }],
  ];
  for (const [status, body, extra] of cases) {
    const s = await stack(reply(status, body, { ...JSON_TYPE, ...extra }));
    try {
      const r = await post(`${s.url}/api/auth/login`, {});
      assert.equal(r.status, status);
      assert.equal(await r.text(), body);
      assert.equal(r.headers.get('retry-after'), extra['Retry-After'] ?? null);
    } finally { await s.close(); }
  }
});

test('only the allowlisted method + path pairs are relayed; everything else is 404 without calling Flask', async () => {
  const s = await stack(reply(200, '{}'));
  try {
    const bad = [
      ['GET', '/api/auth/login'], ['DELETE', '/api/auth/users/1'], ['PATCH', '/api/auth/users/abc'],
      ['POST', '/api/auth/unknown'], ['POST', '/api/auth/users/1'], ['GET', '/api/auth/../health'],
    ];
    for (const [method, path] of bad) {
      const r = await fetch(`${s.url}${path}`, { method, headers: JSON_TYPE, body: method === 'GET' ? undefined : '{}' });
      assert.equal(r.status, 404, `${method} ${path}`);
    }
    assert.equal(s.flask.seen.length, 0);
  } finally { await s.close(); }
});

test('GET /me is relayed with the right upstream path, and the old /auth/users routes are gone', async () => {
  const s = await stack(reply(200, '{"data":[],"error":null}'));
  try {
    await fetch(`${s.url}/api/auth/me`, { headers: { Cookie: 'c=1' } });
    const gone = await fetch(`${s.url}/api/auth/users`, { headers: { Cookie: 'c=1' } });
    assert.equal(gone.status, 404);
    assert.deepEqual(s.flask.seen.map((x) => `${x.method} ${x.url}`), ['GET /api/auth/me']);
    assert.equal(s.flask.seen[0].body, '');
  } finally { await s.close(); }
});

// ---- /admin/* (user management and model performance) ----
const adminStack = (handler, extra = {}) => stack(handler, { routes: ADMIN_ROUTES, prefix: '/admin', ...extra });

test('admin: list / create / edit / delete users are relayed with method, path, body, cookie and CSRF header', async () => {
  const s = await adminStack(reply(200, '{"data":[],"error":null}'));
  try {
    const h = { 'Content-Type': 'application/json', Cookie: 'c=1', 'X-Requested-With': 'StockTrain' };
    await fetch(`${s.url}/api/admin/users`, { headers: h });
    await fetch(`${s.url}/api/admin/users`, { method: 'POST', headers: h, body: '{"ten_dang_nhap":"a"}' });
    await fetch(`${s.url}/api/admin/users/12`, { method: 'PATCH', headers: h, body: '{"ho_ten":"X"}' });
    await fetch(`${s.url}/api/admin/users/12`, { method: 'DELETE', headers: h });
    assert.deepEqual(s.flask.seen.map((x) => `${x.method} ${x.url}`),
      ['GET /api/admin/users', 'POST /api/admin/users', 'PATCH /api/admin/users/12', 'DELETE /api/admin/users/12']);
    assert.deepEqual(JSON.parse(s.flask.seen[2].body), { ho_ten: 'X' });
    for (const call of s.flask.seen) {
      assert.equal(call.headers.cookie, 'c=1');
      assert.equal(call.headers['x-requested-with'], 'StockTrain');
    }
  } finally { await s.close(); }
});

test('admin: model performance relays only ky_hieu and tap_du_lieu from the query string', async () => {
  const s = await adminStack(reply(200, '{"data":{"rows":[]},"error":null}'));
  try {
    await fetch(`${s.url}/api/admin/models/performance?ky_hieu=FPT&tap_du_lieu=TEST&evil=1&ky_hieu=HPG`);
    const url = new URL(s.flask.seen[0].url, 'http://x');
    assert.equal(url.pathname, '/api/admin/models/performance');
    assert.equal(url.searchParams.get('ky_hieu'), 'FPT'); // first value, like Flask
    assert.equal(url.searchParams.get('tap_du_lieu'), 'TEST');
    assert.equal(url.searchParams.has('evil'), false);
  } finally { await s.close(); }
});

test('admin: methods and paths outside the allowlist are 404 and never reach Flask', async () => {
  const s = await adminStack(reply(200, '{}'));
  try {
    const bad = [['PUT', '/api/admin/users/1'], ['GET', '/api/admin/users/1'], ['DELETE', '/api/admin/users'],
      ['PATCH', '/api/admin/users/abc'], ['DELETE', '/api/admin/users/1/extra'], ['POST', '/api/admin/models/performance'],
      ['GET', '/api/admin/other'], ['GET', '/api/admin']];
    for (const [method, path] of bad) {
      const r = await fetch(`${s.url}${path}`, { method, headers: JSON_TYPE, body: ['GET', 'DELETE'].includes(method) ? undefined : '{}' });
      assert.equal(r.status, 404, `${method} ${path}`);
    }
    assert.equal(s.flask.seen.length, 0);
  } finally { await s.close(); }
});

test('admin: Flask 401, 403 and 409 (with its reason code) pass through unchanged', async () => {
  const cases = [[401, '{"data":null,"error":"Cần đăng nhập"}'], [403, '{"data":null,"error":"Bạn không có quyền admin"}'],
    [409, '{"data":null,"error":"x","reason":"LAST_ADMIN"}']];
  for (const [status, body] of cases) {
    const s = await adminStack(reply(status, body));
    try {
      const r = await fetch(`${s.url}/api/admin/users/3`, { method: 'DELETE', headers: JSON_TYPE });
      assert.equal(r.status, status);
      assert.equal(await r.text(), body);
    } finally { await s.close(); }
  }
});

test('admin routes sit behind requireAuth + CSRF: an anonymous or header-less call never reaches the admin proxy', async () => {
  const flask = await fakeFlask((req, res) => {
    res.writeHead(200, JSON_TYPE);
    res.end(req.url === '/api/auth/me' ? '{"data":{"ma_nguoi_dung":1},"error":null}' : '{"data":[],"error":null}');
  });
  const app = express();
  app.use(express.json());
  const cache = createAuthCache({ ttlMs: 0 });
  app.use('/api', createRequireAuth({ baseUrl: flask.baseUrl, cache, logger: silent }));
  app.use('/api', requireCsrfHeader({ value: 'StockTrain' }));
  app.use('/api', createAuthProxy({ baseUrl: flask.baseUrl, cache, logger: silent, routes: ADMIN_ROUTES, prefix: '/admin' }));
  app.use(errorHandler);
  const server = http.createServer(app);
  const url = await listen(server);
  try {
    const anon = await fetch(`${url}/api/admin/users`);
    assert.equal(anon.status, 401);
    const noHeader = await fetch(`${url}/api/admin/users/3`, { method: 'DELETE', headers: { Cookie: 'c=1' } });
    assert.equal(noHeader.status, 403);
    assert.equal(flask.seen.filter((x) => x.url.startsWith('/api/admin')).length, 0);
    const ok = await fetch(`${url}/api/admin/users/3`, { method: 'DELETE', headers: { Cookie: 'c=1', 'X-Requested-With': 'StockTrain' } });
    assert.equal(ok.status, 200);
    assert.equal(flask.seen.filter((x) => x.url.startsWith('/api/admin')).length, 1);
  } finally { await closer(server)(); await flask.close(); }
});

test('Flask 5xx / non-JSON / redirect become a generic 502 that leaks nothing', async () => {
  const cases = [
    [500, '<html>Traceback secret</html>', { 'Content-Type': 'text/html' }],
    [200, 'not json', { 'Content-Type': 'text/plain' }],
    [302, '{}', { ...JSON_TYPE, Location: 'http://evil.example/' }],
    [503, '{"error":"boom"}', JSON_TYPE],
  ];
  for (const [status, body, headers] of cases) {
    const s = await stack(reply(status, body, headers));
    try {
      const r = await post(`${s.url}/api/auth/login`, {});
      assert.equal(r.status, 502);
      const text = await r.text();
      assert.equal(JSON.parse(text).error.code, 'AUTH_UPSTREAM_UNAVAILABLE');
      assert.doesNotMatch(text, /Traceback|secret|boom|evil/i);
    } finally { await s.close(); }
  }
});

test('Flask down: 502 without leaking host or port; Flask too slow: 504', async () => {
  const dead = await fakeFlask(reply(200, '{}'));
  const deadUrl = dead.baseUrl;
  await dead.close();
  const app = express();
  app.use(express.json());
  app.use('/api', createAuthProxy({ baseUrl: deadUrl, timeoutMs: 400, logger: silent }));
  app.use(errorHandler);
  const server = http.createServer(app);
  const url = await listen(server);
  try {
    const r = await post(`${url}/api/auth/login`, {});
    assert.equal(r.status, 502);
    assert.doesNotMatch(await r.text(), /ECONNREFUSED|127\.0\.0\.1|fetch failed/i);
  } finally { await closer(server)(); }

  const slow = await stack((req, res) => { setTimeout(() => { try { res.end('{}'); } catch { /* closed */ } }, 3000); });
  try {
    const r = await post(`${slow.url}/api/auth/login`, {});
    assert.equal(r.status, 504);
  } finally { await slow.close(); }
});

test('session cache is invalidated on logout / change-password', async () => {
  const calls = [];
  const cache = { invalidate: (c) => calls.push(['invalidate', c]), clear: () => calls.push(['clear']) };
  const s = await stack(reply(200, '{"data":"ok","error":null}'), { cache });
  try {
    await post(`${s.url}/api/auth/logout`, {}, { Cookie: 'sess=1' });
    await post(`${s.url}/api/auth/change-password`, {}, { Cookie: 'sess=2' });
    await fetch(`${s.url}/api/auth/me`, { headers: { Cookie: 'sess=1' } });
    assert.deepEqual(calls, [['invalidate', 'sess=1'], ['invalidate', 'sess=2']]);
  } finally { await s.close(); }
});

test('session cache is cleared by every admin user write (create, edit, delete) and not by reads', async () => {
  const calls = [];
  const cache = { invalidate: () => calls.push('invalidate'), clear: () => calls.push('clear') };
  const s = await adminStack(reply(200, '{"data":"ok","error":null}'), { cache });
  try {
    await fetch(`${s.url}/api/admin/users`, { headers: JSON_TYPE });
    await fetch(`${s.url}/api/admin/users`, { method: 'POST', headers: JSON_TYPE, body: '{}' });
    await fetch(`${s.url}/api/admin/users/3`, { method: 'PATCH', headers: JSON_TYPE, body: '{}' });
    await fetch(`${s.url}/api/admin/users/3`, { method: 'DELETE', headers: JSON_TYPE });
    await fetch(`${s.url}/api/admin/models/performance`, { headers: JSON_TYPE });
    assert.deepEqual(calls, ['clear', 'clear', 'clear']);
  } finally { await s.close(); }
});

test('a failed write does not touch the cache', async () => {
  const calls = [];
  const cache = { invalidate: () => calls.push('i'), clear: () => calls.push('c') };
  const s = await stack(reply(403, '{"data":null,"error":"x"}'), { cache });
  try {
    await post(`${s.url}/api/auth/logout`, {}, { Cookie: 'sess=1' });
    assert.deepEqual(calls, []);
  } finally { await s.close(); }
});

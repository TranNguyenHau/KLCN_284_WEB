'use strict';
// Auth proxy tests: fake Flask upstream, no database, no real Flask, no .env. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createAuthProxy } from '../routes/authProxy.js';
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

test('admin routes and GET /me are relayed with the right upstream path', async () => {
  const s = await stack(reply(200, '{"data":[],"error":null}'));
  try {
    await fetch(`${s.url}/api/auth/me`, { headers: { Cookie: 'c=1' } });
    await fetch(`${s.url}/api/auth/users`, { headers: { Cookie: 'c=1' } });
    await fetch(`${s.url}/api/auth/users/12`, { method: 'PATCH', headers: JSON_TYPE, body: '{"dang_hoat_dong":false}' });
    assert.deepEqual(s.flask.seen.map((x) => `${x.method} ${x.url}`),
      ['GET /api/auth/me', 'GET /api/auth/users', 'PATCH /api/auth/users/12']);
    assert.equal(s.flask.seen[0].body, '');
  } finally { await s.close(); }
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

test('session cache is invalidated on logout / change-password and cleared on user management writes', async () => {
  const calls = [];
  const cache = { invalidate: (c) => calls.push(['invalidate', c]), clear: () => calls.push(['clear']) };
  const s = await stack(reply(200, '{"data":"ok","error":null}'), { cache });
  try {
    await post(`${s.url}/api/auth/logout`, {}, { Cookie: 'sess=1' });
    await post(`${s.url}/api/auth/change-password`, {}, { Cookie: 'sess=2' });
    await fetch(`${s.url}/api/auth/users/3`, { method: 'PATCH', headers: JSON_TYPE, body: '{}' });
    await fetch(`${s.url}/api/auth/me`, { headers: { Cookie: 'sess=1' } });
    assert.deepEqual(calls, [['invalidate', 'sess=1'], ['invalidate', 'sess=2'], ['clear']]);
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

'use strict';
// Proves that concurrent requests from different users never mix session cookies through
// AsyncLocalStorage, using the REAL requireAuth middleware and the REAL e02Get client.
// Fake Flask only; backend/.env is NOT read (DOTENV_CONFIG_PATH points at a missing file).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
const closer = (server) => () => { server.closeAllConnections(); return new Promise((r) => server.close(r)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USERS = { 'access_token_cookie=alice': 1, 'access_token_cookie=bob': 2 };

test('concurrent requests of two users keep their own cookie end to end (no cross-talk)', async () => {
  const upstreamLog = [];
  const flask = http.createServer((req, res) => {
    const cookie = req.headers.cookie ?? null;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/auth/me') {
      const id = USERS[cookie];
      if (!id) { res.statusCode = 401; return res.end('{"data":null,"error":"Cần đăng nhập"}'); }
      return res.end(JSON.stringify({ data: { ma_nguoi_dung: id }, error: null }));
    }
    if (req.url.startsWith('/api/stocks')) {
      upstreamLog.push(cookie);
      // Alice is slow and Bob is fast, so the calls interleave.
      return setTimeout(() => res.end(JSON.stringify({ stocks: [], sawCookie: cookie })), cookie?.includes('alice') ? 40 : 5);
    }
    res.statusCode = 404; return res.end('{}');
  });
  const flaskUrl = await listen(flask);

  process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env.test-isolation'; // never read the real .env
  process.env.STOCKTRAIN_API_URL = `${flaskUrl}/api`;
  const { e02Get } = await import('../services/stocktrainClient.js');
  const { createAuthCache, createRequireAuth } = await import('../middleware/requireAuth.js');

  const app = express();
  app.use('/api', createRequireAuth({ baseUrl: flaskUrl, cache: createAuthCache({ ttlMs: 3000 }), logger: { error() {} } }));
  app.get('/api/probe', async (req, res, next) => {
    try {
      await sleep(req.user.ma_nguoi_dung === 1 ? 25 : 1); // different delays before AND after the upstream call
      const body = await e02Get('/stocks');
      await sleep(req.user.ma_nguoi_dung === 1 ? 1 : 25);
      res.json({ user: req.user.ma_nguoi_dung, upstreamSawCookie: body.sawCookie });
    } catch (e) { next(e); }
  });
  const server = http.createServer(app);
  const url = await listen(server);

  try {
    const who = (i) => (i % 2 === 0 ? 'access_token_cookie=alice' : 'access_token_cookie=bob');
    const results = await Promise.all(Array.from({ length: 40 }, async (_, i) => {
      const cookie = who(i);
      const r = await fetch(`${url}/api/probe`, { headers: { Cookie: cookie } });
      return { cookie, status: r.status, body: await r.json() };
    }));
    assert.equal(results.length, 40);
    for (const { cookie, status, body } of results) {
      assert.equal(status, 200);
      assert.equal(body.user, USERS[cookie], 'req.user belongs to the caller');
      assert.equal(body.upstreamSawCookie, cookie, 'Flask received the caller\'s own cookie, never the other user\'s');
    }
    assert.equal(upstreamLog.filter((c) => c === 'access_token_cookie=alice').length, 20);
    assert.equal(upstreamLog.filter((c) => c === 'access_token_cookie=bob').length, 20);

    // Outside any request there is no context: nothing is attached (no cookie leaks to background calls).
    upstreamLog.length = 0;
    const idle = await e02Get('/stocks');
    assert.equal(idle.sawCookie, null);
    assert.deepEqual(upstreamLog, [null]);
  } finally { await closer(server)(); await closer(flask)(); }
});

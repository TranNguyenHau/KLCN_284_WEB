import express from 'express';
import { AppError } from '../utils/errors.js';

/**
 * Forward-only proxy for Flask's /api/auth/* and /api/admin/*. Express decides nothing here: it relays the
 * request (JSON body, Cookie, the CSRF header, client IP) and returns Flask's answer unchanged, including
 * Set-Cookie and Retry-After. Only a fixed allowlist of method + path pairs is relayed (optionally with a
 * fixed list of query parameters). Flask alone decides who may call what (401 / 403).
 *
 * /auth/* is mounted BEFORE requireAuth (login and register need no session). /admin/* is mounted AFTER
 * requireAuth and the CSRF check, so an anonymous call never reaches it; Flask still checks the admin role.
 */
// entry: [METHOD, path regex, optional list of query parameters to relay]
export const AUTH_ROUTES = Object.freeze([
  ['POST', /^\/auth\/login$/],
  ['POST', /^\/auth\/register$/],
  ['POST', /^\/auth\/logout$/],
  ['POST', /^\/auth\/change-password$/],
  ['GET', /^\/auth\/me$/],
]);

export const ADMIN_ROUTES = Object.freeze([
  ['GET', /^\/admin\/users$/],
  ['POST', /^\/admin\/users$/],
  ['PATCH', /^\/admin\/users\/\d{1,9}$/],
  ['DELETE', /^\/admin\/users\/\d{1,9}$/],
  ['GET', /^\/admin\/models\/performance$/, ['ky_hieu', 'tap_du_lieu']],
]);

// 5xx, redirects and anything unexpected from Flask become a generic 502 (nothing leaks).
const PASS_STATUS = new Set([200, 201, 400, 401, 403, 404, 409, 429]);
const MAX_BODY_BYTES = 1024 * 1024;

export function createAuthProxy(options = {}) {
  const baseUrl = options.baseUrl;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
  const cache = options.cache; // optional: { invalidate(cookie), clear() }
  const routes = options.routes || AUTH_ROUTES;
  const prefix = options.prefix || '/auth';
  const logger = options.logger || console;
  if (!baseUrl) throw new Error('authProxy needs the Flask origin (baseUrl)');
  new URL(baseUrl);

  const router = express.Router();
  router.use(async (req, res, next) => {
    if (!req.path.startsWith(`${prefix}/`) && req.path !== prefix) return next();
    const route = routes.find(([method, re]) => method === req.method && re.test(req.path));
    if (!route) return next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));

    const headers = { Accept: 'application/json' };
    if (req.headers.cookie) headers.Cookie = req.headers.cookie;
    const csrf = req.get('x-requested-with');
    if (csrf) headers['X-Requested-With'] = csrf;
    if (req.ip) headers['X-Forwarded-For'] = req.ip; // Flask trusts this only from this proxy
    let body;
    if (req.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {});
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = new URL(`/api${req.path}`, baseUrl); // path comes from the allowlist regex, never free text
      for (const name of route[2] || []) {
        const value = Array.isArray(req.query[name]) ? req.query[name][0] : req.query[name];
        if (typeof value === 'string') url.searchParams.set(name, value); // Flask validates the values
      }
      const upstream = await fetchImpl(url, {
        method: req.method, headers, body, signal: controller.signal, redirect: 'error',
      });
      const type = upstream.headers.get('content-type') || '';
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (!PASS_STATUS.has(upstream.status) || !type.includes('application/json') || bytes.length > MAX_BODY_BYTES) {
        logger.error('[auth-proxy] %s %s: unexpected upstream status=%s', req.method, req.path, upstream.status);
        return next(new AppError(502, 'AUTH_UPSTREAM_UNAVAILABLE', 'Dịch vụ xác thực tạm thời không khả dụng'));
      }
      if (upstream.status < 300 && cache) {
        if (req.path === '/auth/logout' || req.path === '/auth/change-password') cache.invalidate(req.headers.cookie);
        // a user's role/active flag may have changed (or the account was deleted): forget every cached session
        if (/^\/admin\/users/.test(req.path) && req.method !== 'GET') cache.clear();
      }
      const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
      if (setCookies.length) res.append('Set-Cookie', setCookies);
      const retry = upstream.headers.get('retry-after');
      if (retry) res.set('Retry-After', retry);
      return res.status(upstream.status).set('Content-Type', 'application/json; charset=utf-8')
        .set('Cache-Control', 'no-store').send(bytes);
    } catch (err) {
      const timedOut = Boolean(err) && err.name === 'AbortError';
      logger.error('[auth-proxy] %s %s: %s', req.method, req.path, timedOut ? 'timeout' : 'unavailable');
      return next(new AppError(timedOut ? 504 : 502, timedOut ? 'AUTH_UPSTREAM_TIMEOUT' : 'AUTH_UPSTREAM_UNAVAILABLE',
        'Dịch vụ xác thực tạm thời không khả dụng'));
    } finally {
      clearTimeout(timer);
    }
  });
  return router;
}

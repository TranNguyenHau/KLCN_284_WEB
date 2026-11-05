import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from '../utils/errors.js';

/**
 * Express does NOT decode JWTs or decide permissions. It asks Flask (GET /api/auth/me) whether the
 * cookie is a valid session, then lets the request continue. Flask stays the only authority.
 *
 * PUBLIC_PATHS is relative to the /api mount and is meant to be extended (e.g. a Zalo webhook that
 * authenticates with its own key). Keep it in sync with Flask's allowlist in app/security.py.
 */
export const PUBLIC_PATHS = Object.freeze(['/health']);

/** Holds the caller's cookie for the duration of a request so server-side calls to Flask can reuse it. */
export const requestContext = new AsyncLocalStorage();

const HARD_MAX_TTL_MS = 5000; // a cached "valid" answer can never outlive this

/**
 * Short in-memory cache of "this cookie is valid". Entries are keyed by a hash of the cookie (the
 * cookie itself is never stored or logged). Only 200 answers are cached. The TTL is capped at
 * HARD_MAX_TTL_MS, so token expiry or account deactivation takes effect within that window at most.
 */
export function createAuthCache({ ttlMs = 3000, maxEntries = 1000, now = Date.now } = {}) {
  const ttl = Math.min(Math.max(Number(ttlMs) || 0, 0), HARD_MAX_TTL_MS);
  const entries = new Map();
  const keyOf = (cookie) => crypto.createHash('sha256').update(String(cookie)).digest('hex');
  return {
    ttl,
    get(cookie) {
      if (ttl === 0) return undefined;
      const key = keyOf(cookie);
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.at >= ttl) {
        entries.delete(key);
        return undefined;
      }
      return hit.user;
    },
    set(cookie, user) {
      if (ttl === 0) return;
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(keyOf(cookie), { at: now(), user });
    },
    invalidate(cookie) {
      if (cookie) entries.delete(keyOf(cookie));
    },
    clear() {
      entries.clear();
    },
    size: () => entries.size,
  };
}

export function createRequireAuth(options = {}) {
  const baseUrl = options.baseUrl;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cache = options.cache || createAuthCache();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000;
  const publicPaths = new Set(options.publicPaths || PUBLIC_PATHS);
  const logger = options.logger || console;
  if (!baseUrl) throw new Error('requireAuth needs the Flask origin (baseUrl)');
  const meUrl = new URL('/api/auth/me', baseUrl);

  return async function requireAuth(req, res, next) {
    if (req.method === 'OPTIONS' || publicPaths.has(req.path)) return next();
    const cookie = req.headers.cookie;
    if (!cookie) return next(new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập'));

    let user = cache.get(cookie);
    if (user === undefined) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = { Accept: 'application/json', Cookie: cookie };
        if (req.ip) headers['X-Forwarded-For'] = req.ip;
        const upstream = await fetchImpl(meUrl, { method: 'GET', headers, signal: controller.signal, redirect: 'error' });
        const body = Buffer.from(await upstream.arrayBuffer());
        if (upstream.status === 401 || upstream.status === 403 || upstream.status === 429) {
          // Pass the verdict through unchanged (status, JSON body, Retry-After).
          const retry = upstream.headers.get('retry-after');
          if (retry) res.set('Retry-After', retry);
          return res.status(upstream.status).set('Content-Type', 'application/json; charset=utf-8').send(body);
        }
        if (upstream.status !== 200) {
          logger.error('[require-auth] unexpected upstream status=%s', upstream.status);
          return next(new AppError(502, 'AUTH_UPSTREAM_UNAVAILABLE', 'Không xác thực được phiên đăng nhập'));
        }
        try {
          user = JSON.parse(body.toString('utf8')).data ?? null;
        } catch {
          return next(new AppError(502, 'AUTH_UPSTREAM_UNAVAILABLE', 'Không xác thực được phiên đăng nhập'));
        }
        cache.set(cookie, user);
      } catch (err) {
        const timedOut = err && err.name === 'AbortError';
        logger.error('[require-auth] %s', timedOut ? 'timeout' : 'unavailable');
        return next(new AppError(timedOut ? 504 : 502, timedOut ? 'AUTH_UPSTREAM_TIMEOUT' : 'AUTH_UPSTREAM_UNAVAILABLE',
          'Không xác thực được phiên đăng nhập'));
      } finally {
        clearTimeout(timer);
      }
    }
    req.user = user;
    return requestContext.run({ cookie }, () => next());
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF defence for the write routes Express handles itself: a custom header a cross-site form cannot send. */
export function requireCsrfHeader({ value = 'StockTrain', header = 'x-requested-with' } = {}) {
  return function csrfGuard(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get(header) !== value) {
      return next(new AppError(403, 'CSRF_HEADER_REQUIRED', 'Thiếu hoặc sai header chống CSRF'));
    }
    return next();
  };
}

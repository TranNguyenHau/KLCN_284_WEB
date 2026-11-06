'use strict';
/**
 * G6 — Express forwarder for Flask E10 (and the G7a combined route).
 *
 * Express only forwards: it never opens a PostgreSQL connection and never
 * re-implements E10 logic. Flask owns validation, freshness and JSON shape.
 *
 * Mount (ESM):
 *   import { createFlaskForwarder } from './flaskForward.js';
 *   app.use('/api', createFlaskForwarder({ baseUrl: process.env.FLASK_BASE_URL }));
 *
 * Requires Node >= 18 (global fetch) and an existing `express` dependency.
 * baseUrl is an ORIGIN only (e.g. http://127.0.0.1:5001); Flask default port is 5001.
 */
import express from 'express';

export const DEFAULT_ROUTES = Object.freeze([
  { path: '/volatility/latest', upstream: '/api/volatility/latest', params: ['symbol'] },
  { path: '/volatility/history', upstream: '/api/volatility/history', params: ['symbol', 'limit'] },
  { path: '/risk-return/latest', upstream: '/api/risk-return/latest', params: ['symbol'] },
  // Read-only model performance report for any signed-in user (Flask: GET /api/model-performance).
  { path: '/model-performance', upstream: '/api/model-performance', params: ['ky_hieu', 'tap_du_lieu'] },
]);

// Statuses documented for the Flask E10 API; anything else is an upstream fault.
// 401/403/429 are Flask's authentication/authorization/rate-limit verdicts and pass through unchanged.
const PASS_STATUS = new Set([200, 400, 401, 403, 429, 503]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function firstString(value) {
  // Flask's request.args.get() uses the FIRST value of a repeated parameter.
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : undefined;
}

function buildUpstreamUrl(baseUrl, route, query) {
  const url = new URL(route.upstream, baseUrl); // fixed path, never client-controlled
  for (const name of route.params) {
    const v = firstString(query[name]);
    if (v !== undefined) url.searchParams.set(name, v); // Flask does all validation
  }
  return url;
}

function sendError(res, status, code) {
  res.status(status).json({ error: code });
}

export function createFlaskForwarder(options = {}) {
  const baseUrl = options.baseUrl || process.env.FLASK_BASE_URL || 'http://127.0.0.1:5001';
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000; // > Flask connect_timeout (10s)
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logger = options.logger || console;
  const routes = options.routes || DEFAULT_ROUTES;
  if (typeof fetchImpl !== 'function') throw new Error('flaskForward requires Node >= 18 (global fetch)');
  new URL(baseUrl); // fail fast on a bad FLASK_BASE_URL

  const router = express.Router();
  for (const route of routes) {
    router.get(route.path, async (req, res) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // Flask authenticates the caller: relay the session cookie (and nothing else from the client).
        const headers = { Accept: 'application/json' };
        if (req.headers.cookie) headers.Cookie = req.headers.cookie;
        const upstream = await fetchImpl(buildUpstreamUrl(baseUrl, route, req.query), {
          method: 'GET',
          headers,
          signal: controller.signal,
          redirect: 'error',
        });
        const type = upstream.headers.get('content-type') || '';
        const body = Buffer.from(await upstream.arrayBuffer());
        if (!PASS_STATUS.has(upstream.status) || !type.includes('application/json') || body.length > MAX_BODY_BYTES) {
          logger.error('[flask-forward] %s: unexpected upstream response status=%s', route.path, upstream.status);
          return sendError(res, 502, 'upstream_unavailable');
        }
        // Raw bytes and status are forwarded unchanged; no upstream headers (CORS, Server, Connection) are copied
        // (Retry-After on a 429 is the one exception, so clients know when to come back).
        const retry = upstream.headers.get('retry-after');
        if (upstream.status === 429 && retry) res.set('Retry-After', retry);
        res.status(upstream.status).set('Content-Type', 'application/json; charset=utf-8').send(body);
      } catch (err) {
        const timedOut = Boolean(err) && err.name === 'AbortError';
        logger.error('[flask-forward] %s: %s (%s)', route.path, timedOut ? 'timeout' : 'unavailable',
          (err && err.cause && err.cause.code) || (err && err.name) || 'error');
        sendError(res, timedOut ? 504 : 502, timedOut ? 'upstream_timeout' : 'upstream_unavailable');
      } finally {
        clearTimeout(timer);
      }
    });
  }
  return router;
}

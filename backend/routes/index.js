import { Router } from 'express';
import * as s from '../controllers/stockController.js';
import * as m from '../controllers/miscController.js';
import * as e02 from '../controllers/e02Controller.js';
import { config } from '../config.js';
import { createFlaskForwarder } from './flaskForward.js';
import { ADMIN_ROUTES, createAuthProxy } from './authProxy.js';
import { createAuthCache, createRequireAuth, requireCsrfHeader } from '../middleware/requireAuth.js';

const router = Router();
const flaskOrigin = new URL(config.stocktrainApiUrl).origin;
const authCache = createAuthCache({ ttlMs: config.authCacheTtlMs });

// PUBLIC: liveness check only (see PUBLIC_PATHS in middleware/requireAuth.js).
router.get('/health', m.health);

// /auth/* is relayed to Flask, which owns login, logout, registration, sessions and roles.
router.use(createAuthProxy({ baseUrl: flaskOrigin, cache: authCache }));

// Everything below needs a valid session (user or admin) and, for writes, the CSRF header.
router.use(createRequireAuth({ baseUrl: flaskOrigin, cache: authCache }));
router.use(requireCsrfHeader({ value: config.csrfHeaderValue }));

// Admin area: user management and the model performance report. Mounted after the session check, and Flask
// still enforces the admin role itself (401 / 403 pass through unchanged).
router.use(createAuthProxy({ baseUrl: flaskOrigin, cache: authCache, routes: ADMIN_ROUTES, prefix: '/admin' }));

// Read-only StockTrain E02 data from the existing Flask + PostgreSQL service.
router.get('/e02/health', e02.health);
router.get('/e02/prices', e02.prices);
router.get('/e02/predictions/latest', e02.latest);
router.get('/market/overview', s.overview);

// E10 volatility + combined risk-return: forward-only to Flask (no DB in Express).
router.use(createFlaskForwarder({ baseUrl: flaskOrigin }));

router.get('/stocks/search', s.search);
router.get('/stocks/:symbol', s.detail);
router.get('/stocks/:symbol/history', s.history);
router.get('/stocks/:symbol/prediction', s.prediction);
router.get('/stocks/:symbol/indicators', s.indicators);
router.get('/stocks/:symbol/stream', s.stream);

router.get('/news', m.news);

router.get('/portfolio', m.getPortfolio);
router.get('/watchlist', m.getWatchlist);
router.post('/watchlist', m.addWatch);
router.delete('/watchlist/:symbol', m.removeWatch);
router.get('/alerts', m.getAlerts);
router.post('/alerts', m.addAlert);
router.delete('/alerts/:id', m.removeAlert);

router.get('/trading/orders', m.getOrders);
router.post('/trading/orders', m.placeOrder);
router.post('/trading/reset', m.resetAccount);
router.post('/risk/estimate', m.risk);
router.post('/risk/pnl', m.pnl);

router.post('/chat', m.chat);

export default router;

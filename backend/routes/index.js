import { Router } from 'express';
import * as s from '../controllers/stockController.js';
import * as m from '../controllers/miscController.js';

const router = Router();

router.get('/health', m.health);
router.get('/market/overview', s.overview);

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

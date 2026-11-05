import { asyncHandler } from '../middleware/errorHandler.js';
import { e02Get, e02Symbol } from '../services/stocktrainClient.js';

export const health = asyncHandler(async (_req, res) => {
  res.json(await e02Get('/health'));
});

export const latest = asyncHandler(async (req, res) => {
  const symbol = e02Symbol(req.query.symbol);
  const payload = await e02Get('/predictions/latest', { symbol });
  res.json(payload);
});

export const prices = asyncHandler(async (req, res) => {
  const symbol = e02Symbol(req.query.symbol);
  const raw = Number(req.query.limit || 120);
  const limit = Number.isInteger(raw) ? Math.min(1500, Math.max(1, raw)) : 120;
  res.json(await e02Get('/prices', { symbol, limit }));
});

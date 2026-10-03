import { asyncHandler } from '../middleware/errorHandler.js';
import { getQuote, getHistory, getFullHistory, searchStocks, getMarketOverview } from '../services/marketDataService.js';
import { computeIndicators } from '../services/indicatorService.js';
import { getPrediction } from '../services/predictionService.js';
import { streamStatus, subscribe } from '../services/marketStream.js';
import { getProvider } from '../providers/index.js';

export const overview = asyncHandler(async (req, res) => {
  const { quotes, ...rest } = await getMarketOverview();
  res.json(rest);
});

export const search = asyncHandler(async (req, res) => {
  res.json(await searchStocks(req.query.q));
});

export const detail = asyncHandler(async (req, res) => {
  res.json(await getQuote(req.params.symbol));
});

export const history = asyncHandler(async (req, res) => {
  const range = String(req.query.range || '1Y').toUpperCase();
  const rows = await getHistory(req.params.symbol, range);
  res.json({ symbol: req.params.symbol.toUpperCase(), range, dataSource: getProvider().name, history: rows });
});

export const prediction = asyncHandler(async (req, res) => {
  res.json(await getPrediction(req.params.symbol, req.query.days || 7));
});

export const indicators = asyncHandler(async (req, res) => {
  const { RANGE_DAYS } = await import('../services/marketDataService.js');
  const range = String(req.query.range || '6M').toUpperCase();
  const full = await getFullHistory(req.params.symbol);
  const result = computeIndicators(full, RANGE_DAYS[range] || RANGE_DAYS['6M']);
  res.json({ symbol: req.params.symbol.toUpperCase(), range, dataSource: getProvider().name, ...result });
});

export const stream = (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const symbol = req.params.symbol.toUpperCase();
  res.write(`event: status\ndata: ${JSON.stringify(streamStatus())}\n\n`);
  const off = subscribe(symbol, (tick) => res.write(`event: tick\ndata: ${JSON.stringify(tick)}\n\n`));
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    off();
  });
};

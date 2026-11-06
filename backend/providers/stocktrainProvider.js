/** Historical OHLCV from the user's Flask E02 database, never a live market feed. */
import { config } from '../config.js';
import { e02Get, e02Symbol } from '../services/stocktrainClient.js';

export const name = 'stocktrain-e02';
export const isRealtime = false;
const cache = new Map();

export async function listStocks() {
  const body = await e02Get('/stocks');
  return (body.stocks || []).map((x) => ({
    symbol: x.symbol, name: x.company, sector: '', exchange: 'VN'
  }));
}

export async function getStockMeta(rawSymbol) {
  const symbol = e02Symbol(rawSymbol);
  return (await listStocks()).find((x) => x.symbol === symbol) || null;
}

export async function getHistory(rawSymbol) {
  const symbol = e02Symbol(rawSymbol);
  const previous = cache.get(symbol);
  if (previous && Date.now() - previous.at < 10000) return previous.rows;
  const body = await e02Get('/prices', { symbol, limit: 600 });
  const multiplier = config.stocktrainPriceMultiplier;
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('STOCKTRAIN_PRICE_MULTIPLIER must be positive');
  const rows = (body.prices || []).map((x) => ({
    date: x.date,
    priceToVnd: 1000 / multiplier,
    open: Number(x.open) * multiplier,
    high: Number(x.high) * multiplier,
    low: Number(x.low) * multiplier,
    close: Number(x.close) * multiplier,
    volume: Number(x.volume)
  }));
  cache.set(symbol, { at: Date.now(), rows });
  return rows;
}

export async function getQuote(rawSymbol) {
  const symbol = e02Symbol(rawSymbol);
  const [history, meta] = await Promise.all([getHistory(symbol), getStockMeta(symbol)]);
  if (!meta || !history.length) return null;
  const last = history.at(-1);
  const prev = history.at(-2);
  const previousClose = prev?.close ?? last.close;
  const change = last.close - previousClose;
  return {
    symbol, name: meta.name, sector: meta.sector, exchange: meta.exchange,
    price: last.close, priceToVnd: last.priceToVnd, previousClose, change,
    changePercent: previousClose ? change / previousClose * 100 : 0,
    open: last.open, high: last.high, low: last.low, volume: last.volume,
    asOf: last.date, dataSource: name, isRealtime
  };
}

// The Flask E02 API does not provide index data. Do not synthesize them.
export async function getIndices() { return []; }

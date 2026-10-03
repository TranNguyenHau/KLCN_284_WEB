import { STOCKS, INDICES } from '../data/stocks.js';
import { generateSeries, businessDays } from '../data/generator.js';

const cache = new Map();

export const name = 'sample';
export const isRealtime = false;

export function listStocks() {
  return STOCKS.map(({ symbol, name: n, sector, exchange }) => ({ symbol, name: n, sector, exchange }));
}

export function getStockMeta(symbol) {
  return STOCKS.find((s) => s.symbol === symbol) || null;
}

export async function getHistory(symbol) {
  const meta = getStockMeta(symbol);
  if (!meta) return null;
  const key = `${symbol}:${businessDays(1)[0]}`;
  if (!cache.has(key)) {
    cache.set(key, generateSeries({ symbol, base: meta.basePrice, volatility: meta.volatility, drift: meta.drift, avgVolume: meta.avgVolume }));
  }
  return cache.get(key);
}

export async function getQuote(symbol) {
  const meta = getStockMeta(symbol);
  const history = await getHistory(symbol);
  if (!meta || !history) return null;
  const last = history.at(-1);
  const prev = history.at(-2);
  const change = last.close - prev.close;
  return {
    symbol,
    name: meta.name,
    sector: meta.sector,
    exchange: meta.exchange,
    price: last.close,
    previousClose: prev.close,
    change,
    changePercent: (change / prev.close) * 100,
    open: last.open,
    high: last.high,
    low: last.low,
    volume: last.volume,
    asOf: last.date,
    dataSource: name,
    isRealtime
  };
}

export async function getIndices() {
  return INDICES.map((idx) => {
    const series = generateSeries({ symbol: idx.symbol, base: idx.base, volatility: idx.volatility, drift: idx.drift, tick: idx.tick ?? 0.01, decimals: idx.decimals ?? 2, count: 260 });
    const last = series.at(-1);
    const prev = series.at(-2);
    return {
      symbol: idx.symbol,
      name: idx.name,
      value: last.close,
      change: last.close - prev.close,
      changePercent: ((last.close - prev.close) / prev.close) * 100,
      spark: series.slice(-40).map((r) => ({ date: r.date, value: r.close })),
      dataSource: name
    };
  });
}

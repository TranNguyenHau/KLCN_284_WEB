import { getProvider } from '../providers/index.js';
import { AppError } from '../utils/errors.js';
import { getNewsSentiment } from './newsService.js';

export const RANGE_DAYS = { '1M': 22, '3M': 66, '6M': 132, '1Y': 252, '2Y': 504 };

export function normalizeSymbol(raw) {
  const symbol = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(symbol)) throw new AppError(400, 'INVALID_SYMBOL', `Invalid stock symbol '${raw}'`);
  return symbol;
}

export async function listStocks() {
  return getProvider().listStocks();
}

export async function searchStocks(q) {
  const term = String(q || '').trim().toLowerCase();
  const all = await listStocks();
  if (!term) return all;
  return all.filter((s) => s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));
}

export async function getQuote(rawSymbol) {
  const symbol = normalizeSymbol(rawSymbol);
  const quote = await getProvider().getQuote(symbol);
  if (!quote) throw new AppError(404, 'SYMBOL_NOT_FOUND', `Symbol '${symbol}' was not found`);
  return quote;
}

export async function getHistory(rawSymbol, range = '1Y') {
  const symbol = normalizeSymbol(rawSymbol);
  const rows = await getProvider().getHistory(symbol);
  if (!rows) throw new AppError(404, 'SYMBOL_NOT_FOUND', `Symbol '${symbol}' was not found`);
  const days = RANGE_DAYS[String(range).toUpperCase()] || RANGE_DAYS['1Y'];
  return rows.slice(-days);
}

export async function getFullHistory(rawSymbol) {
  const symbol = normalizeSymbol(rawSymbol);
  const rows = await getProvider().getHistory(symbol);
  if (!rows) throw new AppError(404, 'SYMBOL_NOT_FOUND', `Symbol '${symbol}' was not found`);
  return rows;
}

export async function getMarketOverview() {
  const provider = getProvider();
  const stocks = await listStocks();
  const quotes = await Promise.all(stocks.map((s) => provider.getQuote(s.symbol)));
  const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
  const advancers = quotes.filter((q) => q.change > 0).length;
  const decliners = quotes.filter((q) => q.change < 0).length;
  const unchanged = quotes.length - advancers - decliners;
  const breadthScore = (advancers - decliners) / quotes.length;
  const news = await getNewsSentiment();
  const score = 0.6 * breadthScore + 0.4 * news.averageScore;
  const label = score > 0.15 ? 'Bullish' : score < -0.15 ? 'Bearish' : 'Neutral';
  // The dashboard shows these in two tall tables, so each side takes half the catalog
  // (up to six): more rows than before, and the two lists can never share a symbol.
  const movers = Math.min(6, Math.max(1, Math.floor(quotes.length / 2)));
  return {
    asOf: quotes[0]?.asOf,
    dataSource: provider.name,
    isRealtime: provider.isRealtime,
    indices: await provider.getIndices(),
    breadth: { advancers, decliners, unchanged, total: quotes.length },
    sentiment: { label, score, breadthScore, newsScore: news.averageScore, method: 'Blend of 60% market breadth and 40% lexicon news sentiment' },
    topGainers: sorted.slice(0, movers),
    topLosers: sorted.slice(-movers).reverse(),
    quotes
  };
}

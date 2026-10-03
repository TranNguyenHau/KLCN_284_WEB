import { getQuote, getFullHistory, normalizeSymbol } from './marketDataService.js';
import { AppError, round } from '../utils/errors.js';

const FEE_RATE = 0.0015;
const INITIAL_CASH = 500000000;

const initialState = () => ({
  cash: INITIAL_CASH,
  holdings: [
    { symbol: 'VIC', quantity: 500, avgCost: 98000 },
    { symbol: 'FPT', quantity: 300, avgCost: 118000 },
    { symbol: 'VCB', quantity: 400, avgCost: 90000 }
  ],
  orders: [],
  realizedPnl: 0,
  watchlist: ['VIC', 'FPT', 'VCB', 'HPG'],
  alerts: [],
  nextId: 1
});

let state = initialState();

export async function getPortfolio() {
  const rows = await Promise.all(
    state.holdings.map(async (h) => {
      const q = await getQuote(h.symbol);
      const marketValue = q.price * h.quantity;
      const cost = h.avgCost * h.quantity;
      return {
        symbol: h.symbol,
        name: q.name,
        quantity: h.quantity,
        avgCost: round(h.avgCost),
        price: q.price,
        dayChangePercent: q.changePercent,
        marketValue,
        unrealizedPnl: marketValue - cost,
        unrealizedPnlPercent: ((marketValue - cost) / cost) * 100
      };
    })
  );
  const invested = rows.reduce((s, r) => s + r.avgCost * r.quantity, 0);
  const holdingsValue = rows.reduce((s, r) => s + r.marketValue, 0);
  const unrealized = holdingsValue - invested;
  const performance = await buildPerformance();
  return {
    simulated: true,
    cash: state.cash,
    holdingsValue,
    totalEquity: state.cash + holdingsValue,
    invested,
    unrealizedPnl: unrealized,
    unrealizedPnlPercent: invested ? (unrealized / invested) * 100 : 0,
    realizedPnl: state.realizedPnl,
    holdings: rows,
    performance,
    feeRate: FEE_RATE
  };
}

async function buildPerformance() {
  if (!state.holdings.length) return [];
  const histories = await Promise.all(state.holdings.map((h) => getFullHistory(h.symbol)));
  const n = 60;
  const points = [];
  for (let i = histories[0].length - n; i < histories[0].length; i++) {
    const value = state.holdings.reduce((s, h, idx) => s + h.quantity * histories[idx][i].close, 0);
    points.push({ date: histories[0][i].date, value });
  }
  return points;
}

export function getWatchlistSymbols() {
  return [...state.watchlist];
}

export async function getWatchlist() {
  return Promise.all(state.watchlist.map((s) => getQuote(s)));
}

export async function addToWatchlist(raw) {
  const symbol = normalizeSymbol(raw);
  await getQuote(symbol);
  if (!state.watchlist.includes(symbol)) state.watchlist.push(symbol);
  return getWatchlist();
}

export async function removeFromWatchlist(raw) {
  const symbol = normalizeSymbol(raw);
  state.watchlist = state.watchlist.filter((s) => s !== symbol);
  return getWatchlist();
}

export async function getAlerts() {
  return Promise.all(
    state.alerts.map(async (a) => {
      const q = await getQuote(a.symbol);
      const triggered = a.condition === 'above' ? q.price >= a.price : q.price <= a.price;
      return { ...a, currentPrice: q.price, triggered };
    })
  );
}

export async function addAlert({ symbol: raw, condition, price }) {
  const symbol = normalizeSymbol(raw);
  await getQuote(symbol);
  const p = Number(price);
  if (!['above', 'below'].includes(condition) || !(p > 0)) throw new AppError(400, 'INVALID_ALERT', 'condition must be above or below and price must be positive');
  state.alerts.push({ id: state.nextId++, symbol, condition, price: p, createdAt: new Date().toISOString() });
  return getAlerts();
}

export async function removeAlert(id) {
  state.alerts = state.alerts.filter((a) => a.id !== Number(id));
  return getAlerts();
}

export function getOrders() {
  return [...state.orders].reverse();
}

export async function placeOrder({ symbol: raw, side, quantity }) {
  const symbol = normalizeSymbol(raw);
  const qty = Number(quantity);
  if (!['buy', 'sell'].includes(side)) throw new AppError(400, 'INVALID_ORDER', "side must be 'buy' or 'sell'");
  if (!Number.isInteger(qty) || qty <= 0) throw new AppError(400, 'INVALID_ORDER', 'quantity must be a positive whole number');
  const quote = await getQuote(symbol);
  const price = quote.price;
  const gross = price * qty;
  const fee = gross * FEE_RATE;
  const holding = state.holdings.find((h) => h.symbol === symbol);
  let realized = 0;
  if (side === 'buy') {
    if (gross + fee > state.cash) throw new AppError(400, 'INSUFFICIENT_CASH', 'Not enough virtual cash for this order');
    state.cash -= gross + fee;
    if (holding) {
      holding.avgCost = (holding.avgCost * holding.quantity + gross) / (holding.quantity + qty);
      holding.quantity += qty;
    } else {
      state.holdings.push({ symbol, quantity: qty, avgCost: price });
    }
  } else {
    if (!holding || holding.quantity < qty) throw new AppError(400, 'INSUFFICIENT_SHARES', 'Not enough virtual shares to sell');
    realized = (price - holding.avgCost) * qty - fee;
    state.cash += gross - fee;
    holding.quantity -= qty;
    state.realizedPnl += realized;
    if (holding.quantity === 0) state.holdings = state.holdings.filter((h) => h.symbol !== symbol);
  }
  const order = { id: state.nextId++, symbol, side, quantity: qty, price, gross, fee, realizedPnl: side === 'sell' ? realized : null, status: 'filled (simulated)', createdAt: new Date().toISOString() };
  state.orders.push(order);
  return order;
}

export function resetPaperAccount() {
  state = initialState();
  return { reset: true, cash: state.cash };
}

import { getFullHistory, getQuote, normalizeSymbol } from './marketDataService.js';
import { AppError, round } from '../utils/errors.js';

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

export async function estimateRisk({ symbol: raw, quantity, entryPrice, stopLoss, takeProfit }) {
  const symbol = normalizeSymbol(raw);
  const qty = Number(quantity);
  if (!(qty > 0)) throw new AppError(400, 'INVALID_INPUT', 'quantity must be positive');
  const history = (await getFullHistory(symbol)).slice(-252);
  const quote = await getQuote(symbol);
  const entry = num(entryPrice) || quote.price;
  const closes = history.map((r) => r.close);
  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const sd = Math.sqrt(returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1));
  const sorted = [...returns].sort((a, b) => a - b);
  const histVar = -sorted[Math.floor(sorted.length * 0.05)];
  const position = entry * qty;
  let peak = closes[0];
  let maxDrawdown = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    maxDrawdown = Math.max(maxDrawdown, (peak - c) / peak);
  }
  const annualVol = sd * Math.sqrt(252);
  const level = annualVol < 0.2 ? 'low' : annualVol < 0.35 ? 'medium' : 'high';
  const stop = num(stopLoss);
  const target = num(takeProfit);
  const lossAtStop = stop ? (stop - entry) * qty : null;
  const gainAtTarget = target ? (target - entry) * qty : null;
  return {
    symbol,
    simulated: true,
    entryPrice: entry,
    positionValue: position,
    dailyVolatilityPercent: round(sd * 100, 2),
    annualizedVolatilityPercent: round(annualVol * 100, 1),
    riskLevel: level,
    oneDayVaR95Historical: round(position * histVar, 0),
    oneDayVaR95Parametric: round(position * 1.645 * sd, 0),
    maxDrawdown1YPercent: round(maxDrawdown * 100, 1),
    stopLossPnl: lossAtStop == null ? null : round(lossAtStop, 0),
    takeProfitPnl: gainAtTarget == null ? null : round(gainAtTarget, 0),
    riskRewardRatio: lossAtStop && gainAtTarget ? round(Math.abs(gainAtTarget / lossAtStop), 2) : null,
    method: 'Based on one year of daily log returns; estimates are historical and not a forecast',
    dataSource: quote.dataSource
  };
}

export function calculatePnl({ entryPrice, exitPrice, quantity, feePercent = 0.15 }) {
  const entry = Number(entryPrice);
  const exit = Number(exitPrice);
  const qty = Number(quantity);
  if (!(entry > 0 && exit > 0 && qty > 0)) throw new AppError(400, 'INVALID_INPUT', 'entryPrice, exitPrice and quantity must be positive');
  const fee = Number(feePercent) / 100;
  const buy = entry * qty;
  const sell = exit * qty;
  const fees = (buy + sell) * fee;
  const gross = sell - buy;
  const net = gross - fees;
  return { grossPnl: round(gross, 0), fees: round(fees, 0), netPnl: round(net, 0), returnPercent: round((net / buy) * 100, 2), invested: round(buy, 0), simulated: true };
}

import { getFullHistory, normalizeSymbol } from './marketDataService.js';
import { requestPrediction } from './mlService.js';
import { AppError } from '../utils/errors.js';

const HISTORY_ROWS_SENT = 400;

export async function getPrediction(rawSymbol, rawDays = 7) {
  const symbol = normalizeSymbol(rawSymbol);
  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new AppError(400, 'INVALID_DAYS', 'days must be an integer between 1 and 30');
  const history = (await getFullHistory(symbol)).slice(-HISTORY_ROWS_SENT);
  const result = await requestPrediction({ symbol, days, history });
  return {
    symbol,
    days,
    source: 'lstm-model',
    predictions: result.predictions,
    meta: result.meta,
    disclaimer: 'Model predictions are statistical estimates, not guaranteed future prices and not financial advice.'
  };
}

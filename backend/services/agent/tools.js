import { getQuote, getFullHistory, getMarketOverview } from '../marketDataService.js';
import { getPrediction } from '../predictionService.js';
import { computeIndicators } from '../indicatorService.js';
import { getNews, getNewsSentiment } from '../newsService.js';
import { round } from '../../utils/errors.js';

const pct = (a, b) => round(((a - b) / b) * 100, 2);

export const TOOLS = {
  get_current_price: {
    description: 'Latest price, daily change and volume for a symbol',
    run: async ({ symbol }) => getQuote(symbol)
  },
  get_historical_summary: {
    description: 'Summary statistics of the past year of daily prices',
    run: async ({ symbol }) => {
      const rows = (await getFullHistory(symbol)).slice(-252);
      const closes = rows.map((r) => r.close);
      const last = closes.at(-1);
      const vol20 = rows.slice(-20).reduce((s, r) => s + r.volume, 0) / 20;
      return {
        symbol,
        lastDate: rows.at(-1).date,
        change30dPercent: pct(last, closes.at(-23)),
        change90dPercent: pct(last, closes.at(-67)),
        high52w: Math.max(...rows.map((r) => r.high)),
        low52w: Math.min(...rows.map((r) => r.low)),
        avgVolume20d: Math.round(vol20)
      };
    }
  },
  get_lstm_prediction: {
    description: 'Multi-day price prediction from the trained LSTM model (via the ML service)',
    run: async ({ symbol, days = 7 }) => getPrediction(symbol, days)
  },
  get_technical_indicators: {
    description: 'RSI, MACD, Bollinger Bands, moving averages and volume signals',
    run: async ({ symbol }) => {
      const result = computeIndicators(await getFullHistory(symbol), 30);
      return { symbol, latest: result.latest, signals: result.signals, bias: result.bias, counts: result.counts };
    }
  },
  get_market_news: {
    description: 'Recent news headlines for a symbol',
    run: async ({ symbol }) => (await getNews({ symbol })).slice(0, 5)
  },
  get_news_sentiment: {
    description: 'Aggregated sentiment across recent news for a symbol',
    run: async ({ symbol }) => getNewsSentiment(symbol)
  },
  get_market_overview: {
    description: 'Market breadth, sentiment, top gainers and losers',
    run: async () => {
      const o = await getMarketOverview();
      return { asOf: o.asOf, dataSource: o.dataSource, breadth: o.breadth, sentiment: o.sentiment, topGainers: o.topGainers.slice(0, 3), topLosers: o.topLosers.slice(0, 3) };
    }
  }
};

export async function runTool(name, args) {
  try {
    return { tool: name, ok: true, data: await TOOLS[name].run(args) };
  } catch (err) {
    return { tool: name, ok: false, error: { code: err.code || 'TOOL_ERROR', message: err.message } };
  }
}

import { runTool } from './tools.js';
import { composeReply, composeMarket, helpText, fallbackNotice } from './composer.js';
import { listStocks } from '../marketDataService.js';
import { generate, llmAvailable, llmName } from '../llm/index.js';
import { normalizeLanguage } from '../../utils/language.js';

const INTENTS = [
  ['prediction', /predict|forecast|lstm|next\s+\d+|tomorrow|dự đoán|du doan/i],
  ['technical', /rsi|macd|bollinger|indicator|overbought|oversold|moving average|technical|chỉ báo|chi bao/i],
  ['news', /news|sentiment|headline|tin tức|tin tuc/i],
  ['price', /price|quote|how much|giá|gia\b/i],
  ['market', /market|vn-?index|gainers|losers|thị trường|thi truong/i]
];

const PLANS = {
  outlook: ['get_current_price', 'get_historical_summary', 'get_lstm_prediction', 'get_technical_indicators', 'get_market_news', 'get_news_sentiment'],
  prediction: ['get_current_price', 'get_lstm_prediction'],
  technical: ['get_current_price', 'get_technical_indicators'],
  news: ['get_current_price', 'get_market_news', 'get_news_sentiment'],
  price: ['get_current_price', 'get_historical_summary']
};

function classify(message) {
  for (const [name, re] of INTENTS) if (re.test(message)) return name;
  return 'outlook';
}

async function findSymbol(message, context) {
  const stocks = await listStocks();
  const upper = message.toUpperCase();
  const bySymbol = stocks.find((s) => new RegExp(`\\b${s.symbol}\\b`).test(upper));
  if (bySymbol) return bySymbol.symbol;
  const lower = message.toLowerCase();
  const byName = stocks.find((s) => lower.includes(s.name.toLowerCase().split(' ')[0]) && s.name.split(' ')[0].length > 3);
  if (byName) return byName.symbol;
  return context?.symbol && stocks.some((s) => s.symbol === context.symbol) ? context.symbol : null;
}

function daysFrom(message) {
  const m = message.match(/(\d{1,2})\s*(?:-|\s)?(?:day|days|ngày|ngay)/i);
  const n = m ? Number(m[1]) : 7;
  return n >= 1 && n <= 30 ? n : n > 30 ? 30 : 7;
}

/**
 * @param language the language the user selected in the interface; every reply - LLM or
 *   rule-based - is written in it, whatever language the question was typed in.
 */
export async function runAgent({ message, history = [], context = {}, language }) {
  const lang = normalizeLanguage(language);
  const intent = classify(message);
  const toolCalls = [];

  if (intent === 'market' && !/\b[A-Z]{3}\b/.test(message.replace(/VN-?INDEX/i, ''))) {
    const res = await runTool('get_market_overview', {});
    toolCalls.push({ tool: res.tool, ok: res.ok });
    if (res.ok) return finish({ message, history, evidence: { market: res.data }, fallback: composeMarket(res.data, lang), toolCalls, symbol: null, language: lang });
  }

  const symbol = await findSymbol(message, context);
  if (!symbol) return { reply: helpText(lang), toolCalls: [], evidence: null, provider: 'rule-based' };

  const days = daysFrom(message);
  const results = await Promise.all(PLANS[intent === 'market' ? 'outlook' : intent].map((t) => runTool(t, { symbol, days })));
  results.forEach((r) => toolCalls.push({ tool: r.tool, ok: r.ok, error: r.ok ? undefined : r.error.message }));
  const pick = (name) => results.find((r) => r.tool === name && r.ok)?.data;
  const failure = (name) => results.find((r) => r.tool === name && !r.ok)?.error?.message;

  const evidence = {
    symbol,
    price: pick('get_current_price'),
    history: pick('get_historical_summary'),
    prediction: pick('get_lstm_prediction'),
    technical: pick('get_technical_indicators'),
    news: pick('get_market_news'),
    sentiment: pick('get_news_sentiment'),
    unavailable: { prediction: failure('get_lstm_prediction') }
  };
  const fallback = composeReply({ symbol, evidence, failures: { prediction: evidence.unavailable.prediction }, language: lang });
  return finish({ message, history, evidence, fallback, toolCalls, symbol, language: lang });
}

async function finish({ message, history, evidence, fallback, toolCalls, symbol, language }) {
  if (llmAvailable()) {
    try {
      const prior = history.slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) }));
      const reply = await generate([...prior, { role: 'user', content: `QUESTION: ${message}\n\nEVIDENCE (JSON):\n${JSON.stringify(evidence)}` }], { language });
      return { reply, toolCalls, evidence, symbol, provider: llmName() };
    } catch (err) {
      // The reason is surfaced instead of swallowed: a rejected or rate-limited API key is
      // the most likely cause, and the message (already stripped of the key itself) is what
      // makes that visible in the chat instead of a silent downgrade.
      const reason = err?.message || 'unknown error';
      return {
        reply: `${fallback}\n\n(${fallbackNotice(language, reason)})`,
        toolCalls,
        evidence,
        symbol,
        provider: 'rule-based'
      };
    }
  }
  return { reply: fallback, toolCalls, evidence, symbol, provider: 'rule-based' };
}

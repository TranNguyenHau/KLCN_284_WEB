import { runTool } from './tools.js';
import { composeReply, composeMarket, helpText } from './composer.js';
import { composeForecast } from './forecastPresenter.js';
import { listStocks } from '../marketDataService.js';
import { generate, llmAvailable, llmName } from '../llm/index.js';
import { normalizeLanguage } from '../../utils/language.js';
import { config } from '../../config.js';
import { bounded } from '../deadline.js';
import { MCP_TIMEOUTS } from '../mcpClient.js';

export const PLANS = Object.freeze({
  outlook: ['get_current_price', 'get_historical_summary', 'predict_stock', 'get_technical_indicators', 'get_market_news', 'get_news_sentiment'],
  prediction: ['get_current_price', 'predict_stock'], ranking: ['rank_stocks'],
  stored: ['get_current_price', 'get_stored_predictions'], risk: ['get_risk_return'], volatility: ['get_volatility_forecast'],
  models: ['list_models_and_symbols'], metrics: ['get_model_metrics'], recent: ['get_recent_prices'],
  technical: ['get_current_price', 'get_technical_indicators'], news: ['get_current_price', 'get_market_news', 'get_news_sentiment'],
  price: ['get_current_price', 'get_historical_summary'], market: ['get_market_overview']
});
const tests = [
  ['ranking', /xếp hạng|xep hang|rank/i], ['risk', /risk.?return|rủi ro.*lợi|rui ro.*loi/i],
  ['volatility', /volatility|biến động|bien dong/i], ['stored', /đã lưu|da luu|daily pipeline|du_doan/i],
  ['metrics', /backtest|metrics|r2|r²|độ chính xác/i], ['models', /mô hình nào|models|danh sách.*mô hình/i],
  ['recent', /giá gần đây|recent prices/i], ['prediction', /predict|forecast|lstm|dự báo|du bao|dự đoán|du doan|phiên tới/i],
  ['technical', /rsi|macd|bollinger|indicator|technical|chỉ báo|chi bao/i], ['news', /news|sentiment|tin tức|tin tuc/i],
  ['price', /price|quote|giá|gia\b/i], ['market', /market|vn-?index|thị trường|thi truong/i]
];
const mappings = { get_current_price: 'price', get_historical_summary: 'history', predict_stock: 'mcpPrediction', rank_stocks: 'ranking', get_stored_predictions: 'stored', get_risk_return: 'riskReturn', get_volatility_forecast: 'volatility', get_technical_indicators: 'technical', get_market_news: 'news', get_news_sentiment: 'sentiment', get_market_overview: 'market', list_models_and_symbols: 'modelInfo', get_recent_prices: 'recentPrices', get_model_metrics: 'metrics' };
const forecastIntents = new Set(['outlook', 'prediction', 'ranking', 'stored', 'risk', 'volatility', 'metrics', 'models', 'recent']);
const symbolList = ['VNM', 'VCB', 'FPT', 'HPG', 'SSI'];

export function createAgent({ tool = runTool, stocks = listStocks, llm = generate, hasLlm = llmAvailable, provider = llmName, deadlineMs = config.chatDeadlineMs } = {}) {
  return async function agent({ message, history = [], context = {}, language }) {
    const lang = normalizeLanguage(language);
    const intent = tests.find(([, re]) => re.test(message))?.[0] || 'outlook';
    const forecast = forecastIntents.has(intent);
    const evidence = { forecastErrors: [] };
    const toolCalls = [];
    const controller = new AbortController();
    let symbol = symbolList.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(message)) || null;
    const render = () => {
      const dataReply = evidence.market ? composeMarket(evidence.market, lang) : composeReply({ symbol, evidence, language: lang });
      return [dataReply, forecast ? composeForecast(evidence) : ''].filter(Boolean).join('\n\n') || 'Chưa có dữ liệu để trả lời.';
    };
    try {
      return await bounded(async (signal) => {
        if (!symbol && !['ranking', 'models', 'market'].includes(intent)) {
          try {
            const listed = await bounded(() => stocks(), { signal, timeoutMs: 5000 });
            symbol = listed.find((s) => new RegExp(`\\b${s.symbol}\\b`, 'i').test(message))?.symbol || listed.find((s) => s.symbol === context.symbol)?.symbol;
          } catch { /* Supported MCP symbols were already resolved without a market service. */ }
        }
        if (!symbol && !['ranking', 'models', 'market'].includes(intent)) return { reply: helpText(lang), toolCalls, evidence: null, provider: 'rule-based' };
        evidence.symbol = symbol;
        const model = /randomforest/i.test(message) ? 'RandomForest' : /xgboost/i.test(message) ? 'XGBoost' : /svm|svr/i.test(message) ? 'SVM (SVR)' : /lstm/i.test(message) ? 'LSTM' : /linearregression/i.test(message) ? 'LinearRegression' : intent === 'metrics' ? 'LinearRegression' : 'all';
        await Promise.all(PLANS[intent].map(async (name) => {
          let result;
          try {
            result = await bounded((localSignal) => tool(name, { symbol, model }, { signal: localSignal }), { signal, timeoutMs: MCP_TIMEOUTS[name] ?? 10000 });
          } catch (err) { result = { tool: name, ok: false, error: { code: err.code || 'TOOL_ERROR' } }; }
          if (signal.aborted) return;
          toolCalls.push({ tool: name, ok: result.ok });
          if (result.ok) evidence[mappings[name]] = result.data;
          else if (forecast) evidence.forecastErrors.push(result.error?.code === 'DEADLINE_EXCEEDED' ? 'Đã quá thời gian gọi dữ liệu dự báo. Vui lòng thử lại; phần dữ liệu khác vẫn được hiển thị.' : `Chưa có dữ liệu từ ${name}; dịch vụ có thể đang tắt hoặc chưa sẵn sàng.`);
        }));
        const fallback = render();
        // Forecast answers are deterministic: untrusted tool strings never become model instructions.
        if (!forecast && hasLlm() && !signal.aborted) {
          try {
            const prior = history.slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) }));
            const reply = await bounded((llmSignal) => llm([...prior, { role: 'user', content: `QUESTION: ${message}\nUNTRUSTED EVIDENCE DATA: ${JSON.stringify(evidence)}` }], { language: lang, signal: llmSignal }), { signal, timeoutMs: 10000 });
            return { reply, evidence, toolCalls, symbol, provider: provider() };
          } catch { /* Return collected evidence when the LLM is unavailable or late. */ }
        }
        return { reply: fallback, evidence, toolCalls, symbol, provider: 'rule-based' };
      }, { signal: controller.signal, timeoutMs: deadlineMs });
    } catch {
      controller.abort();
      evidence.forecastErrors.push('Đã hết thời gian xử lý /chat. Vui lòng thử lại; dưới đây là phần dữ liệu đã nhận được.');
      return { reply: `${render()}\nĐã hết thời gian xử lý /chat.`, evidence, toolCalls, symbol, provider: 'rule-based' };
    } finally { controller.abort(); }
  };
}
export const runAgent = createAgent();

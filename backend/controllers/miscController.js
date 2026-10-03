import { asyncHandler } from '../middleware/errorHandler.js';
import { getNews, getNewsSentiment } from '../services/newsService.js';
import * as portfolio from '../services/portfolioService.js';
import { estimateRisk, calculatePnl } from '../services/riskService.js';
import { runAgent } from '../services/agent/agentService.js';
import { mlHealth } from '../services/mlService.js';
import { getProvider } from '../providers/index.js';
import { llmName } from '../services/llm/index.js';
import { AppError } from '../utils/errors.js';
import { normalizeLanguage } from '../utils/language.js';

export const health = asyncHandler(async (req, res) => {
  const provider = getProvider();
  res.json({
    status: 'ok',
    marketData: { provider: provider.name, realtime: provider.isRealtime },
    ml: await mlHealth(),
    llm: llmName()
  });
});

export const news = asyncHandler(async (req, res) => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
  const sentiment = req.query.sentiment ? String(req.query.sentiment) : undefined;
  res.json({ summary: await getNewsSentiment(symbol), articles: await getNews({ symbol, sentiment }) });
});

export const getPortfolio = asyncHandler(async (req, res) => res.json(await portfolio.getPortfolio()));
export const getWatchlist = asyncHandler(async (req, res) => res.json(await portfolio.getWatchlist()));
export const addWatch = asyncHandler(async (req, res) => res.json(await portfolio.addToWatchlist(req.body.symbol)));
export const removeWatch = asyncHandler(async (req, res) => res.json(await portfolio.removeFromWatchlist(req.params.symbol)));
export const getAlerts = asyncHandler(async (req, res) => res.json(await portfolio.getAlerts()));
export const addAlert = asyncHandler(async (req, res) => res.status(201).json(await portfolio.addAlert(req.body)));
export const removeAlert = asyncHandler(async (req, res) => res.json(await portfolio.removeAlert(req.params.id)));
export const getOrders = asyncHandler(async (req, res) => res.json(portfolio.getOrders()));
export const placeOrder = asyncHandler(async (req, res) => res.status(201).json(await portfolio.placeOrder(req.body)));
export const resetAccount = asyncHandler(async (req, res) => res.json(portfolio.resetPaperAccount()));
export const risk = asyncHandler(async (req, res) => res.json(await estimateRisk(req.body)));
export const pnl = asyncHandler(async (req, res) => res.json(calculatePnl(req.body)));

export const chat = asyncHandler(async (req, res) => {
  // `lang` is the language the user selected in the interface. It decides the language of
  // the reply, so it is validated here and echoed back with the answer.
  const { message, history, context, lang } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) throw new AppError(400, 'INVALID_MESSAGE', 'message is required');
  if (message.length > 2000) throw new AppError(400, 'MESSAGE_TOO_LONG', 'message must be 2000 characters or fewer');
  const language = normalizeLanguage(lang);
  const result = await runAgent({
    message: message.trim(),
    history: Array.isArray(history) ? history : [],
    context: context || {},
    language
  });
  res.json({ ...result, language, timestamp: new Date().toISOString() });
});

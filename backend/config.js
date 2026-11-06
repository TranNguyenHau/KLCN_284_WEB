import 'dotenv/config';

const text = (value) => String(value || '').trim();
const url = (value, fallback) => text(value || fallback).replace(/\/+$/, '');

const corsOrigins = text(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(text).filter(Boolean);
if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
  throw new Error('CORS_ORIGIN must list explicit origins (no "*") because credentials are enabled');
}

export const config = {
  mcpUrl: text(process.env.MCP_URL),
  mcpAuthToken: text(process.env.MCP_AUTH_TOKEN),
  chatDeadlineMs: 75000,
  port: Number(process.env.PORT) || 4000,
  mlServiceUrl: url(process.env.ML_SERVICE_URL, 'http://localhost:8000'),
  mlTimeoutMs: Number(process.env.ML_TIMEOUT_MS) || 60000,
  stocktrainApiUrl: url(process.env.STOCKTRAIN_API_URL, 'http://127.0.0.1:5001/api'),
  stocktrainTimeoutMs: Number(process.env.STOCKTRAIN_TIMEOUT_MS) || 10000,
  // Default 1: preserve database price units. Set 1000 only after verifying the source's unit.
  stocktrainPriceMultiplier: Number(process.env.STOCKTRAIN_PRICE_MULTIPLIER || '1'),
  databaseUrl: process.env.DATABASE_URL || '',
  llmProvider: text(process.env.LLM_PROVIDER || 'rule-based').toLowerCase(),
  llmApiKey: text(process.env.LLM_API_KEY),
  llmModel: text(process.env.LLM_MODEL),
  // Native Gemini endpoint. Keys newly issued by Google AI Studio start with "AQ."
  // (auth keys) and only work against this endpoint, not the OpenAI-compatible one.
  llmBaseUrl: url(process.env.LLM_BASE_URL, 'https://generativelanguage.googleapis.com/v1beta'),
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 45000,
  marketDataProvider: text(process.env.MARKET_DATA_PROVIDER || 'sample').toLowerCase(),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Cookies are sent with credentials, so CORS must list exact origins (never "*").
  corsOrigins,
  // How long Express may remember "this cookie is a valid session" (hard-capped at 5000 ms).
  authCacheTtlMs: Math.min(Number(process.env.AUTH_CACHE_TTL_MS ?? 3000) || 0, 5000),
  // Custom header value required on write requests (CSRF defence); must equal Flask's AUTH_CSRF_HEADER_VALUE.
  csrfHeaderValue: text(process.env.AUTH_CSRF_HEADER_VALUE) || 'StockTrain'
};

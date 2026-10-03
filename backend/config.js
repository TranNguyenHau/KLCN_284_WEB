import 'dotenv/config';

const text = (value) => String(value || '').trim();
const url = (value, fallback) => text(value || fallback).replace(/\/+$/, '');

export const config = {
  port: Number(process.env.PORT) || 4000,
  mlServiceUrl: url(process.env.ML_SERVICE_URL, 'http://localhost:8000'),
  mlTimeoutMs: Number(process.env.ML_TIMEOUT_MS) || 60000,
  databaseUrl: process.env.DATABASE_URL || '',
  llmProvider: text(process.env.LLM_PROVIDER || 'rule-based').toLowerCase(),
  llmApiKey: text(process.env.LLM_API_KEY),
  llmModel: text(process.env.LLM_MODEL),
  // Native Gemini endpoint. Keys newly issued by Google AI Studio start with "AQ."
  // (auth keys) and only work against this endpoint, not the OpenAI-compatible one.
  llmBaseUrl: url(process.env.LLM_BASE_URL, 'https://generativelanguage.googleapis.com/v1beta'),
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 45000,
  marketDataProvider: text(process.env.MARKET_DATA_PROVIDER || 'sample').toLowerCase(),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173'
};

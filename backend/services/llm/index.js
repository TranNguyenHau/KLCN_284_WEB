import axios from 'axios';
import { config } from '../../config.js';
import { buildSystemPrompt } from './prompts.js';

// Current Gemini lineup as of October 2026: 3.x is GA, and the 2.5 family shuts down on
// 16 October 2026, so it is kept only as a last resort. Flash models stay on the free tier
// (Pro models no longer do), which is what a project key will realistically have.
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_MODEL_FALLBACKS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

// Gemini requires the contents array to alternate user/model turns and to open with a user
// turn. The chat widget seeds the greeting as the first assistant message, so a request
// with no user turn yet would otherwise lead with a model turn. This neutral opener keeps
// the array valid and, because the history is then not empty, tells the model the opening
// line has already been said.
const OPENING_TURN = 'Bắt đầu phiên phân tích.';

// Learned at runtime from the first successful call, so /api/health and the chat bubble
// can report which model actually answered. Empty until then.
let workingGeminiModel = '';

function geminiModelCandidates() {
  return [...new Set([config.llmModel, workingGeminiModel, ...GEMINI_MODEL_FALLBACKS].filter(Boolean))];
}

function geminiModelLabel() {
  return workingGeminiModel || config.llmModel || DEFAULT_GEMINI_MODEL;
}

// Google issues two key formats: the legacy "AIza..." standard key and the newer "AQ..."
// auth key that AI Studio hands out now. Both authenticate against the native
// generativelanguage endpoint, either as an x-goog-api-key header or as a ?key= query
// parameter - but sending both at the same time is answered with
// "multiple authentication credentials received", so the two transports are tried one
// after the other, never together.
function keyTransports() {
  return [{ headers: { 'x-goog-api-key': config.llmApiKey } }, { params: { key: config.llmApiKey } }];
}

/** Never let the key reach a log line, an error message or a client response. */
function scrub(text) {
  const value = String(text || '');
  return config.llmApiKey ? value.split(config.llmApiKey).join('[redacted]') : value;
}

function describeError(err) {
  const status = err.response?.status;
  const message = err.response?.data?.error?.message || err.message || 'unknown error';
  return scrub(`${status ? `HTTP ${status}: ` : ''}${message}`).slice(0, 300);
}

/** 404 / "not found" means this model name is not available on the key, so try the next. */
function isModelUnavailable(err) {
  if (err.response?.status === 404) return true;
  return /not found|not supported|unsupported|does not exist/i.test(err.response?.data?.error?.message || '');
}

/** A rejected credential is worth one retry through the other transport before giving up. */
function isAuthFailure(err) {
  return [400, 401, 403].includes(err.response?.status);
}

async function callGemini(model, transport, body) {
  const { data } = await axios.post(`${config.llmBaseUrl}/models/${model}:generateContent`, body, {
    ...transport,
    timeout: config.llmTimeoutMs
  });
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const reply = parts.map((part) => part.text || '').join('').trim();
  if (!reply) {
    const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || 'no candidate returned';
    throw new Error(`Gemini returned no answer (${reason})`);
  }
  return reply;
}

const providers = {
  openai: async ({ messages, language }) => {
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: config.llmModel || 'gpt-4o-mini', temperature: 0.3, messages: [{ role: 'system', content: buildSystemPrompt(language) }, ...messages] },
      { headers: { Authorization: `Bearer ${config.llmApiKey}` }, timeout: config.llmTimeoutMs }
    );
    return data.choices[0].message.content;
  },
  gemini: async ({ messages, language }) => {
    // Gemini rejects two consecutive turns with the same role. A failed request leaves the
    // question in the stored history, so a retry can put two user turns in a row; when that
    // happens the newer turn wins and the stale duplicate is dropped.
    const contents = [];
    for (const m of messages) {
      const turn = { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      if (contents.at(-1)?.role === turn.role) contents[contents.length - 1] = turn;
      else contents.push(turn);
    }
    if (contents[0]?.role === 'model') contents.unshift({ role: 'user', parts: [{ text: OPENING_TURN }] });
    if (contents.length === 0) contents.push({ role: 'user', parts: [{ text: OPENING_TURN }] });
    const body = {
      systemInstruction: { parts: [{ text: buildSystemPrompt(language) }] },
      contents,
      generationConfig: { temperature: 0.3 }
    };
    const transports = keyTransports();
    const models = geminiModelCandidates();
    let lastError = null;

    for (const model of models) {
      for (let i = 0; i < transports.length; i += 1) {
        try {
          const reply = await callGemini(model, transports[i], body);
          workingGeminiModel = model;
          return reply;
        } catch (err) {
          lastError = err;
          if (isAuthFailure(err) && i < transports.length - 1) continue;
          if (isModelUnavailable(err)) break;
          throw new Error(`Gemini request failed. ${describeError(err)}`);
        }
      }
    }
    throw new Error(`Gemini request failed. ${describeError(lastError)}`);
  }
};

export function llmAvailable() {
  return Boolean(config.llmApiKey) && Boolean(providers[config.llmProvider]);
}

export function llmName() {
  if (!llmAvailable()) return 'rule-based';
  return config.llmProvider === 'gemini' ? `gemini:${geminiModelLabel()}` : config.llmProvider;
}

/**
 * @param messages chat turns, oldest first
 * @param options.language the interface language the user selected, which the answer must follow
 */
export async function generate(messages, options = {}) {
  return providers[config.llmProvider]({ messages, language: options.language });
}

import axios from 'axios';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

const client = axios.create({ baseURL: config.mlServiceUrl, timeout: config.mlTimeoutMs });

function mapError(err) {
  if (err.response) {
    const detail = typeof err.response.data?.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data?.detail || {});
    if (err.response.status === 503) return new AppError(503, 'ML_MODEL_NOT_READY', `The ML service is running but the LSTM model is not loaded. ${detail}`);
    if (err.response.status === 422) return new AppError(422, 'ML_INVALID_REQUEST', detail);
    return new AppError(502, 'ML_SERVICE_ERROR', `The ML service returned an error. ${detail}`);
  }
  if (err.code === 'ECONNABORTED') return new AppError(504, 'ML_SERVICE_TIMEOUT', 'The ML service took too long to respond');
  return new AppError(503, 'ML_SERVICE_UNAVAILABLE', `The ML service at ${config.mlServiceUrl} is unreachable`);
}

export async function requestPrediction({ symbol, days, history }) {
  try {
    const { data } = await client.post('/predict', { symbol, days, history });
    return data;
  } catch (err) {
    throw mapError(err);
  }
}

export async function mlHealth() {
  try {
    const { data } = await client.get('/health', { timeout: 3000 });
    return { online: true, modelReady: Boolean(data.ready), ...data };
  } catch (err) {
    return { online: false, modelReady: false, error: mapError(err).message };
  }
}

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';
import { AUTH_UNAUTHORIZED_EVENT, CSRF_HEADER, CSRF_VALUE } from '../context/AuthContext.jsx';

/**
 * api.js builds its axios instance when it is first imported, and axios.create() copies axios.defaults at
 * that moment. So the fake transport (adapter) is installed BEFORE the dynamic import below. No real network.
 */
let api;
let lastConfig;
let nextResult;

const NETWORK_TEXT = 'Cannot reach the API server. Make sure the Node.js backend is running.';

function respond(config, status, data, headers = {}) {
  return { data, status, statusText: String(status), headers, config, request: {} };
}
const httpFailure = (status, data, headers) => (config) => {
  const response = respond(config, status, data, headers);
  throw new AxiosError(`Request failed with status code ${status}`, status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, {}, response);
};

beforeAll(async () => {
  axios.defaults.adapter = async (config) => {
    lastConfig = config;
    return nextResult(config);
  };
  ({ api } = await import('./api.js'));
});

const events = [];
const listener = () => events.push('unauthorized');
window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
afterEach(() => { events.length = 0; });

/** Call any api.* method, return the rejection (or fail the test if it resolved). */
async function rejection(call = () => api.health()) {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('expected the request to be rejected');
}

describe('interceptor: 401 (session gone)', () => {
  it('interceptor 401 from Flask (string error): rejects an Error with status 401, keeps the axios code, dispatches once', async () => {
    nextResult = httpFailure(401, { data: null, error: 'Cần đăng nhập' });
    const error = await rejection();
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(401);
    expect(error.code).toBe('ERR_BAD_REQUEST'); // not overwritten
    expect(events).toEqual(['unauthorized']);
  });

  it('interceptor 401 from Express (object error): status 401, the server code and message are kept, dispatches once', async () => {
    nextResult = httpFailure(401, { error: { code: 'UNAUTHENTICATED', message: 'Cần đăng nhập' } });
    const error = await rejection();
    expect(error.status).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(error.message).toBe('Cần đăng nhập');
    expect(events).toEqual(['unauthorized']);
  });
});

describe('interceptor: other failures never signal "logged out"', () => {
  it('interceptor 403: status 403, code kept, no event', async () => {
    nextResult = httpFailure(403, { data: null, error: 'Bạn không có quyền admin' });
    const error = await rejection();
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
    expect(error.code).toBe('ERR_BAD_REQUEST');
    expect(events).toEqual([]);
  });

  it('interceptor 429: status 429, code kept, no event', async () => {
    nextResult = httpFailure(429, { data: null, error: 'Quá nhiều lần thử' }, { 'retry-after': '30' });
    const error = await rejection();
    expect(error.status).toBe(429);
    expect(error.code).toBe('ERR_BAD_REQUEST');
    expect(events).toEqual([]);
  });

  it('interceptor timeout: status undefined and code stays ECONNABORTED (not REQUEST_FAILED), no event', async () => {
    nextResult = (config) => { throw new AxiosError('timeout of 90000ms exceeded', 'ECONNABORTED', config, {}); };
    const error = await rejection();
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBeUndefined();
    expect(error.code).toBe('ECONNABORTED');
    expect(events).toEqual([]);
  });

  it('interceptor network error without a status: code ERR_NETWORK, port-free message, no event', async () => {
    nextResult = (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config, {}); };
    const error = await rejection();
    expect(error.status).toBeUndefined();
    expect(error.code).toBe('ERR_NETWORK');
    expect(error.message).toBe(NETWORK_TEXT);
    expect(error.message).not.toMatch(/\b\d{4}\b/);
    expect(events).toEqual([]);
  });

  it.each([
    [400, 'ERR_BAD_REQUEST'],
    [500, 'ERR_BAD_RESPONSE']
  ])('interceptor %s: status and the axios code are kept, no event', async (status, code) => {
    nextResult = httpFailure(status, { error: { message: 'm' } });
    const error = await rejection();
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(events).toEqual([]);
  });

  it('interceptor falls back to REQUEST_FAILED only when neither the server nor axios gives a code', async () => {
    nextResult = (config) => { throw new AxiosError('odd failure', undefined, config, {}); };
    const error = await rejection();
    expect(error.code).toBe('REQUEST_FAILED');
    expect(error.status).toBeUndefined();
  });

  it('interceptor dispatches only for 401, whatever else the server answers', async () => {
    for (const status of [400, 403, 404, 429, 500, 502, 503]) {
      nextResult = httpFailure(status, { data: null, error: 'x' });
      const error = await rejection();
      expect(error.status).toBe(status);
    }
    expect(events).toEqual([]);
  });
});

describe('interceptor: success and request settings', () => {
  it('interceptor unwraps res.data on success and sends no event', async () => {
    nextResult = (config) => respond(config, 200, { status: 'ok' });
    await expect(api.health()).resolves.toEqual({ status: 'ok' });
    expect(events).toEqual([]);
  });

  it('interceptor requests carry the session cookie (withCredentials) and the CSRF header, on reads and writes', async () => {
    nextResult = (config) => respond(config, 200, {});
    await api.health();
    expect(lastConfig.withCredentials).toBe(true);
    expect(lastConfig.headers.get('X-Requested-With')).toBe('StockTrain');
    await api.addWatch?.('FPT');
    expect(lastConfig.method).toBe('post');
    expect(lastConfig.withCredentials).toBe(true);
    expect(lastConfig.headers.get('X-Requested-With')).toBe('StockTrain');
  });

  it('interceptor leaves riskReturnLatest untouched: same path and params', async () => {
    nextResult = (config) => respond(config, 200, { aligned: true });
    await api.riskReturnLatest('FPT');
    expect(lastConfig.url).toBe('/risk-return/latest');
    expect(lastConfig.params).toEqual({ symbol: 'FPT' });
    expect(lastConfig.method).toBe('get');
  });

  it('interceptor constants match the ones AuthContext uses (drift guard)', () => {
    expect(CSRF_HEADER).toBe('X-Requested-With');
    expect(CSRF_VALUE).toBe('StockTrain');
    expect(AUTH_UNAUTHORIZED_EVENT).toBe('stocktrain:unauthorized');
    expect(lastConfig.headers.get(CSRF_HEADER)).toBe(CSRF_VALUE);
  });
});

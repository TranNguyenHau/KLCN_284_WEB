import axios from 'axios';

// Same values as context/AuthContext.jsx (kept here so this service layer does not import React;
// api.interceptor.test.js fails if the two ever drift apart).
const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = import.meta.env.VITE_CSRF_HEADER_VALUE || 'StockTrain';
const UNAUTHORIZED_EVENT = 'stocktrain:unauthorized';

// withCredentials: the session lives in an HttpOnly cookie. The custom header is the CSRF defence for writes.
const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 90000,
  withCredentials: true,
  headers: { [CSRF_HEADER]: CSRF_VALUE }
});

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const payload = err.response?.data?.error;
    const error = new Error(payload?.message || (err.code === 'ERR_NETWORK' ? 'Cannot reach the API server. Make sure the Node.js backend is running.' : err.message));
    error.code = payload?.code || err.code || 'REQUEST_FAILED';
    error.status = err.response?.status;
    // 401 = the session is gone. AuthContext listens and sends the user back to /login.
    // The error is still rejected unchanged so the caller can show its own state.
    if (error.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    return Promise.reject(error);
  }
);

export const api = {
  health: () => http.get('/health'),
  e02Health: () => http.get('/e02/health'),
  e02Prices: (symbol, config) => http.get('/e02/prices', { params: { symbol }, ...config }),
  e02Latest: (symbol, config) => http.get('/e02/predictions/latest', { params: { symbol }, ...config }),
  riskReturnLatest: (symbol, config) => http.get('/risk-return/latest', { params: { symbol }, ...config }),
  overview: () => http.get('/market/overview'),
  searchStocks: (q = '') => http.get('/stocks/search', { params: { q } }),
  // config carries the abort signal so useApi can cancel a request when the page changes.
  stock: (symbol, config) => http.get(`/stocks/${symbol}`, config),
  history: (symbol, range, config) => http.get(`/stocks/${symbol}/history`, { params: { range }, ...config }),
  prediction: (symbol, days, config) => http.get(`/stocks/${symbol}/prediction`, { params: { days }, ...config }),
  indicators: (symbol, range, config) => http.get(`/stocks/${symbol}/indicators`, { params: { range }, ...config }),
  news: (params, config) => http.get('/news', { params, ...config }),
  portfolio: () => http.get('/portfolio'),
  watchlist: () => http.get('/watchlist'),
  addWatch: (symbol) => http.post('/watchlist', { symbol }),
  removeWatch: (symbol) => http.delete(`/watchlist/${symbol}`),
  alerts: () => http.get('/alerts'),
  addAlert: (body) => http.post('/alerts', body),
  removeAlert: (id) => http.delete(`/alerts/${id}`),
  orders: () => http.get('/trading/orders'),
  placeOrder: (body) => http.post('/trading/orders', body),
  resetAccount: () => http.post('/trading/reset'),
  risk: (body) => http.post('/risk/estimate', body),
  pnl: (body) => http.post('/risk/pnl', body),
  chat: (body) => http.post('/chat', body)
};

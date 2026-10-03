import axios from 'axios';

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 90000 });

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const payload = err.response?.data?.error;
    const error = new Error(payload?.message || (err.code === 'ERR_NETWORK' ? 'Cannot reach the API server. Start the Node.js backend on port 4000.' : err.message));
    error.code = payload?.code || err.code || 'REQUEST_FAILED';
    error.status = err.response?.status;
    return Promise.reject(error);
  }
);

export const api = {
  health: () => http.get('/health'),
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

import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext.jsx';
import { I18nProvider } from '../i18n/index.jsx';
import { ThemeProvider } from '../hooks/useTheme.jsx';
import { ToastProvider } from '../hooks/useToast.jsx';

export const ADMIN = {
  ma_nguoi_dung: 1, ten_dang_nhap: 'boss', email: 'boss@example.test', ho_ten: 'Boss Person',
  vai_tro: 'admin', dang_hoat_dong: true, dang_nhap_lan_cuoi: null
};
export const USER = {
  ma_nguoi_dung: 2, ten_dang_nhap: 'staff', email: 'staff@example.test', ho_ten: null,
  vai_tro: 'user', dang_hoat_dong: true, dang_nhap_lan_cuoi: '2026-11-01T08:00:00+00:00'
};

/** What axios resolves for a successful Flask answer: { data: { data, error } }. */
export const ok = (data, status = 200) => ({ status, data: { data, error: null } });

/** What axios rejects with for an HTTP error (Flask puts a string in `error`). */
export function httpError(status, { headers = {}, message = 'server text that must never be shown', reason } = {}) {
  return Object.assign(new Error(`HTTP ${status}`), {
    code: 'ERR_BAD_REQUEST',
    response: { status, headers, data: { data: null, error: message, ...(reason ? { reason } : {}) } }
  });
}
export const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

/**
 * Fake axios client keyed by "METHOD /path". A handler is a value, an Error (thrown), or a function of
 * the request body (it may throw). Unknown routes answer 404.
 */
export function fakeClient(handlers = {}) {
  const calls = [];
  const make = (method) => vi.fn(async (url, body) => {
    calls.push({ method, url, body });
    const handler = handlers[`${method} ${url}`];
    if (handler === undefined) throw httpError(404);
    const result = typeof handler === 'function' ? handler(body) : handler;
    if (result instanceof Error) throw result;
    return result;
  });
  return { get: make('GET'), post: make('POST'), patch: make('PATCH'), delete: make('DELETE'), calls };
}

export function renderWithAuth(ui, { client, route = '/', lang = 'en' } = {}) {
  try {
    localStorage.setItem('alpha.lang', lang);
  } catch {
    /* ignore */
  }
  return render(
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>
            <AuthProvider client={client}>{ui}</AuthProvider>
          </MemoryRouter>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

/**
 * Session state for the whole app. Flask owns authentication and roles; this context only mirrors
 * what GET /api/auth/me says. Hiding buttons by role is a convenience: the server decides.
 *
 * It uses its own small axios client (cookies + the CSRF header) so it does not depend on api.js.
 * Other API calls signal an expired session by dispatching AUTH_UNAUTHORIZED_EVENT on window.
 */
export const AUTH_UNAUTHORIZED_EVENT = 'stocktrain:unauthorized';
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = import.meta.env?.VITE_CSRF_HEADER_VALUE || 'StockTrain';

export function createAuthClient() {
  return axios.create({
    baseURL: import.meta.env?.VITE_API_URL || '/api',
    timeout: 30000,
    withCredentials: true,
    headers: { [CSRF_HEADER]: CSRF_VALUE }
  });
}

/** Normalise any failure to an Error that keeps `.status` and `.code` (same shape the rest of the app uses). */
export function toAuthError(err) {
  const body = err?.response?.data;
  const payload = body?.error;
  const message = typeof payload === 'string' ? payload : payload?.message || err?.message || 'Request failed';
  const error = new Error(message);
  error.status = err?.response?.status;
  error.code = (payload && typeof payload === 'object' && payload.code) || err?.code || 'REQUEST_FAILED';
  // Flask adds a machine-readable `reason` to business-rule refusals (LAST_ADMIN, SELF_DELETE, ...).
  if (typeof body?.reason === 'string') error.reason = body.reason;
  const retry = Number(err?.response?.headers?.['retry-after']);
  if (Number.isFinite(retry) && retry > 0) error.retryAfter = retry;
  return error;
}

/** Mirrors the server policy (app/security.py). The server stays the authority; this only saves a round trip. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const validateUsername = (value) => /^[A-Za-z0-9._-]{3,50}$/.test(value || '');
export const validateEmail = (value) => !!value && value.length <= 100 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
export const validatePassword = (value) => typeof value === 'string' && value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX;

/**
 * Translate a failed auth call. The server's own message is never shown (it is Vietnamese only);
 * the text depends on the HTTP status. `overrides` maps a status to a specific i18n key.
 */
export function authErrorMessage(t, error, overrides = {}) {
  const status = error?.status;
  if (status && overrides[status]) return t(overrides[status]);
  if (status === 429) {
    return error.retryAfter ? t('auth.errors.tooMany', { seconds: error.retryAfter }) : t('auth.errors.tooManyLater');
  }
  if (status === 403) return t('auth.errors.forbidden');
  if (!status) return t('auth.errors.network');
  return t('auth.errors.generic');
}

const AuthContext = createContext(null);
const unwrap = (res) => res?.data?.data;

export function AuthProvider({ children, client: injected }) {
  const clientRef = useRef(injected || null);
  if (!clientRef.current) clientRef.current = createAuthClient();
  const client = clientRef.current;

  // status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'
  const [state, setState] = useState({ status: 'loading', user: null });
  const alive = useRef(true);
  // StrictMode (main.jsx) mounts, unmounts and re-mounts in dev: the flag must be switched back on.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const setAnonymous = useCallback(() => {
    if (alive.current) setState({ status: 'anonymous', user: null });
  }, []);

  /** Run an authenticated call; a 401 means the session is gone, so drop the local state. */
  const authed = useCallback(async (call) => {
    try {
      return await call();
    } catch (err) {
      const error = toAuthError(err);
      if (error.status === 401) setAnonymous();
      throw error;
    }
  }, [setAnonymous]);

  const refresh = useCallback(async () => {
    if (alive.current) setState((s) => ({ ...s, status: 'loading' }));
    try {
      const user = unwrap(await client.get('/auth/me'));
      if (alive.current) setState({ status: 'authenticated', user });
    } catch (err) {
      if (toAuthError(err).status === 401) setAnonymous();
      else if (alive.current) setState({ status: 'unavailable', user: null });
    }
  }, [client, setAnonymous]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, setAnonymous);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, setAnonymous);
  }, [setAnonymous]);

  const actions = useMemo(() => ({
    refresh,
    // A 401 here means wrong credentials, not an expired session, so it does not go through `authed`.
    async login(identifier, password) {
      try {
        const user = unwrap(await client.post('/auth/login', { ten_dang_nhap: identifier, password }));
        if (alive.current) setState({ status: 'authenticated', user });
        return user;
      } catch (err) {
        throw toAuthError(err);
      }
    },
    async register({ username, email, password, fullName }) {
      try {
        return unwrap(await client.post('/auth/register', {
          ten_dang_nhap: username, email, password, ...(fullName ? { ho_ten: fullName } : {})
        }));
      } catch (err) {
        throw toAuthError(err);
      }
    },
    async logout() {
      try {
        await client.post('/auth/logout');
      } catch {
        /* the local session is dropped either way */
      } finally {
        setAnonymous();
      }
    },
    changePassword: (oldPassword, newPassword) =>
      authed(() => client.post('/auth/change-password', { old_password: oldPassword, new_password: newPassword })),
    // Administrator area (Flask enforces the role: 403 for everybody else).
    listUsers: () => authed(async () => unwrap(await client.get('/admin/users'))),
    createUser: ({ username, email, password, fullName, role }) =>
      authed(async () => unwrap(await client.post('/admin/users', {
        ten_dang_nhap: username, email, password, vai_tro: role, ...(fullName ? { ho_ten: fullName } : {})
      }))),
    updateUser: (id, patch) => authed(async () => unwrap(await client.patch(`/admin/users/${id}`, patch))),
    deleteUser: (id) => authed(async () => unwrap(await client.delete(`/admin/users/${id}`))),
    // Read-only model performance report: admin endpoint for the admin area, plain endpoint for every signed-in user.
    modelPerformance: ({ admin = false, params } = {}) =>
      authed(async () => unwrap(await client.get(admin ? '/admin/models/performance' : '/model-performance', { params })))
  }), [client, authed, refresh, setAnonymous]);

  const value = useMemo(() => ({
    ...state,
    isAuthenticated: state.status === 'authenticated',
    isAdmin: state.user?.vai_tro === 'admin',
    ...actions
  }), [state, actions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

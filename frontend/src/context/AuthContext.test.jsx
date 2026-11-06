import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { AxiosError } from 'axios';
import {
  AUTH_UNAUTHORIZED_EVENT, AuthProvider, createAuthClient, toAuthError, useAuth
} from './AuthContext.jsx';
import { ADMIN, USER, fakeClient, httpError, networkError, ok, renderWithAuth } from '../test/authTestUtils.jsx';

/** Run an async action inside act(), swallow its rejection and return it, so state updates are flushed. */
const rejection = async (fn) => {
  let caught = null;
  await act(async () => {
    try {
      await fn();
    } catch (error) {
      caught = error;
    }
  });
  return caught;
};

const setup = (handlers) => {
  const client = fakeClient(handlers);
  const wrapper = ({ children }) => <AuthProvider client={client}>{children}</AuthProvider>;
  return { client, ...renderHook(() => useAuth(), { wrapper }) };
};

describe('AuthProvider: session bootstrap via GET /auth/me', () => {
  it('200 → authenticated with the user and the admin flag', async () => {
    const { result } = setup({ 'GET /auth/me': ok(ADMIN) });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user.ten_dang_nhap).toBe('boss');
    expect(result.current.isAdmin).toBe(true);
  });

  it('a plain user is not an admin', async () => {
    const { result } = setup({ 'GET /auth/me': ok(USER) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.isAdmin).toBe(false);
  });

  it('401 → anonymous (not "unavailable")', async () => {
    const { result } = setup({ 'GET /auth/me': httpError(401) });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.user).toBeNull();
  });

  it('5xx and network errors → unavailable, and refresh() can recover', async () => {
    let answer = httpError(502);
    const { result, client } = setup({ 'GET /auth/me': () => answer });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    answer = networkError();
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('unavailable');
    answer = ok(USER);
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('authenticated');
    expect(client.get).toHaveBeenCalledTimes(3);
  });
});

describe('AuthProvider: actions', () => {
  it('login posts the credentials and authenticates; the password is not kept in state', async () => {
    const { result, client } = setup({ 'GET /auth/me': httpError(401), 'POST /auth/login': ok(USER) });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(() => result.current.login('staff', 'pw-for-test'));
    expect(client.calls.find((c) => c.url === '/auth/login').body).toEqual({ ten_dang_nhap: 'staff', password: 'pw-for-test' });
    expect(result.current.status).toBe('authenticated');
    expect(JSON.stringify(result.current.user)).not.toContain('pw-for-test');
  });

  it('login 401 is a credential error: it rejects with status 401 and does not touch the session', async () => {
    const { result } = setup({ 'GET /auth/me': httpError(401), 'POST /auth/login': httpError(401) });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(await rejection(() => result.current.login('x', 'y'))).toMatchObject({ status: 401 });
    expect(result.current.status).toBe('anonymous');
  });

  it('login 429 keeps Retry-After on the error', async () => {
    const { result } = setup({
      'GET /auth/me': httpError(401), 'POST /auth/login': httpError(429, { headers: { 'retry-after': '120' } })
    });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(await rejection(() => result.current.login('x', 'y'))).toMatchObject({ status: 429, retryAfter: 120 });
  });

  it('register never sends a role, whatever the caller passes', async () => {
    const { result, client } = setup({ 'GET /auth/me': httpError(401), 'POST /auth/register': ok(USER, 201) });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(() => result.current.register({
      username: 'newbie', email: 'n@example.test', password: 'pw-for-test', fullName: '', vai_tro: 'admin', role: 'admin'
    }));
    const body = client.calls.find((c) => c.url === '/auth/register').body;
    expect(Object.keys(body).sort()).toEqual(['email', 'password', 'ten_dang_nhap']);
  });

  it('logout clears the session even when the request fails', async () => {
    const { result } = setup({ 'GET /auth/me': ok(USER), 'POST /auth/logout': networkError() });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(() => result.current.logout());
    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
  });

  it('the global unauthorized event (sent by other API calls) drops the session', async () => {
    const { result } = setup({ 'GET /auth/me': ok(USER) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => { window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT)); });
    expect(result.current.status).toBe('anonymous');
  });

  it('a 401 on an authenticated call (expired session) drops the session; a 400 does not', async () => {
    let answer = httpError(400);
    const { result } = setup({ 'GET /auth/me': ok(USER), 'POST /auth/change-password': () => answer });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(await rejection(() => result.current.changePassword('a', 'b'))).toMatchObject({ status: 400 });
    expect(result.current.status).toBe('authenticated');
    answer = httpError(401);
    expect(await rejection(() => result.current.changePassword('a', 'b'))).toMatchObject({ status: 401 });
    expect(result.current.status).toBe('anonymous');
  });

  it('403 on an admin call rejects but keeps the session (the user is just not allowed)', async () => {
    const { result } = setup({ 'GET /auth/me': ok(USER), 'GET /admin/users': httpError(403) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(await rejection(() => result.current.listUsers())).toMatchObject({ status: 403 });
    expect(result.current.status).toBe('authenticated');
  });
});

describe('AuthProvider under React.StrictMode (how main.jsx runs it in dev)', () => {
  it('still reaches the authenticated state and still reacts to later changes', async () => {
    const client = fakeClient({ 'GET /auth/me': ok(USER), 'POST /auth/logout': ok('ok') });
    const wrapper = ({ children }) => (
      <StrictMode><AuthProvider client={client}>{children}</AuthProvider></StrictMode>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(() => result.current.logout());
    expect(result.current.status).toBe('anonymous');
  });
});

describe('AuthProvider and the unauthorized event', () => {
  it('the event arriving while already anonymous changes nothing but a re-render: no navigation, no new request', async () => {
    const trail = [];
    function Probe() {
      const auth = useAuth();
      const location = useLocation();
      trail.push({ status: auth.status, user: auth.user, path: location.pathname, key: location.key });
      return <p data-testid="probe">{auth.status} {location.pathname}</p>;
    }
    const client = fakeClient({ 'GET /auth/me': httpError(401) });
    renderWithAuth(<Probe />, { client, route: '/login' });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('anonymous /login'));
    const before = trail.at(-1);
    const rendersBefore = trail.length;
    const requestsBefore = client.calls.length;

    act(() => { window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT)); });

    expect(screen.getByTestId('probe')).toHaveTextContent('anonymous /login');
    for (const entry of trail.slice(rendersBefore)) expect(entry).toEqual(before); // same status, user, path and history key
    expect(trail.at(-1)).toEqual(before);
    expect(client.calls).toHaveLength(requestsBefore); // no new /auth/me, no login, no logout
    expect(client.calls.every((call) => call.method === 'GET' && call.url === '/auth/me')).toBe(true);
  });

  it('login 401 through AuthContext is a credential error: it does not emit the unauthorized event', async () => {
    const seen = [];
    const onEvent = () => seen.push('unauthorized');
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onEvent);
    try {
      const client = createAuthClient(); // the real client AuthProvider builds by default (no api.js, no interceptors)
      const hits = [];
      client.defaults.adapter = async (config) => {
        hits.push(`${config.method} ${config.url}`);
        throw new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, {}, {
          status: 401, statusText: '401', headers: {}, config, data: { data: null, error: 'x' }
        });
      };
      const wrapper = ({ children }) => <AuthProvider client={client}>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe('anonymous')); // the /auth/me bootstrap is a 401 as well

      const error = await rejection(() => result.current.login('staff', 'wrong-password'));

      expect(error).toMatchObject({ status: 401, code: 'ERR_BAD_REQUEST' });
      expect(result.current.status).toBe('anonymous');
      expect(hits).toEqual(['get /auth/me', 'post /auth/login']);
      expect(seen).toEqual([]); // neither the bootstrap 401 nor the login 401 signals "session expired"
    } finally {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onEvent);
    }
  });
});

describe('AuthProvider: administration calls', () => {
  it('deleteUser, updateUser and listUsers use /admin/users; the model report picks the admin or the user endpoint', async () => {
    const { result, client } = setup({
      'GET /auth/me': ok(ADMIN), 'GET /admin/users': ok([]), 'DELETE /admin/users/5': ok({ ma_nguoi_dung: 5 }),
      'PATCH /admin/users/5': ok({}), 'GET /admin/models/performance': ok({ rows: [] }), 'GET /model-performance': ok({ rows: [1] })
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await result.current.listUsers();
      await result.current.updateUser(5, { ho_ten: 'X' });
      expect(await result.current.deleteUser(5)).toEqual({ ma_nguoi_dung: 5 });
      expect(await result.current.modelPerformance({ admin: true, params: { tap_du_lieu: 'VAL' } })).toEqual({ rows: [] });
      expect(await result.current.modelPerformance()).toEqual({ rows: [1] });
    });
    expect(client.calls.map((c) => `${c.method} ${c.url}`).slice(1)).toEqual([
      'GET /admin/users', 'PATCH /admin/users/5', 'DELETE /admin/users/5', 'GET /admin/models/performance', 'GET /model-performance'
    ]);
    expect(client.calls.find((c) => c.url === '/admin/models/performance').body).toEqual({ params: { tap_du_lieu: 'VAL' } });
  });

  it('a business-rule refusal keeps status 409 and the machine-readable reason on the error', async () => {
    const { result } = setup({ 'GET /auth/me': ok(ADMIN), 'DELETE /admin/users/1': httpError(409, { reason: 'SELF_DELETE' }) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    const error = await rejection(() => result.current.deleteUser(1));
    expect(error).toMatchObject({ status: 409, reason: 'SELF_DELETE' });
    expect(result.current.status).toBe('authenticated'); // a refusal is not a logout
  });

  it('401 on an admin call drops the session', async () => {
    const { result } = setup({ 'GET /auth/me': ok(ADMIN), 'DELETE /admin/users/1': httpError(401) });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(await rejection(() => result.current.deleteUser(1))).toMatchObject({ status: 401 });
    expect(result.current.status).toBe('anonymous');
  });
});

describe('http client and error shape', () => {
  it('sends cookies and the CSRF header on every request', () => {
    const client = createAuthClient();
    expect(client.defaults.withCredentials).toBe(true);
    expect(client.defaults.headers['X-Requested-With']).toBe('StockTrain');
  });

  it('toAuthError keeps .status and .code (same shape as the rest of the app)', () => {
    const fromFlask = toAuthError(httpError(409));
    expect(fromFlask).toBeInstanceOf(Error);
    expect(fromFlask.status).toBe(409);
    expect(fromFlask.code).toBe('ERR_BAD_REQUEST');
    const fromExpress = toAuthError({ response: { status: 401, data: { error: { code: 'UNAUTHENTICATED', message: 'm' } } } });
    expect(fromExpress.status).toBe(401);
    expect(fromExpress.code).toBe('UNAUTHENTICATED');
    const offline = toAuthError(networkError());
    expect(offline.status).toBeUndefined();
    expect(offline.code).toBe('ERR_NETWORK');
  });
});

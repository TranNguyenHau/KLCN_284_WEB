import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  AUTH_UNAUTHORIZED_EVENT, AuthProvider, createAuthClient, toAuthError, useAuth
} from './AuthContext.jsx';
import { ADMIN, USER, fakeClient, httpError, networkError, ok } from '../test/authTestUtils.jsx';

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
    const { result } = setup({ 'GET /auth/me': ok(USER), 'GET /auth/users': httpError(403) });
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

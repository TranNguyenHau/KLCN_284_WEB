import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import Login from './Login.jsx';
import Register from './Register.jsx';
import ChangePasswordDialog from '../components/ChangePasswordDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { USER, fakeClient, httpError, networkError, ok, renderWithAuth } from '../test/authTestUtils.jsx';

const SERVER_TEXT = 'server text that must never be shown';
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = (name) => fireEvent.click(screen.getByRole('button', { name }));
const postCalls = (client, url) => client.calls.filter((c) => c.method === 'POST' && c.url === url);

const loginApp = (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/secret" element={<p>SECRET CONTENT</p>} />
    <Route path="/" element={<p>HOME CONTENT</p>} />
  </Routes>
);

describe('Login page', () => {
  const anon = (extra = {}) => fakeClient({ 'GET /auth/me': httpError(401), ...extra });

  it('signs in and returns to the page the user originally wanted', async () => {
    const client = anon({ 'POST /auth/login': ok(USER) });
    renderWithAuth(loginApp, { client, route: { pathname: '/login', state: { from: '/secret' } } });
    type('Username or email', ' staff ');
    type('Password', 'pw-for-test');
    submit('Sign in');
    expect(await screen.findByText('SECRET CONTENT')).toBeInTheDocument();
    expect(postCalls(client, '/auth/login')[0].body).toEqual({ ten_dang_nhap: 'staff', password: 'pw-for-test' });
  });

  it('ignores an unsafe "from" (external URL) and goes home', async () => {
    renderWithAuth(loginApp, {
      client: anon({ 'POST /auth/login': ok(USER) }), route: { pathname: '/login', state: { from: 'https://evil.example/' } }
    });
    type('Username or email', 'staff');
    type('Password', 'pw-for-test');
    submit('Sign in');
    expect(await screen.findByText('HOME CONTENT')).toBeInTheDocument();
  });

  it('wrong credentials (401) → one generic message, the server text is never shown, the form stays usable', async () => {
    renderWithAuth(loginApp, { client: anon({ 'POST /auth/login': httpError(401) }), route: '/login' });
    type('Username or email', 'staff');
    type('Password', 'nope-nope');
    submit('Sign in');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
    expect(screen.queryByText(SERVER_TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('429 → its own message with the wait time; without Retry-After a generic "later" message', async () => {
    let answer = httpError(429, { headers: { 'retry-after': '30' } });
    renderWithAuth(loginApp, { client: anon({ 'POST /auth/login': () => answer }), route: '/login' });
    type('Username or email', 'staff');
    type('Password', 'pw-for-test');
    submit('Sign in');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 30 s.');
    answer = httpError(429);
    submit('Sign in');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Please try again later.'));
  });

  it('403 and network failures have their own messages', async () => {
    let answer = httpError(403);
    renderWithAuth(loginApp, { client: anon({ 'POST /auth/login': () => answer }), route: '/login' });
    type('Username or email', 'staff');
    type('Password', 'pw-for-test');
    submit('Sign in');
    expect(await screen.findByRole('alert')).toHaveTextContent('access denied');
    answer = networkError();
    submit('Sign in');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.'));
  });

  it('empty fields are rejected locally without calling the server', async () => {
    const client = anon();
    renderWithAuth(loginApp, { client, route: '/login' });
    submit('Sign in');
    expect(await screen.findByRole('alert')).toHaveTextContent('Please fill in all fields.');
    expect(postCalls(client, '/auth/login')).toHaveLength(0);
  });

  it('shows the "account created" notice after registration, and renders in Vietnamese', async () => {
    renderWithAuth(loginApp, { client: anon(), route: { pathname: '/login', state: { registered: true } }, lang: 'vi' });
    expect(await screen.findByRole('status')).toHaveTextContent('Đã tạo tài khoản');
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
  });

  it('an already signed-in visitor is sent away from /login', async () => {
    renderWithAuth(loginApp, { client: fakeClient({ 'GET /auth/me': ok(USER) }), route: '/login' });
    expect(await screen.findByText('HOME CONTENT')).toBeInTheDocument();
  });
});

describe('Register page', () => {
  const anon = (extra = {}) => fakeClient({ 'GET /auth/me': httpError(401), ...extra });
  const fillValid = (over = {}) => {
    const v = { Username: 'newbie', Email: 'n@example.test', Password: 'pw-for-test', 'Confirm password': 'pw-for-test', ...over };
    for (const [label, value] of Object.entries(v)) type(label, value);
  };

  it('has no role field at all, and a valid form posts no role and goes to /login with a notice', async () => {
    const client = anon({ 'POST /auth/register': ok(USER, 201) });
    renderWithAuth(loginApp, { client, route: '/register' });
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
    fillValid();
    submit('Create account');
    expect(await screen.findByRole('status')).toHaveTextContent('Account created');
    const body = postCalls(client, '/auth/register')[0].body;
    expect(Object.keys(body).sort()).toEqual(['email', 'password', 'ten_dang_nhap']);
  });

  it.each([
    ['username too short', { Username: 'ab' }, 'Username must be 3-50 characters'],
    ['username with a space', { Username: 'a b c' }, 'Username must be 3-50 characters'],
    ['bad email', { Email: 'not-an-email' }, 'Enter a valid email address.'],
    ['short password', { Password: 'short', 'Confirm password': 'short' }, 'Password must be 8-128 characters.'],
    ['mismatched confirmation', { 'Confirm password': 'different-pw-1' }, 'The passwords do not match.']
  ])('rejects %s locally without calling the server', async (_name, over, message) => {
    const client = anon();
    renderWithAuth(loginApp, { client, route: '/register' });
    fillValid(over);
    submit('Create account');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(postCalls(client, '/auth/register')).toHaveLength(0);
  });

  it('409 duplicate → generic message that does not say which field clashed; 429 → rate-limit message', async () => {
    let answer = httpError(409);
    renderWithAuth(loginApp, { client: anon({ 'POST /auth/register': () => answer }), route: '/register' });
    fillValid();
    submit('Create account');
    expect(await screen.findByRole('alert')).toHaveTextContent('That username or email cannot be used.');
    expect(screen.queryByText(SERVER_TEXT)).not.toBeInTheDocument();
    answer = httpError(429, { headers: { 'retry-after': '3600' } });
    submit('Create account');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again in 3600 s.'));
  });
});

describe('ChangePasswordDialog', () => {
  const OLD = 'old-pw-for-test';
  const NEW = 'new-pw-for-test';
  const open = (client, onClose = vi.fn()) => {
    renderWithAuth(<ChangePasswordDialog open onClose={onClose} />, { client });
    return onClose;
  };
  const fill = (over = {}) => {
    const v = { 'Current password': OLD, 'New password': NEW, 'Confirm new password': NEW, ...over };
    for (const [label, value] of Object.entries(v)) type(label, value);
  };
  const authedClient = (extra = {}) => fakeClient({ 'GET /auth/me': ok(USER), ...extra });

  it('is a modal dialog and renders nothing when closed', () => {
    open(authedClient());
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it.each([
    ['new password equals the old one', { 'New password': OLD, 'Confirm new password': OLD }, 'must differ from the current one'],
    ['confirmation mismatch', { 'Confirm new password': 'something-else-1' }, 'The passwords do not match.'],
    ['new password too short', { 'New password': 'short', 'Confirm new password': 'short' }, 'Password must be 8-128 characters.']
  ])('rejects %s locally', async (_n, over, message) => {
    const client = authedClient();
    open(client);
    fill(over);
    submit('Change password');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(postCalls(client, '/auth/change-password')).toHaveLength(0);
  });

  it('success posts old/new, shows a toast and closes', async () => {
    const client = authedClient({ 'POST /auth/change-password': ok('ok') });
    const onClose = open(client);
    fill();
    submit('Change password');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(postCalls(client, '/auth/change-password')[0].body).toEqual({ old_password: OLD, new_password: NEW });
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });

  it('wrong current password (400) → specific message and the dialog stays open', async () => {
    const onClose = open(authedClient({ 'POST /auth/change-password': httpError(400) }));
    fill();
    submit('Change password');
    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is incorrect.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('429 has its own message; 401 (expired session) drops the session', async () => {
    let answer = httpError(429, { headers: { 'retry-after': '45' } });
    function Status() { return <p data-testid="status">{useAuth().status}</p>; }
    renderWithAuth(<><Status /><ChangePasswordDialog open onClose={vi.fn()} /></>,
      { client: authedClient({ 'POST /auth/change-password': () => answer }) });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    fill();
    submit('Change password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 45 s.');
    answer = httpError(401);
    submit('Change password');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
  });

  it('a parent re-render with a new onClose does not wipe what the user typed', () => {
    function Harness() {
      const [n, setN] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setN(n + 1)}>tick</button>
          <ChangePasswordDialog open onClose={() => n} />
        </>
      );
    }
    renderWithAuth(<Harness />, { client: authedClient() });
    type('Current password', OLD);
    fireEvent.click(screen.getByText('tick'));
    expect(screen.getByLabelText('Current password')).toHaveValue(OLD);
  });

  it('Escape closes the dialog', () => {
    const onClose = open(authedClient());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

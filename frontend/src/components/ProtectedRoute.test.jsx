import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute, { AdminRoute } from './ProtectedRoute.jsx';
import { ADMIN, USER, fakeClient, httpError, ok, renderWithAuth } from '../test/authTestUtils.jsx';

function LoginStub() {
  const { state } = useLocation();
  return <p>LOGIN PAGE from={state?.from ?? 'none'}</p>;
}

const app = (
  <Routes>
    <Route path="/login" element={<LoginStub />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/secret" element={<p>SECRET CONTENT</p>} />
      <Route element={<AdminRoute />}>
        <Route path="/users" element={<p>ADMIN PAGE</p>} />
      </Route>
    </Route>
  </Routes>
);

describe('ProtectedRoute', () => {
  it('shows a status message while the session is being checked, then the page', async () => {
    renderWithAuth(app, { client: fakeClient({ 'GET /auth/me': ok(USER) }), route: '/secret' });
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(await screen.findByText('SECRET CONTENT')).toBeInTheDocument();
  });

  it('401 → redirects to /login and remembers where the user wanted to go', async () => {
    renderWithAuth(app, { client: fakeClient({ 'GET /auth/me': httpError(401) }), route: '/secret?tab=1' });
    expect(await screen.findByText('LOGIN PAGE from=/secret?tab=1')).toBeInTheDocument();
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument();
  });

  it('server unavailable → an alert with a retry button that asks again (no redirect, no content)', async () => {
    let answer = httpError(502);
    const client = fakeClient({ 'GET /auth/me': () => answer });
    renderWithAuth(app, { client, route: '/secret' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot verify your session');
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument();
    answer = ok(USER);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('SECRET CONTENT')).toBeInTheDocument();
  });

  it('the Vietnamese texts exist too', async () => {
    renderWithAuth(app, { client: fakeClient({ 'GET /auth/me': httpError(502) }), route: '/secret', lang: 'vi' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Hiện không xác minh được phiên đăng nhập');
  });
});

describe('AdminRoute: role-based display', () => {
  it('admin sees the admin page', async () => {
    renderWithAuth(app, { client: fakeClient({ 'GET /auth/me': ok(ADMIN) }), route: '/users' });
    expect(await screen.findByText('ADMIN PAGE')).toBeInTheDocument();
  });

  it('a plain user gets an access-denied panel, not the page', async () => {
    renderWithAuth(app, { client: fakeClient({ 'GET /auth/me': ok(USER) }), route: '/users' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.queryByText('ADMIN PAGE')).not.toBeInTheDocument();
  });

  it('an anonymous visitor to an admin URL goes to /login first', async () => {
    renderWithAuth(app, { client: fakeClient({ 'GET /auth/me': httpError(401) }), route: '/users' });
    await waitFor(() => expect(screen.getByText(/LOGIN PAGE from=\/users/)).toBeInTheDocument());
  });
});

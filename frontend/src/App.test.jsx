import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import App from './App.jsx';
import { ADMIN, USER, fakeClient, httpError, ok, renderWithAuth } from './test/authTestUtils.jsx';

// The real route table, ProtectedRoute, AdminRoute and AdminShell are exercised; pages and the big layout are stubs.
vi.mock('./layouts/MainLayout.jsx', async () => {
  const { createElement } = await import('react');
  const { Outlet } = await import('react-router-dom');
  return { default: () => createElement(Outlet) };
});
vi.mock('./pages/Dashboard.jsx', () => ({ default: () => 'DASHBOARD PAGE' }));
vi.mock('./pages/NotFound.jsx', () => ({ default: () => 'NOT FOUND PAGE' }));
vi.mock('./pages/StockDetail.jsx', () => ({ default: () => 'STOCK PAGE' }));
vi.mock('./pages/TechnicalAnalysis.jsx', () => ({ default: () => 'ANALYSIS PAGE' }));
vi.mock('./pages/Portfolio.jsx', () => ({ default: () => 'PORTFOLIO PAGE' }));
vi.mock('./pages/Trading.jsx', () => ({ default: () => 'TRADING PAGE' }));
vi.mock('./pages/Login.jsx', () => ({ default: () => 'LOGIN PAGE' }));
vi.mock('./pages/Register.jsx', () => ({ default: () => 'REGISTER PAGE' }));
vi.mock('./pages/Users.jsx', () => ({ default: () => 'ADMIN USERS PAGE' }));
vi.mock('./pages/AdminModels.jsx', () => ({ default: () => 'ADMIN MODELS PAGE' }));
vi.mock('./pages/ModelPerformance.jsx', () => ({ default: () => 'MODEL REPORT (read-only) PAGE' }));

const as = (me) => fakeClient({ 'GET /auth/me': me ? ok(me) : httpError(401) });
const open = (route, me) => renderWithAuth(<App />, { client: as(me), route });

describe('App routes: administration area', () => {
  it.each(['/admin/users', '/admin/models', '/admin', '/users'])('a signed-out visitor to %s is sent to the login page', async (route) => {
    open(route, null);
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it.each(['/admin/users', '/admin/models', '/admin', '/users'])('a plain user at %s sees "Access denied" and none of the admin pages', async (route) => {
    open(route, USER);
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.queryByText('ADMIN USERS PAGE')).not.toBeInTheDocument();
    expect(screen.queryByText('ADMIN MODELS PAGE')).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  it('an admin gets the administration frame with both pages', async () => {
    open('/admin/users', ADMIN);
    expect(await screen.findByText('ADMIN USERS PAGE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'User management' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'Model management' })).toHaveAttribute('href', '/admin/models');
  });

  it('/admin/models shows model management; /admin and the old /users both land on user management', async () => {
    open('/admin/models', ADMIN);
    expect(await screen.findByText('ADMIN MODELS PAGE')).toBeInTheDocument();
  });

  it.each(['/admin', '/users'])('an admin at %s is redirected to /admin/users', async (route) => {
    open(route, ADMIN);
    expect(await screen.findByText('ADMIN USERS PAGE')).toBeInTheDocument();
  });
});

describe('App routes: shared pages', () => {
  it.each([[USER], [ADMIN]])('/models is the read-only report for both roles (%#)', async (me) => {
    open('/models', me);
    expect(await screen.findByText('MODEL REPORT (read-only) PAGE')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN MODELS PAGE')).not.toBeInTheDocument();
  });

  it('ordinary pages still work for a user, and unknown addresses reach the not-found page', async () => {
    open('/portfolio', USER);
    expect(await screen.findByText('PORTFOLIO PAGE')).toBeInTheDocument();
  });

  it('unknown address', async () => {
    open('/no/such/page', USER);
    expect(await screen.findByText('NOT FOUND PAGE')).toBeInTheDocument();
  });

  it('the News page is gone: /news is just another unknown address', async () => {
    open('/news', USER);
    expect(await screen.findByText('NOT FOUND PAGE')).toBeInTheDocument();
  });
});

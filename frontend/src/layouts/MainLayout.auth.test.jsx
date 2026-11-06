import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import MainLayout from './MainLayout.jsx';
import { ADMIN, USER, fakeClient, ok, renderWithAuth } from '../test/authTestUtils.jsx';

// Heavy neighbours are replaced: this file only checks what the layout shows per role.
vi.mock('../components/AlphaChat.jsx', () => ({ default: () => null }));
vi.mock('../components/CommandPalette.jsx', () => ({ default: () => null }));
vi.mock('../components/TickerTape.jsx', () => ({ default: () => null }));
vi.mock('../components/Footer', () => ({ default: () => null }));
vi.mock('../components/MarketStatusPill.jsx', () => ({
  default: () => null, DataSourcePill: () => null, ServicePill: () => null
}));
vi.mock('../services/api.js', () => ({
  api: { health: () => Promise.resolve({ down: true }), overview: () => Promise.resolve({ indices: [] }) }
}));

beforeAll(() => { window.scrollTo = vi.fn(); });

const app = (
  <Routes>
    <Route path="/login" element={<p>LOGIN STUB</p>} />
    <Route element={<MainLayout />}>
      <Route index element={<p>HOME CONTENT</p>} />
      <Route path="users" element={<p>USERS CONTENT</p>} />
    </Route>
  </Routes>
);
const mount = (me, extra = {}, opts = {}) => {
  const client = fakeClient({ 'GET /auth/me': ok(me), 'POST /auth/logout': ok('ok'), ...extra });
  renderWithAuth(app, { client, ...opts });
  return client;
};
const openMenu = async (name = 'Account menu') => fireEvent.click(await screen.findByRole('button', { name }));

describe('MainLayout: role-based display', () => {
  it('a plain user has no administration entries but does get the read-only model performance page', async () => {
    mount(USER);
    await screen.findByRole('button', { name: 'Account menu' });
    expect(screen.queryByRole('link', { name: 'User management' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Model management' })).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Model performance' })).toHaveAttribute('href', '/models');
  });

  it('an administrator gets an Administration group with user and model management', async () => {
    mount(ADMIN);
    expect(await screen.findByRole('link', { name: 'User management' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'Model management' })).toHaveAttribute('href', '/admin/models');
    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Model performance' })).toHaveAttribute('href', '/models'); // shared page stays
  });

  it('the account menu shows the display name (or username) and the role', async () => {
    mount(ADMIN);
    await openMenu();
    expect(screen.getByRole('menu')).toHaveTextContent('Boss Person');
    expect(screen.getByRole('menu')).toHaveTextContent('Administrator');
  });

  it('falls back to the username and shows the user role', async () => {
    mount(USER);
    await openMenu();
    expect(screen.getByRole('menu')).toHaveTextContent('staff');
    expect(screen.getByRole('menu')).toHaveTextContent('User');
  });

  it('sign out calls POST /auth/logout and lands on /login', async () => {
    const client = mount(USER);
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('LOGIN STUB')).toBeInTheDocument();
    expect(client.calls.some((c) => c.method === 'POST' && c.url === '/auth/logout')).toBe(true);
  });

  it('"Change password" opens the dialog', async () => {
    mount(USER);
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change password' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Current password');
  });

  it('Escape closes the account menu', async () => {
    mount(USER);
    await openMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('menu texts are available in Vietnamese', async () => {
    mount(ADMIN, {}, { lang: 'vi' });
    await openMenu('Menu tài khoản');
    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản lý người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản lý mô hình' })).toBeInTheDocument();
    expect(screen.getByText('Quản trị')).toBeInTheDocument();
  });
});

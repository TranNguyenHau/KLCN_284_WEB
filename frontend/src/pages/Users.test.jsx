import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import Users from './Users.jsx';
import { ADMIN, USER, fakeClient, httpError, ok, renderWithAuth } from '../test/authTestUtils.jsx';

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function setup(extra = {}) {
  const rows = [ADMIN, USER];
  const client = fakeClient({
    'GET /auth/me': ok(ADMIN),
    'GET /auth/users': ok(rows),
    'PATCH /auth/users/2': (body) => ok({ ...USER, ...body }),
    ...extra
  });
  renderWithAuth(<Users />, { client });
  return client;
}
const rowOf = async (name) => within(await screen.findByTestId(`user-row-${name}`));
const patchCalls = (client) => client.calls.filter((c) => c.method === 'PATCH');

describe('Users page (admin)', () => {
  it('lists accounts, marks the current admin and shows their status', async () => {
    setup();
    const boss = await rowOf('boss');
    expect(boss.getByText('you')).toBeInTheDocument();
    expect(boss.getByText('Active')).toBeInTheDocument();
    expect((await rowOf('staff')).queryByText('you')).not.toBeInTheDocument();
  });

  it('changing the role sends only vai_tro and updates the row', async () => {
    const client = setup();
    await rowOf('staff');
    fireEvent.change(screen.getByLabelText('Role staff'), { target: { value: 'admin' } });
    await waitFor(() => expect(screen.getByLabelText('Role staff')).toHaveValue('admin'));
    expect(patchCalls(client)[0]).toMatchObject({ url: '/auth/users/2', body: { vai_tro: 'admin' } });
    expect(await screen.findByText('User updated.')).toBeInTheDocument();
  });

  it('the disable button sends dang_hoat_dong=false and the row flips to Disabled / Enable', async () => {
    const client = setup();
    const staff = await rowOf('staff');
    fireEvent.click(staff.getByRole('button', { name: 'Disable' }));
    await waitFor(async () => expect((await rowOf('staff')).getByText('Disabled')).toBeInTheDocument());
    expect(patchCalls(client)[0].body).toEqual({ dang_hoat_dong: false });
    expect((await rowOf('staff')).getByRole('button', { name: 'Enable' })).toBeInTheDocument();
  });

  it('409 from the server (last active admin) → specific message, the row is unchanged', async () => {
    setup({ 'PATCH /auth/users/2': httpError(409) });
    const staff = await rowOf('staff');
    fireEvent.click(staff.getByRole('button', { name: 'Disable' }));
    expect(await screen.findByText('The last active administrator cannot be demoted or disabled.')).toBeInTheDocument();
    expect((await rowOf('staff')).getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('server text that must never be shown')).not.toBeInTheDocument();
  });

  it('403 on the list (not an admin on the server) → error with retry, no table', async () => {
    let answer = httpError(403);
    setup({ 'GET /auth/users': () => answer });
    expect(await screen.findByRole('alert')).toHaveTextContent('access denied');
    expect(screen.queryByTestId('user-row-boss')).not.toBeInTheDocument();
    answer = ok([ADMIN]);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('user-row-boss')).toBeInTheDocument();
  });

  it('create: validates locally, then posts the chosen role and appends the row', async () => {
    const created = { ...USER, ma_nguoi_dung: 9, ten_dang_nhap: 'made', email: 'made@example.test', vai_tro: 'admin' };
    const client = setup({ 'POST /auth/users': ok(created, 201) });
    await rowOf('boss');
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Username must be 3-50 characters');
    type('Username', 'made');
    type('Email', 'made@example.test');
    type('Password', 'pw-for-test');
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByTestId('user-row-made')).toBeInTheDocument();
    expect(client.calls.find((c) => c.method === 'POST' && c.url === '/auth/users').body).toEqual({
      ten_dang_nhap: 'made', email: 'made@example.test', password: 'pw-for-test', vai_tro: 'admin'
    });
    expect(await screen.findByText('User created.')).toBeInTheDocument();
  });

  it('create: 409 duplicate shows the generic duplicate message', async () => {
    setup({ 'POST /auth/users': httpError(409) });
    await rowOf('boss');
    type('Username', 'made');
    type('Email', 'made@example.test');
    type('Password', 'pw-for-test');
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That username or email cannot be used.');
  });

  it('Vietnamese strings are present', async () => {
    renderWithAuth(<Users />, {
      client: fakeClient({ 'GET /auth/me': ok(ADMIN), 'GET /auth/users': ok([ADMIN]) }), lang: 'vi'
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Người dùng' })).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
  });
});

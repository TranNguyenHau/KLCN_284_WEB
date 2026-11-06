import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import Users from './Users.jsx';
import { ADMIN, USER, fakeClient, httpError, ok, renderWithAuth } from '../test/authTestUtils.jsx';

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const CREATED = '2026-10-01T08:00:00+00:00';

/** A tiny stateful fake of the admin API, so "the list refreshes after every change" is really exercised. */
function setup(overrides = {}) {
  const store = [
    { ...ADMIN, ngay_tao: CREATED },
    { ...USER, ho_ten: null, ngay_tao: CREATED }
  ];
  const find = (url) => store.find((r) => r.ma_nguoi_dung === Number(url.split('/').pop()));
  const client = fakeClient({
    'GET /auth/me': ok(ADMIN),
    'GET /admin/users': () => ok(store.map((r) => ({ ...r }))),
    'PATCH /admin/users/2': (body) => { Object.assign(find('/2'), body); return ok(find('/2')); },
    'DELETE /admin/users/2': () => { store.splice(store.indexOf(find('/2')), 1); return ok({ ma_nguoi_dung: 2 }); },
    ...overrides
  });
  renderWithAuth(<Users />, { client });
  return { client, store };
}
const rowOf = async (name) => within(await screen.findByTestId(`user-row-${name}`));
const callsOf = (client, method) => client.calls.filter((c) => c.method === method && c.url !== '/auth/me');

describe('Users page (admin): list, search and filters', () => {
  it('lists accounts with all columns, marks the current admin and shows status', async () => {
    setup();
    for (const column of ['Username', 'Full name', 'Email', 'Role', 'Status', 'Created', 'Last sign-in']) {
      expect(await screen.findByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    const boss = await rowOf('boss');
    expect(boss.getByText('you')).toBeInTheDocument();
    expect(boss.getByText('Boss Person')).toBeInTheDocument();
    expect(boss.getByText('Active')).toBeInTheDocument();
    expect((await rowOf('staff')).queryByText('you')).not.toBeInTheDocument();
    expect(screen.getByText('2 of 2 accounts')).toBeInTheDocument();
  });

  it('search matches username, name or email; the role filter narrows further; no match says so', async () => {
    setup();
    await rowOf('staff');
    fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'boss person' } });
    expect(screen.queryByTestId('user-row-staff')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-row-boss')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'STAFF@example' } });
    expect(screen.getByTestId('user-row-staff')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'admin' } });
    expect(await screen.findByText('No account matches the filter.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: '' } });
    expect(screen.getByTestId('user-row-boss')).toBeInTheDocument();
    expect(screen.queryByTestId('user-row-staff')).not.toBeInTheDocument();
  });

  it('403 on the list (not an admin on the server) → error with retry, no table', async () => {
    let answer = httpError(403);
    setup({ 'GET /admin/users': () => answer });
    expect(await screen.findByRole('alert')).toHaveTextContent('access denied');
    expect(screen.queryByTestId('user-row-boss')).not.toBeInTheDocument();
    answer = ok([ADMIN]);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('user-row-boss')).toBeInTheDocument();
  });
});

describe('Users page (admin): role, status', () => {
  it('changing the role sends only vai_tro, then the list is reloaded from the server', async () => {
    const { client } = setup();
    await rowOf('staff');
    fireEvent.change(screen.getByLabelText('Role staff'), { target: { value: 'admin' } });
    await waitFor(() => expect(screen.getByLabelText('Role staff')).toHaveValue('admin'));
    expect(callsOf(client, 'PATCH')[0]).toMatchObject({ url: '/admin/users/2', body: { vai_tro: 'admin' } });
    expect(callsOf(client, 'GET').filter((c) => c.url === '/admin/users')).toHaveLength(2); // initial + refresh
    expect(await screen.findByText('User updated.')).toBeInTheDocument();
  });

  it('the disable button sends dang_hoat_dong=false and the row flips to Disabled / Enable', async () => {
    const { client } = setup();
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Disable' }));
    await waitFor(async () => expect((await rowOf('staff')).getByText('Disabled')).toBeInTheDocument());
    expect(callsOf(client, 'PATCH')[0].body).toEqual({ dang_hoat_dong: false });
    expect((await rowOf('staff')).getByRole('button', { name: 'Enable' })).toBeInTheDocument();
  });

  it('409 LAST_ADMIN → specific message, row unchanged', async () => {
    setup({ 'PATCH /admin/users/2': httpError(409, { reason: 'LAST_ADMIN' }) });
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Disable' }));
    expect(await screen.findByText('The last active administrator cannot be demoted or disabled.')).toBeInTheDocument();
    expect((await rowOf('staff')).getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('server text that must never be shown')).not.toBeInTheDocument();
  });
});

describe('Users page (admin): edit', () => {
  it('edit dialog saves name and email, closes, toasts and refreshes the list', async () => {
    const { client } = setup();
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit account' });
    fireEvent.change(within(dialog).getByLabelText('Full name'), { target: { value: '  Nguyen Van A ' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'NEW@example.test' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Account updated.')).toBeInTheDocument();
    expect(callsOf(client, 'PATCH')[0].body).toEqual({ ho_ten: 'Nguyen Van A', email: 'new@example.test' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await rowOf('staff')).getByText('Nguyen Van A')).toBeInTheDocument();
  });

  it('invalid email is rejected locally (no request); a taken email shows its own message inside the dialog', async () => {
    const { client } = setup({ 'PATCH /admin/users/2': httpError(409, { reason: 'EMAIL_TAKEN' }) });
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit account' });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(callsOf(client, 'PATCH')).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'boss@example.test' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('already used by another account'));
  });

  it('Cancel closes the dialog without a request', async () => {
    const { client } = setup();
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsOf(client, 'PATCH')).toHaveLength(0);
  });
});

describe('Users page (admin): delete with confirmation', () => {
  it('asks first; Cancel does nothing; Delete removes the account and refreshes', async () => {
    const { client } = setup();
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete account' });
    expect(dialog).toHaveTextContent('"staff"');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(callsOf(client, 'DELETE')).toHaveLength(0);
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete account' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Account deleted.')).toBeInTheDocument();
    expect(callsOf(client, 'DELETE')[0].url).toBe('/admin/users/2');
    await waitFor(() => expect(screen.queryByTestId('user-row-staff')).not.toBeInTheDocument());
  });

  it('the Delete button of your own account is disabled', async () => {
    setup();
    expect((await rowOf('boss')).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it.each([
    ['HAS_RELATED_DATA', 'cannot be deleted. Disable it instead.'],
    ['LAST_ADMIN', 'The last active administrator cannot be deleted.'],
    ['SELF_DELETE', 'You cannot delete the account you are signed in with.']
  ])('409 %s → its own message inside the dialog, the dialog stays open and the account remains', async (reason, text) => {
    setup({ 'DELETE /admin/users/2': httpError(409, { reason }) });
    fireEvent.click((await rowOf('staff')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete account' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByTestId('user-row-staff')).toBeInTheDocument();
    expect(screen.queryByText('server text that must never be shown')).not.toBeInTheDocument();
  });
});

describe('Users page (admin): create', () => {
  it('validates locally, then posts the chosen role and the list shows the new account', async () => {
    const created = { ...USER, ma_nguoi_dung: 9, ten_dang_nhap: 'made', email: 'made@example.test', vai_tro: 'admin', ngay_tao: CREATED };
    const { client, store } = setup({ 'POST /admin/users': (body) => { store.push(created); return ok(created, 201); } });
    await rowOf('boss');
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Username must be 3-50 characters');
    type('Username', 'made');
    type('Email', 'made@example.test');
    type('Password', 'pw-for-test');
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByTestId('user-row-made')).toBeInTheDocument();
    expect(client.calls.find((c) => c.method === 'POST' && c.url === '/admin/users').body).toEqual({
      ten_dang_nhap: 'made', email: 'made@example.test', password: 'pw-for-test', vai_tro: 'admin'
    });
    expect(await screen.findByText('User created.')).toBeInTheDocument();
  });

  it('409 duplicate shows the generic duplicate message', async () => {
    setup({ 'POST /admin/users': httpError(409, { reason: 'DUPLICATE' }) });
    await rowOf('boss');
    type('Username', 'made');
    type('Email', 'made@example.test');
    type('Password', 'pw-for-test');
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That username or email cannot be used.');
  });
});

describe('Users page (admin): Vietnamese', () => {
  it('strings are present in Vietnamese', async () => {
    renderWithAuth(<Users />, {
      client: fakeClient({ 'GET /auth/me': ok(ADMIN), 'GET /admin/users': ok([{ ...ADMIN, ngay_tao: CREATED }]) }), lang: 'vi'
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Quản lý người dùng' })).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa' })).toBeDisabled();
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { useUserFormDialog } from './use-user-form-dialog.js';
import type { ChangeRoleFetcher, ChangeRoleOutcome } from '../../lib/change-role.js';
import type { CreateAccountFetcher, CreateAccountOutcome } from '../../lib/create-account.js';
import type { UpdateAccountFetcher, UpdateAccountOutcome } from '../../lib/update-account.js';

const EXISTING_ACCOUNT: AdminUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee',
  isActive: true,
};

const NEW_ACCOUNT: AdminUser = {
  id: 'new-id',
  fullName: 'Priya Raman',
  email: 'priya@company.com',
  role: 'employee',
  isActive: true,
};

const UPDATED_ACCOUNT: AdminUser = { ...EXISTING_ACCOUNT, fullName: 'Dana Okafor', email: 'dana.okafor@company.com' };

const CREATE_FIELDS = { fullName: 'Priya Raman', email: 'priya@company.com', role: 'employee' as const, password: 'Correct-Horse7' };
// `role: 'employee'` — SAME as EXISTING_ACCOUNT.role, i.e. unchanged, the default for every test
// in this file that is not specifically about US-024's role handling below.
const UPDATE_FIELDS = { fullName: 'Dana Okafor', email: 'dana.okafor@company.com', role: 'employee' as const };
const notUsedChangeRole: ChangeRoleFetcher = () => {
  throw new Error('changeRole not stubbed — this test does not exercise a role change');
};

function renderDialog(
  createAccount: CreateAccountFetcher = vi.fn(),
  updateAccount: UpdateAccountFetcher = vi.fn(),
  onCreated = vi.fn(),
  onUpdated = vi.fn(),
  changeRole: ChangeRoleFetcher = notUsedChangeRole,
) {
  return renderHook(() => useUserFormDialog(createAccount, updateAccount, changeRole, onCreated, onUpdated));
}

describe('useUserFormDialog — create mode (US-021)', () => {
  it('is closed until openAdd() is called', () => {
    const { result } = renderDialog();
    expect(result.current.dialog).toBeUndefined();

    act(() => result.current.openAdd());

    expect(result.current.dialog).toEqual({ mode: 'create', busy: false });
  });

  it('submit() on success calls onCreated with the new account and closes the dialog (US-021/AC-01)', async () => {
    const createAccount: CreateAccountFetcher = async () => ({ kind: 'ok', account: NEW_ACCOUNT });
    const onCreated = vi.fn();
    const { result } = renderDialog(createAccount, vi.fn(), onCreated);

    act(() => result.current.openAdd());
    act(() => result.current.submit(CREATE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(onCreated).toHaveBeenCalledWith(NEW_ACCOUNT);
  });

  it('submit() issues exactly one request even when called twice while one is in flight (US-021/AC-08)', async () => {
    let resolveCreate!: (outcome: CreateAccountOutcome) => void;
    const createAccount = vi.fn(() => new Promise<CreateAccountOutcome>((resolve) => (resolveCreate = resolve)));
    const { result } = renderDialog(createAccount);

    act(() => result.current.openAdd());
    act(() => result.current.submit(CREATE_FIELDS));
    act(() => result.current.submit(CREATE_FIELDS));

    expect(createAccount).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveCreate({ kind: 'ok', account: NEW_ACCOUNT });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('submit() on a duplicate sets outcome duplicate with the server\'s facts (US-021/AC-06)', async () => {
    const createAccount: CreateAccountFetcher = async () => ({ kind: 'duplicate', fullName: 'Existing Holder', isActive: true });
    const { result } = renderDialog(createAccount);

    act(() => result.current.openAdd());
    act(() => result.current.submit(CREATE_FIELDS));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({
        mode: 'create',
        busy: false,
        outcome: 'duplicate',
        duplicateFullName: 'Existing Holder',
        duplicateIsActive: true,
      }),
    );
  });

  it('submit() on failure sets outcome failed, dialog stays open, onCreated never called (US-021/AC-11)', async () => {
    const createAccount: CreateAccountFetcher = async () => ({ kind: 'failed' });
    const onCreated = vi.fn();
    const { result } = renderDialog(createAccount, vi.fn(), onCreated);

    act(() => result.current.openAdd());
    act(() => result.current.submit(CREATE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ mode: 'create', outcome: 'failed', busy: false }));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('dismiss() closes the dialog regardless of state', () => {
    const { result } = renderDialog();

    act(() => result.current.openAdd());
    act(() => result.current.dismiss());

    expect(result.current.dialog).toBeUndefined();
  });
});

describe('useUserFormDialog — edit mode (US-023/AC-01, AC-02, AC-08)', () => {
  it('openEdit(account) opens with mode edit and the subject account carried', () => {
    const { result } = renderDialog();

    act(() => result.current.openEdit(EXISTING_ACCOUNT));

    expect(result.current.dialog).toEqual({ mode: 'edit', account: EXISTING_ACCOUNT, busy: false });
  });

  it('submit() on success calls onUpdated with the updated account, and closes (US-023/AC-01)', async () => {
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'ok', account: UPDATED_ACCOUNT });
    const onUpdated = vi.fn();
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), onUpdated);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(UPDATE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(onUpdated).toHaveBeenCalledWith(UPDATED_ACCOUNT);
  });

  it('submit() dispatches to updateAccount with the SUBJECT account\'s id, not a fresh lookup — role stripped, updateAccount never receives it (US-024)', async () => {
    const calls: Array<[string, unknown]> = [];
    const updateAccount: UpdateAccountFetcher = async (id, fields) => {
      calls.push([id, fields]);
      return { kind: 'ok', account: UPDATED_ACCOUNT };
    };
    const { result } = renderDialog(vi.fn(), updateAccount);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(UPDATE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(calls).toEqual([[EXISTING_ACCOUNT.id, { fullName: UPDATE_FIELDS.fullName, email: UPDATE_FIELDS.email }]]);
  });

  it('submit() issues exactly one request even when called twice while one is in flight — the SAME inFlight guard as create (US-023/AC-08)', async () => {
    let resolveUpdate!: (outcome: UpdateAccountOutcome) => void;
    const updateAccount = vi.fn(() => new Promise<UpdateAccountOutcome>((resolve) => (resolveUpdate = resolve)));
    const { result } = renderDialog(vi.fn(), updateAccount);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(UPDATE_FIELDS));
    act(() => result.current.submit(UPDATE_FIELDS));

    expect(updateAccount).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveUpdate({ kind: 'ok', account: UPDATED_ACCOUNT });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('submit() on a duplicate sets outcome duplicate with the server\'s facts, dialog stays open, onUpdated never called (US-023/AC-02)', async () => {
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'duplicate', fullName: 'Existing Holder', isActive: true });
    const onUpdated = vi.fn();
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), onUpdated);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(UPDATE_FIELDS));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({
        mode: 'edit',
        account: EXISTING_ACCOUNT,
        busy: false,
        outcome: 'duplicate',
        duplicateFullName: 'Existing Holder',
        duplicateIsActive: true,
      }),
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('submit() on failure sets outcome failed, dialog stays open, onUpdated never called (US-023/AC-08)', async () => {
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'failed' });
    const onUpdated = vi.fn();
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), onUpdated);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(UPDATE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ mode: 'edit', outcome: 'failed', busy: false }));
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('dismiss() closes the dialog regardless of state', () => {
    const { result } = renderDialog();

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.dismiss());

    expect(result.current.dialog).toBeUndefined();
  });
});

describe('useUserFormDialog — edit mode, role change (US-024/AC-01, AC-04, AC-08, D-01)', () => {
  const PROMOTE_FIELDS = { fullName: 'Dana Silva', email: 'dana@company.com', role: 'admin' as const };

  it('when the role is UNCHANGED, changeRole is never called — the exact pre-US-024 single-request path', async () => {
    const changeRole = vi.fn();
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'ok', account: UPDATED_ACCOUNT });
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), vi.fn(), changeRole);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(UPDATE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(changeRole).not.toHaveBeenCalled();
  });

  it('when the role DIFFERS, changeRole is called FIRST, with the target role (D-01)', async () => {
    const calls: unknown[] = [];
    const changeRole: ChangeRoleFetcher = async (id, role) => {
      calls.push({ id, role });
      return { kind: 'ok', account: { ...EXISTING_ACCOUNT, role } };
    };
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'ok', account: { ...EXISTING_ACCOUNT, role: 'admin' } });
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), vi.fn(), changeRole);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(PROMOTE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(calls).toEqual([{ id: EXISTING_ACCOUNT.id, role: 'admin' }]);
  });

  it('a successful role change proceeds to updateAccount for the name/email fields, then calls onUpdated once with the FINAL account (D-01)', async () => {
    const order: string[] = [];
    const changeRole: ChangeRoleFetcher = async () => {
      order.push('changeRole');
      return { kind: 'ok', account: { ...EXISTING_ACCOUNT, role: 'admin' } };
    };
    const updateAccount: UpdateAccountFetcher = async () => {
      order.push('updateAccount');
      return { kind: 'ok', account: { ...EXISTING_ACCOUNT, role: 'admin' } };
    };
    const onUpdated = vi.fn();
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), onUpdated, changeRole);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(PROMOTE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(order).toEqual(['changeRole', 'updateAccount']);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith({ ...EXISTING_ACCOUNT, role: 'admin' });
  });

  it('a BLOCKED role change sets outcome lastAdmin and NEVER calls updateAccount — nothing has been saved (US-024/AC-04, AC-08)', async () => {
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'blocked' });
    const updateAccount = vi.fn();
    const onUpdated = vi.fn();
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), onUpdated, changeRole);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(PROMOTE_FIELDS));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({ mode: 'edit', account: EXISTING_ACCOUNT, busy: false, outcome: 'lastAdmin' }),
    );
    expect(updateAccount).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('a FAILED role change sets outcome failed, and NEVER calls updateAccount (US-024/AC-10)', async () => {
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'failed' });
    const updateAccount = vi.fn();
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), vi.fn(), changeRole);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(PROMOTE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'failed', busy: false }));
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it('a role change that succeeds but whose FOLLOWING updateAccount fails still ends in outcome failed (D-04, issue #57 — accepted residual)', async () => {
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'ok', account: { ...EXISTING_ACCOUNT, role: 'admin' } });
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'failed' });
    const onUpdated = vi.fn();
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), onUpdated, changeRole);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(PROMOTE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'failed', busy: false }));
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('issues exactly one changeRole call even when submit() is called twice while one is in flight — the SAME inFlight guard (US-024/AC-08)', async () => {
    let resolveChangeRole!: (outcome: ChangeRoleOutcome) => void;
    const changeRole = vi.fn(() => new Promise<ChangeRoleOutcome>((resolve) => (resolveChangeRole = resolve)));
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'ok', account: { ...EXISTING_ACCOUNT, role: 'admin' } });
    const { result } = renderDialog(vi.fn(), updateAccount, vi.fn(), vi.fn(), changeRole);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(PROMOTE_FIELDS));
    act(() => result.current.submit(PROMOTE_FIELDS));

    expect(changeRole).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveChangeRole({ kind: 'ok', account: { ...EXISTING_ACCOUNT, role: 'admin' } });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });
});

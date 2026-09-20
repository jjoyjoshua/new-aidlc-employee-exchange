import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { useUserFormDialog } from './use-user-form-dialog.js';
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
const UPDATE_FIELDS = { fullName: 'Dana Okafor', email: 'dana.okafor@company.com' };

function renderDialog(
  createAccount: CreateAccountFetcher = vi.fn(),
  updateAccount: UpdateAccountFetcher = vi.fn(),
  onCreated = vi.fn(),
  onUpdated = vi.fn(),
) {
  return renderHook(() => useUserFormDialog(createAccount, updateAccount, onCreated, onUpdated));
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

  it('submit() dispatches to updateAccount with the SUBJECT account\'s id, not a fresh lookup', async () => {
    const calls: Array<[string, unknown]> = [];
    const updateAccount: UpdateAccountFetcher = async (id, fields) => {
      calls.push([id, fields]);
      return { kind: 'ok', account: UPDATED_ACCOUNT };
    };
    const { result } = renderDialog(vi.fn(), updateAccount);

    act(() => result.current.openEdit(EXISTING_ACCOUNT));
    act(() => result.current.submit(UPDATE_FIELDS));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(calls).toEqual([[EXISTING_ACCOUNT.id, UPDATE_FIELDS]]);
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

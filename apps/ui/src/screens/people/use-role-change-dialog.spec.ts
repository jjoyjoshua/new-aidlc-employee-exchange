import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { useRoleChangeDialog } from './use-role-change-dialog.js';
import type { ChangeRoleFetcher, ChangeRoleOutcome } from '../../lib/change-role.js';

const EMPLOYEE: AdminUser = { id: 'u1', fullName: 'Priya Raman', email: 'priya@company.com', role: 'employee', isActive: true };
const ADMIN: AdminUser = { id: 'u2', fullName: 'Marcus Vale', email: 'marcus@company.com', role: 'admin', isActive: true };

describe('useRoleChangeDialog — open computes the target role as the OPPOSITE of the current one (US-024/AC-01)', () => {
  it('opening on an Employee targets admin', () => {
    const { result } = renderHook(() => useRoleChangeDialog(vi.fn(), vi.fn(), vi.fn()));
    act(() => result.current.open(EMPLOYEE));
    expect(result.current.dialog).toEqual({ account: EMPLOYEE, targetRole: 'admin', busy: false });
  });

  it('opening on an Admin targets employee', () => {
    const { result } = renderHook(() => useRoleChangeDialog(vi.fn(), vi.fn(), vi.fn()));
    act(() => result.current.open(ADMIN));
    expect(result.current.dialog).toEqual({ account: ADMIN, targetRole: 'employee', busy: false });
  });
});

describe('useRoleChangeDialog — confirm() success (US-024/AC-01, AC-11)', () => {
  it('calls changeRole with the target role, then onChanged with the returned account, and closes', async () => {
    const updated: AdminUser = { ...EMPLOYEE, role: 'admin' };
    const changeRole: ChangeRoleFetcher = vi.fn(async (): Promise<ChangeRoleOutcome> => ({ kind: 'ok', account: updated }));
    const onChanged = vi.fn();
    const { result } = renderHook(() => useRoleChangeDialog(changeRole, onChanged, vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(changeRole).toHaveBeenCalledWith(EMPLOYEE.id, 'admin');
    expect(onChanged).toHaveBeenCalledWith(updated);
  });
});

describe('useRoleChangeDialog — no optimistic update, busy while in flight, Escape suppressed is the dialog\'s own job (US-024/AC-09)', () => {
  it('issues exactly one request even when confirm() is called twice while one is in flight (US-024/AC-09)', async () => {
    let resolve!: (outcome: ChangeRoleOutcome) => void;
    const changeRole = vi.fn(() => new Promise<ChangeRoleOutcome>((r) => (resolve = r)));
    const { result } = renderHook(() => useRoleChangeDialog(changeRole, vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());
    act(() => result.current.confirm());

    expect(changeRole).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolve({ kind: 'ok', account: { ...EMPLOYEE, role: 'admin' } });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });
});

describe('useRoleChangeDialog — blocked (US-024/AC-04, AC-06)', () => {
  it('sets the blocked outcome, dialog stays open, role unchanged, onChanged never called', async () => {
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'blocked' });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useRoleChangeDialog(changeRole, onChanged, vi.fn()));

    act(() => result.current.open(ADMIN));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toMatchObject({ busy: false, outcome: 'blocked' }));
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('useRoleChangeDialog — failed (US-024/AC-10)', () => {
  it('sets the failed outcome, dialog stays open, retryable', async () => {
    const changeRole = vi
      .fn<ChangeRoleFetcher>()
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValueOnce({ kind: 'ok', account: { ...EMPLOYEE, role: 'admin' } });
    const { result } = renderHook(() => useRoleChangeDialog(changeRole, vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'failed' }));

    act(() => result.current.confirm());
    await waitFor(() => expect(changeRole).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });
});

describe('useRoleChangeDialog — dismiss()', () => {
  it('closes the dialog with no side effect', () => {
    const { result } = renderHook(() => useRoleChangeDialog(vi.fn(), vi.fn(), vi.fn()));
    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.dismiss());
    expect(result.current.dialog).toBeUndefined();
  });
});

describe('useRoleChangeDialog — routeToPromote() (US-024/AC-05)', () => {
  it('closes the dialog AND calls onRouteToPromote — the "Make someone an admin" primary action on the blocked refusal', async () => {
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'blocked' });
    const onRouteToPromote = vi.fn();
    const { result } = renderHook(() => useRoleChangeDialog(changeRole, vi.fn(), onRouteToPromote));

    act(() => result.current.open(ADMIN));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'blocked' }));

    act(() => result.current.routeToPromote());

    expect(result.current.dialog).toBeUndefined();
    // Deferred past this tick on purpose — see the hook's own docblock: it must run AFTER
    // `Dialog`'s unmount-time focus restore, or that restore would win the race.
    await waitFor(() => expect(onRouteToPromote).toHaveBeenCalledTimes(1));
  });
});

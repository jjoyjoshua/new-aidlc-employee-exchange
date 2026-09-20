import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { useResetPasswordDialog } from './use-reset-password-dialog.js';
import type { ResetPasswordFetcher, ResetPasswordOutcome } from '../../lib/reset-password.js';

const EMPLOYEE: AdminUser = { id: 'u1', fullName: 'Priya Raman', email: 'priya@company.com', role: 'employee', isActive: true };
const PASSWORD = 'q4Lm1I0oTz8v';

describe('useResetPasswordDialog — open() (US-027/AC-02, ST-10)', () => {
  it('opens in the confirm phase, not busy', () => {
    const { result } = renderHook(() => useResetPasswordDialog(vi.fn()));
    act(() => result.current.open(EMPLOYEE));
    expect(result.current.dialog).toEqual({ phase: 'confirm', account: EMPLOYEE, busy: false });
  });
});

describe('useResetPasswordDialog — confirm() success switches phase, the SAME dialog stays mounted (US-027/AC-01, AC-03)', () => {
  it('calls resetPassword with the account id, then switches to the result phase carrying the password — never closes', async () => {
    const resetPassword: ResetPasswordFetcher = vi.fn(
      async (): Promise<ResetPasswordOutcome> => ({ kind: 'ok', account: EMPLOYEE, password: PASSWORD }),
    );
    const { result } = renderHook(() => useResetPasswordDialog(resetPassword));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toEqual({ phase: 'result', account: EMPLOYEE, password: PASSWORD }));
    expect(resetPassword).toHaveBeenCalledWith(EMPLOYEE.id);
  });
});

describe('useResetPasswordDialog — busy while in flight, exactly one request on a double confirm() (US-027/AC-09)', () => {
  it('issues exactly one request even when confirm() is called twice while one is in flight', async () => {
    let resolve!: (outcome: ResetPasswordOutcome) => void;
    const resetPassword = vi.fn(() => new Promise<ResetPasswordOutcome>((r) => (resolve = r)));
    const { result } = renderHook(() => useResetPasswordDialog(resetPassword));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());
    act(() => result.current.confirm());

    expect(resetPassword).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ phase: 'confirm', busy: true });

    resolve({ kind: 'ok', account: EMPLOYEE, password: PASSWORD });
    await waitFor(() => expect(result.current.dialog).toMatchObject({ phase: 'result' }));
  });
});

describe('useResetPasswordDialog — failed (US-027/AC-09, ST-13)', () => {
  it('sets the failed outcome, stays in the confirm phase, retryable', async () => {
    const resetPassword = vi
      .fn<ResetPasswordFetcher>()
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValueOnce({ kind: 'ok', account: EMPLOYEE, password: PASSWORD });
    const { result } = renderHook(() => useResetPasswordDialog(resetPassword));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toEqual({ phase: 'confirm', account: EMPLOYEE, busy: false, outcome: 'failed' }));

    act(() => result.current.confirm());
    await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.dialog).toMatchObject({ phase: 'result' }));
  });
});

describe('useResetPasswordDialog — dismiss() clears the password from state entirely (US-027/AC-05)', () => {
  it('closes the dialog from the confirm phase with no side effect', () => {
    const { result } = renderHook(() => useResetPasswordDialog(vi.fn()));
    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.dismiss());
    expect(result.current.dialog).toBeUndefined();
  });

  it('closes the dialog from the result phase — the password is not retrievable anywhere after (US-027/AC-05)', async () => {
    const resetPassword: ResetPasswordFetcher = async () => ({ kind: 'ok', account: EMPLOYEE, password: PASSWORD });
    const { result } = renderHook(() => useResetPasswordDialog(resetPassword));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ phase: 'result' }));

    act(() => result.current.dismiss());

    expect(result.current.dialog).toBeUndefined();
  });
});

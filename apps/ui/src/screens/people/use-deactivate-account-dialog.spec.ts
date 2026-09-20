import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { useDeactivateAccountDialog } from './use-deactivate-account-dialog.js';
import type {
  DeactivateAccountFetcher,
  DeactivateAccountOutcome,
  DeactivationPreviewFetcher,
  DeactivationPreviewOutcome,
} from '../../lib/deactivate-account.js';

const EMPLOYEE: AdminUser = { id: 'u1', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true };
const BOOKINGS = [{ id: 'b-1', deskNumber: 'A-01', date: '2026-09-17' as const }];

describe('useDeactivateAccountDialog — open() (US-025/AC-05)', () => {
  it('opens into the loading phase immediately, before the preview resolves', () => {
    const previewDeactivation = vi.fn(() => new Promise<DeactivationPreviewOutcome>(() => {}));
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, vi.fn(), vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));

    expect(result.current.dialog).toEqual({ account: EMPLOYEE, phase: 'loading', bookings: [], busy: false });
  });

  it('moves to ready with the resolved bookings once the preview succeeds', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: BOOKINGS });
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, vi.fn(), vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));

    await waitFor(() => expect(result.current.dialog).toEqual({ account: EMPLOYEE, phase: 'ready', bookings: BOOKINGS, busy: false }));
  });

  it('an empty preview moves to ready with an empty bookings array (US-025/AC-07)', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: [] });
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, vi.fn(), vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));

    await waitFor(() => expect(result.current.dialog).toEqual({ account: EMPLOYEE, phase: 'ready', bookings: [], busy: false }));
  });

  it('a failed preview sets outcome: "preview_failed" — nothing is known about upcoming bookings', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'failed' });
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, vi.fn(), vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({ account: EMPLOYEE, phase: 'ready', bookings: [], busy: false, outcome: 'preview_failed' }),
    );
  });

  it('a stale preview response for a DISMISSED dialog is ignored — no state update after dismiss()', async () => {
    let resolvePreview!: (outcome: DeactivationPreviewOutcome) => void;
    const previewDeactivation = vi.fn(() => new Promise<DeactivationPreviewOutcome>((r) => (resolvePreview = r)));
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, vi.fn(), vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.dismiss());

    resolvePreview({ kind: 'ok', bookings: BOOKINGS });
    await Promise.resolve();

    expect(result.current.dialog).toBeUndefined();
  });
});

describe('useDeactivateAccountDialog — confirm() success (US-025/AC-01, AC-02, AC-13)', () => {
  it('calls deactivateAccount with the id, then onDeactivated with the returned account, and closes', async () => {
    const deactivated: AdminUser = { ...EMPLOYEE, isActive: false };
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: BOOKINGS });
    const deactivateAccount: DeactivateAccountFetcher = vi.fn(async (): Promise<DeactivateAccountOutcome> => ({ kind: 'ok', account: deactivated }));
    const onDeactivated = vi.fn();
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, deactivateAccount, onDeactivated, vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    await waitFor(() => expect(result.current.dialog?.phase).toBe('ready'));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(deactivateAccount).toHaveBeenCalledWith(EMPLOYEE.id);
    expect(onDeactivated).toHaveBeenCalledWith(deactivated);
  });
});

describe('useDeactivateAccountDialog — no optimistic update, busy while in flight (US-025/AC-11)', () => {
  it('issues exactly one request even when confirm() is called twice while one is in flight (US-025/AC-11)', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: BOOKINGS });
    let resolve!: (outcome: DeactivateAccountOutcome) => void;
    const deactivateAccount = vi.fn(() => new Promise<DeactivateAccountOutcome>((r) => (resolve = r)));
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, deactivateAccount, vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    await waitFor(() => expect(result.current.dialog?.phase).toBe('ready'));
    act(() => result.current.confirm());
    act(() => result.current.confirm());

    expect(deactivateAccount).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolve({ kind: 'ok', account: { ...EMPLOYEE, isActive: false } });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('confirm() before the preview resolves does nothing — phase is still "loading"', async () => {
    const previewDeactivation = vi.fn(() => new Promise<DeactivationPreviewOutcome>(() => {}));
    const deactivateAccount = vi.fn();
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, deactivateAccount, vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.confirm());

    expect(deactivateAccount).not.toHaveBeenCalled();
  });
});

describe('useDeactivateAccountDialog — blocked (US-025/AC-10)', () => {
  it('sets the blocked outcome, dialog stays open, account unchanged, onDeactivated never called', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: [] });
    const deactivateAccount: DeactivateAccountFetcher = async () => ({ kind: 'blocked' });
    const onDeactivated = vi.fn();
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, deactivateAccount, onDeactivated, vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    await waitFor(() => expect(result.current.dialog?.phase).toBe('ready'));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toMatchObject({ busy: false, outcome: 'blocked' }));
    expect(onDeactivated).not.toHaveBeenCalled();
  });
});

describe('useDeactivateAccountDialog — failed (US-025/AC-11)', () => {
  it('sets the failed outcome, dialog stays open, retryable', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: [] });
    const deactivateAccount = vi
      .fn<DeactivateAccountFetcher>()
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValueOnce({ kind: 'ok', account: { ...EMPLOYEE, isActive: false } });
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, deactivateAccount, vi.fn(), vi.fn()));

    act(() => result.current.open(EMPLOYEE));
    await waitFor(() => expect(result.current.dialog?.phase).toBe('ready'));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'failed' }));

    act(() => result.current.confirm());
    await waitFor(() => expect(deactivateAccount).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });
});

describe('useDeactivateAccountDialog — dismiss()', () => {
  it('closes the dialog with no side effect', () => {
    const previewDeactivation = vi.fn(() => new Promise<DeactivationPreviewOutcome>(() => {}));
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, vi.fn(), vi.fn(), vi.fn()));
    act(() => result.current.open(EMPLOYEE));
    act(() => result.current.dismiss());
    expect(result.current.dialog).toBeUndefined();
  });
});

describe('useDeactivateAccountDialog — routeToPromote() (US-025/AC-10)', () => {
  it('closes the dialog AND calls onRouteToPromote — the "Make someone an admin" primary action on the blocked refusal', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: [] });
    const deactivateAccount: DeactivateAccountFetcher = async () => ({ kind: 'blocked' });
    const onRouteToPromote = vi.fn();
    const { result } = renderHook(() => useDeactivateAccountDialog(previewDeactivation, deactivateAccount, vi.fn(), onRouteToPromote));

    act(() => result.current.open(EMPLOYEE));
    await waitFor(() => expect(result.current.dialog?.phase).toBe('ready'));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'blocked' }));

    act(() => result.current.routeToPromote());

    expect(result.current.dialog).toBeUndefined();
    await waitFor(() => expect(onRouteToPromote).toHaveBeenCalledTimes(1));
  });
});

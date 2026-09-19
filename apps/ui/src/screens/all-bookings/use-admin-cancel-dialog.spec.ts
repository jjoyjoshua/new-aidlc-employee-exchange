import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AllBookingsListItem } from '@desk-booking/contracts';
import { useAdminCancelDialog } from './use-admin-cancel-dialog.js';
import type { CancelBookingFetcher, CancelBookingOutcome } from '../../lib/cancel-booking.js';

const ITEM: AllBookingsListItem = {
  id: 'b1',
  date: '2026-09-18',
  deskNumber: 'A-01',
  employeeName: 'Priya Raman',
  status: 'confirmed',
};

describe('useAdminCancelDialog — open/confirm/dismiss (US-015)', () => {
  it('is closed until open() is called, then holds the given item', () => {
    const { result } = renderHook(() => useAdminCancelDialog(vi.fn(), vi.fn(), vi.fn()));
    expect(result.current.dialog).toBeUndefined();

    act(() => result.current.open(ITEM));

    expect(result.current.dialog).toEqual({ item: ITEM, busy: false });
  });

  it('confirm() on success calls onCancelled with the item and closes the dialog (US-015/AC-04)', async () => {
    const cancelBooking: CancelBookingFetcher = async () => ({ kind: 'ok' });
    const onCancelled = vi.fn();
    const { result } = renderHook(() => useAdminCancelDialog(cancelBooking, onCancelled, vi.fn()));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(onCancelled).toHaveBeenCalledWith(ITEM);
  });

  it('confirm() issues exactly one request even when called twice while one is in flight — the second refused before any state read (US-015/AC-07)', async () => {
    let resolveCancel!: (outcome: CancelBookingOutcome) => void;
    const cancelBooking = vi.fn(() => new Promise<CancelBookingOutcome>((resolve) => (resolveCancel = resolve)));
    const { result } = renderHook(() => useAdminCancelDialog(cancelBooking, vi.fn(), vi.fn()));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());
    act(() => result.current.confirm()); // second activation while the first is still in flight

    expect(cancelBooking).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveCancel({ kind: 'ok' });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('confirm() on already_cancelled sets the non-retryable outcome, dialog stays open, and calls neither onCancelled nor onAlreadyCancelled yet (US-015/AC-09)', async () => {
    const cancelBooking: CancelBookingFetcher = async () => ({ kind: 'already_cancelled' });
    const onCancelled = vi.fn();
    const onAlreadyCancelled = vi.fn();
    const { result } = renderHook(() => useAdminCancelDialog(cancelBooking, onCancelled, onAlreadyCancelled));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toMatchObject({ busy: false, outcome: 'already_cancelled' }));
    expect(onCancelled).not.toHaveBeenCalled();
    expect(onAlreadyCancelled).not.toHaveBeenCalled();
  });

  it('confirm() on refused or failed sets the retryable outcome, dialog stays open, row untouched (US-015/AC-02, AC-08)', async () => {
    const cancelBooking = vi.fn().mockResolvedValueOnce({ kind: 'refused' }).mockResolvedValueOnce({ kind: 'failed' });
    const onCancelled = vi.fn();
    const { result } = renderHook(() => useAdminCancelDialog(cancelBooking, onCancelled, vi.fn()));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'retryable' }));

    act(() => result.current.confirm());
    await waitFor(() => expect(cancelBooking).toHaveBeenCalledTimes(2));
    expect(result.current.dialog).toMatchObject({ outcome: 'retryable' });
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('dismiss() after already_cancelled calls onAlreadyCancelled with the item — NEVER a refresh/refetch callback (US-015/AC-09, design note §5.2\'s divergence from the employee-side dialog)', async () => {
    const cancelBooking: CancelBookingFetcher = async () => ({ kind: 'already_cancelled' });
    const onAlreadyCancelled = vi.fn();
    const { result } = renderHook(() => useAdminCancelDialog(cancelBooking, vi.fn(), onAlreadyCancelled));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'already_cancelled' }));

    act(() => result.current.dismiss());

    expect(onAlreadyCancelled).toHaveBeenCalledWith(ITEM);
    expect(result.current.dialog).toBeUndefined();
  });

  it('dismiss() with no outcome yet (e.g. Escape/Keep it before confirming) does not call onAlreadyCancelled', () => {
    const onAlreadyCancelled = vi.fn();
    const { result } = renderHook(() => useAdminCancelDialog(vi.fn(), vi.fn(), onAlreadyCancelled));

    act(() => result.current.open(ITEM));
    act(() => result.current.dismiss());

    expect(onAlreadyCancelled).not.toHaveBeenCalled();
    expect(result.current.dialog).toBeUndefined();
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MyBookingListItem } from '@desk-booking/contracts';
import { useCancelDialog } from './use-cancel-dialog.js';
import type { CancelBookingFetcher, CancelBookingOutcome } from '../../lib/cancel-booking.js';

const ITEM: MyBookingListItem = { id: 'b1', deskNumber: 'A-01', date: '2026-09-18', status: 'confirmed' };

describe('useCancelDialog — open/confirm/dismiss (US-011)', () => {
  it('is closed until open() is called, then holds the given item', () => {
    const { result } = renderHook(() => useCancelDialog(vi.fn(), vi.fn(), vi.fn()));
    expect(result.current.dialog).toBeUndefined();

    act(() => result.current.open(ITEM));

    expect(result.current.dialog).toEqual({ item: ITEM, busy: false });
  });

  it('confirm() on success calls onCancelled with the item and closes the dialog (AC-04, AC-05)', async () => {
    const cancelBooking: CancelBookingFetcher = async () => ({ kind: 'ok' });
    const onCancelled = vi.fn();
    const { result } = renderHook(() => useCancelDialog(cancelBooking, onCancelled, vi.fn()));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(onCancelled).toHaveBeenCalledWith(ITEM);
  });

  it('confirm() issues exactly one request even when called twice while one is in flight (US-011/AC-07)', async () => {
    let resolveCancel!: (outcome: CancelBookingOutcome) => void;
    const cancelBooking = vi.fn(() => new Promise<CancelBookingOutcome>((resolve) => (resolveCancel = resolve)));
    const { result } = renderHook(() => useCancelDialog(cancelBooking, vi.fn(), vi.fn()));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());
    act(() => result.current.confirm()); // second activation while the first is still in flight

    expect(cancelBooking).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveCancel({ kind: 'ok' });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('confirm() on already_cancelled sets the non-retryable outcome, dialog stays open (US-011/AC-09)', async () => {
    const cancelBooking: CancelBookingFetcher = async () => ({ kind: 'already_cancelled' });
    const { result } = renderHook(() => useCancelDialog(cancelBooking, vi.fn(), vi.fn()));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());

    await waitFor(() => expect(result.current.dialog).toMatchObject({ busy: false, outcome: 'already_cancelled' }));
  });

  it('confirm() on refused or failed sets the retryable outcome, dialog stays open (US-011/AC-02, AC-08)', async () => {
    const cancelBooking = vi.fn().mockResolvedValueOnce({ kind: 'refused' }).mockResolvedValueOnce({ kind: 'failed' });
    const { result } = renderHook(() => useCancelDialog(cancelBooking, vi.fn(), vi.fn()));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'retryable' }));

    act(() => result.current.confirm());
    await waitFor(() => expect(cancelBooking).toHaveBeenCalledTimes(2));
    expect(result.current.dialog).toMatchObject({ outcome: 'retryable' });
  });

  it('dismiss() after already_cancelled calls onRefresh; otherwise it does not (US-011/AC-09, design note §5.3)', async () => {
    const cancelBooking: CancelBookingFetcher = async () => ({ kind: 'already_cancelled' });
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useCancelDialog(cancelBooking, vi.fn(), onRefresh));

    act(() => result.current.open(ITEM));
    act(() => result.current.confirm());
    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'already_cancelled' }));

    act(() => result.current.dismiss());

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toBeUndefined();
  });

  it('dismiss() with no outcome yet (e.g. Escape/Keep it before confirming) does not call onRefresh', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useCancelDialog(vi.fn(), vi.fn(), onRefresh));

    act(() => result.current.open(ITEM));
    act(() => result.current.dismiss());

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.dialog).toBeUndefined();
  });
});

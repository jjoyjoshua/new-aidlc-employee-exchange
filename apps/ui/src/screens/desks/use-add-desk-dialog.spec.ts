import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useAddDeskDialog } from './use-add-desk-dialog.js';
import type { AddDeskFetcher, AddDeskOutcome } from '../../lib/add-desk.js';

const NEW_DESK = { id: 'new-id', deskNumber: 'A-12', isActive: true, bookedAhead: 0 };

describe('useAddDeskDialog — open/submit/dismiss (US-017)', () => {
  it('is closed until open() is called', () => {
    const { result } = renderHook(() => useAddDeskDialog(vi.fn(), vi.fn()));
    expect(result.current.dialog).toBeUndefined();

    act(() => result.current.open());

    expect(result.current.dialog).toEqual({ busy: false, collidedOnCaseOnly: false });
  });

  it('submit() on success calls onAdded with the created desk and closes the dialog (US-017/AC-01)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'ok', desk: NEW_DESK });
    const onAdded = vi.fn();
    const { result } = renderHook(() => useAddDeskDialog(addDesk, onAdded));

    act(() => result.current.open());
    act(() => result.current.submit('a-12'));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(onAdded).toHaveBeenCalledWith(NEW_DESK);
  });

  it('submit() issues exactly one request even when called twice while one is in flight — the second refused before any state read (US-017/AC-06)', async () => {
    let resolveAdd!: (outcome: AddDeskOutcome) => void;
    const addDesk = vi.fn(() => new Promise<AddDeskOutcome>((resolve) => (resolveAdd = resolve)));
    const { result } = renderHook(() => useAddDeskDialog(addDesk, vi.fn()));

    act(() => result.current.open());
    act(() => result.current.submit('A-01'));
    act(() => result.current.submit('A-01')); // second activation while the first is still in flight

    expect(addDesk).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveAdd({ kind: 'ok', desk: NEW_DESK });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('submit() on a case-only collision sets outcome duplicate WITH collidedOnCaseOnly (US-017/AC-04, AC-05)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'duplicate' });
    const { result } = renderHook(() => useAddDeskDialog(addDesk, vi.fn()));

    act(() => result.current.open());
    act(() => result.current.submit('a-01'));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({ busy: false, outcome: 'duplicate', collidedOnCaseOnly: true }),
    );
  });

  it('submit() on an exact-case collision sets outcome duplicate WITHOUT collidedOnCaseOnly (US-017/AC-04)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'duplicate' });
    const { result } = renderHook(() => useAddDeskDialog(addDesk, vi.fn()));

    act(() => result.current.open());
    act(() => result.current.submit('A-01'));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({ busy: false, outcome: 'duplicate', collidedOnCaseOnly: false }),
    );
  });

  it('submit() on failure sets outcome failed, dialog stays open, onAdded never called (US-017/AC-07)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'failed' });
    const onAdded = vi.fn();
    const { result } = renderHook(() => useAddDeskDialog(addDesk, onAdded));

    act(() => result.current.open());
    act(() => result.current.submit('A-01'));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'failed', busy: false }));
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('dismiss() closes the dialog regardless of state', () => {
    const { result } = renderHook(() => useAddDeskDialog(vi.fn(), vi.fn()));

    act(() => result.current.open());
    act(() => result.current.dismiss());

    expect(result.current.dialog).toBeUndefined();
  });
});

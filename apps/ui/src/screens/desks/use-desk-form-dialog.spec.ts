import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDeskFormDialog } from './use-desk-form-dialog.js';
import type { AddDeskFetcher, AddDeskOutcome } from '../../lib/add-desk.js';
import type { RenameDeskFetcher, RenameDeskOutcome } from '../../lib/rename-desk.js';

const NEW_DESK = { id: 'new-id', deskNumber: 'A-12', isActive: true, bookedAhead: 0 };
const EXISTING_DESK = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 };
const RENAMED_DESK = { id: 'a', deskNumber: 'B-05', isActive: true };

function renderDialog(addDesk: AddDeskFetcher = vi.fn(), renameDesk: RenameDeskFetcher = vi.fn(), onAdded = vi.fn(), onRenamed = vi.fn()) {
  return renderHook(() => useDeskFormDialog(addDesk, renameDesk, onAdded, onRenamed));
}

describe('useDeskFormDialog — add mode (US-017, generalised in US-018)', () => {
  it('is closed until openAdd() is called', () => {
    const { result } = renderDialog();
    expect(result.current.dialog).toBeUndefined();

    act(() => result.current.openAdd());

    expect(result.current.dialog).toEqual({ mode: 'add', busy: false, collidedOnCaseOnly: false });
  });

  it('submit() on success calls onAdded with the created desk and closes the dialog (US-017/AC-01)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'ok', desk: NEW_DESK });
    const onAdded = vi.fn();
    const { result } = renderDialog(addDesk, vi.fn(), onAdded);

    act(() => result.current.openAdd());
    act(() => result.current.submit('a-12'));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(onAdded).toHaveBeenCalledWith(NEW_DESK);
  });

  it('submit() issues exactly one request even when called twice while one is in flight (US-017/AC-06)', async () => {
    let resolveAdd!: (outcome: AddDeskOutcome) => void;
    const addDesk = vi.fn(() => new Promise<AddDeskOutcome>((resolve) => (resolveAdd = resolve)));
    const { result } = renderDialog(addDesk);

    act(() => result.current.openAdd());
    act(() => result.current.submit('A-01'));
    act(() => result.current.submit('A-01')); // second activation while the first is still in flight

    expect(addDesk).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveAdd({ kind: 'ok', desk: NEW_DESK });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('submit() on a case-only collision sets outcome duplicate WITH collidedOnCaseOnly (US-017/AC-04, AC-05)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'duplicate' });
    const { result } = renderDialog(addDesk);

    act(() => result.current.openAdd());
    act(() => result.current.submit('a-01'));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({ mode: 'add', busy: false, outcome: 'duplicate', collidedOnCaseOnly: true }),
    );
  });

  it('submit() on an exact-case collision sets outcome duplicate WITHOUT collidedOnCaseOnly (US-017/AC-04)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'duplicate' });
    const { result } = renderDialog(addDesk);

    act(() => result.current.openAdd());
    act(() => result.current.submit('A-01'));

    await waitFor(() =>
      expect(result.current.dialog).toEqual({ mode: 'add', busy: false, outcome: 'duplicate', collidedOnCaseOnly: false }),
    );
  });

  it('submit() on failure sets outcome failed, dialog stays open, onAdded never called (US-017/AC-07)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'failed' });
    const onAdded = vi.fn();
    const { result } = renderDialog(addDesk, vi.fn(), onAdded);

    act(() => result.current.openAdd());
    act(() => result.current.submit('A-01'));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ outcome: 'failed', busy: false }));
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('dismiss() closes the dialog regardless of state', () => {
    const { result } = renderDialog();

    act(() => result.current.openAdd());
    act(() => result.current.dismiss());

    expect(result.current.dialog).toBeUndefined();
  });
});

describe('useDeskFormDialog — edit mode (US-018/AC-01, AC-02, AC-07, AC-08)', () => {
  it('openEdit(desk) opens with mode edit and the subject desk carried', () => {
    const { result } = renderDialog();

    act(() => result.current.openEdit(EXISTING_DESK));

    expect(result.current.dialog).toEqual({ mode: 'edit', desk: EXISTING_DESK, busy: false, collidedOnCaseOnly: false });
  });

  it('submit() on success calls onRenamed with the desk id and new number, and closes (US-018/AC-01)', async () => {
    const renameDesk: RenameDeskFetcher = async () => ({ kind: 'ok', desk: RENAMED_DESK });
    const onRenamed = vi.fn();
    const { result } = renderDialog(vi.fn(), renameDesk, vi.fn(), onRenamed);

    act(() => result.current.openEdit(EXISTING_DESK));
    act(() => result.current.submit('b-05'));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(onRenamed).toHaveBeenCalledWith('a', 'B-05');
  });

  it('submit() dispatches to renameDesk with the SUBJECT desk\'s id, not a fresh lookup', async () => {
    const calls: Array<[string, string]> = [];
    const renameDesk: RenameDeskFetcher = async (id, deskNumber) => {
      calls.push([id, deskNumber]);
      return { kind: 'ok', desk: RENAMED_DESK };
    };
    const { result } = renderDialog(vi.fn(), renameDesk);

    act(() => result.current.openEdit(EXISTING_DESK));
    act(() => result.current.submit('B-05'));

    await waitFor(() => expect(result.current.dialog).toBeUndefined());
    expect(calls).toEqual([['a', 'B-05']]);
  });

  it('submit() issues exactly one request even when called twice while one is in flight — the SAME inFlight guard as add (US-018/AC-08)', async () => {
    let resolveRename!: (outcome: RenameDeskOutcome) => void;
    const renameDesk = vi.fn(() => new Promise<RenameDeskOutcome>((resolve) => (resolveRename = resolve)));
    const { result } = renderDialog(vi.fn(), renameDesk);

    act(() => result.current.openEdit(EXISTING_DESK));
    act(() => result.current.submit('B-05'));
    act(() => result.current.submit('B-05'));

    expect(renameDesk).toHaveBeenCalledTimes(1);
    expect(result.current.dialog).toMatchObject({ busy: true });

    resolveRename({ kind: 'ok', desk: RENAMED_DESK });
    await waitFor(() => expect(result.current.dialog).toBeUndefined());
  });

  it('submit() on a duplicate sets outcome duplicate, dialog stays open, onRenamed never called (US-018/AC-02)', async () => {
    const renameDesk: RenameDeskFetcher = async () => ({ kind: 'duplicate' });
    const onRenamed = vi.fn();
    const { result } = renderDialog(vi.fn(), renameDesk, vi.fn(), onRenamed);

    act(() => result.current.openEdit(EXISTING_DESK));
    act(() => result.current.submit('A-99'));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ mode: 'edit', outcome: 'duplicate' }));
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it('submit() on failure sets outcome failed, dialog stays open, onRenamed never called (US-018/AC-08)', async () => {
    const renameDesk: RenameDeskFetcher = async () => ({ kind: 'failed' });
    const onRenamed = vi.fn();
    const { result } = renderDialog(vi.fn(), renameDesk, vi.fn(), onRenamed);

    act(() => result.current.openEdit(EXISTING_DESK));
    act(() => result.current.submit('A-99'));

    await waitFor(() => expect(result.current.dialog).toMatchObject({ mode: 'edit', outcome: 'failed', busy: false }));
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it('dismiss() closes the dialog regardless of state', () => {
    const { result } = renderDialog();

    act(() => result.current.openEdit(EXISTING_DESK));
    act(() => result.current.dismiss());

    expect(result.current.dialog).toBeUndefined();
  });
});

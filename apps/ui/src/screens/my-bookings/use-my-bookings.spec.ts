import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyBookingsResponse } from '@desk-booking/contracts';
import { useMyBookings, type MyBookingsOutcome } from './use-my-bookings.js';

const ok = (data: MyBookingsResponse): MyBookingsOutcome => ({ kind: 'ok', data });
const failed: MyBookingsOutcome = { kind: 'failed' };

const PAGE_1: MyBookingsResponse = {
  today: '2026-09-18',
  items: [{ id: 'a', deskNumber: 'A-01', date: '2026-09-20', status: 'confirmed' }],
  nextBefore: '2026-08-19',
};

const PAGE_2: MyBookingsResponse = {
  today: '2026-09-18',
  items: [{ id: 'b', deskNumber: 'B-02', date: '2026-08-10', status: 'cancelled' }],
  nextBefore: null,
};

describe('useMyBookings — the default page (US-010/AC-01, AC-03)', () => {
  it('issues exactly one request, with before undefined, on mount', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValue(ok(PAGE_1));

    renderHook(() => useMyBookings(fetchMyBookings));

    await waitFor(() => expect(fetchMyBookings).toHaveBeenCalledTimes(1));
    expect(fetchMyBookings).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it('reports loading, then ready with the response\'s items/today/nextBefore', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValue(ok(PAGE_1));

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));

    expect(result.current).toMatchObject({ status: 'loading' });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        today: PAGE_1.today,
        items: PAGE_1.items,
        nextBefore: PAGE_1.nextBefore,
        loadingOlder: false,
      }),
    );
  });

  it('a failed outcome yields status: error (US-010/AC-09)', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValue(failed);

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));

    await waitFor(() => expect(result.current).toMatchObject({ status: 'error' }));
  });
});

describe('useMyBookings.loadOlder — appending a page (US-010/AC-03, design note §4.3)', () => {
  it('requests the current nextBefore, unchanged, and appends the response to the accumulated list', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValueOnce(ok(PAGE_1)).mockResolvedValueOnce(ok(PAGE_2));

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    await act(async () => {
      result.current.loadOlder();
      await waitFor(() => expect(fetchMyBookings).toHaveBeenCalledTimes(2));
    });

    expect(fetchMyBookings).toHaveBeenLastCalledWith(PAGE_1.nextBefore, expect.any(AbortSignal));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        items: [...PAGE_1.items, ...PAGE_2.items],
        nextBefore: null, // PAGE_2's nextBefore — the control now disappears (the story's edge case)
        loadingOlder: false,
      }),
    );
  });

  it('sets loadingOlder true while the request for an older page is in flight', async () => {
    let resolveOlder!: (value: MyBookingsOutcome) => void;
    const fetchMyBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOlder = resolve)));

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => {
      result.current.loadOlder();
    });

    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', loadingOlder: true }));
    // The initial-load skeleton (AC-08) must not reappear — status stays 'ready' throughout.
    expect(result.current.status).toBe('ready');

    resolveOlder(ok(PAGE_2));
    await waitFor(() => expect(result.current).toMatchObject({ loadingOlder: false }));
  });

  it('does nothing when nextBefore is null — the control should not have been there', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValue(ok({ ...PAGE_1, nextBefore: null }));

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => {
      result.current.loadOlder();
    });

    expect(fetchMyBookings).toHaveBeenCalledTimes(1); // no second call
  });

  it('does nothing while an older-page request is already in flight (double-press guard)', async () => {
    const fetchMyBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1))
      .mockImplementationOnce(() => new Promise(() => undefined)); // never resolves

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => {
      result.current.loadOlder();
    });
    await waitFor(() => expect(result.current).toMatchObject({ loadingOlder: true }));

    act(() => {
      result.current.loadOlder(); // pressed again while loading
    });

    expect(fetchMyBookings).toHaveBeenCalledTimes(2); // not 3
  });
});

describe('useMyBookings.retry — the default page only (design note §4.3)', () => {
  it('re-fetches the default page (before undefined) and drops any accumulated older pages', async () => {
    const fetchMyBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1))
      .mockResolvedValueOnce(ok(PAGE_2))
      .mockResolvedValueOnce(ok(PAGE_1));

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    await act(async () => {
      result.current.loadOlder();
      await waitFor(() => expect(fetchMyBookings).toHaveBeenCalledTimes(2));
    });
    await waitFor(() => expect(result.current).toMatchObject({ items: [...PAGE_1.items, ...PAGE_2.items] }));

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(fetchMyBookings).toHaveBeenCalledTimes(3));
    expect(fetchMyBookings).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items }));
  });

  it('a loadOlder() page that resolves AFTER a retry() never grafts itself onto the fresh default page', async () => {
    let resolveOlder!: (value: MyBookingsOutcome) => void;
    const fetchMyBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1)) // initial load
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOlder = resolve))) // loadOlder, held open
      .mockResolvedValueOnce(ok(PAGE_1)); // retry()'s fresh default page

    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => {
      result.current.loadOlder();
    });
    await waitFor(() => expect(fetchMyBookings).toHaveBeenCalledTimes(2));

    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(fetchMyBookings).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items }));

    // The stale loadOlder() page resolves only now — after retry()'s fresh page is already on screen.
    await act(async () => {
      resolveOlder(ok(PAGE_2));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Still exactly PAGE_1's items — PAGE_2 must not have been appended to the post-retry state.
    expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items });
  });
});

describe('useMyBookings.markCancelled — US-011/AC-05, design note §5.3', () => {
  it('flips exactly the named item\'s status to cancelled, with no re-fetch', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValue(ok(PAGE_1));
    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => {
      if (result.current.status === 'ready') result.current.markCancelled('a');
    });

    expect(result.current).toMatchObject({
      status: 'ready',
      items: [{ id: 'a', status: 'cancelled' }],
    });
    // No second fetch — success flips the row in place, it does not re-announce loading (§8.5).
    expect(fetchMyBookings).toHaveBeenCalledTimes(1);
  });

  it('never transitions through status: loading (would re-announce over ST-10\'s toast)', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValue(ok(PAGE_1));
    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    const statuses: string[] = [];
    act(() => {
      if (result.current.status === 'ready') result.current.markCancelled('a');
      statuses.push(result.current.status);
    });

    expect(statuses).not.toContain('loading');
  });

  it('leaves nextBefore and every other item untouched', async () => {
    const twoItemPage: MyBookingsResponse = {
      today: '2026-09-18',
      items: [
        { id: 'a', deskNumber: 'A-01', date: '2026-09-20', status: 'confirmed' },
        { id: 'b', deskNumber: 'B-02', date: '2026-09-21', status: 'confirmed' },
      ],
      nextBefore: '2026-08-19',
    };
    const fetchMyBookings = vi.fn().mockResolvedValue(ok(twoItemPage));
    const { result } = renderHook(() => useMyBookings(fetchMyBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => {
      if (result.current.status === 'ready') result.current.markCancelled('a');
    });

    expect(result.current).toMatchObject({
      nextBefore: '2026-08-19',
      items: [
        { id: 'a', status: 'cancelled' },
        { id: 'b', status: 'confirmed' },
      ],
    });
  });
});

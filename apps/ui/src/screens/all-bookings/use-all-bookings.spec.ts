import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AllBookingsResponse } from '@desk-booking/contracts';
import { useAllBookings, type AllBookingsOutcome } from './use-all-bookings.js';

const ok = (data: AllBookingsResponse): AllBookingsOutcome => ({ kind: 'ok', data });
const failed: AllBookingsOutcome = { kind: 'failed' };

const PAGE_1: AllBookingsResponse = {
  today: '2026-09-16',
  total: 51,
  items: [{ id: 'a', date: '2026-09-16', deskNumber: 'A-01', employeeName: 'Priya Raman', status: 'confirmed' }],
  nextPage: 2,
};

const PAGE_2: AllBookingsResponse = {
  today: '2026-09-16',
  total: 51,
  items: [{ id: 'b', date: '2026-09-17', deskNumber: 'B-02', employeeName: 'Sam Okoro', status: 'confirmed' }],
  nextPage: null,
};

describe('useAllBookings — the default page (US-013/AC-02, AC-04)', () => {
  it('issues exactly one request, for page 1, on mount', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_1));

    renderHook(() => useAllBookings(fetchAllBookings));

    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(1));
    expect(fetchAllBookings).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  it("reports loading, then ready with the response's items/today/total/nextPage", async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_1));

    const { result } = renderHook(() => useAllBookings(fetchAllBookings));

    expect(result.current).toMatchObject({ status: 'loading' });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        today: PAGE_1.today,
        total: PAGE_1.total,
        items: PAGE_1.items,
        nextPage: PAGE_1.nextPage,
        loadingMore: false,
      }),
    );
  });

  it('a failed outcome yields status: error (US-013/AC-09)', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(failed);

    const { result } = renderHook(() => useAllBookings(fetchAllBookings));

    await waitFor(() => expect(result.current).toMatchObject({ status: 'error' }));
  });
});

describe('useAllBookings.loadMore — appending a page (US-013/AC-04)', () => {
  it('requests page + 1 and appends the response to the accumulated list', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValueOnce(ok(PAGE_1)).mockResolvedValueOnce(ok(PAGE_2));

    const { result } = renderHook(() => useAllBookings(fetchAllBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    await act(async () => {
      result.current.loadMore();
      await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(2));
    });

    expect(fetchAllBookings).toHaveBeenLastCalledWith(2, expect.any(AbortSignal));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        items: [...PAGE_1.items, ...PAGE_2.items],
        nextPage: null,
        loadingMore: false,
      }),
    );
  });

  it('is a no-op when nextPage is null', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_2));

    const { result } = renderHook(() => useAllBookings(fetchAllBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', nextPage: null }));

    act(() => result.current.loadMore());

    expect(fetchAllBookings).toHaveBeenCalledTimes(1);
  });

  it('a second press while one is in flight is a no-op (double-press guard)', async () => {
    let resolveFirst: (outcome: AllBookingsOutcome) => void = () => {};
    const fetchAllBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));

    const { result } = renderHook(() => useAllBookings(fetchAllBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current).toMatchObject({ loadingMore: true }));
    act(() => result.current.loadMore());

    expect(fetchAllBookings).toHaveBeenCalledTimes(2); // the initial load + exactly one loadMore

    await act(async () => {
      resolveFirst(ok(PAGE_2));
    });
  });
});

describe('useAllBookings.retry — resets to page 1 (US-013/AC-09)', () => {
  it('re-fetches page 1 and drops any accumulated later pages', async () => {
    const fetchAllBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1))
      .mockResolvedValueOnce(ok(PAGE_2))
      .mockResolvedValueOnce(ok(PAGE_1));

    const { result } = renderHook(() => useAllBookings(fetchAllBookings));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    await act(async () => {
      result.current.loadMore();
      await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(2));
    });

    act(() => result.current.retry());

    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(3));
    expect(fetchAllBookings).toHaveBeenLastCalledWith(1, expect.any(AbortSignal));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items }));
  });
});

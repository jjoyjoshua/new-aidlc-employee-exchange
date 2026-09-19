import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AllBookingsResponse } from '@desk-booking/contracts';
import { NO_FILTERS, type AllBookingsFilters } from './filters.js';
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

    renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));

    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(1));
    expect(fetchAllBookings).toHaveBeenCalledWith(NO_FILTERS, 1, expect.any(AbortSignal));
  });

  it("reports loading, then ready with the response's items/today/total/nextPage", async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_1));

    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));

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

    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));

    await waitFor(() => expect(result.current).toMatchObject({ status: 'error' }));
  });
});

describe('useAllBookings.loadMore — appending a page (US-013/AC-04)', () => {
  it('requests page + 1 with the SAME filters, and appends the response to the accumulated list', async () => {
    const filters: AllBookingsFilters = { status: 'confirmed' };
    const fetchAllBookings = vi.fn().mockResolvedValueOnce(ok(PAGE_1)).mockResolvedValueOnce(ok(PAGE_2));

    const { result } = renderHook(() => useAllBookings(fetchAllBookings, filters));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    await act(async () => {
      result.current.loadMore();
      await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(2));
    });

    expect(fetchAllBookings).toHaveBeenLastCalledWith(filters, 2, expect.any(AbortSignal));
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

    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));
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

    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));
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

    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    await act(async () => {
      result.current.loadMore();
      await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(2));
    });

    act(() => result.current.retry());

    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(3));
    expect(fetchAllBookings).toHaveBeenLastCalledWith(NO_FILTERS, 1, expect.any(AbortSignal));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items }));
  });
});

describe('useAllBookings — a filter change (US-014/AC-04, AC-09, edge case)', () => {
  it('a filter change re-fetches page 1 with the new filters', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_1));

    const { rerender } = renderHook(({ filters }) => useAllBookings(fetchAllBookings, filters), {
      initialProps: { filters: NO_FILTERS },
    });
    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(1));

    const nextFilters: AllBookingsFilters = { status: 'confirmed' };
    rerender({ filters: nextFilters });

    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(2));
    expect(fetchAllBookings).toHaveBeenLastCalledWith(nextFilters, 1, expect.any(AbortSignal));
  });

  it('resets accumulated pages — a filter change after loadMore starts over at page 1', async () => {
    const fetchAllBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1))
      .mockResolvedValueOnce(ok(PAGE_2))
      .mockResolvedValueOnce(ok(PAGE_1));

    const { result, rerender } = renderHook(({ filters }) => useAllBookings(fetchAllBookings, filters), {
      initialProps: { filters: NO_FILTERS },
    });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    await act(async () => {
      result.current.loadMore();
      await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(2));
    });
    await waitFor(() => expect(result.current).toMatchObject({ items: [...PAGE_1.items, ...PAGE_2.items] }));

    rerender({ filters: { status: 'confirmed' } });

    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items }));
  });

  it('a filter change made mid-loadMore drops the superseded page (edge case)', async () => {
    let resolveLoadMore: (outcome: AllBookingsOutcome) => void = () => {};
    const fetchAllBookings = vi
      .fn()
      .mockResolvedValueOnce(ok(PAGE_1))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLoadMore = resolve; }))
      .mockResolvedValueOnce(ok(PAGE_1));

    const { result, rerender } = renderHook(({ filters }) => useAllBookings(fetchAllBookings, filters), {
      initialProps: { filters: NO_FILTERS },
    });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => result.current.loadMore());
    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(2));

    rerender({ filters: { status: 'confirmed' } });
    await waitFor(() => expect(fetchAllBookings).toHaveBeenCalledTimes(3));

    // The superseded loadMore resolves AFTER the filter change's own fetch has already landed.
    await act(async () => {
      resolveLoadMore(ok(PAGE_2));
    });

    // The stale page-2 items must not have grafted onto the new, filtered page-1 result.
    expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items });
  });
});

describe('useAllBookings.markCancelled — update in place, never a refetch (US-015/AC-04, AC-09)', () => {
  it('flips one item\'s status to cancelled, leaving every other field and item untouched', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_1));
    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => result.current.markCancelled('a'));

    expect(result.current).toMatchObject({
      status: 'ready',
      items: [{ ...PAGE_1.items[0], status: 'cancelled' }],
    });
  });

  it('does not decrement total, and does not issue a second fetch (no refetch)', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_1));
    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => result.current.markCancelled('a'));

    expect(result.current).toMatchObject({ total: PAGE_1.total });
    expect(fetchAllBookings).toHaveBeenCalledTimes(1);
  });

  it('leaves an unmatched id untouched — a no-op rather than a throw', async () => {
    const fetchAllBookings = vi.fn().mockResolvedValue(ok(PAGE_1));
    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }));

    act(() => result.current.markCancelled('does-not-exist'));

    expect(result.current).toMatchObject({ status: 'ready', items: PAGE_1.items });
  });

  it('is a no-op while still loading', () => {
    const fetchAllBookings = vi.fn(() => new Promise<AllBookingsOutcome>(() => {}));
    const { result } = renderHook(() => useAllBookings(fetchAllBookings, NO_FILTERS));

    act(() => result.current.markCancelled('a'));

    expect(result.current).toMatchObject({ status: 'loading' });
  });
});

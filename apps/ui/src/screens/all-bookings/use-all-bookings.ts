/**
 * The fetch/accumulation seam behind `AllBookings` (US-013/AC-02, AC-04, AC-09). Mirrors
 * `use-my-bookings.ts`'s shape where the two screens share a need (loading/ready/error, `retry()`)
 * and diverges where they don't: this screen pages by NUMBER, not by a date cursor (design note
 * §2.4), so `loadMore()` simply asks for `page + 1` rather than re-deriving a window.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AllBookingsResponse } from '@desk-booking/contracts';
import type { AllBookingsFilters } from './filters.js';

export type AllBookingsOutcome =
  | { kind: 'ok'; data: AllBookingsResponse }
  /** Everything AC-09 covers: a transport failure, a timeout, a 5xx, a 4xx, an unparseable body.
   *  One outcome, because ST-05 is one state — the same reasoning `MyBookingsOutcome` states. */
  | { kind: 'failed' };

/** US-014 widens this from `(page, signal)` — filters travel with every request, including a
 *  `loadMore()` page, so a filter change and a page number can never disagree (design note §7.2). */
export type AllBookingsFetcher = (
  filters: AllBookingsFilters,
  page: number,
  signal: AbortSignal,
) => Promise<AllBookingsOutcome>;

export type AllBookingsState =
  | { status: 'loading' }
  | {
      status: 'ready';
      today: string;
      total: number;
      items: AllBookingsResponse['items'];
      nextPage: number | null;
      /** AC-04's "Show more" press is in flight. Distinct from `status: 'loading'`, which is the
       *  INITIAL load's skeleton only. */
      loadingMore: boolean;
    }
  | { status: 'error' };

export type UseAllBookingsResult = AllBookingsState & {
  /** Re-fetches page 1 and drops any accumulated later pages. */
  retry: () => void;
  /** No-ops when not `ready`, when `nextPage` is `null`, or when a previous `loadMore()` is
   *  still in flight (double-press guard). */
  loadMore: () => void;
  /**
   * US-015/AC-04, AC-09. Flips ONE item's `status` to `'cancelled'` in place — NEVER a `retry()`.
   * Under an active `status=confirmed` filter (US-014), a refetch would make the just-cancelled
   * row stop matching the query and vanish from the page, which is the exact behaviour AC-04
   * forbids ("the row stays in place showing its new status rather than disappearing"). Called on
   * BOTH a successful cancel and an `already_cancelled` response — a `409` from the cancel
   * endpoint means the row exists and its status IS `cancelled` (the server just asserted it), so
   * this is applying a known fact, not guessing (design note §5.3). Never called on a transport
   * failure — that taught us nothing, and the booking is still Confirmed (AC-08).
   *
   * `total` is deliberately NOT decremented: it counts bookings matching the view, and the row is
   * still in the view (AC-04 keeps it there) — decrementing would make the count line disagree
   * with the visible list.
   */
  markCancelled: (bookingId: string) => void;
};

export function useAllBookings(
  fetchAllBookings: AllBookingsFetcher,
  filters: AllBookingsFilters,
): UseAllBookingsResult {
  const [state, setState] = useState<AllBookingsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Bumped every time page 1 is (re-)fetched — the same "a stale in-flight page must not graft
  // onto a fresher default fetch" guard `useMyBookings` states for its own `generationRef`. A
  // FILTER CHANGE bumps it too (via the `filters` dependency below), which is what makes a
  // filter change reset to page 1 and supersede an in-flight request for the old filters
  // (US-014/AC-09, edge case).
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchAllBookings(filters, 1, controller.signal).then(
      (outcome) => {
        if (controller.signal.aborted) return; // superseded by a retry() or unmount
        setState(
          outcome.kind === 'ok'
            ? {
                status: 'ready',
                today: outcome.data.today,
                total: outcome.data.total,
                items: outcome.data.items,
                nextPage: outcome.data.nextPage,
                loadingMore: false,
              }
            : { status: 'error' },
        );
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );

    return () => controller.abort();
  }, [fetchAllBookings, filters, attempt]);

  const loadMore = useCallback(() => {
    // Read from THIS callback's own closure, recreated on every render via the `state`
    // dependency — the same reasoning `useMyBookings.loadOlder` gives for not reading a cursor
    // out of a setState updater.
    if (state.status !== 'ready' || state.nextPage === null || state.loadingMore) return;
    const page = state.nextPage;
    const generation = generationRef.current;
    setState({ ...state, loadingMore: true });

    const controller = new AbortController();
    void fetchAllBookings(filters, page, controller.signal).then((outcome) => {
      setState((current) => {
        if (generation !== generationRef.current) return current; // a retry() or filter change superseded this page
        if (current.status !== 'ready') return current;
        if (outcome.kind !== 'ok') return { ...current, loadingMore: false };
        return {
          ...current,
          items: [...current.items, ...outcome.data.items],
          total: outcome.data.total,
          nextPage: outcome.data.nextPage,
          loadingMore: false,
        };
      });
    });
  }, [fetchAllBookings, filters, state]);

  const markCancelled = useCallback((bookingId: string) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === bookingId ? { ...item, status: 'cancelled' } : item)),
      };
    });
  }, []);

  return { ...state, retry: () => setAttempt((a) => a + 1), loadMore, markCancelled };
}

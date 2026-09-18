/**
 * The fetch/accumulation seam behind `MyBookings` (US-010/AC-01, AC-03, AC-08, AC-09). Mirrors
 * `book-a-desk/use-availability.ts`'s shape where the two screens share a need (loading/ready/
 * error, `retry()`), and diverges where they don't: this screen accumulates pages rather than
 * replacing one date's data with another's, so there is no latest-wins request-id counter here —
 * design note §4.3 says it is not needed, since there is no rapidly-changing input the way a
 * selected date is on `book-a-desk`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MyBookingListItem, MyBookingsResponse, OfficeDate } from '@desk-booking/contracts';

export type MyBookingsOutcome =
  | { kind: 'ok'; data: MyBookingsResponse }
  /** Everything AC-09 covers: a transport failure, a timeout, a 5xx, a 4xx, an unparseable body.
   *  One outcome, because ST-06 is one state — the same reasoning `AvailabilityOutcome` states. */
  | { kind: 'failed' };

export type MyBookingsFetcher = (before: OfficeDate | undefined, signal: AbortSignal) => Promise<MyBookingsOutcome>;

export type MyBookingsState =
  | { status: 'loading' }
  | {
      status: 'ready';
      today: OfficeDate;
      items: MyBookingListItem[];
      nextBefore: OfficeDate | null;
      /** AC-03's "load older" press is in flight. Distinct from `status: 'loading'` (AC-08 is
       *  about the INITIAL load's skeleton, which must not reappear here). */
      loadingOlder: boolean;
    }
  | { status: 'error' };

export type UseMyBookingsResult = MyBookingsState & {
  /** Re-fetches the default page and drops any accumulated older pages (design note §4.3) —
   *  anything else could show a stale older page above fresh newer data. */
  retry: () => void;
  /** No-ops when not `ready`, when `nextBefore` is `null` (the control should not have been
   *  there), or when a previous `loadOlder()` is still in flight (double-press guard). */
  loadOlder: () => void;
};

export function useMyBookings(fetchMyBookings: MyBookingsFetcher): UseMyBookingsResult {
  const [state, setState] = useState<MyBookingsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Bumped every time the default page is (re-)fetched. `loadOlder()` captures it and checks it
  // again when its response arrives — a `retry()` while an older-page request is still in flight
  // must not let that stale page graft itself onto the fresh default page once it lands. Not a
  // hypothetical: retry() replaces `state` entirely, and without this check `loadOlder`'s own
  // `current.status !== 'ready'` guard would already have passed again by the time it resolves.
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchMyBookings(undefined, controller.signal).then(
      (outcome) => {
        if (controller.signal.aborted) return; // superseded by a retry() or unmount
        setState(
          outcome.kind === 'ok'
            ? { status: 'ready', today: outcome.data.today, items: outcome.data.items, nextBefore: outcome.data.nextBefore, loadingOlder: false }
            : { status: 'error' },
        );
      },
      () => {
        // A fetcher that rejects is a defect, not an outcome — guarded identically so a
        // superseded rejection cannot paint over fresh data (same discipline as `useAvailability`).
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );

    return () => controller.abort();
  }, [fetchMyBookings, attempt]);

  const loadOlder = useCallback(() => {
    // Reads `state` from THIS callback's own closure — recreated on every render via the `state`
    // dependency below — rather than a setState updater's side effect. A setState updater is not
    // guaranteed to run synchronously, so a cursor captured inside one is not reliably readable
    // by the very next line; that produced a real bug here (the guard always saw `undefined`, so
    // `loadOlder()` silently never issued a second request) before this fix.
    if (state.status !== 'ready' || state.nextBefore === null || state.loadingOlder) return;
    const cursor = state.nextBefore;
    const generation = generationRef.current;
    setState({ ...state, loadingOlder: true });

    const controller = new AbortController();
    void fetchMyBookings(cursor, controller.signal).then((outcome) => {
      setState((current) => {
        if (generation !== generationRef.current) return current; // a retry() superseded this page
        if (current.status !== 'ready') return current;
        if (outcome.kind !== 'ok') return { ...current, loadingOlder: false };
        return {
          ...current,
          items: [...current.items, ...outcome.data.items],
          nextBefore: outcome.data.nextBefore,
          loadingOlder: false,
        };
      });
    });
  }, [fetchMyBookings, state]);

  return { ...state, retry: () => setAttempt((a) => a + 1), loadOlder };
}

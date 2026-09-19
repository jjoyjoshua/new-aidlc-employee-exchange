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
      /** US-012/AC-04. A background `refreshQuietly()` failed; the previously loaded list stays
       *  exactly as it was. Distinct from `status: 'error'`, which replaces the whole screen —
       *  this never does (US-012/AC-03). */
      quietRefreshFailed: boolean;
    }
  | { status: 'error' };

export type UseMyBookingsResult = MyBookingsState & {
  /** Re-fetches the default page and drops any accumulated older pages (design note §4.3) —
   *  anything else could show a stale older page above fresh newer data. */
  retry: () => void;
  /** No-ops when not `ready`, when `nextBefore` is `null` (the control should not have been
   *  there), or when a previous `loadOlder()` is still in flight (double-press guard). */
  loadOlder: () => void;
  /** US-011/AC-05, design note §5.3. Flips ONE item's `status` to `'cancelled'` in place — no
   *  `retry()`, no `status: 'loading'` transition. The server already confirmed the outcome; a
   *  refetch here would re-announce "Loading your bookings" over ST-10's own toast, flash
   *  skeletons over a list the employee is reading, and drop every accumulated older page
   *  (design note §8.5). Sectioning (already built by US-010) moves the row into Past on its
   *  own, because it sections by `status`, not by a separate flag. */
  markCancelled: (bookingId: string) => void;
  /** US-012/AC-01–AC-04. Re-fetches the default page and merges it into `items` by `id` —
   *  updating fields of rows already on screen, prepending rows not seen before — without ever
   *  setting `status: 'loading'` and without touching `nextBefore` or any page `loadOlder()` has
   *  already appended (US-012/D-03). A no-op when not `ready` or when a previous call is still
   *  in flight. */
  refreshQuietly: () => void;
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
            ? {
                status: 'ready',
                today: outcome.data.today,
                items: outcome.data.items,
                nextBefore: outcome.data.nextBefore,
                loadingOlder: false,
                quietRefreshFailed: false,
              }
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

  const markCancelled = useCallback((bookingId: string) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === bookingId ? { ...item, status: 'cancelled' } : item)),
      };
    });
  }, []);

  // Synchronous, like `useCancelDialog`'s `inFlight` (US-011) — checked and set before any state
  // read, so a second regain landing while a refresh is still in flight is refused regardless of
  // whether React has re-rendered yet.
  const quietRefreshInFlight = useRef(false);

  const refreshQuietly = useCallback(() => {
    if (state.status !== 'ready' || quietRefreshInFlight.current) return;
    quietRefreshInFlight.current = true;
    const generation = generationRef.current;
    const controller = new AbortController();

    fetchMyBookings(undefined, controller.signal).then(
      (outcome) => {
        quietRefreshInFlight.current = false;
        if (controller.signal.aborted) return;
        setState((current) => {
          if (generation !== generationRef.current || current.status !== 'ready') return current; // superseded by retry()
          if (outcome.kind !== 'ok') return { ...current, quietRefreshFailed: true };

          // US-012/D-03: merge by id — update fields of rows already known, prepend rows not
          // seen before, touch neither `nextBefore` nor any page `loadOlder()` already appended.
          const freshById = new Map(outcome.data.items.map((item) => [item.id, item]));
          const merged = current.items.map((item) => freshById.get(item.id) ?? item);
          const knownIds = new Set(current.items.map((item) => item.id));
          const newItems = outcome.data.items.filter((item) => !knownIds.has(item.id));

          return { ...current, today: outcome.data.today, items: [...newItems, ...merged], quietRefreshFailed: false };
        });
      },
      () => {
        // A fetcher that rejects is a defect, not an outcome — guarded identically to the initial
        // load above, so a superseded rejection cannot paint over fresh data.
        quietRefreshInFlight.current = false;
        if (!controller.signal.aborted) {
          setState((current) => (current.status === 'ready' ? { ...current, quietRefreshFailed: true } : current));
        }
      },
    );
  }, [fetchMyBookings, state.status]);

  return { ...state, retry: () => setAttempt((a) => a + 1), loadOlder, markCancelled, refreshQuietly };
}

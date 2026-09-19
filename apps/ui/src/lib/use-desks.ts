/**
 * The desk-list fetch — moved here from `screens/all-bookings/` in US-016 (D-01), which is its
 * second real consumer alongside `FilterBar`'s desk `Select` (US-014/AC-03, §3, §7.6). Fires once
 * on mount, independent of any bookings fetch and NOT wired to `data-refresh.ts` (US-014 design
 * note §0, §7.6; US-016 design note §0.2) — the desk vocabulary changes far less often than
 * either screen it serves.
 *
 * US-017 adds `markAdded` (design note §6.5), the same "update in place, never refetch" shape
 * `useMyBookings`'s `markCancelled` already established: the server already confirmed the
 * outcome, so a refetch here would flash skeletons over a list `Desks` is reading.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AdminDesk } from '@desk-booking/contracts';

export type DesksOutcome =
  | { kind: 'ok'; desks: AdminDesk[] }
  /** A desk-list failure must not take `AllBookings` to ST-05 — bookings are that screen, desks
   *  are its vocabulary (US-014 design note §7.6). `Desks` (US-016) is the opposite case: a
   *  desk-list failure IS its own ST-04, handled by the caller reading `status: 'error'` here,
   *  not by this hook. */
  | { kind: 'failed' };

export type DesksFetcher = (signal: AbortSignal) => Promise<DesksOutcome>;

export type DesksState =
  | { status: 'loading' }
  | { status: 'ready'; desks: AdminDesk[] }
  | { status: 'error' };

export type UseDesksResult = DesksState & {
  /** US-017/AC-01, AC-06 (design note §6.5). Inserts one desk into the ready list, sorted by
   *  `deskNumber` — a plain string comparison is correct here because the format is fixed-width
   *  (`A-01`), so lexicographic order IS the intended total order (`bookings.repository.ts`'s
   *  own reasoning for the same property). A no-op when not `ready`. */
  markAdded: (desk: AdminDesk) => void;
};

export function useDesks(fetchDesks: DesksFetcher): UseDesksResult {
  const [state, setState] = useState<DesksState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchDesks(controller.signal).then(
      (outcome) => {
        if (controller.signal.aborted) return;
        setState(outcome.kind === 'ok' ? { status: 'ready', desks: outcome.desks } : { status: 'error' });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );

    return () => controller.abort();
  }, [fetchDesks]);

  const markAdded = useCallback((desk: AdminDesk) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const desks = [...current.desks, desk].sort((a, b) => (a.deskNumber < b.deskNumber ? -1 : a.deskNumber > b.deskNumber ? 1 : 0));
      return { ...current, desks };
    });
  }, []);

  return { ...state, markAdded };
}

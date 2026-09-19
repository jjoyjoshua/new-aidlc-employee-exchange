/**
 * The desk-list fetch — moved here from `screens/all-bookings/` in US-016 (D-01), which is its
 * second real consumer alongside `FilterBar`'s desk `Select` (US-014/AC-03, §3, §7.6). Fires once
 * on mount, independent of any bookings fetch and NOT wired to `data-refresh.ts` (US-014 design
 * note §0, §7.6; US-016 design note §0.2) — the desk vocabulary changes far less often than
 * either screen it serves.
 *
 * US-017 adds `markAdded` (design note §6.5), the same "update in place, never refetch" shape
 * `useMyBookings`'s `markCancelled` already established: the server already confirmed the
 * outcome, so a refetch here would flash skeletons over a list `Desks` is reading. US-018 adds
 * `markRenamed` on the same principle (design note §6.3) — it takes `(id, deskNumber)`, not a
 * whole `AdminDesk`, so a rename can never clobber the `bookedAhead` count the response doesn't
 * carry (US-018 design note §3.3).
 */
import { useCallback, useEffect, useState } from 'react';
import type { AdminDesk } from '@desk-booking/contracts';

/** Fixed-width desk numbers (`A-01`) sort correctly as plain strings — the total order US-017's
 *  `markAdded` and US-018's `markRenamed` both need, extracted so the two cannot diverge. */
function byDeskNumber(a: AdminDesk, b: AdminDesk): number {
  return a.deskNumber < b.deskNumber ? -1 : a.deskNumber > b.deskNumber ? 1 : 0;
}

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
  /** US-018/AC-01, AC-06 (design note §6.3). Replaces the named desk's number in place and
   *  re-sorts — mandatory, not defensive: a rename across a zone letter (`A-01` -> `B-05`, the
   *  story's own edge case) must move the row. Takes `(id, deskNumber)`, never a whole
   *  `AdminDesk`, so the desk's `bookedAhead` (which the rename response does not carry) is
   *  preserved rather than replaced. A no-op when not `ready`. */
  markRenamed: (id: string, deskNumber: string) => void;
  /**
   * US-019/AC-10 (design note §8.6). Flips the named desk's `isActive` in place — no re-sort,
   * unlike `markRenamed`: the order is `desk_number` ASC and a state change never touches the
   * number, so calling `byDeskNumber` here would be harmless but misleading.
   *
   * On DEACTIVATION only, also sets `bookedAhead: 0` — the correction the ST-09 frame draws (an
   * em dash), and the browser is entitled to it: a successful deactivation only ever happens when
   * the live count was zero, so this is reading the meaning of a success already given, not
   * re-evaluating BR-001.9 (decisions.md D-03). Activation sets no count — the server never read
   * it, so the browser's existing value is the best available. A no-op when not `ready`.
   */
  markStateChanged: (id: string, isActive: boolean) => void;
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
      const desks = [...current.desks, desk].sort(byDeskNumber);
      return { ...current, desks };
    });
  }, []);

  const markRenamed = useCallback((id: string, deskNumber: string) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const desks = current.desks
        .map((desk) => (desk.id === id ? { ...desk, deskNumber } : desk))
        .sort(byDeskNumber);
      return { ...current, desks };
    });
  }, []);

  const markStateChanged = useCallback((id: string, isActive: boolean) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      return {
        ...current,
        desks: current.desks.map((desk) =>
          desk.id === id ? { ...desk, isActive, ...(isActive ? {} : { bookedAhead: 0 }) } : desk,
        ),
      };
    });
  }, []);

  return { ...state, markAdded, markRenamed, markStateChanged };
}

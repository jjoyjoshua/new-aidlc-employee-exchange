/**
 * The desk-list fetch — moved here from `screens/all-bookings/` in US-016 (D-01), which is its
 * second real consumer alongside `FilterBar`'s desk `Select` (US-014/AC-03, §3, §7.6). Fires once
 * on mount, independent of any bookings fetch and NOT wired to `data-refresh.ts` (US-014 design
 * note §0, §7.6; US-016 design note §0.2) — the desk vocabulary changes far less often than
 * either screen it serves.
 */
import { useEffect, useState } from 'react';
import type { AdminDesk } from '@desk-booking/contracts';

export type DesksOutcome =
  | { kind: 'ok'; desks: AdminDesk[] }
  /** A desk-list failure must not take `AllBookings` to ST-05 — bookings are that screen, desks
   *  are its vocabulary (US-014 design note §7.6). `Desks` (US-016) is the opposite case: a
   *  desk-list failure IS its own ST-04, handled by the caller reading `status: 'error'` here,
   *  not by this hook. */
  | { kind: 'failed' };

export type DesksFetcher = (signal: AbortSignal) => Promise<DesksOutcome>;

export type UseDesksResult =
  | { status: 'loading' }
  | { status: 'ready'; desks: AdminDesk[] }
  | { status: 'error' };

export function useDesks(fetchDesks: DesksFetcher): UseDesksResult {
  const [state, setState] = useState<UseDesksResult>({ status: 'loading' });

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

  return state;
}

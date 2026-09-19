/**
 * The desk-list fetch behind `FilterBar`'s desk `Select` (US-014/AC-03, §3, §7.6). Fires once on
 * mount, independent of the bookings fetch and NOT wired to `data-refresh.ts` (design note §0,
 * §7.6) — the desk vocabulary changes far less often than the booking list it filters.
 */
import { useEffect, useState } from 'react';
import type { AdminDesk } from '@desk-booking/contracts';

export type DesksOutcome =
  | { kind: 'ok'; desks: AdminDesk[] }
  /** A desk-list failure must not take the screen to ST-05 — bookings are the screen, desks are
   *  its vocabulary (design note §7.6). The desk `Select` renders disabled instead. */
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

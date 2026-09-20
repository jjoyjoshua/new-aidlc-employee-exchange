/**
 * The people-list fetch (US-020/AC-01, AC-02, AC-04, AC-06). Mirrors `use-desks.ts`'s shape
 * exactly, including its abort-controller discipline (the in-flight request is aborted whenever
 * the fetcher identity changes, matching `useEffect`'s cleanup on every dependency change).
 *
 * Deliberately a ONE-argument fetcher — `(signal) => Promise<UsersOutcome>` — never
 * `useUsers(fetchUsers, q)` (design note A8/§7.5). `People.tsx` threads the committed search term
 * through a `useCallback` closure, `Desks.tsx:110-117`'s own `stableFetch` device, so the abort
 * discipline below is free for a committed re-search exactly as it already is for desks' own
 * retry. No `markAdded`/`markRenamed`/`markStateChanged` here — this story's slice is read-only
 * (US-020 is `modules/users`'s first slice); those verbs belong to US-023 – US-027.
 */
import { useEffect, useState } from 'react';
import type { AdminSummary, AdminUser } from '@desk-booking/contracts';

export type UsersOutcome =
  | { kind: 'ok'; users: AdminUser[]; summary: AdminSummary }
  | { kind: 'failed' };

export type UsersFetcher = (signal: AbortSignal) => Promise<UsersOutcome>;

export type UsersState =
  | { status: 'loading' }
  | { status: 'ready'; users: AdminUser[]; summary: AdminSummary }
  | { status: 'error' };

export function useUsers(fetchUsers: UsersFetcher): UsersState {
  const [state, setState] = useState<UsersState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchUsers(controller.signal).then(
      (outcome) => {
        if (controller.signal.aborted) return;
        setState(
          outcome.kind === 'ok' ? { status: 'ready', users: outcome.users, summary: outcome.summary } : { status: 'error' },
        );
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );

    return () => controller.abort();
  }, [fetchUsers]);

  return state;
}

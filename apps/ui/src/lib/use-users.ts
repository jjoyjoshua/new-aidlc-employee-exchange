/**
 * The people-list fetch (US-020/AC-01, AC-02, AC-04, AC-06). Mirrors `use-desks.ts`'s shape
 * exactly, including its abort-controller discipline (the in-flight request is aborted whenever
 * the fetcher identity changes, matching `useEffect`'s cleanup on every dependency change).
 *
 * Deliberately a ONE-argument fetcher — `(signal) => Promise<UsersOutcome>` — never
 * `useUsers(fetchUsers, q)` (design note A8/§7.5). `People.tsx` threads the committed search term
 * through a `useCallback` closure, `Desks.tsx:110-117`'s own `stableFetch` device, so the abort
 * discipline below is free for a committed re-search exactly as it already is for desks' own
 * retry.
 *
 * US-021 adds `markAdded` (design note §4.1, §4.2, A5, A6). Two corrections to the naive
 * "append like `use-desks.ts`'s own `markAdded`" reading: the list is `full_name` ASC
 * server-side, so an append puts every new person last until the next fetch (A5); and this
 * hook never sees the active search term, so appending unconditionally would insert a row into
 * a FILTERED view the server alone can evaluate correctly (A6) — the match line's numerator
 * would disagree with what renders, and a no-match `EmptyState` would be silently replaced by
 * one non-matching row.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AdminSummary, AdminUser } from '@desk-booking/contracts';

export type UsersOutcome =
  | { kind: 'ok'; users: AdminUser[]; summary: AdminSummary }
  | { kind: 'failed' };

export type UsersFetcher = (signal: AbortSignal) => Promise<UsersOutcome>;

export type UsersState =
  | { status: 'loading' }
  | { status: 'ready'; users: AdminUser[]; summary: AdminSummary }
  | { status: 'error' };

/** The list's own server-side order (`users.repository.ts`'s `listAccounts`) — extracted so the
 *  two cannot diverge (`use-desks.ts`'s `byDeskNumber` is the precedent for this exact reasoning).
 *  `localeCompare` and Postgres's collation are not guaranteed the same total order, so this is
 *  the client's best approximation until the next fetch, never an exactness guarantee. */
function byFullName(a: AdminUser, b: AdminUser): number {
  return a.fullName.localeCompare(b.fullName);
}

export interface MarkAddedOptions {
  /** `committedQ === undefined` from the caller — no active search. `false` while a search is
   *  active: the array is left alone (design note §4.2, A6), and the ST-07 toast is the whole
   *  of the confirmation until the search is cleared or re-run. */
  appendToList: boolean;
}

export type UseUsersResult = UsersState & {
  /**
   * US-021/AC-01, AC-06 (ST-07). `summary.total` and exactly one of `summary.employees`/
   * `summary.admins` (by `account.role`) always increment together, so `employees + admins ===
   * total` never goes false on the client — the same invariant `users.service.ts`'s own tests
   * assert server-side. The `users` array only gains the new row when `options.appendToList`,
   * inserted at its SORTED position via `byFullName`, never appended (A5). A no-op before the
   * first successful load, the same hazard `use-desks.ts`'s own `markAdded` already has and
   * does not guard against — `Add person` renders enabled during `loading` (US-020 §10), so
   * this is a pre-existing, documented gap, not a regression (A15).
   */
  markAdded: (account: AdminUser, options: MarkAddedOptions) => void;
};

export function useUsers(fetchUsers: UsersFetcher): UseUsersResult {
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

  const markAdded = useCallback((account: AdminUser, { appendToList }: MarkAddedOptions) => {
    setState((current) => {
      if (current.status !== 'ready') return current;

      const summary = {
        ...current.summary,
        total: current.summary.total + 1,
        employees: current.summary.employees + (account.role === 'employee' ? 1 : 0),
        admins: current.summary.admins + (account.role === 'admin' ? 1 : 0),
      };

      const users = appendToList ? [...current.users, account].sort(byFullName) : current.users;

      return { ...current, users, summary };
    });
  }, []);

  return { ...state, markAdded };
}

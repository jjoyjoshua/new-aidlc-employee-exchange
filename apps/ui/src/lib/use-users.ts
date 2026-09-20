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
 *
 * US-023 adds `markUpdated` (design note §4.2) — NOT `markAdded` with a different verb, and the
 * differences matter: (1) `summary` is UNCHANGED — US-023 alters neither `role` nor `is_active`,
 * so no count moves, unlike `markAdded`'s two increments just above; (2) the row is replaced by
 * `id` and the array is RE-SORTED via `byFullName`, because a name change can move a row within a
 * `full_name` ASC list; (3) the row is replaced IN PLACE, even under an active search, never
 * removed — `markAdded` had to abstain from touching a filtered view because inserting a row is
 * the hook inventing a server-side filter decision, but `markUpdated`'s row is already rendered:
 * leaving it showing the OLD name after a successful save would read as a failed save. Renaming a
 * match out of the current search term leaves one stale-but-visible row until the next fetch —
 * the lesser wrong, and the match line's numerator is unaffected because `summary` does not change.
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
  /**
   * US-023/AC-01 (ST-07). Replaces the row matching `account.id` with the updated values and
   * re-sorts via `byFullName` — `summary` is left byte-identical, on purpose (see the module
   * docblock). A no-op before the first successful load, the same pre-existing, documented gap
   * `markAdded` carries (A15) — this screen's edit action is reached from a rendered row, so in
   * practice that gap is unreachable for this function specifically, unlike `markAdded`'s
   * `Add person` button.
   */
  markUpdated: (account: AdminUser) => void;
  /**
   * US-024/AC-01, AC-11. NOT `markUpdated`: that method leaves `summary` byte-identical because
   * US-023 never changes `role`/`is_active`; a role change moves exactly two of the summary's
   * four counts, in opposite directions, by exactly one each — `employees`/`admins` shift,
   * `total`/`deactivated` never do (design note §4.1). The delta is read from `account.role`, the
   * NEW value, against the row it replaces — never from `account.isActive`, because
   * `users.service.ts`'s `tallySummary` counts every admin row regardless of `is_active` (US-024's
   * own summary-vs-BR-001.11 distinction, D-03's rationale): a role change on a DEACTIVATED
   * account still moves these counts, exactly as one on an active account does.
   */
  markRoleChanged: (account: AdminUser) => void;
  /**
   * US-025/AC-13. NOT `markRoleChanged`'s shape: a deactivation moves `summary.deactivated` by
   * +1 only — `total` (the population is unchanged) and `employees`/`admins` (role is untouched)
   * stay exactly as they were. The row is replaced in place; sorted via `byFullName` for the same
   * defensive consistency `markRoleChanged` applies, though a name never changes here.
   */
  markDeactivated: (account: AdminUser) => void;
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

  const markUpdated = useCallback((account: AdminUser) => {
    setState((current) => {
      if (current.status !== 'ready') return current;

      // `summary` is spread through UNCHANGED — no count moves for a name/email correction.
      const users = current.users.map((row) => (row.id === account.id ? account : row)).sort(byFullName);

      return { ...current, users };
    });
  }, []);

  const markRoleChanged = useCallback((account: AdminUser) => {
    setState((current) => {
      if (current.status !== 'ready') return current;

      const previous = current.users.find((row) => row.id === account.id);
      // No prior row (should not happen — this is only ever called for a row just acted on):
      // replace in place, but do not guess at a summary delta with nothing to compute it from.
      if (!previous) return { ...current, users: current.users.map((row) => (row.id === account.id ? account : row)) };

      const summary = {
        ...current.summary,
        // `total` and `deactivated` are UNCHANGED — the population did not change and neither did
        // anyone's active state (`markUpdated`'s own reasoning, applied here for a different pair
        // of columns). Only the role bucket moves, both ways at once.
        employees: current.summary.employees + (account.role === 'employee' ? 1 : -1),
        admins: current.summary.admins + (account.role === 'admin' ? 1 : -1),
      };

      const users = current.users.map((row) => (row.id === account.id ? account : row)).sort(byFullName);

      return { ...current, users, summary };
    });
  }, []);

  const markDeactivated = useCallback((account: AdminUser) => {
    setState((current) => {
      if (current.status !== 'ready') return current;

      // `total`/`employees`/`admins` are UNCHANGED — the population did not change and neither did
      // anyone's role (`markUpdated`'s own reasoning, applied to the one column this story moves).
      const summary = { ...current.summary, deactivated: current.summary.deactivated + 1 };
      const users = current.users.map((row) => (row.id === account.id ? account : row)).sort(byFullName);

      return { ...current, users, summary };
    });
  }, []);

  return { ...state, markAdded, markUpdated, markRoleChanged, markDeactivated };
}

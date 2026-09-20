/**
 * The real `fetchUsers` — mirrors `fetch-desks.ts`'s shape exactly. Adapts `ApiClient`'s
 * `ApiResult<AdminUsersResponse>` to the `UsersOutcome` `useUsers` expects (US-020/AC-01, AC-02,
 * AC-04, AC-06). Takes `(q, signal)`, not `(signal)` alone — `q` is the one thing that varies
 * between calls; `People.tsx` closes over the committed term in its own `stableFetch`
 * (design note §7.5, A8), matching `fetch-desks.ts`'s single caller composing it the same way.
 */
import { adminUsersResponseSchema } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import type { UsersOutcome } from './use-users.js';

/** The type `createFetchUsers` returns — `(q, signal) => Promise<UsersOutcome>`, kept distinct
 *  from `UsersFetcher` (`use-users.ts`'s one-argument shape) so the two-argument-to-one-argument
 *  narrowing in `People.tsx`'s `stableFetch` closure is visible at the type level. */
export type FetchUsers = (q: string | undefined, signal: AbortSignal) => Promise<UsersOutcome>;

export function createFetchUsers(api: ApiClient): FetchUsers {
  return async (q: string | undefined, signal: AbortSignal): Promise<UsersOutcome> => {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    const result = await api.request(`/api/admin/users${query}`, adminUsersResponseSchema, { signal });
    if (result.kind !== 'ok') return { kind: 'failed' };
    return { kind: 'ok', users: result.data.users, summary: result.data.summary };
  };
}

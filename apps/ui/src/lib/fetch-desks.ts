/**
 * The real `fetchDesks` — moved here from `screens/all-bookings/` in US-016 (D-01), alongside
 * `use-desks.ts`. Adapts `ApiClient`'s `ApiResult<AdminDesksResponse>` to the `DesksOutcome`
 * `useDesks` expects. Mirrors `fetch-all-bookings.ts`'s shape; a single GET with no parameters
 * (US-014 design note §3.3, §7.6; US-016 design note §3.3).
 */
import { adminDesksResponseSchema } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import type { DesksFetcher, DesksOutcome } from './use-desks.js';

export function createFetchDesks(api: ApiClient): DesksFetcher {
  return async (signal: AbortSignal): Promise<DesksOutcome> => {
    const result = await api.request('/api/admin/desks', adminDesksResponseSchema, { signal });
    if (result.kind !== 'ok') return { kind: 'failed' };
    return { kind: 'ok', desks: result.data.desks };
  };
}

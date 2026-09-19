/**
 * The real `fetchDesks` — adapts `ApiClient`'s `ApiResult<AdminDesksResponse>` to the
 * `DesksOutcome` `useDesks` expects. Mirrors `fetch-all-bookings.ts`'s shape; a single GET with no
 * parameters (design note §3.3, §7.6).
 */
import { adminDesksResponseSchema } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import type { DesksFetcher, DesksOutcome } from './use-desks.js';

export function createFetchDesks(api: ApiClient): DesksFetcher {
  return async (signal: AbortSignal): Promise<DesksOutcome> => {
    const result = await api.request('/api/admin/desks', adminDesksResponseSchema, { signal });
    if (result.kind !== 'ok') return { kind: 'failed' };
    return { kind: 'ok', desks: result.data.desks };
  };
}

/**
 * The real `fetchAllBookings` — adapts `ApiClient`'s `ApiResult<AllBookingsResponse>` to the
 * `AllBookingsOutcome` `useAllBookings` expects. Mirrors `fetch-my-bookings.ts`'s shape; diverges
 * only in the cursor — a page number, not a date (design note §2.4, this story's folder in
 * `inception/specs/`).
 *
 * Every `ApiResult` branch but `ok` collapses to `failed`, the same reasoning `fetch-my-bookings.ts`
 * gives: a transport failure, a timeout, a 5xx, a 4xx and an unparseable body are all one screen
 * state, ST-05.
 */
import { allBookingsResponseSchema, type AllBookingsResponse } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import { toQueryString } from './filters.js';
import type { AllBookingsFetcher, AllBookingsOutcome } from './use-all-bookings.js';

export function createFetchAllBookings(api: ApiClient): AllBookingsFetcher {
  return async (filters, page: number, signal: AbortSignal): Promise<AllBookingsOutcome> => {
    const query = toQueryString(filters, page);
    const result = await api.request(`/api/admin/bookings${query}`, allBookingsResponseSchema, { signal });

    if (result.kind !== 'ok') return { kind: 'failed' };

    // `nextPage` always parses to its defaulted shape (`.default(null)` guarantees it) — rebuilt
    // here for the same generic-inference reason `fetch-my-bookings.ts` documents for `nextBefore`.
    const data: AllBookingsResponse = { ...result.data, nextPage: result.data.nextPage ?? null };
    return { kind: 'ok', data };
  };
}

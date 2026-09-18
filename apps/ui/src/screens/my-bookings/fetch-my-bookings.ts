/**
 * The real `fetchMyBookings` — adapts `ApiClient`'s `ApiResult<MyBookingsResponse>` to the
 * `MyBookingsOutcome` `useMyBookings` expects. Mirrors `book-a-desk/fetch-availability.ts`'s
 * shape exactly (design note §4.3) — the only precedent in this codebase for this fetch seam.
 *
 * Every `ApiResult` branch but `ok` collapses to `failed`: a transport failure, a timeout, a 5xx,
 * a 4xx and an unparseable body are all one screen state, ST-06.
 */
import { myBookingsResponseSchema, type MyBookingsResponse, type OfficeDate } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import type { MyBookingsFetcher, MyBookingsOutcome } from './use-my-bookings.js';

export function createFetchMyBookings(api: ApiClient): MyBookingsFetcher {
  return async (before: OfficeDate | undefined, signal: AbortSignal): Promise<MyBookingsOutcome> => {
    const query = before ? `?before=${before}` : '';
    const result = await api.request(`/api/bookings${query}`, myBookingsResponseSchema, { signal });

    if (result.kind !== 'ok') return { kind: 'failed' };

    // `nextBefore` always parses to its defaulted shape (`.default(null)` guarantees it), but
    // inferring `T` from `ZodType<T>` at the call site above widens it to include `undefined` —
    // the same generic-inference quirk `fetch-availability.ts` documents. Rebuilt here rather
    // than touching `api-client.ts`.
    const data: MyBookingsResponse = { ...result.data, nextBefore: result.data.nextBefore ?? null };
    return { kind: 'ok', data };
  };
}

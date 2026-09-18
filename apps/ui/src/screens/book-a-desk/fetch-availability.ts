/**
 * The real `fetchAvailability` — adapts `ApiClient`'s `ApiResult<AvailabilityResponse>` to the
 * `AvailabilityOutcome` `useAvailability` expects. US-006 design note §4.1.
 *
 * Every `ApiResult` branch but `ok` collapses to `failed`: a transport failure, a timeout, a 5xx,
 * a 4xx refusal (including the `date_not_bookable` this screen's own date controls make
 * unreachable) and an unparseable body are all one screen state, ST-06 (design note §2.7).
 */
import { availabilityResponseSchema, type AvailabilityResponse, type OfficeDate } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import type { AvailabilityFetcher, AvailabilityOutcome } from './use-availability.js';

export function createFetchAvailability(api: ApiClient): AvailabilityFetcher {
  return async (date: OfficeDate, signal: AbortSignal): Promise<AvailabilityOutcome> => {
    const result = await api.request(
      `/api/bookings/availability?date=${date}`,
      availabilityResponseSchema,
      { signal },
    );

    if (result.kind !== 'ok') return { kind: 'failed' };

    // `myBooking` always parses to `MyBooking | null` (the schema's `.default(null)` guarantees
    // it), but inferring `T` from `ZodType<T>` at the call site above widens it to include
    // `undefined` — a TypeScript/Zod generic-inference quirk, not a real possibility at runtime.
    // Rebuilding the field closes the gap without touching `api-client.ts`.
    const data: AvailabilityResponse = { ...result.data, myBooking: result.data.myBooking ?? null };
    return { kind: 'ok', data };
  };
}

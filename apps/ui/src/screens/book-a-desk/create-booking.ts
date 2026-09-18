/**
 * The real `createBooking` fetcher behind `useBookDesk` — adapts `ApiClient`'s
 * `ApiResult<Booking>` to `CreateBookingOutcome`, the same seam shape `fetch-availability.ts`
 * already established for `GET /availability` (US-006 design note §4.1).
 */
import { bookingSchema, ERROR_CODES, type OfficeDate } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import type { CreateBookingFetcher, CreateBookingOutcome } from './use-book-desk.js';

export function createCreateBooking(api: ApiClient): CreateBookingFetcher {
  return async (input: { date: OfficeDate; deskId: string }, signal: AbortSignal): Promise<CreateBookingOutcome> => {
    const result = await api.request('/api/bookings', bookingSchema, {
      method: 'POST',
      body: input,
      signal,
    });

    if (result.kind === 'ok') return { kind: 'ok', booking: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.desk_already_booked) return { kind: 'desk_conflict' };
    if (result.kind === 'error' && result.code === ERROR_CODES.already_booked_that_date) {
      return { kind: 'user_conflict' };
    }
    // date_not_bookable / desk_not_found / desk_inactive (unreachable via this screen's own
    // controls), any other error, and `unavailable` (transport failure, timeout, 5xx) are all
    // AC-10's one generic failure.
    return { kind: 'failed' };
  };
}

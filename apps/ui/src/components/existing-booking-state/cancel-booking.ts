/**
 * The real `cancelBooking` fetcher behind `ExistingBookingState` (US-007/AC-07, FR-12, FR-06).
 *
 * `POST /api/bookings/:id/cancel` answers `200` with an empty body — `requestNoContent` is the
 * matching browser-side seam, the same one `signOut()` already uses (US-002).
 *
 * `404 booking_not_found` is mapped to `ok`, not `failed` (Architect design note §3.4, finding
 * F-6): the endpoint is deliberately undiscriminated (D-03), so a 404 here can mean "already
 * cancelled" — a double-confirm, since this story builds no double-submit guard on cancel
 * (spec.md's Out of scope). A 404 means the booking is no longer Confirmed, which is exactly the
 * state the employee asked for — showing a failure for something that already happened would be
 * the worst of the three possible behaviours.
 */
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';

export type CancelBookingOutcome = { kind: 'ok' } | { kind: 'failed' };
export type CancelBookingFetcher = (bookingId: string) => Promise<CancelBookingOutcome>;

export function createCancelBooking(api: ApiClient): CancelBookingFetcher {
  return async (bookingId: string): Promise<CancelBookingOutcome> => {
    const result = await api.requestNoContent(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });

    if (result.kind === 'ok') return { kind: 'ok' };
    if (result.kind === 'error' && result.code === ERROR_CODES.booking_not_found) return { kind: 'ok' };
    return { kind: 'failed' };
  };
}

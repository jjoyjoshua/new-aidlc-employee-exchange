/**
 * The real `cancelBooking` fetcher — US-007/AC-07's `ExistingBookingState` (SCR-003 ST-10) and
 * US-011's `MyBookings` (SCR-002 ST-07–ST-10) both consume this. Moved here from
 * `components/existing-booking-state/` once it had two real consumers (US-011 design note §5.2)
 * — the same "two real consumers in front of it" bar US-010 applied to `BookingRow`.
 *
 * `POST /api/bookings/:id/cancel` answers `200` with an empty body — `requestNoContent` is the
 * matching browser-side seam, the same one `signOut()` already uses (US-002).
 *
 * Four outcomes, not two — widened by US-011 because the endpoint's own failure shape widened
 * (design note §3): a `409 booking_already_cancelled` is now reachable, distinct from the
 * existing `404 booking_not_found`. Each screen collapses what it does not need:
 *   - `ExistingBookingState` (SCR-003) folds `already_cancelled` and `refused` into its own `ok`
 *     — preserving US-007/AC-07's converge-don't-fail behaviour exactly (design note §8.2).
 *   - `MyBookings` (SCR-002) uses all four, because ST-09 renders `already_cancelled` and
 *     `refused`/`failed` differently (design note §5.3).
 *
 * US-015 adds `createAdminCancelBooking`, a SIBLING rather than a parameter on the function
 * above: the two endpoints sit behind different guards (`/api/bookings` vs `/api/admin/bookings`),
 * and a single function taking a variable path would erase exactly that difference at the call
 * site — the same species of argument US-013/US-014 give for keeping their own cross-employee
 * reads on a separate object rather than a parameterized method. The outcome mapping is identical
 * (both endpoints answer with the same codes), so it is extracted once and shared, never
 * duplicated.
 */
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient, ApiResult } from './api-client.js';

export type CancelBookingOutcome =
  | { kind: 'ok' }
  /** US-011/AC-09 — 409. The booking is gone, and the caller is told so distinctly (SCR-002 ST-09). */
  | { kind: 'already_cancelled' }
  /** The server ANSWERED a refusal with no distinguishable reason — today, only
   *  `booking_not_found` (US-011/AC-02's past-dated refusal folds in here too). Distinct from
   *  `failed`: a server answer means our view of this booking is provably wrong, which is why a
   *  screen may choose to refresh on it; a transport failure means we learned nothing (design
   *  note §2.3, open item 1). */
  | { kind: 'refused' }
  /** Transport failure, timeout, 5xx, unparseable body. */
  | { kind: 'failed' };
export type CancelBookingFetcher = (bookingId: string) => Promise<CancelBookingOutcome>;

/** Shared by both factories below: the two endpoints answer with the identical code vocabulary
 *  (`booking_already_cancelled`, `booking_not_found`), so there is exactly one place this mapping
 *  is written. */
function mapCancelResult(result: ApiResult<void>): CancelBookingOutcome {
  if (result.kind === 'ok') return { kind: 'ok' };
  if (result.kind === 'error' && result.code === ERROR_CODES.booking_already_cancelled) {
    return { kind: 'already_cancelled' };
  }
  if (result.kind === 'error' && result.code === ERROR_CODES.booking_not_found) return { kind: 'refused' };
  return { kind: 'failed' };
}

export function createCancelBooking(api: ApiClient): CancelBookingFetcher {
  return async (bookingId: string): Promise<CancelBookingOutcome> => {
    const result = await api.requestNoContent(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });
    return mapCancelResult(result);
  };
}

/**
 * US-015 — the ADMIN cancel, `POST /api/admin/bookings/:id/cancel`. Behind `requireAdmin`
 * (`http/app.ts`), never called from an employee-facing screen.
 */
export function createAdminCancelBooking(api: ApiClient): CancelBookingFetcher {
  return async (bookingId: string): Promise<CancelBookingOutcome> => {
    const result = await api.requestNoContent(`/api/admin/bookings/${bookingId}/cancel`, { method: 'POST' });
    return mapCancelResult(result);
  };
}

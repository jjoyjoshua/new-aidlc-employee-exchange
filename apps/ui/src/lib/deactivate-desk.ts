/**
 * The real `deactivateDesk` fetcher behind `Desks`' deactivate flow — `POST
 * /api/admin/desks/:id/deactivate` (US-019 design note §7.1).
 *
 * Three outcomes, not two: unlike `activate-desk.ts`, BR-001.9's hard block is a real, distinct
 * refusal with its own copy (ST-06) — `ok`, `blocked`, `failed`.
 */
import { deskBlockedDetailsSchema, deskStateResponseSchema, ERROR_CODES, type DeskStateResponse } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type DeactivateDeskOutcome =
  | { kind: 'ok'; desk: DeskStateResponse }
  /** US-019/AC-04 — 422 `desk_has_upcoming_bookings`, ST-06. The count is the SERVER's, measured
   *  in the refusing request (design note §4, §6) — never the row's own `bookedAhead`, which is
   *  provably 0 on the one path that reaches here (§4.5, option E). */
  | { kind: 'blocked'; upcomingBookings: number }
  /** US-019/AC-11 — ST-08. Transport failure, timeout, 5xx, an unparseable body, a 404
   *  (design note §3.5: the endpoint distinguishes it, the screen has no approved copy for it),
   *  OR a `desk_has_upcoming_bookings` whose `details` did not parse (design note §7.3). */
  | { kind: 'failed' };
export type DeactivateDeskFetcher = (id: string) => Promise<DeactivateDeskOutcome>;

export function createDeactivateDesk(api: ApiClient): DeactivateDeskFetcher {
  return async (id: string): Promise<DeactivateDeskOutcome> => {
    const result = await api.request(`/api/admin/desks/${id}/deactivate`, deskStateResponseSchema, {
      method: 'POST',
    });

    if (result.kind === 'ok') return { kind: 'ok', desk: result.data };

    if (result.kind === 'error' && result.code === ERROR_CODES.desk_has_upcoming_bookings) {
      const details = deskBlockedDetailsSchema.safeParse(result.details);
      if (details.success) return { kind: 'blocked', upcomingBookings: details.data.upcomingBookings };
      // A refusal the screen cannot state correctly is worse than a retryable failure — the same
      // rule `api-client.ts`'s own unparseable-success-body branch states. The warning is here,
      // not silent, for the same reason: a silent `failed` would be indistinguishable from a real
      // outage in a bug report.
      console.warn('[desks] blocked refusal carried no usable count', { code: result.code });
      return { kind: 'failed' };
    }

    return { kind: 'failed' };
  };
}

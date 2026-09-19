/**
 * The real `addDesk` fetcher behind `useAddDeskDialog` — adapts `ApiClient`'s
 * `ApiResult<AdminDesk>` to `AddDeskOutcome`, the same seam shape `create-booking.ts` established
 * for `POST /api/bookings` (US-017 design note §3.5).
 *
 * Three outcomes, not four: unlike `cancel-booking.ts`, there is no second server-answered
 * refusal to separate from a transport failure — AC-07 explicitly groups every non-duplicate
 * failure (server error, timeout, lost connection) into one state.
 */
import { adminDeskSchema, ERROR_CODES, type AdminDesk } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type AddDeskOutcome =
  | { kind: 'ok'; desk: AdminDesk }
  /** US-017/AC-04 — 409 `desk_number_taken`. The ONE refusal with copy of its own (SCR-007 ST-04). */
  | { kind: 'duplicate' }
  /** US-017/AC-07 — transport failure, timeout, 5xx, an unparseable body, or a 400 the browser's
   *  own validation should have caught. Reaching `failed` via a 400 means the browser's own
   *  validation was wrong — a defect to log, not a state to design for. */
  | { kind: 'failed' };
export type AddDeskFetcher = (deskNumber: string) => Promise<AddDeskOutcome>;

export function createAddDesk(api: ApiClient): AddDeskFetcher {
  return async (deskNumber: string): Promise<AddDeskOutcome> => {
    const result = await api.request('/api/admin/desks', adminDeskSchema, {
      method: 'POST',
      body: { deskNumber },
    });

    if (result.kind === 'ok') return { kind: 'ok', desk: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.desk_number_taken) return { kind: 'duplicate' };
    return { kind: 'failed' };
  };
}

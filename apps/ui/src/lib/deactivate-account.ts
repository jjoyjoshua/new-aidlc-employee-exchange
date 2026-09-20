/**
 * The real fetchers behind `DeactivateAccountDialog` (SCR-008) — `GET
 * /api/admin/users/:id/deactivation-preview` (US-025/AC-05) and `POST
 * /api/admin/users/:id/deactivate` (US-025/AC-01, AC-02, AC-04, AC-10, AC-12), mirroring
 * `change-role.ts`'s own shape for the second.
 *
 * Two outcomes for the deactivate call, not three: like `change-role.ts`'s BR-001.11 refusal, no
 * `details` payload exists on the `422` (D-03) — the confirmation dialog already holds every
 * fact the approved copy needs.
 */
import { adminUserSchema, deactivationPreviewSchema, ERROR_CODES, type AdminUser, type OfficeDate } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export interface DeactivationPreviewBooking {
  id: string;
  deskNumber: string;
  date: OfficeDate;
}

export type DeactivationPreviewOutcome =
  | { kind: 'ok'; bookings: DeactivationPreviewBooking[] }
  /** Transport failure, timeout, 5xx, or an unparseable body — `update-account.ts`'s own
   *  reasoning: no approved copy exists for "that person is gone" mid-preview. */
  | { kind: 'failed' };
export type DeactivationPreviewFetcher = (id: string, signal: AbortSignal) => Promise<DeactivationPreviewOutcome>;

export function createPreviewDeactivation(api: ApiClient): DeactivationPreviewFetcher {
  return async (id: string, signal: AbortSignal): Promise<DeactivationPreviewOutcome> => {
    const result = await api.request(`/api/admin/users/${id}/deactivation-preview`, deactivationPreviewSchema, { signal });

    if (result.kind !== 'ok') return { kind: 'failed' };
    return { kind: 'ok', bookings: result.data.bookings };
  };
}

export type DeactivateAccountOutcome =
  | { kind: 'ok'; account: AdminUser }
  /** US-025/AC-10 — 422 `last_active_admin`. BR-001.11's refusal, from the database function's
   *  reused trigger (`ADR-013`), never an in-app count. */
  | { kind: 'blocked' }
  /** US-025/AC-11 — transport failure, timeout, 5xx, an unparseable body, or a 404
   *  `user_not_found`. */
  | { kind: 'failed' };
export type DeactivateAccountFetcher = (id: string) => Promise<DeactivateAccountOutcome>;

export function createDeactivateAccount(api: ApiClient): DeactivateAccountFetcher {
  return async (id: string): Promise<DeactivateAccountOutcome> => {
    const result = await api.request(`/api/admin/users/${id}/deactivate`, adminUserSchema, { method: 'POST' });

    if (result.kind === 'ok') return { kind: 'ok', account: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.last_active_admin) return { kind: 'blocked' };
    return { kind: 'failed' };
  };
}

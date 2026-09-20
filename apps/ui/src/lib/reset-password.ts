/**
 * The real `resetPassword` fetcher behind `ResetPasswordDialog` (SCR-008) — `POST
 * /api/admin/users/:id/reset-password` (US-027), mirroring `activate-account.ts`'s shape: no
 * request body, two outcomes.
 *
 * Two outcomes, not three: unlike `deactivateAccount`'s `blocked`, a reset has no refusal rule of
 * its own — it cannot fire the last-active-admin trigger, and there is no other domain reason to
 * decline it. A 404 `user_not_found`, a 503 `service_unavailable`, a transport failure, a timeout
 * or an unparseable body all fold to `failed` (`activate-account.ts`'s own reasoning: no approved
 * copy distinguishes any of them for this action).
 */
import { resetPasswordResponseSchema, type AdminUser } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type ResetPasswordOutcome = { kind: 'ok'; account: AdminUser; password: string } | { kind: 'failed' };
export type ResetPasswordFetcher = (id: string) => Promise<ResetPasswordOutcome>;

export function createResetPassword(api: ApiClient): ResetPasswordFetcher {
  return async (id: string): Promise<ResetPasswordOutcome> => {
    const result = await api.request(`/api/admin/users/${id}/reset-password`, resetPasswordResponseSchema, {
      method: 'POST',
    });

    if (result.kind === 'ok') return { kind: 'ok', account: result.data.account, password: result.data.password };
    return { kind: 'failed' };
  };
}

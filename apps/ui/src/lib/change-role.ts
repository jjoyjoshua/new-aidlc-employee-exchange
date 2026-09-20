/**
 * The real `changeRole` fetcher behind `RoleChangeDialog` (SCR-008) and the edit form's role
 * radios (SCR-009) — `POST /api/admin/users/:id/role` (US-024 design note §3.2, one door for
 * AC-08's "one rule, two doors").
 *
 * Two outcomes, not three: unlike `deactivate-desk.ts`'s `blocked`, BR-001.11's refusal carries
 * NO `details` payload (D-03) — every fact the approved copy needs (the account's own name) is
 * already on the screen that sent the request, so there is nothing to parse and nothing that can
 * fail to parse.
 */
import { adminUserSchema, ERROR_CODES, type AdminUser, type UserRole } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type ChangeRoleOutcome =
  | { kind: 'ok'; account: AdminUser }
  /** US-024/AC-04, AC-07 — 422 `last_active_admin`. BR-001.11's refusal, from the database
   *  trigger (`ADR-013`), never an in-app count. */
  | { kind: 'blocked' }
  /** US-024/AC-10 — transport failure, timeout, 5xx, an unparseable body, or a 404
   *  `user_not_found` (`update-account.ts`'s own reasoning: no approved copy exists for "that
   *  person is gone"). */
  | { kind: 'failed' };
export type ChangeRoleFetcher = (id: string, role: UserRole) => Promise<ChangeRoleOutcome>;

export function createChangeRole(api: ApiClient): ChangeRoleFetcher {
  return async (id: string, role: UserRole): Promise<ChangeRoleOutcome> => {
    const result = await api.request(`/api/admin/users/${id}/role`, adminUserSchema, {
      method: 'POST',
      body: { role },
    });

    if (result.kind === 'ok') return { kind: 'ok', account: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.last_active_admin) return { kind: 'blocked' };
    return { kind: 'failed' };
  };
}

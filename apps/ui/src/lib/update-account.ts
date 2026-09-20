/**
 * The real `updateAccount` fetcher behind `UserFormDialog`'s edit mode — `create-account.ts`'s
 * duplicate-details handling combined with `rename-desk.ts`'s PATCH shape, for
 * `PATCH /api/admin/users/:id` (US-023 design note §4.5).
 *
 * `not_found` folds into `failed`, `rename-desk.ts`'s own reasoning: no approved SCR-009 copy
 * exists for "that person is gone", so the browser cannot distinguish it from any other failure.
 */
import {
  adminUserSchema,
  emailTakenDetailsSchema,
  ERROR_CODES,
  userUpdateSchema,
  type AdminUser,
  type UserUpdateRequest,
} from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type UpdateAccountOutcome =
  | { kind: 'ok'; account: AdminUser }
  /** US-023/AC-02 — 409 `email_taken`. The SAME state ST-04 is on create (SCR-009). */
  | { kind: 'duplicate'; fullName: string; isActive: boolean }
  /** US-023/AC-08 — transport failure, timeout, 5xx, an unparseable body, a 400 the browser's own
   *  validation should have caught, a 404 `user_not_found` (design note §3.5 — folded, as
   *  `rename-desk.ts` folds `desk_not_found`), or an `email_taken` whose `details` did not parse. */
  | { kind: 'failed' };
export type UpdateAccountFetcher = (id: string, input: UserUpdateRequest) => Promise<UpdateAccountOutcome>;

export function createUpdateAccount(api: ApiClient): UpdateAccountFetcher {
  return async (id: string, input: UserUpdateRequest): Promise<UpdateAccountOutcome> => {
    const result = await api.request(`/api/admin/users/${id}`, adminUserSchema, {
      method: 'PATCH',
      body: userUpdateSchema.parse(input),
    });

    if (result.kind === 'ok') return { kind: 'ok', account: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.email_taken) {
      const details = emailTakenDetailsSchema.safeParse(result.details);
      if (details.success) return { kind: 'duplicate', fullName: details.data.fullName, isActive: details.data.isActive };
    }
    return { kind: 'failed' };
  };
}

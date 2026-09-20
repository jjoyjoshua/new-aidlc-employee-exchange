/**
 * The real `createAccount` fetcher behind `UserFormDialog` — adapts `ApiClient`'s
 * `ApiResult<AdminUser>` to `CreateAccountOutcome`, the same seam shape `add-desk.ts` established
 * for `POST /api/admin/desks` (US-017 design note §3.5).
 *
 * `duplicate` carries the server's structured `details` (`fullName`, `isActive`), never a
 * server-composed `message` — ADR-009's second application (design note §3.1). SCR-009 ST-04's
 * approved copy bolds the holder's name inside a sentence and gives the field its own short
 * message; both are composed client-side in `screens/people/copy.ts`, from facts, not parsed out
 * of prose. A `details` that fails to parse folds to `failed`, the same discipline ADR-009
 * requires for any malformed structured detail.
 */
import {
  adminUserSchema,
  createAccountRequestSchema,
  emailTakenDetailsSchema,
  ERROR_CODES,
  type AdminUser,
  type CreateAccountRequest,
} from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type CreateAccountOutcome =
  | { kind: 'ok'; account: AdminUser }
  /** US-021/AC-06 — 409 `email_taken`. The one refusal with copy of its own (SCR-009 ST-04). */
  | { kind: 'duplicate'; fullName: string; isActive: boolean }
  /** US-021/AC-11 — transport failure, timeout, 5xx, an unparseable body, a 400 the browser's own
   *  validation should have caught, or an `email_taken` whose `details` did not parse — mirroring
   *  `AddDeskOutcome`'s own `failed` grouping. */
  | { kind: 'failed' };
export type CreateAccountFetcher = (input: CreateAccountRequest) => Promise<CreateAccountOutcome>;

export function createCreateAccount(api: ApiClient): CreateAccountFetcher {
  return async (input: CreateAccountRequest): Promise<CreateAccountOutcome> => {
    const result = await api.request('/api/admin/users', adminUserSchema, {
      method: 'POST',
      body: createAccountRequestSchema.parse(input),
    });

    if (result.kind === 'ok') return { kind: 'ok', account: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.email_taken) {
      const details = emailTakenDetailsSchema.safeParse(result.details);
      if (details.success) return { kind: 'duplicate', fullName: details.data.fullName, isActive: details.data.isActive };
    }
    return { kind: 'failed' };
  };
}

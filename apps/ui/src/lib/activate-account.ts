/**
 * The real `activateAccount` fetcher behind `People`'s activate flow — `POST
 * /api/admin/users/:id/activate` (US-026 design note §6.1), mirroring `activate-desk.ts`'s shape.
 *
 * Two outcomes, not three: like `activate-desk.ts`'s AC-09, US-026's activation has no refusal
 * rule to separate from a transport failure — reactivation cannot fire the last-active-admin
 * trigger (design note §2). Everything that is not a 200 folds to `failed`, a 404 included.
 */
import { adminUserSchema, type AdminUser } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type ActivateAccountOutcome = { kind: 'ok'; account: AdminUser } | { kind: 'failed' };
export type ActivateAccountFetcher = (id: string) => Promise<ActivateAccountOutcome>;

export function createActivateAccount(api: ApiClient): ActivateAccountFetcher {
  return async (id: string): Promise<ActivateAccountOutcome> => {
    const result = await api.request(`/api/admin/users/${id}/activate`, adminUserSchema, { method: 'POST' });

    if (result.kind === 'ok') return { kind: 'ok', account: result.data };
    return { kind: 'failed' };
  };
}

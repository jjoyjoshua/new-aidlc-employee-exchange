/**
 * The real `activateDesk` fetcher behind `Desks`' activate flow — `POST
 * /api/admin/desks/:id/activate` (US-019 design note §7.2).
 *
 * Two outcomes, not three: AC-09 has no rule, so there is no refusal to separate from a transport
 * failure. Everything that is not a 200 folds to `failed` — a 404 included, for the same reason
 * `rename-desk.ts` folds its own 404 (design note §3.5: the endpoint distinguishes it, no
 * approved copy exists for "that desk is gone").
 *
 * A separate file from `deactivate-desk.ts`, not one file with two exports — these are two
 * operations with two rules and two screen outcomes, the line US-018 §3.6 drew for
 * `rename-desk.ts` against `add-desk.ts`.
 */
import { deskStateResponseSchema, type DeskStateResponse } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type ActivateDeskOutcome = { kind: 'ok'; desk: DeskStateResponse } | { kind: 'failed' };
export type ActivateDeskFetcher = (id: string) => Promise<ActivateDeskOutcome>;

export function createActivateDesk(api: ApiClient): ActivateDeskFetcher {
  return async (id: string): Promise<ActivateDeskOutcome> => {
    const result = await api.request(`/api/admin/desks/${id}/activate`, deskStateResponseSchema, {
      method: 'POST',
    });

    if (result.kind === 'ok') return { kind: 'ok', desk: result.data };
    return { kind: 'failed' };
  };
}

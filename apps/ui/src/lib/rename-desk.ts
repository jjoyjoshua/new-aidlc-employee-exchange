/**
 * The real `renameDesk` fetcher behind `useDeskFormDialog`'s edit mode — `add-desk.ts`'s shape,
 * unchanged, for `PATCH /api/admin/desks/:id` (US-018 design note §3.6).
 *
 * Three outcomes, not four, same as `add-desk.ts`: a 404 (the endpoint's own not-found — design
 * note §3.5) folds into `failed`, because no approved copy exists for "that desk is gone" and
 * SCR-007 numbers no state for it.
 */
import { deskUpdateResponseSchema, ERROR_CODES, type DeskUpdateResponse } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';

export type RenameDeskOutcome =
  | { kind: 'ok'; desk: DeskUpdateResponse }
  /** US-018/AC-02 — 409 `desk_number_taken`. The ONE refusal with copy of its own (SCR-007 ST-04). */
  | { kind: 'duplicate' }
  /** US-018/AC-08 — transport failure, timeout, 5xx, an unparseable body, a 400 the browser's own
   *  validation should have caught, OR a 404 (design note §3.5: the endpoint distinguishes it,
   *  the screen has no approved copy for it). */
  | { kind: 'failed' };
export type RenameDeskFetcher = (id: string, deskNumber: string) => Promise<RenameDeskOutcome>;

export function createRenameDesk(api: ApiClient): RenameDeskFetcher {
  return async (id: string, deskNumber: string): Promise<RenameDeskOutcome> => {
    const result = await api.request(`/api/admin/desks/${id}`, deskUpdateResponseSchema, {
      method: 'PATCH',
      body: { deskNumber },
    });

    if (result.kind === 'ok') return { kind: 'ok', desk: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.desk_number_taken) return { kind: 'duplicate' };
    return { kind: 'failed' };
  };
}

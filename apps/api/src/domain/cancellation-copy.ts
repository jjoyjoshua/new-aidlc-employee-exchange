/**
 * BR-001.20, US-029/AC-04, AC-05, AC-06. "What should this notification say?" — `domain/README.md`
 * already names this as domain's own rule. `cancellation_source` is the one thing to key this on
 * (`0003_bookings.sql`'s own instruction to the notification composer): never compare ids to infer
 * who acted.
 */
export type CancellationSource = 'owner' | 'admin' | 'deactivation_cascade';

export interface CancellationCopy {
  /** `''` for a self-cancellation (AC-05 — passive voice with no actor reads as "no actor
   *  named"); `' by your office admin'` for the other two (AC-04) — the role, never the
   *  individual administrator. */
  actorClause: string;
  /** `false` only for the deactivation cascade (AC-06) — REQ-005 has already stopped that
   *  person signing in, so inviting them to book again is not offered. */
  includeRebookInvite: boolean;
}

export function cancellationCopy(source: CancellationSource): CancellationCopy {
  if (source === 'owner') return { actorClause: '', includeRebookInvite: true };
  if (source === 'admin') return { actorClause: ' by your office admin', includeRebookInvite: true };
  return { actorClause: ' by your office admin', includeRebookInvite: false };
}

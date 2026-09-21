/**
 * `notification_deliveries` — one row per attempt (US-034, `db-design.md` §1.5). The row
 * deliberately carries neither `subject` nor `body`: `recipient` plus `kind` is enough to
 * answer "did Dana get told?", and `db-design.md:218` promises this table holds no message
 * body and no password.
 */
import { supabase } from '../../infra/supabase/index.js';

/** Matches the `notification_kind` enum (`0006_notification_deliveries.sql`). Only
 *  `'confirmation'` and `'cancellation'` have a caller yet (US-028, US-029); `'reminder'` is
 *  here because the column already accepts it and US-030 extends this same path
 *  (Architect design note §2.3, F-6) rather than adding a second one. */
export type NotificationKind = 'confirmation' | 'cancellation' | 'reminder';

export interface DeliveryRow {
  bookingId: string | undefined;
  userId: string;
  /** Always `'email'` today — this repository does not decide it, the caller does
   *  (`notifications.service.ts`); push is `infra/webpush`'s (US-031/US-032). */
  channel: 'email' | 'push';
  kind: NotificationKind;
  recipient: string;
  outcome: 'sent' | 'failed';
  /** Set only on a failed attempt — a short, bounded, code-based string the caller already
   *  sanitized (Architect design note §4, F-5). Never the raw transport error. */
  errorDetail: string | undefined;
}

/** US-030/AC-07. The claim-side result of `claimReminderSent` — `{ claimed: false }` means the
 *  reminder partial-unique index (`0006_notification_deliveries.sql:52-54`) already holds a
 *  `sent` row for this booking: an EXPECTED outcome (a prior run, or a retry), never an error
 *  (US-034 design-note.md §2.3's own instruction). */
export type ClaimReminderOutcome = { claimed: true; id: string } | { claimed: false };

const REMINDER_INDEX_NAME = 'notification_deliveries_one_sent_reminder_per_booking';

export interface NotificationsRepository {
  insertDelivery(row: DeliveryRow): Promise<void>;
  /** US-030/D-02. "Write first, then explain" — the SAME discipline `cancelOwnedBooking`/
   *  `insertConfirmedBooking` use for their own races. The insert itself is the claim; there is
   *  no read beforehand to reopen the TOCTOU window those functions exist to avoid. */
  claimReminderSent(row: DeliveryRow): Promise<ClaimReminderOutcome>;
  /** US-030/AC-10. Demotes an already-claimed row after the transport itself reports failure —
   *  the claim already committed, so this is an UPDATE, never a second insert. */
  markDeliveryFailed(id: string, errorDetail: string): Promise<void>;
}

export const notificationsRepository: NotificationsRepository = {
  async insertDelivery(row) {
    const { error } = await supabase().from('notification_deliveries').insert({
      booking_id: row.bookingId ?? null,
      user_id: row.userId,
      channel: row.channel,
      kind: row.kind,
      recipient: row.recipient,
      outcome: row.outcome,
      error_detail: row.errorDetail ?? null,
    });

    if (error) throw new Error(`notification delivery insert failed: ${error.message}`);
  },

  async claimReminderSent(row) {
    const { data, error } = await supabase()
      .from('notification_deliveries')
      .insert({
        booking_id: row.bookingId ?? null,
        user_id: row.userId,
        channel: row.channel,
        kind: row.kind,
        recipient: row.recipient,
        outcome: row.outcome,
        error_detail: row.errorDetail ?? null,
      })
      .select('id')
      .single();

    if (!error) return { claimed: true, id: (data as { id: string }).id };
    if (error.code !== '23505') throw new Error(`reminder claim failed: ${error.message}`);
    if (error.message.includes(REMINDER_INDEX_NAME)) return { claimed: false };
    // `insertConfirmedBooking`'s own discipline (design note §1.2, F-1): a 23505 that names
    // neither known index is a bug to investigate, never a guessed outcome.
    throw new Error(`unrecognised unique violation: ${error.message}`);
  },

  async markDeliveryFailed(id, errorDetail) {
    const { error } = await supabase()
      .from('notification_deliveries')
      .update({ outcome: 'failed', error_detail: errorDetail })
      .eq('id', id);

    if (error) throw new Error(`reminder delivery demotion could not be recorded: ${error.message}`);
  },
};

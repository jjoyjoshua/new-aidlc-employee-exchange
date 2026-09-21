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

/** What `upsertPushSubscription` writes (US-031/FR-03). `userAgent` is operator diagnosis only
 *  (`db-design.md:177`) — the caller truncates it from the request header, never the body. */
export interface PushSubscriptionRow {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | undefined;
}

export interface NotificationsRepository {
  insertDelivery(row: DeliveryRow): Promise<void>;
  /** US-030/D-02. "Write first, then explain" — the SAME discipline `cancelOwnedBooking`/
   *  `insertConfirmedBooking` use for their own races. The insert itself is the claim; there is
   *  no read beforehand to reopen the TOCTOU window those functions exist to avoid. */
  claimReminderSent(row: DeliveryRow): Promise<ClaimReminderOutcome>;
  /** US-030/AC-10. Demotes an already-claimed row after the transport itself reports failure —
   *  the claim already committed, so this is an UPDATE, never a second insert. */
  markDeliveryFailed(id: string, errorDetail: string): Promise<void>;

  /** US-031/FR-01. The one column of `user_profiles` this module reads (design note §4.6) —
   *  an explicit column list, never `select('*')`, so ADR-004's cross-module `SELECT`
   *  allowance stays visibly narrow. */
  getPushOptIn(userId: string): Promise<boolean>;
  /** US-031/FR-03, FR-04. The one column of `user_profiles` this module WRITES — the ADR-004
   *  exception `app-architecture.md:89` grants in writing (design note §4.6). Returns the
   *  value the database actually holds after the write, never the value the caller asked for
   *  (US-031/AC-07 — the toggle is set only from what the server confirms). */
  setPushOptIn(userId: string, value: boolean): Promise<boolean>;
  /** US-031/FR-02, FR-03. Upserts on `endpoint` — the same browser re-subscribing updates its
   *  row rather than duplicating it (db-design.md:263). Called BEFORE `setPushOptIn(true)`
   *  (design note §4.2) — never the reverse. */
  upsertPushSubscription(row: PushSubscriptionRow): Promise<void>;
  /** US-031/FR-04. ALL of the account's subscriptions, not just one browser's — AC-03 is
   *  unqualified (design note §4.3). Called AFTER `setPushOptIn(false)`, never before. */
  deletePushSubscriptions(userId: string): Promise<void>;
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

  async getPushOptIn(userId) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .select('push_opt_in')
      .eq('id', userId)
      .single();

    if (error) throw new Error(`push opt-in read failed: ${error.message}`);
    return (data as { push_opt_in: boolean }).push_opt_in;
  },

  async setPushOptIn(userId, value) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .update({ push_opt_in: value })
      .eq('id', userId)
      .select('push_opt_in')
      .single();

    if (error) throw new Error(`push opt-in write failed: ${error.message}`);
    return (data as { push_opt_in: boolean }).push_opt_in;
  },

  async upsertPushSubscription({ userId, endpoint, p256dh, auth, userAgent }) {
    const { error } = await supabase()
      .from('push_subscriptions')
      .upsert(
        { user_id: userId, endpoint, p256dh, auth, user_agent: userAgent ?? null },
        { onConflict: 'endpoint' },
      );

    if (error) throw new Error(`push subscription upsert failed: ${error.message}`);
  },

  async deletePushSubscriptions(userId) {
    const { error } = await supabase().from('push_subscriptions').delete().eq('user_id', userId);

    if (error) throw new Error(`push subscription delete failed: ${error.message}`);
  },
};

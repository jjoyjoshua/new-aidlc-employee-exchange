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

export interface NotificationsRepository {
  insertDelivery(row: DeliveryRow): Promise<void>;
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
};

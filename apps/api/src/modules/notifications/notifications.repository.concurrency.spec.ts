/**
 * US-030/AC-07 — the real-Postgres proof that `claimReminderSent`'s mapping assumption holds:
 * that the reminder partial-unique index (`0006_notification_deliveries.sql:52-54`) actually
 * arbitrates two OVERLAPPING claim attempts for the SAME booking to exactly one winner, the way
 * two overlapping runs of the scheduled job would race in production.
 *
 * `notifications.repository.spec.ts` proves the mapping's LOGIC against a fake client that is
 * TOLD what error Postgres produced. It cannot prove that a real concurrent insert against the
 * real partial index actually produces a `23505` naming
 * `notification_deliveries_one_sent_reminder_per_booking` — that gap is exactly what
 * `bookings.repository.concurrency.spec.ts` names for its own, structurally identical, claim
 * (design note there, §1.1-§1.3).
 *
 * **Gate: `RUN_BOOKINGS_CONCURRENCY_TEST=1`.** Same convention, same flag, same reasoning as
 * `bookings.repository.concurrency.spec.ts`/`admin.concurrency.spec.ts` — duplicated locally
 * rather than imported (their own precedent for why). Absent the flag, every test below is
 * SKIPPED, not failed, and CI needs no database configured for the suite to stay green.
 *
 *   RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test --workspace @desk-booking/api -- notifications.repository.concurrency
 *
 * Run it only against a **disposable** Postgres/Supabase project, never shared or production.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { supabase } from '../../infra/supabase/index.js';
import { notificationsRepository } from './notifications.repository.js';

// eslint-disable-next-line no-restricted-properties -- test-only run gate, not app config; see docblock above
const RUN = process.env.RUN_BOOKINGS_CONCURRENCY_TEST === '1';

const DATE = '2026-09-16'; // A Wednesday — only the CHECK constraint cares which one.

interface Cleanup {
  deliveryIds: string[];
  bookingIds: string[];
  deskIds: string[];
  userIds: string[];
}

function newCleanup(): Cleanup {
  return { deliveryIds: [], bookingIds: [], deskIds: [], userIds: [] };
}

/**
 * `notification_deliveries.booking_id references bookings (id) on delete restrict`
 * (`0006_notification_deliveries.sql:23`) — a delivery row referencing a booking BLOCKS that
 * booking's delete. Deliveries must be removed first, unlike the sibling concurrency files'
 * cleanup order, which never has this table in the picture.
 */
async function cleanUp(cleanup: Cleanup): Promise<void> {
  if (cleanup.deliveryIds.length) {
    await supabase().from('notification_deliveries').delete().in('id', cleanup.deliveryIds);
  }
  if (cleanup.bookingIds.length) {
    await supabase().from('bookings').delete().in('id', cleanup.bookingIds);
  }
  if (cleanup.deskIds.length) {
    await supabase().from('desks').delete().in('id', cleanup.deskIds);
  }
  for (const userId of cleanup.userIds) {
    await supabase().auth.admin.deleteUser(userId);
  }
}

async function createEmployee(cleanup: Cleanup, fullName = 'Reminder Concurrency Fixture'): Promise<string> {
  const email = `us030-concurrency-${randomUUID()}@example.test`;
  const { data, error } = await supabase().auth.admin.createUser({
    email,
    password: `Test-${randomUUID()}!1`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture auth user could not be created: ${error?.message}`);
  cleanup.userIds.push(data.user.id);

  const { error: profileError } = await supabase()
    .from('user_profiles')
    .insert({ id: data.user.id, email, full_name: fullName, role: 'employee' });
  if (profileError) throw new Error(`fixture user_profiles row could not be created: ${profileError.message}`);

  return data.user.id;
}

async function createDesk(cleanup: Cleanup, deskNumber: string): Promise<string> {
  const { data, error } = await supabase().from('desks').insert({ desk_number: deskNumber }).select('id').single();
  if (error || !data) throw new Error(`fixture desk could not be created: ${error?.message}`);
  const id = (data as { id: string }).id;
  cleanup.deskIds.push(id);
  return id;
}

async function createConfirmedBooking(cleanup: Cleanup, userId: string, deskId: string): Promise<string> {
  const { data, error } = await supabase()
    .from('bookings')
    .insert({ user_id: userId, desk_id: deskId, booking_date: DATE })
    .select('id')
    .single();
  if (error || !data) throw new Error(`fixture booking could not be created: ${error?.message}`);
  const id = (data as { id: string }).id;
  cleanup.bookingIds.push(id);
  return id;
}

describe.runIf(RUN)('notificationsRepository.claimReminderSent — real Postgres arbitration (US-030/AC-07)', () => {
  it('lets exactly one of two concurrent claims for the SAME booking win; the loser is { claimed: false }, and the raw error is 23505 naming the reminder index', async () => {
    const cleanup = newCleanup();
    try {
      const user = await createEmployee(cleanup);
      const desk = await createDesk(cleanup, 'Z-09');
      const bookingId = await createConfirmedBooking(cleanup, user, desk);

      const [a, b] = await Promise.all([
        notificationsRepository.claimReminderSent({
          bookingId,
          userId: user,
          channel: 'email',
          kind: 'reminder',
          recipient: 'dana@example.test',
          outcome: 'sent',
          errorDetail: undefined,
        }),
        notificationsRepository.claimReminderSent({
          bookingId,
          userId: user,
          channel: 'email',
          kind: 'reminder',
          recipient: 'dana@example.test',
          outcome: 'sent',
          errorDetail: undefined,
        }),
      ]);
      for (const outcome of [a, b]) if (outcome.claimed) cleanup.deliveryIds.push(outcome.id);

      // Exactly one claim won — the database arbitrated, not application logic.
      const winners = [a, b].filter((outcome) => outcome.claimed);
      expect(winners).toHaveLength(1);
      const losers = [a, b].filter((outcome) => !outcome.claimed);
      expect(losers).toHaveLength(1);

      // The mapping's LOGIC is proven above. What follows proves the ASSUMPTION it depends on:
      // re-attempt the same, now-claimed booking directly against Postgres, bypassing the
      // repository's mapping, and inspect the RAW rejected error.
      const raw = await supabase().from('notification_deliveries').insert({
        booking_id: bookingId,
        user_id: user,
        channel: 'email',
        kind: 'reminder',
        recipient: 'dana@example.test',
        outcome: 'sent',
      });

      expect(raw.error).not.toBeNull();
      expect(raw.error?.code).toBe('23505');
      expect(raw.error?.message).toContain('notification_deliveries_one_sent_reminder_per_booking');

      // Exactly one 'sent' reminder row exists for this booking — the guarantee AC-07 rests on,
      // read from the database's own count, not the application's belief about it.
      const { count } = await supabase()
        .from('notification_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId)
        .eq('kind', 'reminder')
        .eq('outcome', 'sent');
      expect(count).toBe(1);
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('a claim for a DIFFERENT booking is unaffected by another booking already holding a sent reminder row', async () => {
    const cleanup = newCleanup();
    try {
      const user = await createEmployee(cleanup);
      const desk = await createDesk(cleanup, 'Z-10');
      const bookingA = await createConfirmedBooking(cleanup, user, desk);
      const desk2 = await createDesk(cleanup, 'Z-11');
      const bookingB = await createConfirmedBooking(cleanup, user, desk2);

      const first = await notificationsRepository.claimReminderSent({
        bookingId: bookingA,
        userId: user,
        channel: 'email',
        kind: 'reminder',
        recipient: 'dana@example.test',
        outcome: 'sent',
        errorDetail: undefined,
      });
      if (first.claimed) cleanup.deliveryIds.push(first.id);
      expect(first.claimed).toBe(true);

      const second = await notificationsRepository.claimReminderSent({
        bookingId: bookingB,
        userId: user,
        channel: 'email',
        kind: 'reminder',
        recipient: 'dana@example.test',
        outcome: 'sent',
        errorDetail: undefined,
      });
      if (second.claimed) cleanup.deliveryIds.push(second.id);

      expect(second.claimed).toBe(true);
    } finally {
      await cleanUp(cleanup);
    }
  });
});

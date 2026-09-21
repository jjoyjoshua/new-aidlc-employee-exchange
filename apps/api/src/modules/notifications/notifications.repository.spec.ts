/**
 * A recording-fake Supabase client, matching the pattern `bookings.repository.spec.ts` and
 * `desks.repository.spec.ts` established — proves the exact insert payload we issue, not a
 * mocked return value.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';
import { notificationsRepository } from './notifications.repository.js';

interface RecordedCall {
  table: string;
  insert?: unknown;
  update?: unknown;
  upsert?: unknown;
  upsertOptions?: unknown;
  delete?: true;
  eq: Array<[string, unknown]>;
  select?: string;
  single?: boolean;
}

type FakeResponse = { data: unknown; error: { code?: string; message: string } | null };

function fakeSupabase(response: FakeResponse) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const call: RecordedCall = { table, eq: [] };
    const builder = {
      insert(row: unknown) {
        call.insert = row;
        return builder;
      },
      update(row: unknown) {
        call.update = row;
        return builder;
      },
      upsert(row: unknown, options: unknown) {
        call.upsert = row;
        call.upsertOptions = options;
        return builder;
      },
      delete() {
        call.delete = true;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
        return builder;
      },
      select(columns: string) {
        call.select = columns;
        return builder;
      },
      single() {
        call.single = true;
        return builder;
      },
      then(onFulfilled: (value: FakeResponse) => unknown, onRejected?: (reason: unknown) => unknown) {
        calls.push(call);
        return Promise.resolve(response).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return { calls, client: { from } as unknown as SupabaseClient };
}

const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const BOOKING_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';

describe('notificationsRepository.insertDelivery — the exact row written (US-034)', () => {
  it('writes booking_id, user_id, channel, kind, recipient and outcome for a sent attempt, with error_detail null', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await notificationsRepository.insertDelivery({
        bookingId: BOOKING_ID,
        userId: USER_ID,
        channel: 'email',
        kind: 'confirmation',
        recipient: 'dana@example.com',
        outcome: 'sent',
        errorDetail: undefined,
      });
    } finally {
      setSupabaseForTesting(undefined);
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe('notification_deliveries');
    expect(calls[0]!.insert).toEqual({
      booking_id: BOOKING_ID,
      user_id: USER_ID,
      channel: 'email',
      kind: 'confirmation',
      recipient: 'dana@example.com',
      outcome: 'sent',
      error_detail: null,
    });
  });

  it('writes the sanitized error_detail for a failed attempt, and no other message content', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await notificationsRepository.insertDelivery({
        bookingId: BOOKING_ID,
        userId: USER_ID,
        channel: 'email',
        kind: 'cancellation',
        recipient: 'dana@example.com',
        outcome: 'failed',
        errorDetail: 'transport_rejected',
      });
    } finally {
      setSupabaseForTesting(undefined);
    }

    expect(calls[0]!.insert).toMatchObject({ outcome: 'failed', error_detail: 'transport_rejected' });
    // db-design.md:218 — no message body, no password, no raw error object.
    expect(Object.keys(calls[0]!.insert as object)).toEqual([
      'booking_id',
      'user_id',
      'channel',
      'kind',
      'recipient',
      'outcome',
      'error_detail',
    ]);
  });

  it('writes a null booking_id when none is given', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await notificationsRepository.insertDelivery({
        bookingId: undefined,
        userId: USER_ID,
        channel: 'email',
        kind: 'reminder',
        recipient: 'dana@example.com',
        outcome: 'sent',
        errorDetail: undefined,
      });
    } finally {
      setSupabaseForTesting(undefined);
    }

    expect(calls[0]!.insert).toMatchObject({ booking_id: null });
  });

  it('throws when the insert itself errors, rather than reporting success', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: '23503', message: 'insert or update on table violates foreign key constraint' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        notificationsRepository.insertDelivery({
          bookingId: BOOKING_ID,
          userId: USER_ID,
          channel: 'email',
          kind: 'confirmation',
          recipient: 'dana@example.com',
          outcome: 'sent',
          errorDetail: undefined,
        }),
      ).rejects.toThrow(/notification delivery insert failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

const REMINDER_INDEX_VIOLATION = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "notification_deliveries_one_sent_reminder_per_booking"',
};

describe('notificationsRepository.claimReminderSent — the write half of US-030/AC-07', () => {
  it('inserts the row as sent and returns { claimed: true, id } on success', async () => {
    const { calls, client } = fakeSupabase({ data: { id: 'delivery-1' }, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await notificationsRepository.claimReminderSent({
        bookingId: BOOKING_ID,
        userId: USER_ID,
        channel: 'email',
        kind: 'reminder',
        recipient: 'dana@example.com',
        outcome: 'sent',
        errorDetail: undefined,
      });

      expect(result).toEqual({ claimed: true, id: 'delivery-1' });
      expect(calls).toEqual([
        {
          table: 'notification_deliveries',
          insert: {
            booking_id: BOOKING_ID,
            user_id: USER_ID,
            channel: 'email',
            kind: 'reminder',
            recipient: 'dana@example.com',
            outcome: 'sent',
            error_detail: null,
          },
          select: 'id',
          eq: [],
          single: true,
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { claimed: false } — never throws — when the reminder partial-unique index rejects a duplicate (US-030/AC-07)', async () => {
    const { client } = fakeSupabase({ data: null, error: REMINDER_INDEX_VIOLATION });
    setSupabaseForTesting(client);

    try {
      const result = await notificationsRepository.claimReminderSent({
        bookingId: BOOKING_ID,
        userId: USER_ID,
        channel: 'email',
        kind: 'reminder',
        recipient: 'dana@example.com',
        outcome: 'sent',
        errorDetail: undefined,
      });

      expect(result).toEqual({ claimed: false });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a 23505 that does not name the reminder index, rather than guessing (design note §1.2\'s own precedent)', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "some_other_index"' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(
        notificationsRepository.claimReminderSent({
          bookingId: BOOKING_ID,
          userId: USER_ID,
          channel: 'email',
          kind: 'reminder',
          recipient: 'dana@example.com',
          outcome: 'sent',
          errorDetail: undefined,
        }),
      ).rejects.toThrow(/unrecognised unique violation/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a non-23505 error rather than treating it as a duplicate', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        notificationsRepository.claimReminderSent({
          bookingId: BOOKING_ID,
          userId: USER_ID,
          channel: 'email',
          kind: 'reminder',
          recipient: 'dana@example.com',
          outcome: 'sent',
          errorDetail: undefined,
        }),
      ).rejects.toThrow(/reminder claim failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('notificationsRepository.markDeliveryFailed — demoting a claimed row (US-030/AC-10)', () => {
  it('updates outcome and error_detail by id', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await notificationsRepository.markDeliveryFailed('delivery-1', 'transport_unreachable');

      expect(calls).toEqual([
        {
          table: 'notification_deliveries',
          update: { outcome: 'failed', error_detail: 'transport_unreachable' },
          eq: [['id', 'delivery-1']],
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws when the update itself errors, rather than reporting success', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(notificationsRepository.markDeliveryFailed('delivery-1', 'transport_unreachable')).rejects.toThrow(
        /could not be recorded/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('notificationsRepository.getPushOptIn / setPushOptIn — the one column this module touches (US-031/design note §4.6)', () => {
  it('reads push_opt_in by an explicit column list, never select(*)', async () => {
    const { calls, client } = fakeSupabase({ data: { push_opt_in: true }, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await notificationsRepository.getPushOptIn(USER_ID);

      expect(result).toBe(true);
      expect(calls).toEqual([{ table: 'user_profiles', select: 'push_opt_in', eq: [['id', USER_ID]], single: true }]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws when the read itself errors', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(notificationsRepository.getPushOptIn(USER_ID)).rejects.toThrow(/push opt-in read failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('writes only push_opt_in, and returns the value the database actually holds (US-031/AC-07)', async () => {
    const { calls, client } = fakeSupabase({ data: { push_opt_in: true }, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await notificationsRepository.setPushOptIn(USER_ID, true);

      expect(result).toBe(true);
      expect(calls).toEqual([
        { table: 'user_profiles', update: { push_opt_in: true }, select: 'push_opt_in', eq: [['id', USER_ID]], single: true },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws when the write itself errors', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(notificationsRepository.setPushOptIn(USER_ID, false)).rejects.toThrow(/push opt-in write failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('notificationsRepository.upsertPushSubscription — one row per browser (US-031/FR-02, FR-03)', () => {
  it('upserts on the endpoint conflict target, writing user_id, p256dh, auth and user_agent', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await notificationsRepository.upsertPushSubscription({
        userId: USER_ID,
        endpoint: ENDPOINT,
        p256dh: 'p256dh-value',
        auth: 'auth-value',
        userAgent: 'Mozilla/5.0',
      });

      expect(calls).toEqual([
        {
          table: 'push_subscriptions',
          upsert: { user_id: USER_ID, endpoint: ENDPOINT, p256dh: 'p256dh-value', auth: 'auth-value', user_agent: 'Mozilla/5.0' },
          upsertOptions: { onConflict: 'endpoint' },
          eq: [],
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('writes a null user_agent when none is given, never an empty string', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await notificationsRepository.upsertPushSubscription({
        userId: USER_ID,
        endpoint: ENDPOINT,
        p256dh: 'p256dh-value',
        auth: 'auth-value',
        userAgent: undefined,
      });

      expect(calls[0]!.upsert).toMatchObject({ user_agent: null });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws when the upsert itself errors, rather than reporting success', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(
        notificationsRepository.upsertPushSubscription({
          userId: USER_ID,
          endpoint: ENDPOINT,
          p256dh: 'p256dh-value',
          auth: 'auth-value',
          userAgent: undefined,
        }),
      ).rejects.toThrow(/push subscription upsert failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('notificationsRepository.deletePushSubscriptions — ALL of the account\'s rows (US-031/AC-03)', () => {
  it('deletes every row for the given user_id', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      await notificationsRepository.deletePushSubscriptions(USER_ID);

      expect(calls).toEqual([{ table: 'push_subscriptions', delete: true, eq: [['user_id', USER_ID]] }]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws when the delete itself errors, rather than reporting success', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(notificationsRepository.deletePushSubscriptions(USER_ID)).rejects.toThrow(
        /push subscription delete failed/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

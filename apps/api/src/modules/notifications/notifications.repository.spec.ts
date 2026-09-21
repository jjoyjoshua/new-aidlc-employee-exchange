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
}

type FakeResponse = { data: unknown; error: { code?: string; message: string } | null };

function fakeSupabase(response: FakeResponse) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const call: RecordedCall = { table };
    const builder = {
      insert(row: unknown) {
        call.insert = row;
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

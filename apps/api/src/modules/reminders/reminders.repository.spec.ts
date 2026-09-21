/**
 * A recording-fake Supabase client for `RemindersRepository`, matching
 * `bookings.repository.spec.ts`'s own convention: pin the exact query issued (table, select,
 * `.eq()` filters), never a mocking library.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';
import { remindersRepository } from './reminders.repository.js';

interface RecordedCall {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
}

type FakeResponse = { data: unknown; error: { code: string; message: string } | null };

function fakeSupabase(response: FakeResponse) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const call: RecordedCall = { table, eq: [] };
    const builder = {
      select(columns: string) {
        call.select = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
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

const ROW = {
  id: 'b1',
  user_id: 'u1',
  booking_date: '2026-09-17',
  desks: { desk_number: 'A-02' },
  user_profiles: { email: 'dana@company.com' },
};

describe('remindersRepository.listConfirmedBookingsForDate (US-030/AC-01, AC-02, AC-05, AC-06)', () => {
  it('selects id, user_id, booking_date and the joined desk number and owner email, filtered to the date and status confirmed only (US-030/AC-01, US-030/AC-02, US-030/AC-05, US-030/AC-06)', async () => {
    const { calls, client } = fakeSupabase({ data: [ROW], error: null });
    setSupabaseForTesting(client);

    try {
      const result = await remindersRepository.listConfirmedBookingsForDate('2026-09-17');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'id, user_id, booking_date, desks(desk_number), user_profiles!user_id(email)',
          eq: [
            ['booking_date', '2026-09-17'],
            ['status', 'confirmed'],
          ],
        },
      ]);
      expect(result).toEqual([
        { id: 'b1', userId: 'u1', email: 'dana@company.com', deskNumber: 'A-02', bookingDate: '2026-09-17' },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns an empty array when nothing is confirmed for that date', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    setSupabaseForTesting(client);

    try {
      const result = await remindersRepository.listConfirmedBookingsForDate('2026-09-17');
      expect(result).toEqual([]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if a row has no joined desk (desk_id is NOT NULL — a bug, not a valid state)', async () => {
    const { client } = fakeSupabase({ data: [{ ...ROW, desks: null }], error: null });
    setSupabaseForTesting(client);

    try {
      await expect(remindersRepository.listConfirmedBookingsForDate('2026-09-17')).rejects.toThrow(/no joined desk/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if a row has no joined user_profiles (user_id is NOT NULL — a bug, not a valid state)', async () => {
    const { client } = fakeSupabase({ data: [{ ...ROW, user_profiles: null }], error: null });
    setSupabaseForTesting(client);

    try {
      await expect(remindersRepository.listConfirmedBookingsForDate('2026-09-17')).rejects.toThrow(
        /no joined user_profiles/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error rather than returning an empty list (never swallowed)', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(remindersRepository.listConfirmedBookingsForDate('2026-09-17')).rejects.toThrow(
        /reminder candidates lookup failed/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

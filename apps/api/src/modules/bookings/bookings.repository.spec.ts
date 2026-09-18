/**
 * A recording-fake Supabase client — this codebase's first repository test (US-006 design note
 * §6, option B, confirmed with the human at D1). `auth.repository.ts` has no spec file; every
 * existing route test injects a stub repository, which is tautological for AC-04: it proves the
 * array a stub returned is the array that came back, not that the real query carries the right
 * predicate.
 *
 * This fake records the exact chained call — table, select columns, `.eq()` filters, `.order()`
 * — rather than asserting on it via a mocking library, so what is pinned is visible in the test
 * itself. It proves our INTENT (the query we issue), not Postgres's actual behaviour — that gap
 * is real and is exactly what the design note's option C (real-Postgres integration tests,
 * deferred) would additionally close.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';
import { availabilityRepository } from './bookings.repository.js';

interface RecordedCall {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  order?: string;
}

function fakeSupabase(responses: Record<string, { data: unknown; error: null }>) {
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
      order(column: string) {
        call.order = column;
        return builder;
      },
      // Supabase's query builder is itself a thenable — awaiting it is what triggers the
      // "request". Recording happens here, at the point the chain is actually consumed.
      then(onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        calls.push(call);
        return Promise.resolve(responses[table] ?? { data: [], error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return { calls, client: { from } as unknown as SupabaseClient };
}

describe('availabilityRepository.listActiveDesks — the one row that actually proves US-006/AC-04', () => {
  it('selects id and desk_number only, filters to active desks, and orders by desk_number (US-006/AC-04)', async () => {
    const { calls, client } = fakeSupabase({
      desks: { data: [{ id: '1', desk_number: 'A-01' }], error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.listActiveDesks();

      expect(calls).toEqual([
        { table: 'desks', select: 'id, desk_number', eq: [['is_active', true]], order: 'desk_number' },
      ]);
      expect(result).toEqual([{ id: '1', desk_number: 'A-01' }]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.listConfirmedDeskIds — the whole of US-006/AC-06', () => {
  it('selects desk_id only — no user_id, no * — filtered to confirmed bookings on the date', async () => {
    const { calls, client } = fakeSupabase({
      bookings: { data: [{ desk_id: 'd1' }, { desk_id: 'd2' }], error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.listConfirmedDeskIds('2026-09-16');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'desk_id',
          eq: [
            ['booking_date', '2026-09-16'],
            ['status', 'confirmed'],
          ],
          order: undefined,
        },
      ]);
      expect(result).toEqual(['d1', 'd2']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

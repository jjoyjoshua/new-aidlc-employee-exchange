/**
 * A recording-fake Supabase client for `AdminBookingsRepository`, extending the pattern
 * `bookings.repository.spec.ts` established with two verbs that repository never needed:
 * `.range()` and the `{ count: 'exact' }` option on `.select()`. What is pinned is visible in the
 * test itself, the same reasoning that file gives for not reaching for a mocking library.
 *
 * This proves the QUERY we issue (the predicate, the order, the range, the disambiguated embed
 * string) — not that PostgREST accepts that embed string at runtime. That gap is real and is
 * closed separately in `bookings.repository.concurrency.spec.ts` (design note §3.1).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';
import { adminBookingsRepository } from './admin-bookings.repository.js';

interface RecordedCall {
  table: string;
  select?: string;
  selectOptions?: { count?: string };
  gte?: [string, unknown];
  order: Array<{ column: string; ascending: boolean }>;
  range?: [number, number];
}

type FakeResponse = { data: unknown; error: { code: string; message: string } | null; count?: number | null };

function fakeSupabase(response: FakeResponse) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const call: RecordedCall = { table, order: [] };
    const builder = {
      select(columns: string, options?: { count?: string }) {
        call.select = columns;
        if (options) call.selectOptions = options;
        return builder;
      },
      gte(column: string, value: unknown) {
        call.gte = [column, value];
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        call.order.push({ column, ascending: opts?.ascending ?? true });
        return builder;
      },
      range(from2: number, to: number) {
        call.range = [from2, to];
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
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  booking_date: '2026-09-16',
  status: 'confirmed' as const,
  desks: { desk_number: 'A-01' },
  user_profiles: { full_name: 'Priya Raman' },
};

describe('adminBookingsRepository.listBookingsFromDate — the query shape (US-013/AC-02, AC-03, AC-04)', () => {
  it('filters to booking_date >= from, with NO status predicate, ordered as a total order, over the given range', async () => {
    const { calls, client } = fakeSupabase({ data: [ROW], error: null, count: 1 });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.listBookingsFromDate('2026-09-16', 0, 50);

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'id, booking_date, status, desks(desk_number), user_profiles!user_id(full_name)',
          selectOptions: { count: 'exact' },
          gte: ['booking_date', '2026-09-16'],
          order: [
            { column: 'booking_date', ascending: true },
            { column: 'created_at', ascending: true },
            { column: 'id', ascending: true },
          ],
          range: [0, 49],
        },
      ]);
      expect(result).toEqual({
        total: 1,
        rows: [
          {
            id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
            booking_date: '2026-09-16',
            status: 'confirmed',
            desk_number: 'A-01',
            employee_name: 'Priya Raman',
          },
        ],
      });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('the embed is disambiguated by column (!user_id), never a bare user_profiles(...) (design note §3.1)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookingsFromDate('2026-09-16', 0, 50);
      expect(calls[0]?.select).toContain('user_profiles!user_id(full_name)');
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('requests the page at the given offset (US-013/AC-04)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookingsFromDate('2026-09-16', 50, 50);
      expect(calls[0]?.range).toEqual([50, 99]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns the total matching count from the same query, not the page length (US-013/AC-07)', async () => {
    const { client } = fakeSupabase({ data: [ROW], error: null, count: 137 });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.listBookingsFromDate('2026-09-16', 0, 50);
      expect(result.total).toBe(137);
      expect(result.rows).toHaveLength(1);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('a far-back from still reaches an old booking — no date floor in the query (US-013/AC-05)', async () => {
    const oldRow = { ...ROW, booking_date: '2025-01-15' };
    const { calls, client } = fakeSupabase({ data: [oldRow], error: null, count: 1 });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.listBookingsFromDate('2025-01-01', 0, 50);
      expect(calls[0]?.gte).toEqual(['booking_date', '2025-01-01']);
      expect(result.rows[0]?.booking_date).toBe('2025-01-15');
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error rather than returning an empty page (never swallowed)', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.listBookingsFromDate('2026-09-16', 0, 50)).rejects.toThrow(
        /admin bookings lookup failed/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('maps PGRST103 (a page past the last row) to an empty page, never a thrown error (design note §3.4, verified against real Postgres in bookings.repository.concurrency.spec.ts)', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
    });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.listBookingsFromDate('2026-09-16', 1_000_000, 50);
      expect(result).toEqual({ rows: [], total: 0 });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if a row has no joined desk (desk_id is NOT NULL — a bug, not a valid state)', async () => {
    const { client } = fakeSupabase({ data: [{ ...ROW, desks: null }], error: null, count: 1 });
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.listBookingsFromDate('2026-09-16', 0, 50)).rejects.toThrow(/no joined desk/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if a row has no joined user_profiles (user_id is NOT NULL — a bug, not a valid state)', async () => {
    const { client } = fakeSupabase({ data: [{ ...ROW, user_profiles: null }], error: null, count: 1 });
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.listBookingsFromDate('2026-09-16', 0, 50)).rejects.toThrow(
        /no joined user_profiles/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

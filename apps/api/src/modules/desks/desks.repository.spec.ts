/**
 * A recording-fake Supabase client for `DesksRepository`, matching the pattern
 * `admin-bookings.repository.spec.ts` established. This proves the QUERY we issue — in
 * particular that it carries NO `is_active` filter, the deliberate opposite of
 * `modules/bookings`'s `listActiveDesks` (US-014 design note §3.2).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';
import { desksRepository } from './desks.repository.js';

interface RecordedCall {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  gte?: [string, unknown];
  order: Array<{ column: string; ascending: boolean }>;
}

function fakeSupabase(response: { data: unknown; error: { message: string } | null }) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const call: RecordedCall = { table, eq: [], order: [] };
    const builder = {
      select(columns: string) {
        call.select = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
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
      then(onFulfilled: (value: typeof response) => unknown, onRejected?: (reason: unknown) => unknown) {
        calls.push(call);
        return Promise.resolve(response).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return { calls, client: { from } as unknown as SupabaseClient };
}

const ACTIVE_ROW = { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', desk_number: 'A-01', is_active: true };
const INACTIVE_ROW = { id: '4f2504e0-4f89-41d3-9a0c-0305e82c3302', desk_number: 'A-02', is_active: false };

describe('desksRepository.listAllDesks (US-014/AC-03, edge case — inactive desks stay findable)', () => {
  it('selects id, desk_number, is_active ordered by desk_number, with NO is_active filter', async () => {
    const { calls, client } = fakeSupabase({ data: [ACTIVE_ROW, INACTIVE_ROW], error: null });
    setSupabaseForTesting(client);

    try {
      await desksRepository.listAllDesks();

      expect(calls).toEqual([
        {
          table: 'desks',
          select: 'id, desk_number, is_active',
          eq: [],
          order: [{ column: 'desk_number', ascending: true }],
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns both active and inactive rows unfiltered', async () => {
    const { client } = fakeSupabase({ data: [ACTIVE_ROW, INACTIVE_ROW], error: null });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.listAllDesks();
      expect(result).toEqual([
        { id: ACTIVE_ROW.id, desk_number: 'A-01', is_active: true },
        { id: INACTIVE_ROW.id, desk_number: 'A-02', is_active: false },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns an empty list rather than throwing when no desks exist', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.listAllDesks();
      expect(result).toEqual([]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.listAllDesks()).rejects.toThrow(/desks lookup failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('desksRepository.listUpcomingConfirmedDeskIds (US-016/AC-04, AC-05 — BR-001.9)', () => {
  it('selects desk_id ONLY from bookings, filtered to the given status and >= the given date, no order', async () => {
    const { calls, client } = fakeSupabase({
      data: [{ desk_id: 'desk-1' }, { desk_id: 'desk-1' }, { desk_id: 'desk-2' }],
      error: null,
    });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.listUpcomingConfirmedDeskIds('confirmed', '2026-09-19');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'desk_id',
          eq: [['status', 'confirmed']],
          gte: ['booking_date', '2026-09-19'],
          order: [],
        },
      ]);
      expect(result).toEqual(['desk-1', 'desk-1', 'desk-2']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns an empty list when nothing matches, rather than throwing', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.listUpcomingConfirmedDeskIds('confirmed', '2026-09-19');
      expect(result).toEqual([]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.listUpcomingConfirmedDeskIds('confirmed', '2026-09-19')).rejects.toThrow(
        /bookings lookup failed/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

/**
 * A recording-fake Supabase client for `DesksRepository`, matching the pattern
 * `admin-bookings.repository.spec.ts` established. This proves the QUERY we issue — in
 * particular that it carries NO `is_active` filter, the deliberate opposite of
 * `modules/bookings`'s `listActiveDesks` (US-014 design note §3.2), and — for
 * `updateDeskNumber` (US-018) — that no `.select()` precedes the `.update()` (the absence that
 * proves AC-07's no-pre-check discipline, US-018 design note §2.3).
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
  insert?: unknown;
  update?: Record<string, unknown>;
  single?: boolean;
  maybeSingle?: true;
}

type FakeResponse = { data: unknown; error: { code?: string; message: string } | null };

function fakeSupabase(response: FakeResponse) {
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
      insert(row: unknown) {
        call.insert = row;
        return builder;
      },
      update(values: Record<string, unknown>) {
        call.update = values;
        return builder;
      },
      single() {
        call.single = true;
        return builder;
      },
      maybeSingle() {
        call.maybeSingle = true;
        calls.push(call);
        return Promise.resolve(response);
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

describe('desksRepository.insertDesk (US-017/AC-01, AC-04, AC-05 — the first write this module has ever held)', () => {
  it('inserts with the given desk_number ONLY — no is_active, no id, no timestamps (US-017/AC-01)', async () => {
    const row = { id: '5f2504e0-4f89-41d3-9a0c-0305e82c3303', desk_number: 'A-07', is_active: true };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.insertDesk('A-07');

      expect(calls).toEqual([
        {
          table: 'desks',
          select: 'id, desk_number, is_active',
          eq: [],
          order: [],
          insert: { desk_number: 'A-07' },
          single: true,
        },
      ]);
      expect(result).toEqual({ kind: 'ok', desk: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('the insert carries the value passed in verbatim — normalisation is the caller\'s (US-017/AC-03)', async () => {
    const { calls, client } = fakeSupabase({
      data: { id: 'x', desk_number: 'A-07', is_active: true },
      error: null,
    });
    setSupabaseForTesting(client);

    try {
      await desksRepository.insertDesk('A-07');
      expect(calls[0]?.insert).toEqual({ desk_number: 'A-07' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "duplicate" } on a 23505 naming desks_desk_number_key (US-017/AC-04, AC-05)', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "desks_desk_number_key"' },
    });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.insertDesk('A-01');
      expect(result).toEqual({ kind: 'duplicate' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a 23505 naming an unrecognised index — a wrong answer nobody notices is worse than an honest 500', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "some_other_key"' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.insertDesk('A-01')).rejects.toThrow(/unrecognised unique violation/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a 23514 (the format CHECK) — reaching it means the normaliser or schema failed', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23514', message: 'new row for relation "desks" violates check constraint "desks_desk_number_format"' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.insertDesk('a-01')).rejects.toThrow(/desk insert failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on any other repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.insertDesk('A-01')).rejects.toThrow(/desk insert failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('desksRepository.updateDeskNumber (US-018/AC-01, AC-02, AC-03, AC-07)', () => {
  const UPDATED_AT = new Date('2026-09-19T10:00:00.000Z');

  it('updates desk_number and updated_at ONLY, keyed on id, with NO preceding .select() (US-018/AC-01, AC-07)', async () => {
    const row = { id: '5f2504e0-4f89-41d3-9a0c-0305e82c3303', desk_number: 'B-05', is_active: true };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.updateDeskNumber(row.id, 'B-05', UPDATED_AT);

      expect(calls).toEqual([
        {
          table: 'desks',
          select: 'id, desk_number, is_active',
          eq: [['id', row.id]],
          order: [],
          update: { desk_number: 'B-05', updated_at: UPDATED_AT.toISOString() },
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual({ kind: 'ok', desk: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('renaming to the current value is still an ordinary update — no pre-check precedes it (US-018/AC-07)', async () => {
    const row = { id: '5f2504e0-4f89-41d3-9a0c-0305e82c3303', desk_number: 'A-01', is_active: true };
    const { calls, client } = fakeSupabase({ data: row, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.updateDeskNumber(row.id, 'A-01', UPDATED_AT);

      expect(calls).toHaveLength(1);
      expect(calls[0]?.update).toEqual({ desk_number: 'A-01', updated_at: UPDATED_AT.toISOString() });
      expect(result).toEqual({ kind: 'ok', desk: row });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "not_found" } when no row matches the id — zero rows, not an error', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.updateDeskNumber('missing-id', 'A-01', UPDATED_AT);
      expect(result).toEqual({ kind: 'not_found' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns { kind: "duplicate" } on a 23505 naming desks_desk_number_key (US-018/AC-02)', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "desks_desk_number_key"' },
    });
    setSupabaseForTesting(client);

    try {
      const result = await desksRepository.updateDeskNumber('some-id', 'A-01', UPDATED_AT);
      expect(result).toEqual({ kind: 'duplicate' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a 23505 naming an unrecognised index', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "some_other_key"' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.updateDeskNumber('some-id', 'A-01', UPDATED_AT)).rejects.toThrow(/unrecognised unique violation/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a 23514 (the format CHECK) — reaching it means the normaliser or schema failed', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: '23514', message: 'new row for relation "desks" violates check constraint "desks_desk_number_format"' },
    });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.updateDeskNumber('some-id', 'a-01', UPDATED_AT)).rejects.toThrow(/desk update failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on any other repository error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(desksRepository.updateDeskNumber('some-id', 'A-01', UPDATED_AT)).rejects.toThrow(/desk update failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

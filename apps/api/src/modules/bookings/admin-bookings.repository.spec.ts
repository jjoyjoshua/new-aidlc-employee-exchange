/**
 * A recording-fake Supabase client for `AdminBookingsRepository`, extending the pattern
 * `bookings.repository.spec.ts` established with the verbs that repository never needed:
 * `.range()`, `.lte()`, `.lt()`, `.eq()`, `.update()`, `.maybeSingle()` and the `{ count: 'exact' }`
 * option on `.select()`. What is pinned is visible in the test itself, the same reasoning that
 * file gives for not reaching for a mocking library.
 *
 * This proves the QUERY we issue (the predicate, the order, the range, the disambiguated embed
 * string, the update payload) — not that PostgREST accepts that embed string or arbitrates a
 * concurrent write the way we assume at runtime. That gap is real and is closed separately in
 * `bookings.repository.concurrency.spec.ts` (design note §3.1, §3.4).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setSupabaseForTesting } from '../../infra/supabase/index.js';
import { adminBookingsRepository, type AdminBookingsFilter } from './admin-bookings.repository.js';

interface RecordedCall {
  table: string;
  select?: string;
  selectOptions?: { count?: string };
  update?: Record<string, unknown>;
  gte?: [string, unknown];
  lte?: [string, unknown];
  lt?: [string, unknown];
  eq: Array<[string, unknown]>;
  order: Array<{ column: string; ascending: boolean }>;
  range?: [number, number];
  maybeSingle?: true;
}

type FakeResponse = { data: unknown; error: { code: string; message: string } | null; count?: number | null };

/**
 * `response` is either one fixed response reused for every call (US-013/US-014's own shape —
 * one query per test), or a QUEUE of responses consumed one per call in order (US-029/D-03's
 * `cancelAnyBooking`, which now issues the update then a separate follow-up read against the
 * same table) — the last entry repeats once the queue is exhausted.
 */
function fakeSupabase(response: FakeResponse | FakeResponse[]) {
  const calls: RecordedCall[] = [];
  const queue = Array.isArray(response) ? [...response] : undefined;
  const nextResponse = (): FakeResponse => {
    if (!queue) return response as FakeResponse;
    return queue.length > 1 ? queue.shift()! : queue[0]!;
  };

  function from(table: string) {
    const call: RecordedCall = { table, order: [], eq: [] };
    const builder = {
      select(columns: string, options?: { count?: string }) {
        call.select = columns;
        if (options) call.selectOptions = options;
        return builder;
      },
      update(values: Record<string, unknown>) {
        call.update = values;
        return builder;
      },
      gte(column: string, value: unknown) {
        call.gte = [column, value];
        return builder;
      },
      lte(column: string, value: unknown) {
        call.lte = [column, value];
        return builder;
      },
      lt(column: string, value: unknown) {
        call.lt = [column, value];
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
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
      maybeSingle() {
        call.maybeSingle = true;
        calls.push(call);
        return Promise.resolve(nextResponse());
      },
      then(onFulfilled: (value: FakeResponse) => unknown, onRejected?: (reason: unknown) => unknown) {
        calls.push(call);
        return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
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

const BASE_FILTER: AdminBookingsFilter = { from: '2026-09-16' };

describe('adminBookingsRepository.listBookings — the query shape (US-013/AC-02, AC-03, AC-04; US-014/AC-01, AC-02, AC-03, AC-04)', () => {
  it('filters to booking_date >= from, with NO status predicate, ordered as a total order, over the given range', async () => {
    const { calls, client } = fakeSupabase({ data: [ROW], error: null, count: 1 });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.listBookings(BASE_FILTER, 0, 50);

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'id, booking_date, status, desks(desk_number), user_profiles!user_id(full_name)',
          selectOptions: { count: 'exact' },
          gte: ['booking_date', '2026-09-16'],
          eq: [],
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
      await adminBookingsRepository.listBookings(BASE_FILTER, 0, 50);
      expect(calls[0]?.select).toContain('user_profiles!user_id(full_name)');
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('requests the page at the given offset (US-013/AC-04)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings(BASE_FILTER, 50, 50);
      expect(calls[0]?.range).toEqual([50, 99]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns the total matching count from the same query, not the page length (US-013/AC-07)', async () => {
    const { client } = fakeSupabase({ data: [ROW], error: null, count: 137 });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.listBookings(BASE_FILTER, 0, 50);
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
      const result = await adminBookingsRepository.listBookings({ from: '2025-01-01' }, 0, 50);
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
      await expect(adminBookingsRepository.listBookings(BASE_FILTER, 0, 50)).rejects.toThrow(
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
      const result = await adminBookingsRepository.listBookings(BASE_FILTER, 1_000_000, 50);
      expect(result).toEqual({ rows: [], total: 0 });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if a row has no joined desk (desk_id is NOT NULL — a bug, not a valid state)', async () => {
    const { client } = fakeSupabase({ data: [{ ...ROW, desks: null }], error: null, count: 1 });
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.listBookings(BASE_FILTER, 0, 50)).rejects.toThrow(/no joined desk/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if a row has no joined user_profiles (user_id is NOT NULL — a bug, not a valid state)', async () => {
    const { client } = fakeSupabase({ data: [{ ...ROW, user_profiles: null }], error: null, count: 1 });
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.listBookings(BASE_FILTER, 0, 50)).rejects.toThrow(
        /no joined user_profiles/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('adminBookingsRepository.listBookings — US-014 filters', () => {
  it('to adds .lte(booking_date, to) (US-014/AC-01)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings({ from: '2026-09-01', to: '2026-09-30' }, 0, 50);
      expect(calls[0]?.lte).toEqual(['booking_date', '2026-09-30']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('omits .lte() entirely when to is absent (no ceiling)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings(BASE_FILTER, 0, 50);
      expect(calls[0]?.lte).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('omits .gte() entirely when from is absent (a completed-status query with no floor)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings({ status: 'confirmed', before: '2026-09-16' }, 0, 50);
      expect(calls[0]?.gte).toBeUndefined();
      expect(calls[0]?.lt).toEqual(['booking_date', '2026-09-16']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('status adds .eq(status, stored) — the STORED value, never the presented one (US-014/AC-02)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings({ from: '2026-09-16', status: 'confirmed' }, 0, 50);
      expect(calls[0]?.eq).toContainEqual(['status', 'confirmed']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('before adds .lt(booking_date, before) — EXCLUSIVE, distinct from to (US-014/AC-02, Completed)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings({ from: '2026-09-01', status: 'confirmed', before: '2026-09-16' }, 0, 50);
      expect(calls[0]?.lt).toEqual(['booking_date', '2026-09-16']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('deskId adds .eq(desk_id, deskId) (US-014/AC-03)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings(
        { from: '2026-09-16', deskId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
        0,
        50,
      );
      expect(calls[0]?.eq).toContainEqual(['desk_id', '3f2504e0-4f89-41d3-9a0c-0305e82c3301']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('all filters combined produce all four predicates on one call (US-014/AC-04)', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings(
        {
          from: '2026-09-01',
          to: '2026-09-30',
          before: '2026-09-16',
          status: 'confirmed',
          deskId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        },
        0,
        50,
      );
      const call = calls[0];
      expect(call?.gte).toEqual(['booking_date', '2026-09-01']);
      expect(call?.lte).toEqual(['booking_date', '2026-09-30']);
      expect(call?.lt).toEqual(['booking_date', '2026-09-16']);
      expect(call?.eq).toContainEqual(['status', 'confirmed']);
      expect(call?.eq).toContainEqual(['desk_id', '3f2504e0-4f89-41d3-9a0c-0305e82c3301']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('the .select() string, ordering, range() and count option are byte-identical to US-013\'s — unchanged by filtering', async () => {
    const { calls, client } = fakeSupabase({ data: [], error: null, count: 0 });
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.listBookings(
        { from: '2026-09-01', to: '2026-09-30', status: 'confirmed', deskId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
        0,
        50,
      );
      expect(calls[0]?.select).toBe('id, booking_date, status, desks(desk_number), user_profiles!user_id(full_name)');
      expect(calls[0]?.selectOptions).toEqual({ count: 'exact' });
      expect(calls[0]?.order).toEqual([
        { column: 'booking_date', ascending: true },
        { column: 'created_at', ascending: true },
        { column: 'id', ascending: true },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

const BOOKING_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ADMIN_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';
const CANCELLED_AT = new Date('2026-09-16T12:00:00.000Z');
const TODAY: AdminBookingsFilter['from'] = '2026-09-16';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';

const DETAILS_ROW = {
  user_id: OWNER_ID,
  booking_date: '2026-09-16',
  desks: { desk_number: 'A-02' },
  user_profiles: { email: 'dana@company.com' },
};

describe('adminBookingsRepository.cancelAnyBooking — the write (US-015/AC-01, AC-02, AC-04, AC-05, AC-06, AC-07)', () => {
  it('updates by id/confirmed/not-past, writing cancellation_source admin and cancelled_by the acting admin — no user_id predicate anywhere', async () => {
    const { calls, client } = fakeSupabase([{ data: { id: BOOKING_ID }, error: null }, { data: DETAILS_ROW, error: null }]);
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.cancelAnyBooking(BOOKING_ID, ADMIN_ID, CANCELLED_AT, TODAY!);

      expect(calls[0]).toEqual({
        table: 'bookings',
        select: 'id',
        update: {
          status: 'cancelled',
          cancelled_at: CANCELLED_AT.toISOString(),
          cancelled_by: ADMIN_ID,
          cancellation_source: 'admin',
        },
        eq: [
          ['id', BOOKING_ID],
          ['status', 'confirmed'],
        ],
        gte: ['booking_date', TODAY],
        order: [],
        maybeSingle: true,
      });
      expect(result).toEqual({
        id: BOOKING_ID,
        ownerId: OWNER_ID,
        deskNumber: 'A-02',
        date: '2026-09-16',
        ownerEmail: 'dana@company.com',
      });
      // The absence is REQ-014 — assert no eq() call ever names user_id.
      expect(calls[0]?.eq.some(([column]) => column === 'user_id')).toBe(false);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('resolves the desk number and the owner email with a SEPARATE follow-up read, scoped by id alone (US-029/D-03)', async () => {
    const { calls, client } = fakeSupabase([{ data: { id: BOOKING_ID }, error: null }, { data: DETAILS_ROW, error: null }]);
    setSupabaseForTesting(client);

    try {
      await adminBookingsRepository.cancelAnyBooking(BOOKING_ID, ADMIN_ID, CANCELLED_AT, TODAY!);

      expect(calls).toHaveLength(2);
      expect(calls[1]).toEqual({
        table: 'bookings',
        select: 'user_id, booking_date, desks(desk_number), user_profiles!user_id(email)',
        eq: [['id', BOOKING_ID]],
        order: [],
        maybeSingle: true,
      });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined when the update matches no row (already cancelled, past-dated, or no such booking) — and never issues the follow-up read', async () => {
    const { calls, client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.cancelAnyBooking(BOOKING_ID, ADMIN_ID, CANCELLED_AT, TODAY!);
      expect(result).toBeUndefined();
      expect(calls).toHaveLength(1);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error rather than returning undefined (never swallowed)', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.cancelAnyBooking(BOOKING_ID, ADMIN_ID, CANCELLED_AT, TODAY!)).rejects.toThrow(
        /admin booking cancel failed/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws if the follow-up read finds no joined desk (desk_id is NOT NULL — a bug, not a valid state)', async () => {
    const { client } = fakeSupabase([
      { data: { id: BOOKING_ID }, error: null },
      { data: { ...DETAILS_ROW, desks: null }, error: null },
    ]);
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.cancelAnyBooking(BOOKING_ID, ADMIN_ID, CANCELLED_AT, TODAY!)).rejects.toThrow(
        /no joined desk/,
      );
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('adminBookingsRepository.findBookingState — the disambiguating read (US-015/AC-09)', () => {
  it('selects status and booking_date only, scoped by id alone — unscoped by design', async () => {
    const { calls, client } = fakeSupabase({ data: { status: 'cancelled', booking_date: '2026-09-16' }, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.findBookingState(BOOKING_ID);

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'status, booking_date',
          eq: [['id', BOOKING_ID]],
          order: [],
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual({ status: 'cancelled', booking_date: '2026-09-16' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined when no booking matches the id', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    setSupabaseForTesting(client);

    try {
      const result = await adminBookingsRepository.findBookingState(BOOKING_ID);
      expect(result).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a repository error rather than returning undefined (never swallowed)', async () => {
    const { client } = fakeSupabase({ data: null, error: { code: 'XX000', message: 'boom' } });
    setSupabaseForTesting(client);

    try {
      await expect(adminBookingsRepository.findBookingState(BOOKING_ID)).rejects.toThrow(/bookings lookup failed/);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

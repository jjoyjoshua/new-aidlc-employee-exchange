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
import {
  DESK_CONFLICT_ERROR,
  USER_CONFLICT_ERROR,
  UNRECOGNISED_UNIQUE_VIOLATION_ERROR,
  NON_UNIQUE_VIOLATION_ERROR,
  activeDeskRow,
  inactiveDeskRow,
  CANCEL_THEN_REBOOK_SAME_DATE_ROWS,
  REBOOKED_DESK_ID,
} from './bookings.fixtures.js';

/** Applies a recorded `.order()` chain to a row set the way Postgres would — a stable sort per
 *  key, in the order the keys were given. Lets a fixture-driven test catch a missing or
 *  wrong-direction second sort key, not merely assert the query's shape (US-008/AC-03, F-2). */
function applyRecordedOrder<T extends Record<string, unknown>>(
  rows: T[],
  order: Array<{ column: string; ascending: boolean }>,
): T[] {
  return [...rows].sort((a, b) => {
    for (const { column, ascending } of order) {
      const av = a[column];
      const bv = b[column];
      if (av === bv) continue;
      const cmp = av! < bv! ? -1 : 1;
      return ascending ? cmp : -cmp;
    }
    return 0;
  });
}

interface RecordedCall {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  order: Array<{ column: string; ascending: boolean }>;
  insert?: unknown;
  update?: unknown;
  single?: boolean;
  maybeSingle?: boolean;
  limit?: number;
  gte?: [string, unknown];
  lte?: [string, unknown];
  lt?: [string, unknown];
}

type FakeResponse = { data: unknown; error: { code: string; message: string } | null };

function fakeSupabase(responses: Record<string, FakeResponse | ((call: RecordedCall) => FakeResponse)>) {
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
      lte(column: string, value: unknown) {
        call.lte = [column, value];
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        call.order.push({ column, ascending: opts?.ascending ?? true });
        return builder;
      },
      lt(column: string, value: unknown) {
        call.lt = [column, value];
        return builder;
      },
      insert(row: unknown) {
        call.insert = row;
        return builder;
      },
      update(patch: unknown) {
        call.update = patch;
        return builder;
      },
      limit(count: number) {
        call.limit = count;
        return builder;
      },
      single() {
        call.single = true;
        return builder;
      },
      maybeSingle() {
        call.maybeSingle = true;
        return builder;
      },
      // Supabase's query builder is itself a thenable — awaiting it is what triggers the
      // "request". Recording happens here, at the point the chain is actually consumed.
      then(onFulfilled: (value: FakeResponse) => unknown, onRejected?: (reason: unknown) => unknown) {
        calls.push(call);
        const responder = responses[table] ?? { data: [], error: null };
        const response = typeof responder === 'function' ? responder(call) : responder;
        return Promise.resolve(response).then(onFulfilled, onRejected);
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
        { table: 'desks', select: 'id, desk_number', eq: [['is_active', true]], order: [{ column: 'desk_number', ascending: true }] },
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
          order: [],
        },
      ]);
      expect(result).toEqual(['d1', 'd2']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.listConfirmedDeskIdsInRange — US-009/AC-06, ADR-004 unchanged', () => {
  it('selects booking_date and desk_id only — no user_id, no * — over an inclusive range, confirmed only', async () => {
    const { calls, client } = fakeSupabase({
      bookings: { data: [{ booking_date: '2026-09-10', desk_id: 'd1' }], error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.listConfirmedDeskIdsInRange('2026-09-10', '2026-10-09');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'booking_date, desk_id',
          eq: [['status', 'confirmed']],
          gte: ['booking_date', '2026-09-10'],
          lte: ['booking_date', '2026-10-09'],
          order: [],
        },
      ]);
      expect(result).toEqual([{ booking_date: '2026-09-10', desk_id: 'd1' }]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.listMyConfirmedDatesInRange — US-009/AC-06, BR-001.1', () => {
  it('selects booking_date only, filtered to the caller, over an inclusive range, confirmed only', async () => {
    const { calls, client } = fakeSupabase({
      bookings: { data: [{ booking_date: '2026-09-11' }], error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.listMyConfirmedDatesInRange('user-1', '2026-09-10', '2026-10-09');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'booking_date',
          eq: [
            ['user_id', 'user-1'],
            ['status', 'confirmed'],
          ],
          gte: ['booking_date', '2026-09-10'],
          lte: ['booking_date', '2026-10-09'],
          order: [],
        },
      ]);
      expect(result).toEqual(['2026-09-11']);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.getDeskById — US-007/FR-04', () => {
  it('returns the row, including is_active, for a real desk id', async () => {
    const { calls, client } = fakeSupabase({
      desks: { data: activeDeskRow('11111111-1111-4111-8111-111111111111'), error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.getDeskById('11111111-1111-4111-8111-111111111111');

      expect(calls).toEqual([
        {
          table: 'desks',
          select: 'id, desk_number, is_active',
          eq: [['id', '11111111-1111-4111-8111-111111111111']],
          order: [],
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual({ id: '11111111-1111-4111-8111-111111111111', desk_number: 'A-01', is_active: true });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined for a missing id (US-007/AC-12)', async () => {
    const { client } = fakeSupabase({ desks: { data: null, error: null } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.getDeskById('does-not-exist');
      expect(result).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('reports an inactive desk as is_active: false, not as missing (US-007/AC-12)', async () => {
    const { client } = fakeSupabase({ desks: { data: inactiveDeskRow(), error: null } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.getDeskById('irrelevant');
      expect(result).toEqual(inactiveDeskRow());
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.findMyConfirmedBooking — US-007/FR-05, AC-06', () => {
  it('selects id, desk_id and the joined desk_number, filtered to the caller and status confirmed', async () => {
    const { calls, client } = fakeSupabase({
      bookings: {
        data: { id: 'b1', desk_id: 'd1', desks: { desk_number: 'A-02' } },
        error: null,
      },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.findMyConfirmedBooking('user-1', '2026-09-16');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'id, desk_id, desks(desk_number)',
          eq: [
            ['user_id', 'user-1'],
            ['booking_date', '2026-09-16'],
            ['status', 'confirmed'],
          ],
          order: [],
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual({ id: 'b1', desk_id: 'd1', desk_number: 'A-02' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined when the caller holds no confirmed booking that date (US-007/AC-06)', async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: null } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.findMyConfirmedBooking('user-1', '2026-09-16');
      expect(result).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.insertConfirmedBooking — US-007/FR-02, D-01 (design note §1.2)', () => {
  it("returns { kind: 'ok' } with the new row's id when the insert succeeds", async () => {
    const { calls, client } = fakeSupabase({
      bookings: { data: { id: 'new-booking-id' }, error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.insertConfirmedBooking('user-1', 'desk-1', '2026-09-16');

      expect(result).toEqual({ kind: 'ok', id: 'new-booking-id' });
      expect(calls).toEqual([
        {
          table: 'bookings',
          insert: { user_id: 'user-1', desk_id: 'desk-1', booking_date: '2026-09-16' },
          select: 'id',
          eq: [],
          order: [],
          single: true,
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it("maps the desk-per-day index violation to { kind: 'desk_conflict' } (US-007/AC-08)", async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: DESK_CONFLICT_ERROR } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.insertConfirmedBooking('user-1', 'desk-1', '2026-09-16');
      expect(result).toEqual({ kind: 'desk_conflict' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it("maps the user-per-day index violation to { kind: 'user_conflict' } (US-007/AC-05)", async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: USER_CONFLICT_ERROR } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.insertConfirmedBooking('user-1', 'desk-1', '2026-09-16');
      expect(result).toEqual({ kind: 'user_conflict' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a non-23505 error rather than treating it as a conflict outcome (design note §1.2, F-1)', async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: NON_UNIQUE_VIOLATION_ERROR } });
    setSupabaseForTesting(client);

    try {
      await expect(availabilityRepository.insertConfirmedBooking('user-1', 'desk-1', '2026-09-16')).rejects.toThrow();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('throws on a 23505 that names neither known index, rather than guessing (design note §1.2, F-1)', async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: UNRECOGNISED_UNIQUE_VIOLATION_ERROR } });
    setSupabaseForTesting(client);

    try {
      await expect(availabilityRepository.insertConfirmedBooking('user-1', 'desk-1', '2026-09-16')).rejects.toThrow();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.cancelOwnedBooking — US-007/FR-06, AC-07', () => {
  it('updates status, cancelled_at, cancelled_by and cancellation_source in one statement, scoped to id/user/confirmed', async () => {
    const cancelledAt = new Date('2026-09-16T10:00:00.000Z');
    const { calls, client } = fakeSupabase({
      bookings: { data: { id: 'b1' }, error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.cancelOwnedBooking('user-1', 'b1', cancelledAt);

      expect(result).toEqual({ id: 'b1' });
      expect(calls).toEqual([
        {
          table: 'bookings',
          update: {
            status: 'cancelled',
            cancelled_at: cancelledAt.toISOString(),
            cancelled_by: 'user-1',
            cancellation_source: 'owner',
          },
          select: 'id',
          eq: [
            ['id', 'b1'],
            ['user_id', 'user-1'],
            ['status', 'confirmed'],
          ],
          order: [],
          maybeSingle: true,
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined (no row) when the id/user/status predicate matches nothing (US-007/AC-07)', async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: null } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.cancelOwnedBooking('user-1', 'not-mine-or-gone', new Date());
      expect(result).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.findMyLastBookedDeskId — US-008/FR-02, FR-03', () => {
  it('returns undefined for a user with no booking history (US-008/AC-04)', async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: null } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.findMyLastBookedDeskId('user-1');
      expect(result).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('selects desk_id only, applies no status filter, orders booking_date desc then created_at desc, limited to 1 (US-008/AC-03)', async () => {
    const { calls, client } = fakeSupabase({
      bookings: (call) => ({ data: applyRecordedOrder(CANCEL_THEN_REBOOK_SAME_DATE_ROWS, call.order)[0] ?? null, error: null }),
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.findMyLastBookedDeskId('user-1');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'desk_id',
          eq: [['user_id', 'user-1']],
          order: [
            { column: 'booking_date', ascending: false },
            { column: 'created_at', ascending: false },
          ],
          limit: 1,
          maybeSingle: true,
        },
      ]);
      // The tie-break case (design note §5, F-2): a cancelled and a confirmed booking share the
      // most recent booking_date; only the created_at desc key picks the confirmed row, which
      // replaced the cancelled one, over whichever row the fixture lists first.
      expect(result).toBe(REBOOKED_DESK_ID);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.listMyBookingsInWindow — US-010/AC-01, AC-03, AC-04, AC-05', () => {
  it('selects id, booking_date, status and the joined desk_number, filtered to the caller and the date floor, ALL statuses, ordered booking_date desc then created_at desc, with no upper bound when `to` is omitted', async () => {
    const { calls, client } = fakeSupabase({
      bookings: { data: [{ id: 'b1', booking_date: '2026-09-16', status: 'confirmed', desks: { desk_number: 'A-02' } }], error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.listMyBookingsInWindow('user-1', '2026-08-19');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'id, booking_date, status, desks(desk_number)',
          eq: [['user_id', 'user-1']],
          gte: ['booking_date', '2026-08-19'],
          order: [
            { column: 'booking_date', ascending: false },
            { column: 'created_at', ascending: false },
          ],
        },
      ]);
      expect(result).toEqual([{ id: 'b1', booking_date: '2026-09-16', status: 'confirmed', desk_number: 'A-02' }]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('applies an upper bound with .lte() only when `to` is given (an older page, design note §1.3)', async () => {
    const { calls, client } = fakeSupabase({
      bookings: { data: [], error: null },
    });
    setSupabaseForTesting(client);

    try {
      await availabilityRepository.listMyBookingsInWindow('user-1', '2026-07-20', '2026-08-19');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'id, booking_date, status, desks(desk_number)',
          eq: [['user_id', 'user-1']],
          gte: ['booking_date', '2026-07-20'],
          lte: ['booking_date', '2026-08-19'],
          order: [
            { column: 'booking_date', ascending: false },
            { column: 'created_at', ascending: false },
          ],
        },
      ]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('applies no status filter — a Cancelled row is history and this read must return it too (US-010/AC-04, AC-05)', async () => {
    const { calls, client } = fakeSupabase({ bookings: { data: [], error: null } });
    setSupabaseForTesting(client);

    try {
      await availabilityRepository.listMyBookingsInWindow('user-1', '2026-08-19');
      // No .eq('status', ...) anywhere in the recorded predicate.
      const statusFilters = calls.flatMap((c) => c.eq).filter(([column]) => column === 'status');
      expect(statusFilters).toEqual([]);
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

describe('availabilityRepository.findMyNewestBookingBefore — US-010/AC-03', () => {
  it('selects booking_date only, filtered to the caller and strictly before the given date, ordered desc, limited to 1', async () => {
    const { calls, client } = fakeSupabase({
      bookings: { data: { booking_date: '2026-07-30' }, error: null },
    });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.findMyNewestBookingBefore('user-1', '2026-08-19');

      expect(calls).toEqual([
        {
          table: 'bookings',
          select: 'booking_date',
          eq: [['user_id', 'user-1']],
          lt: ['booking_date', '2026-08-19'],
          order: [
            { column: 'booking_date', ascending: false },
            { column: 'created_at', ascending: false },
          ],
          limit: 1,
          maybeSingle: true,
        },
      ]);
      expect(result).toEqual({ booking_date: '2026-07-30' });
    } finally {
      setSupabaseForTesting(undefined);
    }
  });

  it('returns undefined when the caller has nothing older (US-010/AC-03 edge case — the control disappears)', async () => {
    const { client } = fakeSupabase({ bookings: { data: null, error: null } });
    setSupabaseForTesting(client);

    try {
      const result = await availabilityRepository.findMyNewestBookingBefore('user-1', '2026-08-19');
      expect(result).toBeUndefined();
    } finally {
      setSupabaseForTesting(undefined);
    }
  });
});

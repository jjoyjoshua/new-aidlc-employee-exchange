/**
 * US-007/FR-02 — the real-Postgres proof of D-01's constraint-violation mapping (Architect
 * design note §1.1-§1.3, finding F-2).
 *
 * `bookings.repository.spec.ts` proves the mapping's LOGIC against a fake client that is TOLD
 * what error Postgres produced. It cannot prove the assumption that logic depends on: that a
 * real unique-violation error surfaced through supabase-js actually carries SQLSTATE `23505`,
 * and that its `message` names the bare index rather than something else. This file proves that,
 * against a real database, by causing two real violations and asserting on the RAW rejected
 * error object as well as the repository's mapped outcome — "a future supabase-js/Postgres
 * change that alters the surfaced shape fails here with a clear cause instead of 'expected ok,
 * got desk_conflict'" (design note §1.3).
 *
 * **Gate: `RUN_BOOKINGS_CONCURRENCY_TEST=1`.** There is no precedent in this repository for a
 * test that needs a real database (confirmed by search before writing this file — grep for
 * `RUN_` env gates across `apps/api/src` turns up nothing), so this file establishes the
 * convention `testing-standards.md` calls for and `implementation-plan.md` Step 3 asks this file
 * to set up. Absent the flag, every test below is SKIPPED, not failed, and CI needs no database
 * configured for the suite to stay green.
 *
 * Run it only against a **disposable** Postgres/Supabase project — Supabase local
 * (`supabase start`) or a throwaway hosted project — never a shared development or production
 * one. It creates and deletes real `user_profiles` (via `auth.admin.createUser`, since
 * `user_profiles.id references auth.users(id)`), `desks` and `bookings` rows, through the
 * ordinary `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` configuration already required to boot the
 * server at all (`apps/api/src/infra/supabase/index.ts`, `apps/api/src/config/index.ts`) — point
 * those at the disposable project before setting the flag:
 *
 *   RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test --workspace @desk-booking/api -- concurrency
 *
 * Also named `(US-007/AC-09)` for the per-user case (Architect design note §8, finding F-7):
 * "exactly one booking exists" after a double-tap is a guarantee this unique index gives, not
 * the UI's busy state — the UI merely stops issuing a second request. If it ever failed to, this
 * index is what still holds, and the assertion at the end of that test reads the database's own
 * count, not the application's belief about how many requests it issued.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { supabase } from '../../infra/supabase/index.js';
import { availabilityRepository } from './bookings.repository.js';
import { adminBookingsRepository } from './admin-bookings.repository.js';

// `no-restricted-properties` normally forbids `process.env` in `apps/api/src/**` outside
// `config/`, because application configuration is read and validated exactly once there (see
// that module's own docblock). This is not application configuration — it decides whether a
// TEST runs, not whether the server boots — so it does not belong in that schema, and the
// exception is scoped to this one line rather than widening the rule.
// eslint-disable-next-line no-restricted-properties -- test-only run gate, not app config; see docblock above
const RUN = process.env.RUN_BOOKINGS_CONCURRENCY_TEST === '1';

// A Wednesday. Only the CHECK constraint `bookings_weekday_only` (Mon-Fri) cares which one.
const DATE = '2026-09-16';

interface Cleanup {
  bookingIds: string[];
  deskIds: string[];
  userIds: string[];
}

function newCleanup(): Cleanup {
  return { bookingIds: [], deskIds: [], userIds: [] };
}

async function cleanUp(cleanup: Cleanup): Promise<void> {
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

/** A real `auth.users` row plus its `user_profiles` row — the FK `user_profiles.id references
 *  auth.users (id)` (`0001_user_profiles.sql:28`) means a booking's `user_id` cannot be a bare
 *  uuid the way a fake-client test gets away with. */
async function createEmployee(cleanup: Cleanup, fullName = 'Concurrency Fixture'): Promise<string> {
  const email = `us007-concurrency-${randomUUID()}@example.test`;
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

describe.runIf(RUN)('availabilityRepository.insertConfirmedBooking — real Postgres arbitration (US-007/FR-02)', () => {
  it('lets exactly one of two concurrent inserts for the SAME desk+date win; the loser is desk_conflict, and the raw error is 23505 naming bookings_one_confirmed_per_desk_per_day (US-007/AC-08)', async () => {
    const cleanup = newCleanup();
    try {
      const deskId = await createDesk(cleanup, 'Z-01');
      const userA = await createEmployee(cleanup);
      const userB = await createEmployee(cleanup);

      const [a, b] = await Promise.all([
        availabilityRepository.insertConfirmedBooking(userA, deskId, DATE),
        availabilityRepository.insertConfirmedBooking(userB, deskId, DATE),
      ]);
      for (const outcome of [a, b]) if (outcome.kind === 'ok') cleanup.bookingIds.push(outcome.id);

      const outcomes = [a.kind, b.kind].sort();
      expect(outcomes).toEqual(['desk_conflict', 'ok']);

      // The mapping's LOGIC is proven above. What follows proves the ASSUMPTION it depends on
      // (design note §1.1, §1.3): re-attempt the same, now-taken desk+date directly against
      // Postgres, bypassing the repository's mapping, and inspect the RAW rejected error.
      const userC = await createEmployee(cleanup);
      const raw = await supabase().from('bookings').insert({ user_id: userC, desk_id: deskId, booking_date: DATE });

      expect(raw.error).not.toBeNull();
      expect(raw.error?.code).toBe('23505');
      expect(raw.error?.message).toContain('bookings_one_confirmed_per_desk_per_day');
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('lets exactly one of two concurrent inserts for the SAME user+date win; the loser is user_conflict, the raw error is 23505 naming bookings_one_confirmed_per_user_per_day, and exactly one confirmed row exists for that user+date (US-007/AC-05, also US-007/AC-09 — design note §8 F-7)', async () => {
    const cleanup = newCleanup();
    try {
      const deskA = await createDesk(cleanup, 'Z-02');
      const deskB = await createDesk(cleanup, 'Z-03');
      const user = await createEmployee(cleanup);

      const [a, b] = await Promise.all([
        availabilityRepository.insertConfirmedBooking(user, deskA, DATE),
        availabilityRepository.insertConfirmedBooking(user, deskB, DATE),
      ]);
      for (const outcome of [a, b]) if (outcome.kind === 'ok') cleanup.bookingIds.push(outcome.id);

      const outcomes = [a.kind, b.kind].sort();
      expect(outcomes).toEqual(['ok', 'user_conflict']);

      const deskC = await createDesk(cleanup, 'Z-04');
      const raw = await supabase().from('bookings').insert({ user_id: user, desk_id: deskC, booking_date: DATE });

      expect(raw.error).not.toBeNull();
      expect(raw.error?.code).toBe('23505');
      expect(raw.error?.message).toContain('bookings_one_confirmed_per_user_per_day');

      // AC-09's real guarantee: the DATABASE's own count, not the application's belief about
      // how many requests it issued.
      const { data: rows, error } = await supabase()
        .from('bookings')
        .select('id')
        .eq('user_id', user)
        .eq('booking_date', DATE)
        .eq('status', 'confirmed');
      if (error) throw new Error(error.message);
      expect(rows).toHaveLength(1);
    } finally {
      await cleanUp(cleanup);
    }
  });
});

/**
 * US-013 design note §3.1, §3.4 (`inception/specs/US-013-see-every-booking/design-note.md`) —
 * two runtime-only assumptions the recording-fake test (`admin-bookings.repository.spec.ts`)
 * cannot prove: that `user_profiles!user_id(full_name)` actually disambiguates against real
 * PostgREST (`bookings` has two FKs into `user_profiles`), and that a page past the last row
 * comes back as an empty `200` rather than a `416`.
 */
describe.runIf(RUN)('adminBookingsRepository.listBookings — real Postgres (US-013/AC-03, AC-04)', () => {
  it('the user_profiles embed resolves via user_id, never cancelled_by — the HOLDER\'s name, not the canceller\'s (US-013/AC-03, design note §3.1)', async () => {
    const cleanup = newCleanup();
    try {
      const holder = await createEmployee(cleanup, 'US013 Holder');
      const canceller = await createEmployee(cleanup, 'US013 Canceller');
      const deskId = await createDesk(cleanup, 'Z-05');

      const { data, error } = await supabase()
        .from('bookings')
        .insert({
          user_id: holder,
          desk_id: deskId,
          booking_date: DATE,
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: canceller,
          cancellation_source: 'admin',
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`fixture booking could not be created: ${error?.message}`);
      cleanup.bookingIds.push((data as { id: string }).id);

      const page = await adminBookingsRepository.listBookings({ from: DATE }, 0, 50);
      const row = page.rows.find((r: { id: string }) => r.id === (data as { id: string }).id);

      expect(row?.employee_name).toBe('US013 Holder');
      expect(row?.employee_name).not.toBe('US013 Canceller');
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('a page far beyond the last row resolves to an empty page, never a thrown error (US-013/AC-04, design note §3.4)', async () => {
    // No fixture data needed: an offset far beyond anything this disposable project holds for
    // this DATE is enough to exercise PostgREST's out-of-range Range behaviour.
    const page = await adminBookingsRepository.listBookings({ from: DATE }, 1_000_000, 50);

    expect(page.rows).toEqual([]);
  });
});

/**
 * US-015 design note §3.4, §9 — the two runtime-only assumptions no unit test (a recording fake)
 * can prove: that two concurrent `UPDATE`s carrying the SAME `status = 'confirmed'` predicate
 * really do arbitrate to exactly one winner when the WHERE clause is the only guard (there is no
 * row-version column), and that the arbitration holds ACROSS two different writers
 * (`cancelOwnedBooking` and `cancelAnyBooking`), not only between two copies of the same one.
 */
describe.runIf(RUN)('cancelOwnedBooking vs cancelAnyBooking — real Postgres arbitration (US-015/AC-07, AC-09)', () => {
  it('a booking owner and an admin racing to cancel the SAME booking: exactly one wins, and the stored cancellation_source matches the winner (US-015/AC-09, the two-actor race)', async () => {
    const cleanup = newCleanup();
    try {
      const owner = await createEmployee(cleanup, 'Race Owner');
      const admin = await createEmployee(cleanup, 'Race Admin');
      const deskId = await createDesk(cleanup, 'Z-06');

      const { data, error } = await supabase()
        .from('bookings')
        .insert({ user_id: owner, desk_id: deskId, booking_date: DATE })
        .select('id')
        .single();
      if (error || !data) throw new Error(`fixture booking could not be created: ${error?.message}`);
      const bookingId = (data as { id: string }).id;
      cleanup.bookingIds.push(bookingId);

      const now = new Date();
      const [ownerResult, adminResult] = await Promise.all([
        availabilityRepository.cancelOwnedBooking(owner, bookingId, now, DATE),
        adminBookingsRepository.cancelAnyBooking(bookingId, admin, now, DATE),
      ]);

      // Exactly one of the two writes matched a row — the database arbitrated, not application
      // logic (design note §3.4).
      const winners = [ownerResult, adminResult].filter((r) => r !== undefined);
      expect(winners).toHaveLength(1);

      const { data: row, error: readError } = await supabase()
        .from('bookings')
        .select('status, cancellation_source, cancelled_by')
        .eq('id', bookingId)
        .single();
      if (readError || !row) throw new Error(`fixture readback failed: ${readError?.message}`);

      expect((row as { status: string }).status).toBe('cancelled');
      // The winner's own write is what the stored row reflects — whichever of the two actually
      // matched the row, never a mix of one's status with the other's attribution.
      if (ownerResult !== undefined) {
        expect((row as { cancellation_source: string }).cancellation_source).toBe('owner');
        expect((row as { cancelled_by: string }).cancelled_by).toBe(owner);
      } else {
        expect((row as { cancellation_source: string }).cancellation_source).toBe('admin');
        expect((row as { cancelled_by: string }).cancelled_by).toBe(admin);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('two admins racing to cancel the SAME booking: exactly one row updated, one cancelled_at, a database-side count of 1 (US-015/AC-07, the server half)', async () => {
    const cleanup = newCleanup();
    try {
      const owner = await createEmployee(cleanup, 'Race Owner 2');
      const adminA = await createEmployee(cleanup, 'Race Admin A');
      const adminB = await createEmployee(cleanup, 'Race Admin B');
      const deskId = await createDesk(cleanup, 'Z-07');

      const { data, error } = await supabase()
        .from('bookings')
        .insert({ user_id: owner, desk_id: deskId, booking_date: DATE })
        .select('id')
        .single();
      if (error || !data) throw new Error(`fixture booking could not be created: ${error?.message}`);
      const bookingId = (data as { id: string }).id;
      cleanup.bookingIds.push(bookingId);

      const now = new Date();
      const [resultA, resultB] = await Promise.all([
        adminBookingsRepository.cancelAnyBooking(bookingId, adminA, now, DATE),
        adminBookingsRepository.cancelAnyBooking(bookingId, adminB, now, DATE),
      ]);

      const winners = [resultA, resultB].filter((r) => r !== undefined);
      expect(winners).toHaveLength(1);

      // AC-07's real guarantee: the DATABASE's own count, not the application's belief about how
      // many requests it issued.
      const { data: rows, error: countError } = await supabase()
        .from('bookings')
        .select('id, cancelled_by')
        .eq('id', bookingId)
        .eq('status', 'cancelled');
      if (countError) throw new Error(countError.message);
      expect(rows).toHaveLength(1);
      expect([adminA, adminB]).toContain((rows as Array<{ cancelled_by: string }>)[0]?.cancelled_by);
    } finally {
      await cleanUp(cleanup);
    }
  });
});

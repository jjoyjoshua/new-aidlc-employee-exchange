/**
 * US-018 design note §2.3, §5, §10 note 4 — two assumptions a fake client can only be TOLD, not
 * discover: that renaming a desk to its OWN current value raises no `23505` (a fake told "no
 * error" proves nothing about whether Postgres would actually raise one), and that a booking's
 * desk number really is resolved LIVE at read time rather than frozen at booking time (a fake
 * returns whatever fixture it is given, so "the join is live" is unfalsifiable against it).
 *
 * Lives under `modules/admin`, not `modules/bookings` or `modules/desks`, on purpose: proving
 * AC-06 needs both `desksRepository` (`modules/desks`) and `availabilityRepository` /
 * `adminBookingsRepository` (`modules/bookings`) in the same test, and `eslint.config.mjs`'s
 * module boundaries forbid `bookings` and `desks` from importing each other (ADR-004) — neither
 * module may host this file. `modules/admin` already composes across both (`admin.router.ts`,
 * `admin.routes.spec.ts`), the same way this repository's own composition root does.
 *
 * Same gate, convention and fixture shape as `bookings/bookings.repository.concurrency.spec.ts`
 * (its own docblock explains the gate's origin) — duplicated locally rather than imported, since
 * a shared cross-module test fixture module would itself need to sit somewhere and re-raise the
 * same boundary question.
 *
 *   RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test --workspace @desk-booking/api -- admin.concurrency
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { supabase } from '../../infra/supabase/index.js';
import { availabilityRepository } from '../bookings/bookings.repository.js';
import { adminBookingsRepository } from '../bookings/admin-bookings.repository.js';
import { desksRepository } from '../desks/desks.repository.js';
import { usersRepository } from '../users/users.repository.js';

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

async function createEmployee(cleanup: Cleanup, fullName = 'Concurrency Fixture'): Promise<string> {
  const email = `us018-concurrency-${randomUUID()}@example.test`;
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

/** US-020/AC-04 (design note §2.3, A2). Unlike `createEmployee`, the caller controls the full
 *  email local part — the metacharacter under test must land in a predictable place, not merely
 *  somewhere in a UUID. `role` defaults to `'employee'` — US-024's own callers below are the
 *  first to pass `'admin'`; every existing call site is unaffected. */
async function createAccountWithProfile(
  cleanup: Cleanup,
  fullName: string,
  emailLocalPart: string,
  role: 'employee' | 'admin' = 'employee',
): Promise<string> {
  const email = `${emailLocalPart}-${randomUUID()}@example.test`;
  const { data, error } = await supabase().auth.admin.createUser({
    email,
    password: `Test-${randomUUID()}!1`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture auth user could not be created: ${error?.message}`);
  cleanup.userIds.push(data.user.id);

  const { error: profileError } = await supabase()
    .from('user_profiles')
    .insert({ id: data.user.id, email, full_name: fullName, role });
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

describe.runIf(RUN)('desksRepository.updateDeskNumber — real Postgres (US-018/AC-06, AC-07)', () => {
  it('renaming a desk to its own current number raises NO 23505 — the self-collision that would break AC-07 (US-018 design note §2.3)', async () => {
    const cleanup = newCleanup();
    try {
      const deskId = await createDesk(cleanup, 'Z-08');

      const result = await desksRepository.updateDeskNumber(deskId, 'Z-08', new Date());

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') expect(result.desk.desk_number).toBe('Z-08');
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('a rename is visible from all three read paths AC-06 names — the employee list, the admin list, and the desk filter (US-018/AC-06)', async () => {
    const cleanup = newCleanup();
    try {
      const deskId = await createDesk(cleanup, 'Z-09');
      const employee = await createEmployee(cleanup, 'US018 Holder');

      const booked = await availabilityRepository.insertConfirmedBooking(employee, deskId, DATE);
      if (booked.kind !== 'ok') throw new Error(`fixture booking could not be created: ${booked.kind}`);
      cleanup.bookingIds.push(booked.id);

      const renamed = await desksRepository.updateDeskNumber(deskId, 'Z-10', new Date());
      expect(renamed.kind).toBe('ok');

      // 1. The employee's own booking list — bookings.repository.ts's listMyBookingsInWindow.
      const myBookings = await availabilityRepository.listMyBookingsInWindow(employee, DATE);
      expect(myBookings.find((b) => b.id === booked.id)?.desk_number).toBe('Z-10');

      // 2. The administrator's booking list — admin-bookings.repository.ts's listBookings.
      const adminPage = await adminBookingsRepository.listBookings({ from: DATE }, 0, 50);
      expect(adminPage.rows.find((r: { id: string }) => r.id === booked.id)?.desk_number).toBe('Z-10');

      // 3. The desk filter's own vocabulary — desks.repository.ts's listAllDesks.
      const allDesks = await desksRepository.listAllDesks();
      expect(allDesks.find((d) => d.id === deskId)?.desk_number).toBe('Z-10');
      expect(allDesks.find((d) => d.id === deskId)?.desk_number).not.toBe('Z-09');
    } finally {
      await cleanUp(cleanup);
    }
  });
});

/**
 * US-020/AC-04 (design note §2.3, A2 — the finding the plan's Step 3 did not originally cover).
 * `usersRepository.listAccounts.spec.ts`'s recording fake proves ONLY the string
 * `buildSearchFilter` produces; it cannot prove PostgREST parses that string as one `ilike` over
 * a LITERAL substring rather than as a wildcard or a mis-split filter clause. Only real Postgres
 * can answer that, which is why this case lives in this gated file rather than in a unit spec.
 */
describe.runIf(RUN)('usersRepository.listAccounts — real Postgres (US-020/AC-04)', () => {
  it('a term containing "_" matches the literal underscore row and NOT a same-shape row with an ordinary character in its place', async () => {
    const cleanup = newCleanup();
    try {
      const literalId = await createAccountWithProfile(cleanup, 'Anna_Lee Fixture', 'us020-literal-underscore');
      // Same length and shape as the literal row EXCEPT the character `_` would wildcard-match —
      // an unescaped `_` in the ILIKE pattern matches ANY single character, so this decoy row
      // would appear in the results if the escaping in `buildSearchFilter` did not hold.
      const decoyId = await createAccountWithProfile(cleanup, 'AnnaXLee Fixture', 'us020-wildcard-decoy');

      const results = await usersRepository.listAccounts('Anna_Lee');
      const ids = results.map((row) => row.id);

      expect(ids).toContain(literalId);
      expect(ids).not.toContain(decoyId);
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('a term containing "." matches the literal substring across the whole email, without PostgREST mis-splitting the filter clause on the dot', async () => {
    const cleanup = newCleanup();
    try {
      const dottedId = await createAccountWithProfile(cleanup, 'Pat Jones Fixture', 'pat.jones');

      const results = await usersRepository.listAccounts('pat.jones');
      const ids = results.map((row) => row.id);

      expect(ids).toContain(dottedId);
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('a term containing \'"\' or \'\\\\\' does not widen the filter\'s column scope — it either matches nothing or matches literally, never throws or returns unrelated rows', async () => {
    const cleanup = newCleanup();
    try {
      const ordinaryId = await createAccountWithProfile(cleanup, 'Ordinary Fixture', 'us020-ordinary');

      const quoteResults = await usersRepository.listAccounts('"; --');
      const backslashResults = await usersRepository.listAccounts('\\admin');

      expect(quoteResults.map((row) => row.id)).not.toContain(ordinaryId);
      expect(backslashResults.map((row) => row.id)).not.toContain(ordinaryId);
    } finally {
      await cleanUp(cleanup);
    }
  });
});

/**
 * Shared by every `describe.runIf(RUN)` block below that exercises BR-001.11's whole-table
 * invariant (US-024's `setRole`, US-025's `deactivateAccount`) — module scope, not nested inside
 * one block, so both can use the identical device. **The `exists` the trigger evaluates is over
 * the WHOLE table**, so every case must first neutralise the project's own seeded admin(s) —
 * demoting them AFTER a fixture admin exists to replace them (never before, which the rule under
 * test would itself refuse), and restoring them in `finally` regardless of outcome. Each test
 * snapshots `activeAdminIds()` BEFORE creating its own fixtures — reading the snapshot any later
 * would include the fixtures themselves, and bulk-demoting fixture-and-seed together in one
 * statement trips the very guard under test.
 */
async function activeAdminIds(): Promise<string[]> {
  const { data, error } = await supabase().from('user_profiles').select('id').eq('role', 'admin').eq('is_active', true);
  if (error) throw new Error(`could not read active admins: ${error.message}`);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/**
 * Demotes exactly the admin ids named — meant to be called with a snapshot taken BEFORE any
 * fixture admin is created, never a fresh read at call time. Reading the snapshot late is the
 * bug this comment exists to prevent: `activeAdminIds()` called after a fixture admin already
 * exists returns the fixture too, and bulk-demoting fixture-and-seed together in one statement
 * trips the very guard under test (each row's own trigger sees the OTHER row already changed
 * earlier in the same statement, by Postgres's own per-row `AFTER` trigger ordering).
 */
async function demote(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase().from('user_profiles').update({ role: 'employee' }).in('id', ids);
  if (error) throw new Error(`fixture setup: could not demote pre-existing admin(s): ${error.message}`);
}

/** The mirror of `demote` — always called in `finally`, regardless of the test's outcome. */
async function restore(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase().from('user_profiles').update({ role: 'admin' }).in('id', ids);
  if (error) {
    // A cleanup failure must be loud, but must not replace whatever the test itself threw —
    // `finally` re-throwing here would do exactly that (`bookings.repository.concurrency
    // .spec.ts`'s own `cleanUp` uses the same non-throwing discipline for the same reason).
    console.error(`fixture cleanup FAILED — pre-existing admin(s) [${ids.join(', ')}] were NOT restored to admin`, error.message);
  }
}

async function deactivateRow(id: string): Promise<void> {
  const { error } = await supabase().from('user_profiles').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(`fixture setup: could not deactivate ${id}: ${error.message}`);
}

/**
 * US-024/AC-04, AC-07, AC-12, edge case (Architect design note §3.5, `ADR-013`). Proves the ONE
 * thing a recording fake cannot: that the write-skew race `db-design.md` §3 named — two admins
 * demoting each other in the same instant — is actually closed by the trigger's advisory lock
 * (`supabase/migrations/0004_last_active_admin_guard.sql`), and that its rejection really does
 * surface through supabase-js as SQLSTATE `Z0011` (design note §3.1's one unverifiable
 * assumption, proven here rather than merely asserted by a fake).
 */
describe.runIf(RUN)('usersRepository.setRole — real Postgres, BR-001.11 (US-024/AC-04, AC-07, AC-12, edge case)', () => {
  const deactivate = deactivateRow;

  it('case 1 — demoting the only active admin is refused, and the raw rejected error carries SQLSTATE Z0011 (US-024/AC-04)', async () => {
    const cleanup = newCleanup();
    // Snapshot BEFORE creating any fixture — see `demote`'s own docblock for why.
    const preExisting = await activeAdminIds();
    try {
      const adminId = await createAccountWithProfile(cleanup, 'US024 Only Admin', 'us024-only-admin', 'admin');
      await demote(preExisting);
      try {
        // The raw client call first — this is the §3.1 assumption itself, asserted directly,
        // never merely told to the repository by a fake.
        const { error } = await supabase().from('user_profiles').update({ role: 'employee' }).eq('id', adminId);
        expect(error).not.toBeNull();
        expect(error?.code).toBe('Z0011');

        const result = await usersRepository.setRole({ id: adminId, role: 'employee', updatedAt: new Date() });
        expect(result).toEqual({ kind: 'blocked' });
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('case 2 — a deactivated admin does not count: demoting the one REMAINING active admin is refused (US-024/AC-07)', async () => {
    const cleanup = newCleanup();
    const preExisting = await activeAdminIds();
    try {
      const activeAdminId = await createAccountWithProfile(cleanup, 'US024 Active Admin', 'us024-active-admin', 'admin');
      const deactivatedAdminId = await createAccountWithProfile(cleanup, 'US024 Deactivated Admin', 'us024-deactivated-admin', 'admin');
      // Legal at this point: TWO fixture admins exist (plus any pre-existing ones, not yet
      // demoted), so deactivating one leaves plenty of others active — the guard passes.
      await deactivate(deactivatedAdminId);
      await demote(preExisting);
      try {
        const result = await usersRepository.setRole({ id: activeAdminId, role: 'employee', updatedAt: new Date() });
        expect(result).toEqual({ kind: 'blocked' });
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('case 3 — two active admins demoting each other AT THE SAME INSTANT: exactly one survives, never zero (US-024 edge case, the design\'s whole proof)', async () => {
    const cleanup = newCleanup();
    const preExisting = await activeAdminIds();
    try {
      const adminA = await createAccountWithProfile(cleanup, 'US024 Admin A', 'us024-concurrent-a', 'admin');
      const adminB = await createAccountWithProfile(cleanup, 'US024 Admin B', 'us024-concurrent-b', 'admin');
      await demote(preExisting);
      try {
        const now = new Date();
        const [resultA, resultB] = await Promise.all([
          usersRepository.setRole({ id: adminA, role: 'employee', updatedAt: now }),
          usersRepository.setRole({ id: adminB, role: 'employee', updatedAt: now }),
        ]);

        const kinds = [resultA.kind, resultB.kind].sort();
        // This is the assertion that FAILS against the naive trigger `db-design.md` §3 originally
        // described (no advisory lock): without serialisation, BOTH would read the other's row as
        // still-admin and BOTH would commit, leaving `kinds` as `['ok', 'ok']` and zero active
        // admins — exactly the outcome BR-001.11 exists to prevent.
        expect(kinds).toEqual(['blocked', 'ok']);

        const remaining = await activeAdminIds();
        expect(remaining).toHaveLength(1);
        expect([adminA, adminB]).toContain(remaining[0]);
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('case 4 — negative control: two active admins, demoting one alone succeeds (the guard does not over-block)', async () => {
    const cleanup = newCleanup();
    const preExisting = await activeAdminIds();
    try {
      const adminA = await createAccountWithProfile(cleanup, 'US024 Admin C', 'us024-negative-a', 'admin');
      const adminB = await createAccountWithProfile(cleanup, 'US024 Admin D', 'us024-negative-b', 'admin');
      await demote(preExisting);
      try {
        const result = await usersRepository.setRole({ id: adminA, role: 'employee', updatedAt: new Date() });
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') expect(result.profile.role).toBe('employee');

        const remaining = await activeAdminIds();
        expect(remaining).toEqual([adminB]);
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('case 5 — a deactivated person\'s role can still be changed, even though they were the only admin before deactivation (US-024/AC-12)', async () => {
    const cleanup = newCleanup();
    const preExisting = await activeAdminIds();
    try {
      const activeAdminId = await createAccountWithProfile(cleanup, 'US024 Active Admin 2', 'us024-ac12-active', 'admin');
      const deactivatedAdminId = await createAccountWithProfile(cleanup, 'US024 Deactivated Admin 2', 'us024-ac12-deactivated', 'admin');
      await deactivate(deactivatedAdminId);
      await demote(preExisting);
      try {
        // Changing the DEACTIVATED admin's own role — it was never counted, so this can never
        // reduce the active-admin count, regardless of what it changes to.
        const result = await usersRepository.setRole({ id: deactivatedAdminId, role: 'employee', updatedAt: new Date() });
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(result.profile.role).toBe('employee');
          expect(result.profile.is_active).toBe(false);
        }

        // The active admin is untouched throughout.
        const remaining = await activeAdminIds();
        expect(remaining).toEqual([activeAdminId]);
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });
});

/**
 * US-025/AC-02, AC-04, AC-10, AC-12, edge case (Architect design note §2.4, §3.5). Proves what a
 * recording fake cannot: that the `0004` trigger fires correctly from INSIDE
 * `deactivate_account_cascade` exactly as it fires from a plain `UPDATE` (case 4, the design's
 * whole proof for this story — the trigger aborting the function must also roll back the
 * BOOKINGS half of the transaction, not just `user_profiles`), and that the cascade's own
 * predicate (`status = 'confirmed' AND booking_date >= p_today`) agrees with the service's
 * `displayStatusPredicate` (case 2).
 *
 * `today`/`now` are passed to `usersRepository.deactivateAccount` explicitly by every case here —
 * this method takes them as parameters (design note §2.1) rather than reading a clock, so the
 * fixture dates below and the RPC's own comparison can never disagree about what "today" means.
 */
describe.runIf(RUN)('usersRepository.deactivateAccount — real Postgres, cascade atomicity (US-025/AC-02, AC-04, AC-10, AC-12, edge case)', () => {
  const TODAY_DATE = '2026-09-16'; // A Wednesday, matching this file's own `DATE` convention.
  const PAST_DATE = '2026-09-14'; // A Monday — before TODAY_DATE, never touched.
  const FUTURE_DATE = '2026-09-17'; // A Thursday — after TODAY_DATE, always touched.
  const FUTURE_DATE_2 = '2026-09-18'; // A Friday — a SECOND future date, distinct from FUTURE_DATE
  // (bookings_one_confirmed_per_user_per_day forbids two confirmed bookings for the same person
  // on the same day, so case 2's four fixture bookings need four distinct dates).
  const NOW = new Date('2026-09-16T09:00:00.000Z');

  interface BookingRow {
    id: string;
    status: string;
    cancelled_by: string | null;
    cancellation_source: string | null;
  }

  async function readBooking(id: string): Promise<BookingRow> {
    const { data, error } = await supabase()
      .from('bookings')
      .select('id, status, cancelled_by, cancellation_source')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error(`could not read fixture booking ${id}: ${error?.message}`);
    return data as BookingRow;
  }

  async function readIsActive(id: string): Promise<boolean> {
    const { data, error } = await supabase().from('user_profiles').select('is_active').eq('id', id).single();
    if (error || !data) throw new Error(`could not read fixture account ${id}: ${error?.message}`);
    return (data as { is_active: boolean }).is_active;
  }

  /** Inserts and registers the booking for cleanup IMMEDIATELY on success — never batched after
   *  a later check that might throw first, which would leak the booking (and, via
   *  `on delete restrict`, its desk) past this test's own `finally`. */
  async function bookOrThrow(cleanup: Cleanup, userId: string, deskId: string, date: string): Promise<string> {
    const result = await availabilityRepository.insertConfirmedBooking(userId, deskId, date);
    if (result.kind !== 'ok') throw new Error(`fixture booking could not be created: ${result.kind}`);
    cleanup.bookingIds.push(result.id);
    return result.id;
  }

  it('case 1 — deactivating the only active admin is refused, and NOTHING is touched: account stays active, booking stays confirmed (US-025/AC-04, US-025/AC-10, US-025/AC-12)', async () => {
    const cleanup = newCleanup();
    const preExisting = await activeAdminIds();
    try {
      const adminId = await createAccountWithProfile(cleanup, 'US025 Only Admin', 'us025-only-admin', 'admin');
      const deskId = await createDesk(cleanup, 'Z-25');
      const bookingId = await bookOrThrow(cleanup, adminId, deskId, FUTURE_DATE);
      await demote(preExisting);
      try {
        // The raw client call first — the §2.7/§3.1 assumption itself, that Z0011 survives the
        // `/rpc/` path exactly as it survives a plain table UPDATE (a DIFFERENT code path,
        // untested by US-024's own proof).
        const { error } = await supabase().rpc('deactivate_account_cascade', {
          p_target_id: adminId,
          p_actor_id: adminId,
          p_now: NOW.toISOString(),
          p_today: TODAY_DATE,
        });
        expect(error).not.toBeNull();
        expect(error?.code).toBe('Z0011');

        const result = await usersRepository.deactivateAccount({ id: adminId, actorId: adminId, now: NOW, today: TODAY_DATE });
        expect(result).toEqual({ kind: 'blocked' });

        // AC-12's "all or nothing", proven directly: NEITHER half of the transaction landed.
        expect(await readIsActive(adminId)).toBe(true);
        expect((await readBooking(bookingId)).status).toBe('confirmed');
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('case 2 — cancels exactly the upcoming Confirmed bookings, dated today or later; a past Confirmed and an already-Cancelled booking are untouched (US-025/AC-02, US-025/AC-03)', async () => {
    const cleanup = newCleanup();
    try {
      const employeeId = await createEmployee(cleanup, 'US025 Cascade Fixture');
      const admin = await createAccountWithProfile(cleanup, 'US025 Acting Admin', 'us025-acting-admin', 'admin');
      const deskA = await createDesk(cleanup, 'Z-26');
      const deskB = await createDesk(cleanup, 'Z-27');
      const deskC = await createDesk(cleanup, 'Z-28');
      const deskD = await createDesk(cleanup, 'Z-29');

      const upcoming1Id = await bookOrThrow(cleanup, employeeId, deskA, TODAY_DATE);
      const upcoming2Id = await bookOrThrow(cleanup, employeeId, deskB, FUTURE_DATE);
      const pastId = await bookOrThrow(cleanup, employeeId, deskC, PAST_DATE);
      const alreadyCancelledId = await bookOrThrow(cleanup, employeeId, deskD, FUTURE_DATE_2);

      // Pre-cancel the fourth booking BY THE OWNER, before the cascade runs — it must stay exactly
      // as it is, not be re-stamped with `deactivation_cascade`.
      const { error: preCancelError } = await supabase()
        .from('bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: employeeId, cancellation_source: 'owner' })
        .eq('id', alreadyCancelledId);
      if (preCancelError) throw new Error(`fixture pre-cancel failed: ${preCancelError.message}`);

      const result = await usersRepository.deactivateAccount({ id: employeeId, actorId: admin, now: NOW, today: TODAY_DATE });

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.profile.is_active).toBe(false);
        const cancelledIds = result.cancelledBookings.map((b) => b.id).sort();
        expect(cancelledIds).toEqual([upcoming1Id, upcoming2Id].sort());
        for (const row of result.cancelledBookings) {
          expect(row.cancellationSource).toBe('deactivation_cascade');
        }
      }

      // Direct reads confirm both cancelled rows, and prove the other two were left alone.
      const upcoming1Row = await readBooking(upcoming1Id);
      expect(upcoming1Row.status).toBe('cancelled');
      expect(upcoming1Row.cancelled_by).toBe(admin);
      expect(upcoming1Row.cancellation_source).toBe('deactivation_cascade');

      const upcoming2Row = await readBooking(upcoming2Id);
      expect(upcoming2Row.status).toBe('cancelled');
      expect(upcoming2Row.cancellation_source).toBe('deactivation_cascade');

      const pastRow = await readBooking(pastId);
      expect(pastRow.status).toBe('confirmed');
      expect(pastRow.cancellation_source).toBeNull();

      const alreadyCancelledRow = await readBooking(alreadyCancelledId);
      expect(alreadyCancelledRow.cancellation_source).toBe('owner');
      expect(alreadyCancelledRow.cancelled_by).toBe(employeeId);
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('case 3 — deactivating an admin with zero upcoming bookings succeeds while another active admin remains, and touches no booking (US-025/AC-07\'s data shape)', async () => {
    const cleanup = newCleanup();
    const preExisting = await activeAdminIds();
    try {
      const targetAdminId = await createAccountWithProfile(cleanup, 'US025 Target Admin', 'us025-target-admin', 'admin');
      const anotherAdminId = await createAccountWithProfile(cleanup, 'US025 Another Admin', 'us025-another-admin', 'admin');
      const deactivatedAdminId = await createAccountWithProfile(cleanup, 'US025 Deactivated Admin', 'us025-deactivated-admin', 'admin');
      await deactivateRow(deactivatedAdminId);
      await demote(preExisting);
      try {
        const result = await usersRepository.deactivateAccount({ id: targetAdminId, actorId: anotherAdminId, now: NOW, today: TODAY_DATE });

        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
          expect(result.profile.is_active).toBe(false);
          expect(result.cancelledBookings).toEqual([]);
        }

        // anotherAdminId's own active status is untouched — it is what made the deactivation legal.
        expect(await readIsActive(anotherAdminId)).toBe(true);
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });

  it('case 4 — two active admins (the last two), both holding upcoming bookings, deactivated AT THE SAME INSTANT: exactly one succeeds, its bookings cancelled; the loser stays active with its bookings still Confirmed (US-025 edge case, the design\'s whole proof)', async () => {
    const cleanup = newCleanup();
    const preExisting = await activeAdminIds();
    try {
      const adminA = await createAccountWithProfile(cleanup, 'US025 Admin A', 'us025-concurrent-a', 'admin');
      const adminB = await createAccountWithProfile(cleanup, 'US025 Admin B', 'us025-concurrent-b', 'admin');
      const deskA = await createDesk(cleanup, 'Z-30');
      const deskB = await createDesk(cleanup, 'Z-31');
      const bookingAId = await bookOrThrow(cleanup, adminA, deskA, FUTURE_DATE);
      const bookingBId = await bookOrThrow(cleanup, adminB, deskB, FUTURE_DATE);
      await demote(preExisting);
      try {
        const [resultA, resultB] = await Promise.all([
          usersRepository.deactivateAccount({ id: adminA, actorId: adminA, now: NOW, today: TODAY_DATE }),
          usersRepository.deactivateAccount({ id: adminB, actorId: adminB, now: NOW, today: TODAY_DATE }),
        ]);

        const kinds = [resultA.kind, resultB.kind].sort();
        // This is the assertion that FAILS if the trigger did not fire correctly from inside the
        // new function, or if the advisory lock's serialisation did not carry over the `/rpc/`
        // path: without it, BOTH could read the other's row as still-admin-and-active and BOTH
        // would commit, leaving zero active admins.
        expect(kinds).toEqual(['blocked', 'ok']);

        const remaining = await activeAdminIds();
        expect(remaining).toHaveLength(1);
        const [winner, winnerBookingId] = resultA.kind === 'ok' ? [adminA, bookingAId] : [adminB, bookingBId];
        const [loser, loserBookingId] = resultA.kind === 'ok' ? [adminB, bookingBId] : [adminA, bookingAId];
        expect(remaining[0]).toBe(loser);

        // The winner's cascade actually ran...
        expect(await readIsActive(winner)).toBe(false);
        expect((await readBooking(winnerBookingId)).status).toBe('cancelled');

        // ...and the loser's did not — proving the abort rolled back BOTH tables, not just
        // user_profiles (design note §2.4, the whole point of this case).
        expect(await readIsActive(loser)).toBe(true);
        expect((await readBooking(loserBookingId)).status).toBe('confirmed');
      } finally {
        await restore(preExisting);
      }
    } finally {
      await cleanUp(cleanup);
    }
  });
});

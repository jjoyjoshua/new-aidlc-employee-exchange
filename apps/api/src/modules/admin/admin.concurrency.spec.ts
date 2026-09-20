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
 *  somewhere in a UUID. */
async function createAccountWithProfile(
  cleanup: Cleanup,
  fullName: string,
  emailLocalPart: string,
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

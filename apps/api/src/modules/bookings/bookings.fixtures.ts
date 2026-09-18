/**
 * The QA dataset this story's own QA notes describe: 40 active desks over three zones, plus one
 * retired desk that is simply absent from `listActiveDesks()`'s real output shape — not present
 * and marked some other way (US-006/AC-04). Shared by US-006, US-007 and US-009 so the three
 * stories argue about the same desks. Mirrors `supabase/seed/desks.dev.sql`'s counts.
 */
import type { AvailabilityRepository, DeskRow } from './bookings.repository.js';

const ZONE_COUNTS: ReadonlyArray<readonly [string, number]> = [
  ['A', 14],
  ['B', 14],
  ['C', 13],
];

/** The one desk in the dataset that is `is_active = false`. It never appears in `activeDesks()` —
 *  that absence IS the fixture, matching the shape of the real `.eq('is_active', true)` query. */
export const RETIRED_DESK_NUMBER = 'C-13';

function allDeskNumbers(): string[] {
  return ZONE_COUNTS.flatMap(([zone, count]) =>
    Array.from({ length: count }, (_, i) => `${zone}-${String(i + 1).padStart(2, '0')}`),
  );
}

function deskId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** 40 active desks over zones A/B/C, ordered by desk number — what `listActiveDesks()` returns
 *  for this dataset. */
export function activeDesks(): DeskRow[] {
  return allDeskNumbers()
    .filter((deskNumber) => deskNumber !== RETIRED_DESK_NUMBER)
    .map((desk_number, i) => ({ id: deskId(i + 1), desk_number }));
}

/**
 * The ids `listConfirmedDeskIds` would return for a partially-booked day: everything from the
 * 13th desk onward is taken, leaving exactly the first 12 free — the story's own AC-01 example,
 * "12 of 40 desks free".
 */
export function partiallyTakenDeskIds(desks: DeskRow[] = activeDesks()): string[] {
  return desks.slice(12).map((desk) => desk.id);
}

/** An office with no active desks at all (US-006/AC-09). */
export const emptyOffice: DeskRow[] = [];

/**
 * US-007/FR-04. The one desk this dataset marks inactive — same id space as `deskId()` above,
 * outside the 1..40 range `activeDesks()` uses so it never collides with a real fixture desk.
 */
export const INACTIVE_DESK_ID = deskId(999);

export function inactiveDeskRow(): { id: string; desk_number: string; is_active: boolean } {
  return { id: INACTIVE_DESK_ID, desk_number: RETIRED_DESK_NUMBER, is_active: false };
}

export function activeDeskRow(
  id: string,
  desk_number = 'A-01',
): { id: string; desk_number: string; is_active: boolean } {
  return { id, desk_number, is_active: true };
}

/**
 * US-007/FR-02, D-01. Postgres-shaped unique-violation errors, keyed on the SAME bare index
 * names `0003_bookings.sql:64,67` declares — this is the fixture `insertConfirmedBooking`'s
 * mapping (Architect design note §1.2) is proven against over a fake client. The real shape is
 * proven separately, over real Postgres, by `bookings.repository.concurrency.spec.ts` (Step 3).
 */
export const DESK_CONFLICT_ERROR = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "bookings_one_confirmed_per_desk_per_day"',
  details: 'Key (desk_id, booking_date)=(00000000-0000-4000-8000-000000000001, 2026-09-16) already exists.',
};

export const USER_CONFLICT_ERROR = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "bookings_one_confirmed_per_user_per_day"',
  details: 'Key (user_id, booking_date)=(3f2504e0-4f89-41d3-9a0c-0305e82c3301, 2026-09-16) already exists.',
};

/** A `23505` that names neither index (design note §1.2 — "unrecognised", must throw, never a 409). */
export const UNRECOGNISED_UNIQUE_VIOLATION_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "some_future_index_nobody_taught_us_about"',
};

/** Not a unique violation at all — e.g. one of `0003_bookings.sql`'s CHECK constraints
 *  (`23514`) or the `desks` foreign key (`23503`). Must throw, never map to a conflict outcome. */
export const NON_UNIQUE_VIOLATION_ERROR = {
  code: '23514',
  message: 'new row for relation "bookings" violates check constraint "bookings_weekday_only"',
};

/**
 * US-008/AC-03, D-03. Two bookings, same user, same `booking_date` — the cancel-then-rebook shape
 * design note §5 pins as the reason `created_at desc` is a load-bearing second sort key, not
 * defensive. The rejected (cancelled) row is created first and listed first here; a query that
 * sorts on `booking_date` alone (a stable sort over this array) would return it, since nothing
 * breaks the tie. Only `created_at desc` as the second key picks the confirmed row, which was
 * created later because it replaced the first.
 */
export const REJECTED_DESK_ID = '00000000-0000-4000-8000-aaaaaaaaaaaa';
export const REBOOKED_DESK_ID = '00000000-0000-4000-8000-bbbbbbbbbbbb';

export const CANCEL_THEN_REBOOK_SAME_DATE_ROWS = [
  { desk_id: REJECTED_DESK_ID, booking_date: '2026-09-16', created_at: '2026-09-15T09:00:00.000Z' },
  { desk_id: REBOOKED_DESK_ID, booking_date: '2026-09-16', created_at: '2026-09-15T10:00:00.000Z' },
];

/**
 * US-007. `AvailabilityRepository` gained four write/read methods this story; every test stub
 * written against it before US-007 (and most written for it) only cares about one or two. These
 * two base fixtures exist so a test spreads in the one override it needs rather than retyping
 * six methods it does not — the same reason `activeDesks()`/`emptyOffice` already exist above.
 */

/** Every method throws. For date-refusal / early-guard tests that must prove NOTHING beyond
 *  the guard was ever called (US-007/AC-11, and US-006's pre-existing date-guard tests). */
export const throwingAvailabilityRepository: AvailabilityRepository = {
  async listActiveDesks() {
    throw new Error('must not be called for a refused date');
  },
  async listConfirmedDeskIds() {
    throw new Error('must not be called for a refused date');
  },
  async getDeskById() {
    throw new Error('must not be called for a refused date');
  },
  async findMyConfirmedBooking() {
    throw new Error('must not be called for a refused date');
  },
  async insertConfirmedBooking() {
    throw new Error('must not be called for a refused date');
  },
  async cancelOwnedBooking() {
    throw new Error('must not be called for a refused date');
  },
  async findMyLastBookedDeskId() {
    throw new Error('must not be called for a refused date');
  },
};

/** Empty/undefined answers everywhere — no active desks, no bookings, no matching desk. For
 *  tests that only exercise a subset of the interface and would otherwise have to restate the
 *  other methods just to satisfy the type. */
export const emptyAvailabilityRepository: AvailabilityRepository = {
  async listActiveDesks() {
    return [];
  },
  async listConfirmedDeskIds() {
    return [];
  },
  async getDeskById() {
    return undefined;
  },
  async findMyConfirmedBooking() {
    return undefined;
  },
  async insertConfirmedBooking() {
    throw new Error('insertConfirmedBooking is not stubbed for this test');
  },
  async cancelOwnedBooking() {
    throw new Error('cancelOwnedBooking is not stubbed for this test');
  },
  async findMyLastBookedDeskId() {
    return undefined;
  },
};

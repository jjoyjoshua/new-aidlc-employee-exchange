/**
 * The one cross-employee READ AND WRITE in this codebase (US-013/US-015, REQ-011/REQ-014).
 * Deliberately a SEPARATE object from `AvailabilityRepository` in `bookings.repository.ts`, not a
 * twelfth method there — every method on that object is desk-scoped or filtered to `user_id`,
 * which is a cheap, checkable invariant US-006/AC-06 and US-007/D-03 lean on. Putting an unscoped
 * read or write next to those would put a copy-paste hazard one line away from the exact surface
 * AC-10 protects (Architect design note §4.2, this story's folder in `inception/specs/`).
 *
 * Reachable only behind `requireAdmin` (`apps/api/src/modules/admin/admin.router.ts`) — never call
 * this from a route outside `/api/admin/*`.
 *
 * ADR-004 follow-up 3 anticipated this module reading `user_profiles` in addition to `bookings`
 * and `desks`; `README.md` in this directory states it. US-015/REQ-014 is the first WRITE this
 * module makes to `bookings` — `cancelAnyBooking`'s missing `.eq('user_id', …)` predicate is that
 * requirement, not an oversight (design note §3.1, §3.2).
 */
import { supabase } from '../../infra/supabase/index.js';
import type { BookingStatus, OfficeDate } from '@desk-booking/contracts';

/** One row this module reads back from `bookings`, joined to the desk and the holder's name.
 *  `status` is the STORED two-value shape — the derivation to Completed happens in the service
 *  (ADR-007), not here, matching `MyBookingRow`'s own convention. */
export interface AdminBookingRow {
  id: string;
  booking_date: OfficeDate;
  status: BookingStatus;
  desk_number: string;
  employee_name: string;
}

/** `listBookings`'s outcome — the page's rows, and the total matching the predicate
 *  (design note §2.5, §3.4), from the SAME query via `{ count: 'exact' }`. */
export interface AdminBookingsPage {
  rows: AdminBookingRow[];
  total: number;
}

/**
 * The plain date/status/desk bounds `listBookings` applies — resolved by the SERVICE, never
 * computed here (US-014 design note §6.3). This repository does not know what a PRESENTED
 * status is; `status` below is always the STORED two-value shape, and `before` (the compound
 * status predicate's exclusive upper bound) arrives already separated from `to` (the caller's
 * own date-range ceiling) so Postgres ANDs `<= to` and `< before` independently — the
 * intersection is Postgres's job, not a date-arithmetic step here.
 */
export interface AdminBookingsFilter {
  /** Inclusive. Absent = no floor at all — US-013/AC-05 already established there is no archive
   *  cutoff. US-013's own default view supplies "today" here at the SERVICE, not as a rule this
   *  repository enforces; a `completed` status filter must NOT get a floor of "today" injected
   *  under it, since a Completed booking is by definition dated before today — that combination
   *  would make every Completed-only query structurally empty (US-014/AC-02). Passed in, never
   *  read here — this repository holds no clock. */
  from?: OfficeDate;
  /** Inclusive. US-014/AC-01. Absent = no ceiling. */
  to?: OfficeDate;
  /** Exclusive. Contributed only by a `completed` status filter (US-014/AC-02, ADR-007). */
  before?: OfficeDate;
  /** The STORED value. Absent = all statuses — AC-02's "all statuses" is the ABSENCE of a
   *  predicate, not a predicate matching everything. */
  status?: BookingStatus;
  /** US-014/AC-03. */
  deskId?: string;
}

export interface AdminBookingsRepository {
  /**
   * US-013/AC-02–AC-05; US-014/AC-01–AC-04. Applies each bound in `filter` independently
   * (`.gte`/`.lte`/`.lt`/`.eq`) — Postgres computes the intersection for free, so this method
   * never combines them itself.
   *
   * Ordered `booking_date asc, created_at asc, id asc` — a TOTAL order. The third key is
   * load-bearing, not belt-and-braces: offset paging over a non-unique sort key is unstable
   * without it (design note §3.2). UNCHANGED by filtering — a diff here invalidates the
   * real-Postgres verification in `bookings.repository.concurrency.spec.ts` (US-014 design note
   * §6.3, §10).
   *
   * The `user_profiles` embed is disambiguated by COLUMN (`!user_id`), not by the
   * Postgres-generated FK constraint name — `bookings` has two foreign keys into `user_profiles`
   * (`user_id`, `cancelled_by`), so a bare `user_profiles(full_name)` embed is ambiguous and
   * PostgREST refuses it at runtime. `user_id` is the column the migration itself names; the
   * constraint name appears nowhere in this repository (design note §3.1). This is a
   * RUNTIME-ONLY property the recording-fake test below cannot prove — verified separately
   * against real Postgres in `bookings.repository.concurrency.spec.ts`.
   */
  listBookings(filter: AdminBookingsFilter, offset: number, limit: number): Promise<AdminBookingsPage>;

  /**
   * US-015/AC-01, AC-02, AC-04, AC-07. One `UPDATE … RETURNING id`, scoped to id / confirmed /
   * not-past — NO read-then-write window, exactly as `cancelOwnedBooking` (bookings.repository.ts).
   *
   * There is deliberately no `.eq('user_id', …)`, and the absence IS REQ-014. This is the only
   * write in the codebase that changes a row belonging to somebody other than the caller; the
   * authority comes from the `/api/admin` mount (`http/app.ts`), never from a predicate here.
   *
   * `adminId` is ATTRIBUTION, never scope — it is written to `cancelled_by` and is not in the
   * `WHERE` at all. That is why `bookingId` comes FIRST here and `userId` comes first in
   * `cancelOwnedBooking`: the parameter orders differ because the roles differ, and two adjacent
   * uuids are a swap hazard worth naming. A swap fails loudly (`cancelled_by = <a booking id>`
   * violates the FK to `user_profiles`, a `23503`, and `where id = <an admin id>` matches
   * nothing), never silently.
   *
   * `cancelledAt` and `today` are the caller's ONE clock reading, from the SAME instant — two
   * `nowMs()` calls would differ across office midnight (US-011 design note §8.4).
   *
   * `cancellation_source: 'admin'` is BR-001.20's own key (`0003_bookings.sql`), not a label:
   * US-029/US-032 select their wording from it and must never compare ids to infer the actor.
   *
   * `status = 'confirmed'` in the `WHERE` is the ENTIRE optimistic-concurrency guard — there is no
   * row-version column, and none is needed, because the `confirmed -> cancelled` transition is
   * one-way and terminal: no code path anywhere sets `status` back to `'confirmed'` (design note
   * §3.4). If a future feature ever restores a cancelled booking to `confirmed`, THAT is the
   * change that would reopen the ABA problem this predicate currently forecloses, and it would
   * need a real version column or an explicit `cancelled_at IS NULL` guard.
   */
  cancelAnyBooking(
    bookingId: string,
    adminId: string,
    cancelledAt: Date,
    today: OfficeDate,
  ): Promise<{ id: string; ownerId: string; deskNumber: string; date: OfficeDate; ownerEmail: string } | undefined>;

  /**
   * US-015/AC-09, design note §3.1, §3.3. Read-only, issued ONLY when `cancelAnyBooking` above
   * returns nothing, and ONLY to classify that miss — never to decide whether to write. Select
   * list is `status, booking_date` and nothing wider; no `desk_id`, no join, and deliberately
   * no `cancellation_source` — AC-09 does not distinguish "the owner cancelled it first" from
   * "another admin's request won the race", and widening this select to make that distinction
   * would put "who cancelled this" on the response of an endpoint whose job is to cancel, for
   * copy nobody approved.
   *
   * Unscoped by design — this is the disambiguating read for a write that is itself unscoped.
   * Do not give this a `.eq('user_id', …)` twin next to `findMyBookingState`
   * (`bookings.repository.ts`): that file's every method is scoped-by-construction, and a
   * near-identical sibling differing by one omitted predicate is precisely the copy-paste hazard
   * this repository exists to keep separate from that one (design note §3.1).
   */
  findBookingState(bookingId: string): Promise<{ status: BookingStatus; booking_date: OfficeDate } | undefined>;
}

export const adminBookingsRepository: AdminBookingsRepository = {
  async listBookings(filter, offset, limit) {
    let query = supabase()
      .from('bookings')
      .select('id, booking_date, status, desks(desk_number), user_profiles!user_id(full_name)', { count: 'exact' });

    if (filter.from !== undefined) query = query.gte('booking_date', filter.from);
    if (filter.to !== undefined) query = query.lte('booking_date', filter.to);
    if (filter.before !== undefined) query = query.lt('booking_date', filter.before);
    if (filter.status !== undefined) query = query.eq('status', filter.status);
    if (filter.deskId !== undefined) query = query.eq('desk_id', filter.deskId);

    const { data, error, count } = await query
      .order('booking_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    // `PGRST103` — "Requested range not satisfiable" — is PostgREST's answer to a page entirely
    // beyond the matching result set. Reachable legitimately (a tab open across office midnight,
    // or a hand-typed `?page=`), and the honest answer is an empty page, not a `500` (design note
    // §3.4, verified against real Postgres in `bookings.repository.concurrency.spec.ts`). Any
    // OTHER error still throws — recognise the one expected shape, exactly as
    // `insertConfirmedBooking`'s `23505` mapping does for its own known cases.
    if (error && error.code !== 'PGRST103') {
      throw new Error(`admin bookings lookup failed: ${error.message}`);
    }

    // See `bookings.repository.ts`'s `findMyConfirmedBooking` for why `unknown` comes first: a
    // relationship embed defaults to an array in supabase-js's types with no generated `Database`
    // schema, but PostgREST embeds a many-to-one relation as a single object at runtime.
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      booking_date: OfficeDate;
      status: BookingStatus;
      desks: { desk_number: string } | null;
      user_profiles: { full_name: string } | null;
    }>;

    return {
      total: count ?? 0,
      rows: rows.map((row) => {
        // `desk_id`/`user_id` are NOT NULL (0003_bookings.sql) — a missing embed here means
        // something is structurally wrong, the same reasoning `listMyBookingsInWindow` states.
        if (!row.desks) throw new Error(`booking ${row.id} has no joined desk — desk_id is NOT NULL, this is a bug`);
        if (!row.user_profiles) {
          throw new Error(`booking ${row.id} has no joined user_profiles — user_id is NOT NULL, this is a bug`);
        }
        return {
          id: row.id,
          booking_date: row.booking_date,
          status: row.status,
          desk_number: row.desks.desk_number,
          employee_name: row.user_profiles.full_name,
        };
      }),
    };
  },

  async cancelAnyBooking(bookingId, adminId, cancelledAt, today) {
    const { data, error } = await supabase()
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: cancelledAt.toISOString(),
        cancelled_by: adminId,
        cancellation_source: 'admin',
      })
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .select('id')
      .maybeSingle();

    if (error) throw new Error(`admin booking cancel failed: ${error.message}`);
    if (!data) return undefined;

    // US-029/D-03. A SEPARATE plain read, never combined with the update above — this codebase
    // has no precedent for `.update().select('...relation(...)')` and this repository already
    // proves the identical embed shape works for `listBookings`. Unscoped by id alone, matching
    // the write's own REQ-014 unscoping; the owner's email comes from here rather than crossing
    // into `users`, keeping this module self-contained (`coding-standards.md`, no module imports
    // another module's service).
    const { data: details, error: detailsError } = await supabase()
      .from('bookings')
      .select('user_id, booking_date, desks(desk_number), user_profiles!user_id(email)')
      .eq('id', bookingId)
      .maybeSingle();

    if (detailsError) throw new Error(`admin booking cancel — desk/owner lookup failed: ${detailsError.message}`);

    const row = details as {
      user_id: string;
      booking_date: OfficeDate;
      desks: { desk_number: string } | null;
      user_profiles: { email: string } | null;
    } | null;
    if (!row) throw new Error(`booking ${bookingId} vanished between cancel and its own detail read — this is a bug`);
    if (!row.desks) throw new Error(`booking ${bookingId} has no joined desk — desk_id is NOT NULL, this is a bug`);
    if (!row.user_profiles) throw new Error(`booking ${bookingId} has no joined user_profiles — user_id is NOT NULL, this is a bug`);

    return {
      id: (data as { id: string }).id,
      ownerId: row.user_id,
      deskNumber: row.desks.desk_number,
      date: row.booking_date,
      ownerEmail: row.user_profiles.email,
    };
  },

  async findBookingState(bookingId) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('status, booking_date')
      .eq('id', bookingId)
      .maybeSingle();

    if (error) throw new Error(`bookings lookup failed: ${error.message}`);
    return (data as { status: BookingStatus; booking_date: OfficeDate } | null) ?? undefined;
  },
};

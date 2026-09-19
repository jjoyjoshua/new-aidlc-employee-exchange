/**
 * The one cross-employee read in this codebase (US-013, REQ-011). Deliberately a SEPARATE object
 * from `AvailabilityRepository` in `bookings.repository.ts`, not a twelfth method there — every
 * method on that object is desk-scoped or filtered to `user_id`, which is a cheap, checkable
 * invariant US-006/AC-06 and US-007/D-03 lean on. Putting an unscoped read next to those would put
 * a copy-paste hazard one line away from the exact surface AC-10 protects (Architect design note
 * §4.2, this story's folder in `inception/specs/`).
 *
 * Reachable only behind `requireAdmin` (`apps/api/src/modules/admin/admin.router.ts`) — never call
 * this from a route outside `/api/admin/*`.
 *
 * ADR-004 follow-up 3 anticipated this module reading `user_profiles` in addition to `bookings`
 * and `desks`; `README.md` in this directory states it.
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

/** `listBookingsFromDate`'s outcome — the page's rows, and the total matching the predicate
 *  (design note §2.5, §3.4), from the SAME query via `{ count: 'exact' }`. */
export interface AdminBookingsPage {
  rows: AdminBookingRow[];
  total: number;
}

export interface AdminBookingsRepository {
  /**
   * US-013/AC-02–AC-05. `from` is the caller's own "today" (passed in, never read here — this
   * repository holds no clock, matching every other method in this module). No status predicate:
   * AC-02's "all statuses" is the ABSENCE of a filter, not a filter that matches everything.
   *
   * Ordered `booking_date asc, created_at asc, id asc` — a TOTAL order. The third key is
   * load-bearing, not belt-and-braces: offset paging over a non-unique sort key is unstable
   * without it (design note §3.2).
   *
   * The `user_profiles` embed is disambiguated by COLUMN (`!user_id`), not by the
   * Postgres-generated FK constraint name — `bookings` has two foreign keys into `user_profiles`
   * (`user_id`, `cancelled_by`), so a bare `user_profiles(full_name)` embed is ambiguous and
   * PostgREST refuses it at runtime. `user_id` is the column the migration itself names; the
   * constraint name appears nowhere in this repository (design note §3.1). This is a
   * RUNTIME-ONLY property the recording-fake test below cannot prove — verified separately
   * against real Postgres in `bookings.repository.concurrency.spec.ts`.
   */
  listBookingsFromDate(from: OfficeDate, offset: number, limit: number): Promise<AdminBookingsPage>;
}

export const adminBookingsRepository: AdminBookingsRepository = {
  async listBookingsFromDate(from, offset, limit) {
    const { data, error, count } = await supabase()
      .from('bookings')
      .select('id, booking_date, status, desks(desk_number), user_profiles!user_id(full_name)', { count: 'exact' })
      .gte('booking_date', from)
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
};

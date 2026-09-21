/**
 * US-013's slice — `GET /api/admin/bookings`. One clock reading, threaded to both the repository's
 * predicate and `bookingDisplayStatus` (ADR-007), the same discipline `cancelBooking` states for
 * `cancelledAt`/`today`. The page size is fixed here, server-side, and is never a client parameter
 * (Architect design note §2.4, this story's folder in `inception/specs/`).
 */
import { type AllBookingsResponse, type BookingDisplayStatus, type OfficeDate } from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import { bookingDisplayStatus, displayStatusPredicate } from '../../domain/booking-history.js';
import type { AdminBookingsFilter, AdminBookingsRepository } from './admin-bookings.repository.js';

/** US-013/AC-04. Fixed server-side — a client-supplied page size is a bulk-extraction dial on
 *  the one route that returns everybody's whereabouts (design note §2.4). */
export const ADMIN_BOOKINGS_PAGE_SIZE = 50;

export interface AdminBookingsServiceDeps {
  bookings: AdminBookingsRepository;
  nowMs: () => number;
  officeTimezone: string;
}

/** US-014's four filters, as parsed off the wire (`allBookingsQuerySchema`) — `status` is still
 *  the PRESENTED value here; this service resolves it to the repository's stored-value predicate
 *  (`displayStatusPredicate`, design note §6.3). */
export interface AdminBookingsQuery {
  from?: OfficeDate;
  to?: OfficeDate;
  status?: BookingDisplayStatus;
  deskId?: string;
}

export type CancelAnyBookingOutcome =
  /** `ownerId`/`deskNumber`/`date`/`ownerEmail` are for US-029's cancellation email — resolved
   *  by the repository's own follow-up read (D-03), never a second query here. */
  | { kind: 'ok'; ownerId: string; deskNumber: string; date: OfficeDate; ownerEmail: string }
  /** US-015/AC-09. The row exists and is ALREADY cancelled — the owner got there first (US-011),
   *  a concurrent admin request won, or a deactivation cascade (US-025) voided it. Deliberately
   *  ONE outcome, never split by `cancellation_source` (design note §3.3, `decisions.md` D-08). */
  | { kind: 'already_cancelled' }
  /** No such booking, or a real booking that is past-dated (US-015/AC-02). Merged for the same
   *  reason `bookings.service.ts`'s `CancelBookingOutcome` merges its own `not_found` — no
   *  approved copy or error code distinguishes them (design note §2.4, `decisions.md` D-07). */
  | { kind: 'not_found' };

export function createAdminBookingsService({ bookings, nowMs, officeTimezone }: AdminBookingsServiceDeps) {
  return {
    /**
     * US-013/AC-02–AC-07; US-014/AC-01–AC-04. `page` is 1-based, matching
     * `allBookingsQuerySchema`. `today` is derived exactly once and used for the default `from`
     * floor, the status predicate (US-014/AC-02) and the status derivation (US-013/AC-06) — two
     * separate `officeToday` calls could disagree across office midnight, the same reasoning
     * `listMyBookings` states for its own single reading.
     */
    async listAllBookings(page: number, query: AdminBookingsQuery = {}): Promise<AllBookingsResponse> {
      const today = officeToday(nowMs(), officeTimezone);
      const offset = (page - 1) * ADMIN_BOOKINGS_PAGE_SIZE;

      // An absent `from` means the server's own today (US-013/AC-02's default view), never "no
      // floor" — design note §4.2 — EXCEPT under a `completed` status filter, which is by
      // definition dated before today (ADR-007). Injecting a "from=today" default under
      // `completed` would intersect an inclusive today-or-later floor with an exclusive
      // before-today ceiling and make every Completed-only query structurally empty, failing the
      // QA note's exact assertion. Three cases, one per shape of predicate:
      //   - `confirmed` contributes its own floor (today) — raised via a lexicographic max
      //     against any caller-supplied `from`, never defaulted independently of it.
      //   - `completed` contributes only a ceiling (`before`) — `from` passes through the
      //     caller's own value with NO default injected, matching US-013/AC-05's "no archive
      //     cutoff" precedent.
      //   - `cancelled`, or no status filter at all — the general default view floor applies.
      const predicate = query.status ? displayStatusPredicate(query.status, today) : undefined;
      let from: OfficeDate | undefined;
      if (predicate?.from !== undefined) {
        from = query.from !== undefined && query.from > predicate.from ? query.from : predicate.from;
      } else if (predicate?.before !== undefined) {
        from = query.from;
      } else {
        from = query.from ?? today;
      }

      const filter: AdminBookingsFilter = {
        ...(from !== undefined && { from }),
        ...(query.to !== undefined && { to: query.to }),
        ...(predicate?.before !== undefined && { before: predicate.before }),
        ...(predicate?.stored !== undefined && { status: predicate.stored }),
        ...(query.deskId !== undefined && { deskId: query.deskId }),
      };

      const { rows, total } = await bookings.listBookings(filter, offset, ADMIN_BOOKINGS_PAGE_SIZE);

      const items = rows.map((row) => ({
        id: row.id,
        date: row.booking_date,
        deskNumber: row.desk_number,
        employeeName: row.employee_name,
        status: bookingDisplayStatus(row.status, row.booking_date, today),
      }));

      // AC-04. One source for both `total` and `nextPage` — a page number the browser could
      // derive itself from `total` and a page size it does not know is a second field able to
      // disagree with the first (design note §2.3).
      const nextPage = offset + items.length < total ? page + 1 : null;

      return { today, total, items, nextPage };
    },

    /**
     * US-015/AC-02, AC-04, AC-07, AC-09. Write first, then explain: the `UPDATE` inside
     * `cancelAnyBooking` is the sole write and the sole arbiter of "confirmed -> cancelled". The
     * disambiguating read below runs ONLY when that write applied to nothing, and ONLY to
     * classify the miss — reading first and writing second would reintroduce the read-then-write
     * window `cancelAnyBooking`'s own docblock exists to avoid, and would misclassify AC-09's own
     * race (the read says confirmed, the owner's own cancel commits, this write misses, and a
     * stale read would report "not found" for a booking that was just cancelled).
     *
     * `now`/`today` are ONE clock reading shared by both `cancelledAt` and the past-date guard,
     * exactly as `cancelBooking` (`bookings.service.ts`) states for its own — two separate
     * `nowMs()` calls would differ only across office midnight.
     *
     * "The owner already cancelled it" and "another admin's request won the race" are NOT
     * distinguished — both produce a row with `status: 'cancelled'`, and the classification read
     * looks at `status` alone (design note §3.3, `decisions.md` D-08).
     */
    async cancelAnyBooking(adminId: string, bookingId: string): Promise<CancelAnyBookingOutcome> {
      const now = nowMs();
      const today = officeToday(now, officeTimezone);

      const cancelled = await bookings.cancelAnyBooking(bookingId, adminId, new Date(now), today);
      if (cancelled) {
        return {
          kind: 'ok',
          ownerId: cancelled.ownerId,
          deskNumber: cancelled.deskNumber,
          date: cancelled.date,
          ownerEmail: cancelled.ownerEmail,
        };
      }

      const existing = await bookings.findBookingState(bookingId);
      if (existing?.status === 'cancelled') return { kind: 'already_cancelled' };
      return { kind: 'not_found' };
    },
  };
}

export type AdminBookingsService = ReturnType<typeof createAdminBookingsService>;

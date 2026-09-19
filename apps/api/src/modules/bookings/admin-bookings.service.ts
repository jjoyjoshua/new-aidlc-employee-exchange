/**
 * US-013's slice — `GET /api/admin/bookings`. One clock reading, threaded to both the repository's
 * predicate and `bookingDisplayStatus` (ADR-007), the same discipline `cancelBooking` states for
 * `cancelledAt`/`today`. The page size is fixed here, server-side, and is never a client parameter
 * (Architect design note §2.4, this story's folder in `inception/specs/`).
 */
import { type AllBookingsResponse } from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import { bookingDisplayStatus } from '../../domain/booking-history.js';
import type { AdminBookingsRepository } from './admin-bookings.repository.js';

/** US-013/AC-04. Fixed server-side — a client-supplied page size is a bulk-extraction dial on
 *  the one route that returns everybody's whereabouts (design note §2.4). */
export const ADMIN_BOOKINGS_PAGE_SIZE = 50;

export interface AdminBookingsServiceDeps {
  bookings: AdminBookingsRepository;
  nowMs: () => number;
  officeTimezone: string;
}

export function createAdminBookingsService({ bookings, nowMs, officeTimezone }: AdminBookingsServiceDeps) {
  return {
    /**
     * US-013/AC-02–AC-07. `page` is 1-based, matching `allBookingsQuerySchema`. `today` is
     * derived exactly once and used for both the repository's `from` predicate (AC-02) and the
     * status derivation (AC-06) — two separate `officeToday` calls could disagree across office
     * midnight, the same reasoning `listMyBookings` states for its own single reading.
     */
    async listAllBookings(page: number): Promise<AllBookingsResponse> {
      const today = officeToday(nowMs(), officeTimezone);
      const offset = (page - 1) * ADMIN_BOOKINGS_PAGE_SIZE;

      const { rows, total } = await bookings.listBookingsFromDate(today, offset, ADMIN_BOOKINGS_PAGE_SIZE);

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
  };
}

export type AdminBookingsService = ReturnType<typeof createAdminBookingsService>;

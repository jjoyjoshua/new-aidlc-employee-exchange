/**
 * US-014's slice — `GET /api/admin/desks` — extended by US-016/AC-04, AC-05 to also tally each
 * desk's `bookedAhead` count. No longer "a pure mapping, no clock read": one `officeToday`
 * reading per call, threaded to the borrowed predicate and nowhere else (US-016 design note §2.3).
 */
import type { AdminDesk } from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import { displayStatusPredicate } from '../../domain/booking-history.js';
import type { DesksRepository } from './desks.repository.js';

export interface DesksServiceDeps {
  desks: DesksRepository;
  nowMs: () => number;
  officeTimezone: string;
}

export function createDesksService({ desks, nowMs, officeTimezone }: DesksServiceDeps) {
  return {
    /**
     * US-014/AC-03; US-016/AC-01, AC-04, AC-05. Maps the repository's rows to the wire shape,
     * preserving order, and annotates each with its `bookedAhead` count.
     *
     * ONE clock reading, threaded to the predicate and nothing else — the discipline
     * `listAllBookings` states for its own (`admin-bookings.service.ts`). Two `officeToday` calls
     * in one request could straddle an office midnight and produce a count that disagrees with
     * the list it annotates.
     *
     * `'confirmed'` and the `>= today` bound are never written literally here — both arrive from
     * `displayStatusPredicate`, the same function US-019's deactivation block must call, so this
     * count and that block cannot drift apart (US-016 design note §2.4).
     */
    async listAllDesks(): Promise<AdminDesk[]> {
      const today = officeToday(nowMs(), officeTimezone);
      const predicate = displayStatusPredicate('confirmed', today);
      if (predicate.from === undefined) {
        // Reaching here means `displayStatusPredicate('confirmed', ...)` stopped returning a
        // floor — a change to that function this module must not silently tolerate.
        throw new Error("displayStatusPredicate('confirmed', today) returned no floor — this is a bug");
      }

      const [rows, upcomingDeskIds] = await Promise.all([
        desks.listAllDesks(),
        desks.listUpcomingConfirmedDeskIds(predicate.stored, predicate.from),
      ]);

      const counts = new Map<string, number>();
      for (const id of upcomingDeskIds) counts.set(id, (counts.get(id) ?? 0) + 1);

      return rows.map((row) => ({
        id: row.id,
        deskNumber: row.desk_number,
        isActive: row.is_active,
        // AC-05. `?? 0`, never `?? undefined` — a desk with no upcoming bookings reports ZERO,
        // and the em dash SCR-006 draws is a rendering of 0, not a second wire value.
        bookedAhead: counts.get(row.id) ?? 0,
      }));
    },
  };
}

export type DesksService = ReturnType<typeof createDesksService>;

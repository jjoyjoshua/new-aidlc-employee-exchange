/**
 * The availability projection (US-006), and the one date guard every route in this module needs.
 *
 * `refusalFor`/`officeToday` are US-005's, reused as-is: a second window check here would be
 * drift, not defence in depth (`modules/bookings/README.md`).
 */
import { refusalFor, type AvailabilityResponse, type DateRefusal, type DeskAvailability, type OfficeDate } from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import type { AvailabilityRepository } from './bookings.repository.js';

export interface BookingsServiceDeps {
  availability: AvailabilityRepository;
  nowMs: () => number;
  /** US-005/AC-07 pattern — threaded in, not read from `config()` here, so `buildApp` stays the
   *  test seam. */
  officeTimezone: string;
}

export type AvailabilityOutcome =
  | { kind: 'ok'; data: AvailabilityResponse }
  | { kind: 'refused'; reason: DateRefusal };

export function createBookingsService({ availability, nowMs, officeTimezone }: BookingsServiceDeps) {
  return {
    /**
     * US-006. Re-derives "today" server-side on every call (design note §2.1's forward note from
     * US-005) — it never trusts a client-supplied notion of today, so a well-formed but refused
     * date is caught here before either query runs.
     */
    async getAvailability(date: OfficeDate): Promise<AvailabilityOutcome> {
      const today = officeToday(nowMs(), officeTimezone);
      const reason = refusalFor(date, today);
      if (reason) return { kind: 'refused', reason };

      const [desks, takenIds] = await Promise.all([
        availability.listActiveDesks(),
        availability.listConfirmedDeskIds(date),
      ]);
      const taken = new Set(takenIds);

      // The projection (US-006/AC-02, AC-03): every active desk appears once, taken or
      // available, never omitted. Zone grouping is the browser's (`zones.ts`) — this stays a
      // flat, server-ordered array (design note §2.4).
      const projected: DeskAvailability[] = desks.map((desk) => ({
        id: desk.id,
        deskNumber: desk.desk_number,
        status: taken.has(desk.id) ? 'taken' : 'available',
      }));

      return { kind: 'ok', data: { date, desks: projected } };
    },
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;

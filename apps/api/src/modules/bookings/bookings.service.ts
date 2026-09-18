/**
 * The availability projection (US-006), and the one date guard every route in this module needs.
 * US-007 adds the write side: `createBooking` and `cancelBooking`, plus `myBooking` on the
 * availability projection.
 *
 * `refusalFor`/`officeToday` are US-005's, reused as-is: a second window check here would be
 * drift, not defence in depth (`modules/bookings/README.md`). No new `domain/` function for
 * US-007 either (spec.md's Technical constraints) — the same reuse rule.
 */
import {
  addDays,
  lastBookableDate,
  refusalFor,
  type AvailabilityResponse,
  type DateRefusal,
  type DeskAvailability,
  type MyBooking,
  type OfficeDate,
} from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import { pickNextFreeDays } from '../../domain/next-free-days.js';
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

/** US-007/FR-01. What `createBooking`'s success carries — enough for the router to build
 *  `bookingSchema`'s response without a second query; `confirmationEmail` is not here because
 *  the service never reads it — the router already has `req.user.email` from the session
 *  middleware (spec.md's AC-04 constraint; design note §0). */
export interface CreatedBooking {
  id: string;
  deskId: string;
  deskNumber: string;
  date: OfficeDate;
  status: 'confirmed';
}

export type CreateBookingOutcome =
  | { kind: 'ok'; booking: CreatedBooking }
  | { kind: 'date_refused'; reason: DateRefusal }
  | { kind: 'desk_not_found' }
  | { kind: 'desk_inactive' }
  | { kind: 'desk_conflict' }
  | { kind: 'user_conflict' };

export type CancelBookingOutcome = { kind: 'ok' } | { kind: 'not_found' };

export function createBookingsService({ availability, nowMs, officeTimezone }: BookingsServiceDeps) {
  return {
    /**
     * US-006, extended by US-007/FR-05. Re-derives "today" server-side on every call (design
     * note §2.1's forward note from US-005) — it never trusts a client-supplied notion of
     * today, so a well-formed but refused date is caught here before any query runs.
     *
     * `userId` is always the session's own (US-007/AC-06, design note §2.2): the router threads
     * `req.user.id`, never a query parameter — `availabilityQuerySchema` stays `.strict()` with
     * no such field, so a client-supplied one cannot even reach here.
     */
    async getAvailability(date: OfficeDate, userId: string): Promise<AvailabilityOutcome> {
      const today = officeToday(nowMs(), officeTimezone);
      const reason = refusalFor(date, today);
      if (reason) return { kind: 'refused', reason };

      const [desks, takenIds, myBookingRow, lastDeskId] = await Promise.all([
        availability.listActiveDesks(),
        availability.listConfirmedDeskIds(date),
        availability.findMyConfirmedBooking(userId, date),
        availability.findMyLastBookedDeskId(userId),
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

      // US-007/AC-06. `findMyConfirmedBooking` is already filtered to `userId` — this is a
      // straight projection, not a second filter, so there is nothing here to forget: the
      // non-disclosure guarantee lives entirely in the repository call (design note §2.2).
      const myBooking: MyBooking | null = myBookingRow
        ? { id: myBookingRow.id, deskId: myBookingRow.desk_id, deskNumber: myBookingRow.desk_number }
        : null;

      // US-008/AC-01, AC-05. One predicate, three causes:
      //   - TAKEN        -> the row exists with status 'taken'          -> excluded here
      //   - INACTIVE     -> listActiveDesks never returned it           -> not in `projected` at all
      //   - ABSENT       -> same                                        -> not in `projected` at all
      // The browser is handed an id it can label unconditionally, or null. It never re-checks.
      // Matches on id, not deskNumber, so the label follows a desk through a rename.
      const usualDeskId =
        lastDeskId && projected.some((d) => d.id === lastDeskId && d.status === 'available') ? lastDeskId : null;

      // US-009/AC-01, AC-02, AC-05, AC-06. Only paid in the one state with nothing else to
      // render — ST-10 (myBooking set) outranks ST-04 in the render, so suggestions there would
      // be computed and discarded (design note §2.4). `desks` is reused from the read above; the
      // range reads are never issued outside this branch.
      const fullyBooked = projected.length > 0 && !projected.some((d) => d.status === 'available');
      let nextFreeDays: OfficeDate[] = [];
      if (fullyBooked && !myBooking) {
        const from = addDays(date, 1);
        const to = lastBookableDate(today);
        // The selected date can legitimately BE the window's last bookable day; without this
        // guard the range query asks for an inverted range and gets an empty answer for the
        // wrong reason (design note §2.4).
        if (from <= to) {
          const [rangeRows, myDates] = await Promise.all([
            availability.listConfirmedDeskIdsInRange(from, to),
            availability.listMyConfirmedDatesInRange(userId, from, to),
          ]);
          const takenByDate = new Map<OfficeDate, Set<string>>();
          for (const row of rangeRows) {
            const set = takenByDate.get(row.booking_date) ?? new Set<string>();
            set.add(row.desk_id);
            takenByDate.set(row.booking_date, set);
          }
          const mine = new Set(myDates);

          nextFreeDays = pickNextFreeDays({
            after: date,
            today,
            limit: 2,
            hasFreeDesk: (candidate) => desks.some((desk) => !takenByDate.get(candidate)?.has(desk.id)),
            alreadyBooked: (candidate) => mine.has(candidate),
          });
        }
      }

      return { kind: 'ok', data: { date, desks: projected, myBooking, usualDeskId, nextFreeDays } };
    },

    /**
     * US-007/FR-01–FR-04. Three guards, in order, before the insert this whole story is about:
     *
     *   1. `refusalFor` (FR-03, AC-11) — the SAME window/weekend rule US-005 built, never a
     *      second implementation of it.
     *   2. `getDeskById` (FR-04, AC-12) — exists, then active. Neither guard calls the insert.
     *   3. `insertConfirmedBooking` (FR-02, D-01, D-04) — no availability pre-check; the two
     *      partial unique indexes in `0003_bookings.sql` are the only thing that decides a race.
     *
     * NFR-02: every one of these is re-derived from the request and the database on every call,
     * never from anything the client asserted.
     */
    async createBooking(userId: string, input: { date: OfficeDate; deskId: string }): Promise<CreateBookingOutcome> {
      const today = officeToday(nowMs(), officeTimezone);
      const reason = refusalFor(input.date, today);
      if (reason) return { kind: 'date_refused', reason };

      const desk = await availability.getDeskById(input.deskId);
      if (!desk) return { kind: 'desk_not_found' };
      if (!desk.is_active) return { kind: 'desk_inactive' };

      const outcome = await availability.insertConfirmedBooking(userId, input.deskId, input.date);
      if (outcome.kind === 'desk_conflict') return { kind: 'desk_conflict' };
      if (outcome.kind === 'user_conflict') return { kind: 'user_conflict' };

      return {
        kind: 'ok',
        booking: {
          id: outcome.id,
          deskId: input.deskId,
          deskNumber: desk.desk_number,
          date: input.date,
          status: 'confirmed',
        },
      };
    },

    /**
     * US-007/FR-06, AC-07, D-03. One outcome for "cancelled" and one for everything else — not
     * found, not the caller's, not currently confirmed — deliberately undiscriminated (D-03,
     * design note §3.3). `cancelledAt` is this call's own clock reading, read once here so the
     * value written matches the instant this decision was made (same convention as
     * `auth.repository.ts`'s `stampLastSeen`).
     */
    async cancelBooking(userId: string, bookingId: string): Promise<CancelBookingOutcome> {
      const cancelled = await availability.cancelOwnedBooking(userId, bookingId, new Date(nowMs()));
      return cancelled ? { kind: 'ok' } : { kind: 'not_found' };
    },
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;

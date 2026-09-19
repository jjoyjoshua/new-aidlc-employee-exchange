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
  type BookingDisplayStatus,
  type DateRefusal,
  type DeskAvailability,
  type MyBooking,
  type OfficeDate,
} from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import { bookingDisplayStatus, historyFloor } from '../../domain/booking-history.js';
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

export type CancelBookingOutcome =
  | { kind: 'ok' }
  /** US-011/AC-09. The row is the caller's own and is ALREADY cancelled — an admin (US-015), a
   *  deactivation cascade (US-025), or a concurrent request of the caller's own won the race. */
  | { kind: 'already_cancelled' }
  /** No such booking, not the caller's, or the caller's own and past-dated (US-011/AC-02).
   *  Deliberately merged — design note §1.2, §2.2; amends US-007/D-03. */
  | { kind: 'not_found' };

/** US-010. `GET /api/bookings`'s shape, pre-serialization — the router hands this straight to
 *  `myBookingsResponseSchema`. */
export interface MyBookingsListing {
  today: OfficeDate;
  items: Array<{ id: string; deskNumber: string; date: OfficeDate; status: BookingDisplayStatus }>;
  nextBefore: OfficeDate | null;
}

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
     * US-007/FR-06, AC-07, D-03 as amended by US-011 (design note §1.4, §2, §3, §4.1).
     *
     * Write first, then explain: the `UPDATE` inside `cancelOwnedBooking` is the sole write and
     * the sole arbiter of "confirmed → cancelled". The disambiguating read below runs ONLY when
     * that write applied to nothing, and ONLY to classify the miss — reading first and writing
     * second would reintroduce the read-then-write window `cancelOwnedBooking`'s own docblock
     * exists to avoid, and would misclassify AC-09's own race (the read says confirmed, an
     * admin's cancel commits, the write misses, and a stale read would report "not found" for a
     * booking that was just cancelled).
     *
     * `now`/`today` are ONE clock reading shared by both `cancelledAt` and the past-date guard —
     * two separate `nowMs()` calls would differ only across office midnight (design note §8.4).
     */
    async cancelBooking(userId: string, bookingId: string): Promise<CancelBookingOutcome> {
      const now = nowMs();
      const today = officeToday(now, officeTimezone);

      const cancelled = await availability.cancelOwnedBooking(userId, bookingId, new Date(now), today);
      if (cancelled) return { kind: 'ok' };

      const existing = await availability.findMyBookingState(userId, bookingId);
      if (existing?.status === 'cancelled') return { kind: 'already_cancelled' };
      return { kind: 'not_found' };
    },

    /**
     * US-010/AC-01, AC-03, AC-04. Architect design note §5 (this story's folder in
     * `inception/specs/`). No `before` -> the default page: `[historyFloor(today), unbounded]`.
     * A `before` -> anchor on the caller's newest booking strictly before it (design note §1.3);
     * no such booking means the control should not have been there, and the honest answer is an
     * empty page with `nextBefore: null` — never an error.
     *
     * `nextBefore` is always the FLOOR of the page just read, not the oldest item's date: the two
     * differ whenever the oldest row on the page is not exactly on the floor, and taking it from
     * `items` would skip every booking between the two (design note §5, §7.4).
     */
    async listMyBookings(userId: string, before: OfficeDate | undefined): Promise<MyBookingsListing> {
      const today = officeToday(nowMs(), officeTimezone);

      let from: OfficeDate;
      let to: OfficeDate | undefined;
      if (before === undefined) {
        from = historyFloor(today);
        to = undefined; // unbounded above — the default page carries future bookings too
      } else {
        const anchor = await availability.findMyNewestBookingBefore(userId, before);
        if (!anchor) return { today, items: [], nextBefore: null };
        to = anchor.booking_date;
        from = historyFloor(to);
      }

      const [rows, older] = await Promise.all([
        availability.listMyBookingsInWindow(userId, from, to),
        availability.findMyNewestBookingBefore(userId, from),
      ]);

      return {
        today,
        items: rows.map((row) => ({
          id: row.id,
          deskNumber: row.desk_number,
          date: row.booking_date,
          status: bookingDisplayStatus(row.status, row.booking_date, today),
        })),
        nextBefore: older ? from : null,
      };
    },
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;

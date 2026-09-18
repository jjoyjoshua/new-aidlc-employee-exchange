import { addDays, lastBookableDate, refusalFor, type OfficeDate } from '@desk-booking/contracts';

/**
 * US-009/AC-02, AC-05, AC-06. Which working days may be offered when a date is fully booked.
 *
 * Pure: no clock, no config, no I/O (eslint Boundary 2). The data arrives as two predicates, so
 * the whole of AC-06 is provable with no database and no HTTP — the caller (`bookings.service.ts`)
 * builds `hasFreeDesk`/`alreadyBooked` from two query results and hands them in as closures.
 */
export function pickNextFreeDays(args: {
  /** The fully-booked date; candidates start at +1. NOT `today` — the selected date can be well
   *  inside the window. */
  after: OfficeDate;
  /** The window's origin, for `lastBookableDate`. */
  today: OfficeDate;
  /** 2 (AC-02). */
  limit: number;
  hasFreeDesk: (date: OfficeDate) => boolean;
  /** BR-001.1 — a date the caller already holds a Confirmed booking on, even if it is free. */
  alreadyBooked: (date: OfficeDate) => boolean;
}): OfficeDate[] {
  const { after, today, limit, hasFreeDesk, alreadyBooked } = args;
  const out: OfficeDate[] = [];
  const end = lastBookableDate(today); // V-02's inclusive right edge

  let candidate = addDays(after, 1);
  // BOTH conditions in the loop guard. A loop written to stop only when `limit` days are found
  // never terminates in exactly the case AC-05 describes — a window with fewer than `limit` free
  // days — and it passes every happy-path test. `candidate <= end` is what makes it return.
  while (candidate <= end && out.length < limit) {
    // `refusalFor` reused, never re-derived — the weekend rule and the window edge are US-005's.
    // A second implementation here would be drift, not defence in depth
    // (`modules/bookings/README.md`).
    if (!refusalFor(candidate, today) && !alreadyBooked(candidate) && hasFreeDesk(candidate)) {
      out.push(candidate);
    }
    candidate = addDays(candidate, 1);
  }

  return out;
}

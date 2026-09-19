import { addDays, type BookingDisplayStatus, type BookingStatus, type OfficeDate } from '@desk-booking/contracts';

/**
 * US-010/REQ-009, REQ-028, BR-001.5. Two rules the employee's booking history needs, and both
 * are pure decisions rather than mappings — Architect design note §3, this story's folder in
 * `inception/specs/`.
 *
 * Pure: no clock, no config, no I/O (eslint Boundary 2). `today` arrives as an argument, from
 * the service's `officeToday(nowMs(), officeTimezone)`, exactly as `refusalFor` receives it.
 */

/**
 * REQ-009, resolved by the PO on 2026-09-07 (SCR-002 conflict row 1): the list shows the last
 * thirty days, then an explicit control for older.
 *
 * Deliberately NOT `BOOKING_WINDOW_DAYS`. That is REQ-006's forward booking window. These are
 * two requirements that happen to share the number 30 today, and coupling them would make a
 * change to one silently change the other (design note §1.2).
 */
export const HISTORY_WINDOW_DAYS = 30;

/**
 * The INCLUSIVE oldest date a page anchored on `anchor` shows. `anchor` is `today` for the
 * default page and the page's own newest booking for an older one (design note §1.3). AC-03's
 * boundary: a booking dated exactly `historyFloor(today)` is shown; one day older is not.
 */
export function historyFloor(anchor: OfficeDate): OfficeDate {
  return addDays(anchor, -HISTORY_WINDOW_DAYS);
}

/**
 * BR-001.5, REQ-028, US-010/AC-04. The status an employee READS, from the status the database
 * STORES.
 *
 * A Confirmed booking whose date has passed in the office's timezone reads as Completed, never
 * as Confirmed. A Cancelled booking stays Cancelled whatever its date — cancelling next
 * Wednesday's desk does not make it "completed", and SCR-002 ST-10 puts that row in Past
 * bookings regardless (design note §4.1). Nothing is stored and nothing drifts: ADR-007.
 */
export function bookingDisplayStatus(
  stored: BookingStatus,
  date: OfficeDate,
  today: OfficeDate,
): BookingDisplayStatus {
  if (stored === 'confirmed' && date < today) return 'completed';
  return stored;
}

/** The date bounds and stored value a PRESENTED status resolves to — the exact inverse of
 *  `bookingDisplayStatus` above, and the reason US-014's status filter cannot be an equality
 *  test: `confirmed` and `completed` are both compound predicates over the two-valued stored
 *  enum, not a third stored value (ADR-007's "Harder" section, addressed to this story by name;
 *  US-014 design note §6). Pure: `today` arrives as an argument, never read here. `from` is
 *  INCLUSIVE, `before` is EXCLUSIVE — the same convention `booking_date < today` already uses
 *  in `bookingDisplayStatus` itself, so no date arithmetic is needed at either call site. */
export interface DisplayStatusPredicate {
  stored: BookingStatus;
  /** Inclusive lower bound this status contributes, if any. */
  from?: OfficeDate;
  /** Exclusive upper bound this status contributes, if any. */
  before?: OfficeDate;
}

export function displayStatusPredicate(
  status: BookingDisplayStatus,
  today: OfficeDate,
): DisplayStatusPredicate {
  if (status === 'completed') return { stored: 'confirmed', before: today };
  if (status === 'confirmed') return { stored: 'confirmed', from: today };
  return { stored: 'cancelled' };
}

import { z } from 'zod';

/**
 * An office-local calendar date. No instant, no zone — design note (US-005) §1.1. Every
 * function in this module is civil-date arithmetic: the same answer in Kolkata, in London and
 * in a CI runner pinned to UTC, because none of it ever touches a timezone.
 */
export const officeDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type OfficeDate = z.infer<typeof officeDateSchema>;

/**
 * REQ-006 — today through today + 30 calendar days, INCLUSIVE. Calendar days, not working
 * days: the story's edge cases are explicit that the window's end does not skip weekends.
 *
 * A literal constant, not a configuration key (US-005/D-… — design note §2.6): no NFR or risk
 * asks an operator to change it, and making it configurable would make `nextBookableDate`
 * partial for no gain.
 */
export const BOOKING_WINDOW_DAYS = 30;

/**
 * AC-04's three reasons, as codes. Copy lives in the UI, keyed on the code (US-001/D-10):
 * 'past' -> "Past", 'too-far-ahead' -> "Too far ahead", 'closed' -> "Closed".
 */
export type DateRefusal = 'past' | 'too-far-ahead' | 'closed';

/**
 * `Date.UTC` is used purely as a calendar calculator here, not as a timezone: UTC has no
 * daylight saving and no half-hour offsets, so `date + days` never lands on the wrong civil
 * date. The arithmetic never touches the office's zone and must not.
 */
/** Fixed-width substring extraction — `YYYY-MM-DD` is a validated shape, never a split(). */
function toUtcDate(date: OfficeDate): Date {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: OfficeDate, days: number): OfficeDate {
  const base = toUtcDate(date);
  const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** BR-001.3 — Saturday or Sunday. */
export function isWeekend(date: OfficeDate): boolean {
  const dayOfWeek = toUtcDate(date).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/** REQ-006's right edge: addDays(today, BOOKING_WINDOW_DAYS). */
export function lastBookableDate(today: OfficeDate): OfficeDate {
  return addDays(today, BOOKING_WINDOW_DAYS);
}

/**
 * `undefined` means bookable. AC-02, AC-03 and AC-04 in one function, so the date strip and the
 * calendar footer render AC-04's text from the same call rather than re-deriving *why*.
 *
 * The precedence is load-bearing (US-005/D-05): a past Saturday is `past`, not `closed` — its
 * real problem is that it has gone, which is the more useful answer for a screen reader. A
 * Saturday beyond the window is `too-far-ahead`, not `closed`, for the same reason. Comparison
 * is plain string comparison: zero-padded `YYYY-MM-DD` sorts lexicographically exactly as it
 * sorts chronologically, so this needs no `Date` parsing at all.
 */
export function refusalFor(date: OfficeDate, today: OfficeDate): DateRefusal | undefined {
  if (date < today) return 'past';
  if (date > lastBookableDate(today)) return 'too-far-ahead';
  if (isWeekend(date)) return 'closed';
  return undefined;
}

/**
 * AC-01's preselection. Total — never `undefined` — because at most two steps (Saturday ->
 * Monday, Sunday -> Monday) are ever needed, and the window is always at least 30 days, so the
 * result is always inside it (design note §2.5).
 */
export function nextBookableDate(today: OfficeDate): OfficeDate {
  let candidate = today;
  while (isWeekend(candidate)) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

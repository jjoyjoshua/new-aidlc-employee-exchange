import type { OfficeDate } from '@desk-booking/contracts';

/**
 * Every date label on SCR-003 is an office-local civil date, never the viewing device's
 * (US-005/D-03, design note §2.8). `new Date('2026-10-03').toLocaleDateString()` renders "Oct 2"
 * for any viewer west of Greenwich, because it formats in the browser's own zone. Every
 * formatter here forces `timeZone: 'UTC'`, so the civil date the string encodes is the civil
 * date it shows, wherever the browser happens to be.
 */
function toUtcInstant(date: OfficeDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** The day-of-month digits, read directly — no `Date` parsing needed for this part. */
export function getDayOfMonth(date: OfficeDate): number {
  return Number(date.slice(8, 10));
}

/** "Mon", "Tue", … — the date strip's chip labels. */
export function formatWeekdayShort(date: OfficeDate): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(toUtcInstant(date));
}

/**
 * "Mo", "Tu", … — the calendar grid's column headings. Not a distinct Intl option (there is no
 * two-letter `weekday`); derived from the three-letter short form, which happens to give the
 * right two letters for every day of the week in English.
 */
export function formatWeekdayNarrow(date: OfficeDate): string {
  return formatWeekdayShort(date).slice(0, 2);
}

/** "Sep", "Oct", … */
export function formatMonthShort(date: OfficeDate): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(toUtcInstant(date));
}

/** "September 2026" — the calendar header (AC-05). */
export function formatMonthYear(date: OfficeDate): string {
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    toUtcInstant(date),
  );
  return label;
}

/** "Sat 3 Oct" — the strip's refused-date text and the calendar footer's last-bookable date. */
export function formatOfficeDateLabel(date: OfficeDate): string {
  return `${formatWeekdayShort(date)} ${getDayOfMonth(date)} ${formatMonthShort(date)}`;
}

/**
 * Approved copy for this screen (US-013), verified against the real hi-fi Figma frames
 * (`HF / SCR-005 · All bookings / ST-##`) rather than the written screen spec alone — this
 * story's `change-log.md` records pulling them before writing any UI.
 *
 * Render this copy, never a server-derived string — the UI owns user-visible copy.
 */

/** ST-03 — US-013/AC-08. Verbatim, confirmed against the real hi-fi frame (node `184:11194`).
 *  Deliberately no body line and no "Add desks" action: that branch needs a desk-inventory check
 *  no endpoint yet answers (`decisions.md` D-07). */
export const EMPTY_NO_BOOKINGS_TITLE = 'Nobody has booked a desk yet.';

/** ST-05 — US-013/AC-09. Verbatim, confirmed against the real hi-fi frame (node `184:11747`). */
export const LOAD_FAILED = "We couldn't load bookings.";

/** AC-04's "Show more" control — verbatim, confirmed against the real hi-fi frame (node `173:220`). */
export const SHOW_MORE = 'Show more';

/** AC-07's count line — verbatim shape, confirmed against the real `Result summary` frame
 *  (node `167:119`): "24 bookings · from Mon 7 Sep · all statuses". `total` is the full count
 *  matching the view, not the number currently loaded (`decisions.md` D-01) — stays true after
 *  **Show more**. There are no filters in this story, so "all statuses" is always true here;
 *  US-014 is what makes this sentence vary. */
export function countLine(total: number, todayLabel: string): string {
  return `${total} booking${total === 1 ? '' : 's'} · from ${todayLabel} · all statuses`;
}

/** The page header's timezone line (NFR-001) — `office.timezone`, matching `my-bookings/copy.ts`'s
 *  own `OFFICE_TIME` wording exactly. */
export const OFFICE_TIME = (timezone: string): string => `Office time (${timezone})`;

/**
 * Approved copy for this screen (US-013), verified against the real hi-fi Figma frames
 * (`HF / SCR-005 · All bookings / ST-##`) rather than the written screen spec alone — this
 * story's `change-log.md` records pulling them before writing any UI.
 *
 * Render this copy, never a server-derived string — the UI owns user-visible copy.
 */

/** ST-03 — US-013/AC-08. Verbatim, confirmed against the real hi-fi frame (node `184:11194`).
 *  Deliberately no body line and no "Add desks" action: that branch needs a desk-inventory check
 *  no endpoint yet answers (`decisions.md` D-07). Distinct from `EMPTY_FILTERED_TITLE` below —
 *  US-014/AC-06 requires the two to read differently, so an administrator can tell "nothing
 *  booked at all" from "nothing matches what I asked for". */
export const EMPTY_NO_BOOKINGS_TITLE = 'Nobody has booked a desk yet.';

/** ST-04 — US-014/AC-06. Verbatim, confirmed against the real hi-fi frame (node `184:11579`,
 *  360px empty-filtered state). */
export const EMPTY_FILTERED_TITLE = 'No bookings match this filter.';
export const EMPTY_FILTERED_BODY = 'Try a wider date range, or a different status.';
export const CLEAR_FILTERS = 'Clear filters';

/** ST-05 — US-013/AC-09. Verbatim, confirmed against the real hi-fi frame (node `184:11747`). */
export const LOAD_FAILED = "We couldn't load bookings.";

/** AC-04's "Show more" control — verbatim, confirmed against the real hi-fi frame (node `173:220`). */
export const SHOW_MORE = 'Show more';

/** AC-02, AC-07 — the status filter's presented word, capitalized exactly as the real hi-fi
 *  frame renders it ("Confirmed", not "confirmed"; node `184:11962`'s Status field and count
 *  line both agree). Reused by both the Status `Select`'s option labels and the count line. */
export function statusLabel(status: 'confirmed' | 'completed' | 'cancelled'): string {
  return status[0]!.toUpperCase() + status.slice(1);
}

/** US-014/AC-07's additions to the count line — all optional, all absent by default so this
 *  reduces to US-013's exact original string when no filter is active. */
export interface CountLineOptions {
  /** The filtered desk's NUMBER (not id) — e.g. "B-03". */
  deskLabel?: string;
  /** The range's end, in the same label format as `fromLabel`. Absent = no ceiling stated. */
  toLabel?: string;
  /** Absent = "all statuses" (US-013's original default; `statusLabel()`'s output otherwise). */
  statusLabel?: string;
}

/** AC-07's count line — verbatim shape, confirmed against the real `Result summary` frame
 *  (node `167:119` for the unfiltered case, `184:11962`/`184:12386` for the filtered ones):
 *  "3 bookings · desk B-03 · from Mon 7 Sep · Confirmed". `total` is the full count matching the
 *  view, not the number currently loaded (`decisions.md` D-01) — stays true after **Show more**.
 *  The clause order is fixed by the frame: count, then desk (if any), then the date range, then
 *  status. There is no confirmed frame for the `to` clause's exact wording — "from X to Y" is
 *  this story's best reading, open for a UX correction (design note open item 7). */
export function countLine(total: number, fromLabel: string, options: CountLineOptions = {}): string {
  const parts = [`${total} booking${total === 1 ? '' : 's'}`];
  if (options.deskLabel !== undefined) parts.push(`desk ${options.deskLabel}`);
  parts.push(`from ${fromLabel}${options.toLabel !== undefined ? ` to ${options.toLabel}` : ''}`);
  parts.push(options.statusLabel ?? 'all statuses');
  return parts.join(' · ');
}

/** The page header's timezone line (NFR-001) — `office.timezone`, matching `my-bookings/copy.ts`'s
 *  own `OFFICE_TIME` wording exactly. */
export const OFFICE_TIME = (timezone: string): string => `Office time (${timezone})`;

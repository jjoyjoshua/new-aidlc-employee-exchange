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

/**
 * ST-07 — US-015/AC-01, AC-02. The reason a non-cancellable row states, verbatim against the
 * real hi-fi frame (`HF / SCR-005 · All bookings / ST-07 Row not cancellable`). Full employee
 * name is used throughout this story's copy (`decisions.md` D-05) — these two strings carry no
 * name, so that decision does not touch them.
 */
export function cancelReason(status: 'completed' | 'cancelled'): string {
  return status === 'completed' ? "Past bookings can't be cancelled" : 'Already cancelled';
}

/**
 * ST-08 — US-015/AC-03. Verbatim against the real hi-fi frame: "Cancel Priya Raman's desk?" /
 * "A-01 · Mon 7 Sep. The desk goes back into the pool and Priya is emailed." `employeeName` is
 * the FULL name throughout (`decisions.md` D-05) — no derived first name, and no special-casing
 * for a name already ending in "s".
 */
export function cancelDialogTitle(employeeName: string): string {
  return `Cancel ${employeeName}'s desk?`;
}

export function cancelDialogBody(deskNumber: string, dateLabel: string, employeeName: string): string {
  return `${deskNumber} · ${dateLabel}. The desk goes back into the pool and ${employeeName} is emailed.`;
}

/** ST-08's actions — verbatim against the real hi-fi frame. `CANCEL_CONFIRM_LABEL` is
 *  deliberately NOT `my-bookings/copy.ts`'s `'Cancel booking'` — SCR-005 draws "Cancel this
 *  booking" for this screen specifically, because on a screen full of other people's bookings
 *  "this" is the word doing the work. */
export const CANCEL_CONFIRM_LABEL = 'Cancel this booking';
export const CANCEL_KEEP_LABEL = 'Keep it';

/** ST-10's two distinct messages, verbatim against the real hi-fi frames. The retryable message
 *  is deliberately generic — a past-dated cancel attempt answers the SAME `404` as "no such
 *  booking" and gets this SAME message (`decisions.md` D-07), never a third one. */
export const CANCEL_FAILED_RETRYABLE = "We couldn't cancel that just now. Try again.";
export const CANCEL_RETRY_LABEL = 'Try again';

/** ST-10's non-retryable branch (US-015/AC-09) — verbatim against the real hi-fi frame, kept
 *  exactly as approved even though the endpoint cannot always verify who cancelled first
 *  (`decisions.md` D-08). `employeeName` is the row's own, full name. */
export function alreadyCancelledMessage(employeeName: string): string {
  return `${employeeName} has already cancelled this booking.`;
}
export const CANCEL_CLOSE_LABEL = 'Close';

/** ST-11 — US-015/AC-05, AC-06. Verbatim against the real hi-fi frame: "A-01 released for Mon 7
 *  Sep. Priya Raman has been emailed." This is copy only — no email is actually sent by this
 *  story (`decisions.md` D-03), the same pattern `cancelledToast` in `my-bookings/copy.ts`
 *  already ships for the employee-initiated cancel. */
export function cancelledToast(deskNumber: string, dateLabel: string, employeeName: string): string {
  return `${deskNumber} released for ${dateLabel}. ${employeeName} has been emailed.`;
}

/**
 * Approved copy for this screen's non-list states (design note, this story's folder in
 * `inception/specs/`). AC-06 and AC-07 both require the empty states to read differently
 * (`copy.spec.ts` asserts it) — kept in one file so reaching for one string puts the other in
 * view, the same reasoning `book-a-desk/copy.ts` states for its own file.
 *
 * Render this copy, never a server-derived string — the UI owns user-visible copy.
 */

/** ST-03 — US-010/AC-06. Verbatim, confirmed against the real hi-fi frame (node `102:5527`) —
 *  the written SCR-002 spec matched it exactly. */
export const NEVER_BOOKED = {
  title: "You haven't booked a desk yet.",
  body: "Pick a day and a desk — we'll email you a confirmation.",
} as const;

/** ST-04 — US-010/AC-07. Verbatim, confirmed against the real hi-fi frame (node `102:5696`) —
 *  deliberately no body line, unlike NEVER_BOOKED: the frame's EmptyState renders none here. */
export const NOTHING_UPCOMING = {
  title: 'Nothing booked coming up.',
} as const;

/** ST-06 — US-010/AC-09. Verbatim, confirmed against the real hi-fi frame (node `102:6303`) —
 *  the reassurance ("They're safe") is deliberate: a list that fails to render reads as a
 *  booking that vanished. */
export const LOAD_FAILED = "We couldn't load your bookings. They're safe — this is a display problem.";

/** AC-08's single live-region announcement, while the initial page is in flight. */
export const LOADING_ANNOUNCEMENT = 'Loading your bookings';

/** AC-08's announcement once the initial page has loaded — the confirmed-status count,
 *  singular/plural. */
export function readyAnnouncement(confirmedCount: number): string {
  return `${confirmedCount} upcoming booking${confirmedCount === 1 ? '' : 's'}`;
}

/** AC-03's "load older" control. Wording resolved 2026-09-18 (Joy Joshua) — "Show more", matching
 *  SCR-002's own resolved conflict row 1, over the story text's unnamed "explicit control". */
export const SHOW_MORE = 'Show more';

/** The long-form accessible name for SHOW_MORE (design note §4.6) — pass the label from
 *  `formatOfficeDateLong`, never a raw ISO string. */
export const SHOW_MORE_ARIA_LABEL = (longLabel: string): string => `Show bookings older than ${longLabel}`;

/** ST-05's eyebrow (Figma node `102:5940`) — verbatim, all caps in the markup itself (the frame's
 *  own text, not a CSS text-transform). */
export const TODAY_EYEBROW = 'TODAY';

/** The page header's timezone line (AC-10) — `office.timezone`, never `office.today`
 *  (design note §7.2, §4.5). Matches `book-a-desk`'s own header line wording. */
export const OFFICE_TIME = (timezone: string): string => `Office time (${timezone})`;

/** The Past bookings section heading (SCR-002 layout). */
export const PAST_BOOKINGS_HEADING = 'Past bookings';

/** The Upcoming section heading (SCR-002 layout). */
export const UPCOMING_HEADING = 'Upcoming';

/**
 * US-011, ST-07–ST-10 (design note §5.5). Verified verbatim against the live Figma frames —
 * `HF / SCR-002 · My bookings / ST-07…ST-10` in file `xjFVgBbMrJUl7Ys3EX3Cbn` (node ids in this
 * story's `traceability.md`) — not the written screen spec alone.
 */

/** ST-07's dialog title. */
export const CANCEL_DIALOG_TITLE = 'Cancel your desk?';

/** ST-07's dialog body. Built from the ROW's own desk number and date label — the SCR-002
 *  designer handoff is explicit that the sentence is approved copy, but the desk and date are
 *  data, and must name the row the dialog was opened from, never the frame's own example
 *  ("B-02 · Wed 9 Sep"). `dateLabel` is `formatOfficeDateLabel`'s output, never a raw ISO date. */
export function cancelDialogBody(deskNumber: string, dateLabel: string): string {
  return `${deskNumber} · ${dateLabel}. The desk goes back into the pool and we'll email you a confirmation.`;
}

/** ST-07's confirming (destructive) action. */
export const CANCEL_CONFIRM_LABEL = 'Cancel booking';

/** ST-07's dismissing action — also `ConfirmDialog`'s own default `cancelLabel`, restated here so
 *  a reader of this screen's copy does not have to go find it in the generic component. */
export const CANCEL_KEEP_LABEL = 'Keep it';

/** ST-09's retryable branch — a transport failure, or a genuine 5xx (US-011/AC-08). */
export const CANCEL_FAILED_RETRYABLE = "We couldn't cancel that just now. Try again.";

/** ST-09's non-retryable branch — the booking is already gone (US-011/AC-09). Distinct from
 *  `CANCEL_FAILED_RETRYABLE` on purpose: retrying this one can never succeed. */
export const CANCEL_ALREADY_CANCELLED = 'That booking has already been cancelled.';

/** ST-09's non-retryable branch's single action (`ConfirmDialog`'s `singleAction`). Not drawn in
 *  any Figma frame (SCR-002's own designer handoff says the frames only show the retryable
 *  outcome) — taken verbatim from the approved written screen spec. */
export const CANCEL_CLOSE_LABEL = 'Close';

/** ST-10's toast. Names the channel and the address, not just the outcome (REQ-024, PRIN-5) —
 *  the fact she can act on if the email never arrives. `email` comes from the caller's own
 *  account (`useAuth().user.email`), never from the cancel response. */
export function cancelledToast(deskNumber: string, dateLabel: string, email: string): string {
  return `Desk ${deskNumber} released for ${dateLabel}. Cancellation emailed to ${email}.`;
}

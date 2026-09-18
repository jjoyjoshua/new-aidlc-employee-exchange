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

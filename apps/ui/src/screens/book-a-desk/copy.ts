/**
 * Approved copy for this screen's non-list states, kept in one file so reaching for one string
 * puts the other in view (design note §4.5) — AC-09 and the story's QA notes both require the
 * two empty states (this one, and US-009's fully-booked one) to read differently.
 *
 * Render this copy, never the server's `message` — the UI owns user-visible copy and keys it on
 * `code` (US-001/D-10).
 */

/** SCR-003 ST-05 — US-006/AC-09. Verbatim; title and body split per the Designer handoff note.
 *  NOT a template: it names no date, because every date is equally empty and offering
 *  alternatives would be cruel (AC-09 forbids alternative dates and an admin link). */
export const NO_DESKS_EXIST = {
  title: 'There are no desks set up yet.',
  body: 'Your office admin adds desks before anyone can book.',
} as const;

/** SCR-003 ST-06 — US-006/AC-08. Names the date; pass the label from `formatOfficeDateLabel`,
 *  never from `new Date(dateString).toLocaleDateString()` (the trap `format-office-date.ts`
 *  exists to close). */
export const AVAILABILITY_LOAD_FAILED = (label: string): string =>
  `We couldn't load desk availability for ${label}.`;

/** SCR-003 ST-09 — US-007/AC-08. The desk-per-day index fired: someone else's confirm won the
 *  race. Names what happened, not what to do — the refresh and the cleared selection already
 *  do the "what to do" part. */
export const DESK_JUST_TAKEN = 'Someone just booked that desk. The list has been refreshed.';

/** SCR-003 ST-12 — US-007/AC-10. Deliberately does not say "try again" as the only option —
 *  a blind retry can double-book (refused confusingly by BR-001.1) or succeed, and the
 *  interface genuinely cannot tell which happened. */
export const BOOKING_UNCERTAIN =
  "We couldn't confirm whether that booking went through. Check My bookings before trying again.";

/** SCR-003 hi-fi frame (Figma node 38:173, "Your usual") — US-008/FR-05, FR-06. Rendered as
 *  visible text, right-aligned on the caller's usual desk's row beside the clock hint icon, and
 *  folded into its composed `aria-label` (DeskRow.tsx) so a screen reader announces it too.
 *  Verbatim "your usual" per the hi-fi frame, not the ASCII wireframe's paraphrase — confirmed
 *  against the actual design 2026-09-18 after the wireframe and the frame were found to disagree. */
export const YOUR_USUAL_DESK = 'your usual';

/** SCR-003 ST-04 — US-009/AC-01. Names the date, unlike NO_DESKS_EXIST, because this date is the
 *  problem and another date is the fix. Verbatim per the approved Figma frame (node `39:1245`),
 *  found by opening the real hi-fi frames rather than trusting the written spec alone. */
export const FULLY_BOOKED = (label: string): string => `Every desk is taken on ${label}.`;

/**
 * SCR-003 ST-04's lead-in line above the suggested days (Figma node `39:1245`'s `body`:
 * "The next two working days with desks free:"). The frame names "two" explicitly, but AC-05
 * requires the message to still read correctly when only one or zero days qualify — so the
 * count word is dropped at one, and the whole line is dropped at zero (`decisions.md` D-03).
 *
 * Returns `undefined` for 0 rather than an empty string, so the caller renders no lead line at
 * all — never a lead-in above an empty slot.
 */
export function FULLY_BOOKED_LEAD(suggestionCount: number): string | undefined {
  if (suggestionCount >= 2) return 'The next two working days with desks free:';
  if (suggestionCount === 1) return 'The next working day with a desk free:';
  return undefined;
}

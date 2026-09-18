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

// US-009 adds FULLY_BOOKED here, beside NO_DESKS_EXIST, and a test asserting the two differ.

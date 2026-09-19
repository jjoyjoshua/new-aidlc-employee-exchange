/**
 * Approved copy for SCR-006 (US-016), verified against the real hi-fi Figma frames (`HF / SCR-006
 * · Desks / ST-##`) rather than the written screen spec alone.
 *
 * Render this copy, never a server-derived string — the UI owns user-visible copy.
 */
import type { AdminDesk } from '@desk-booking/contracts';

export const PAGE_TITLE = 'Desks';

/** ST-01. Verbatim against the real hi-fi frame (`Page header`'s "Add desk" action, node
 *  `195:113`) and the empty state's own action (node `209:86`) — the SAME string in both places,
 *  the header and the empty state (US-016/AC-06). */
export const ADD_DESK_LABEL = 'Add desk';

export const EDIT_LABEL = 'Edit';
export const DEACTIVATE_LABEL = 'Deactivate';
export const ACTIVATE_LABEL = 'Activate';

/** ST-03 — US-016/AC-06. Verbatim against the real hi-fi frame (node `211:1021`/`211:1141`). */
export const EMPTY_TITLE = 'No desks yet. Nobody can book until you add one.';
export const EMPTY_BODY = 'Employees see an empty booking screen until the first desk exists.';

/** ST-04 — US-016/AC-07. Verbatim against the real hi-fi frame (node `213:903`). */
export const LOAD_FAILED = "We couldn't load the desk list.";
export const TRY_AGAIN_LABEL = 'Try again';

/**
 * US-016/AC-05. `0` renders as an EM DASH — not the word "zero", not blank. SCR-006 draws it, and
 * AC-05 requires none to be unmistakable for missing data. Pair with `bookedAheadAccessibleText`
 * for the cell's accessible name — a bare dash is silent or gibberish to a screen reader
 * (US-016 design note §7.2).
 */
export function bookedAheadLabel(count: number): string {
  if (count === 0) return '—';
  return `${count} upcoming`;
}

/** The accessible counterpart to `bookedAheadLabel` — words in every case, including zero
 *  (`decisions.md` D-03). */
export function bookedAheadAccessibleText(count: number): string {
  if (count === 0) return 'No upcoming bookings';
  return bookedAheadLabel(count);
}

/**
 * The "N desks · M active, K inactive" line above the table (Figma `Result summary`, node
 * `202:65`). Derived entirely from the array the browser already holds — the server never echoes
 * these three numbers (US-016 design note §3.2: "a derived total belongs on the wire only when
 * the client does not hold the whole set", and `GET /api/admin/desks` returns every desk).
 */
export function summaryLine(desks: AdminDesk[]): string {
  const total = desks.length;
  const active = desks.filter((desk) => desk.isActive).length;
  const inactive = total - active;
  return `${total} desk${total === 1 ? '' : 's'} · ${active} active, ${inactive} inactive`;
}

/**
 * SCR-007 (US-017 — the add-desk dialog). Verified against the real hi-fi frames
 * (`HF / SCR-007 · Desk form / ST-01`, node `225:20`), not the written spec alone.
 */
export const ADD_DESK_DIALOG_TITLE = 'Add desk';
export const DESK_NUMBER_LABEL = 'Desk number';
export const DESK_NUMBER_HELPER =
  'One letter, a dash, two digits — like A-01. The letter groups desks into zones on the booking screen.';
export const CANCEL_LABEL = 'Cancel';

/** ST-03 — US-017/AC-02. Two messages, because the two mistakes need different corrections: the
 *  empty case names what is missing, the bad-shape case restates the rule rather than saying
 *  "invalid" (SCR-007's own reasoning). */
export function deskNumberFormatError(raw: string): string {
  if (raw.trim().length === 0) return 'Give the desk a number.';
  return 'Use one letter, a dash and two digits — like A-01.';
}

/** ST-04 — US-017/AC-04 (PRIN-3). Leads with the colliding number rather than stating a rule. */
export function duplicateDeskTitle(deskNumber: string): string {
  return `${deskNumber} is already taken by another desk.`;
}

/** ST-04's body. The case sentence is a separate, conditional half — see `DeskFormDialog`, which
 *  appends it only when the collision was case-insensitive rather than exact. */
export const DUPLICATE_DESK_BODY = 'Desk numbers have to be unique, and capitals don’t make a difference.';
export const DUPLICATE_DESK_CASE_SENTENCE = 'a-01 and A-01 count as the same.';

/** ST-07 — US-017/AC-07. */
export const SAVE_FAILED = "We couldn't save that just now. Try again.";
export const RETRY_LABEL = 'Try again';

/** ST-06. Names the effect on BOOKABILITY, not just the outcome — the fact everyone else in the
 *  office cares about, the same reasoning `my-bookings`' own cancellation toast states. */
export function deskAddedToast(deskNumber: string): string {
  return `Desk ${deskNumber} added. People can book it from today.`;
}

/**
 * SCR-007 ST-02 (US-018 — the edit-desk dialog). Verified against the real hi-fi frame
 * (`HF / SCR-007 · Desk form / ST-02 Edit — default · 1280`, node `225:369`): "Edit desk A-01".
 * Binds to the desk as LOADED, never the live input value — a title that tracked the field would
 * rename itself mid-keystroke (US-018 design note §6.1).
 */
export function editDeskDialogTitle(deskNumber: string): string {
  return `Edit desk ${deskNumber}`;
}

/** SCR-007 ST-02 — US-018/AC-01. Frame-verified (node `225:369`). */
export const SAVE_CHANGES_LABEL = 'Save changes';

/**
 * ST-02's persistent note — US-018/AC-04 (BR-001.19, RISK-012). Verbatim against the real hi-fi
 * frame for a count of 3; the singular is derived (no approved frame or spec draws it) following
 * this file's existing inline-pluralisation pattern (`summaryLine`, above). Names the CONSEQUENCE
 * and the silence, in that order: the count alone would be a statistic, and AC-04 requires both
 * halves before the save. Rendered only when the count is non-zero (the story's QA note: it must
 * NOT appear on a desk with no upcoming bookings).
 */
export function upcomingHoldersWarning(count: number): string {
  const holders = count === 1 ? '1 person has' : `${count} people have`;
  return `${holders} this desk booked. Renaming it changes what they see — they won't be told.`;
}

/** ST-06, edit variant — US-018/AC-01. Spec-sourced (`SCR-007:89`), not frame-verified: no
 *  edit-mode ST-06 frame is drawn (ST-06 is drawn as SCR-006-plus-toast for the add case only). */
export function deskRenamedToast(deskNumber: string): string {
  return `Desk number updated to ${deskNumber}.`;
}

/**
 * SCR-006 ST-05 — US-019/AC-03. Frame-verified against the real hi-fi frame (node `213:1092`) for
 * desk A-02. The desk number is interpolated INTO the title, not appended — the frame draws one
 * run-on question, "Deactivate A-02?".
 */
export function deactivateDialogTitle(deskNumber: string): string {
  return `Deactivate ${deskNumber}?`;
}

/** ST-05's body — US-019/AC-03. Frame-verified (node `213:1092`). States the consequence AND
 *  that history survives, in that order — "deactivate" reads as "delete" without the second
 *  sentence (story `:37`). Constant, not a function: nothing in it varies by desk. */
export const DEACTIVATE_DIALOG_BODY =
  'It disappears from everyone’s booking options straight away. Past bookings on it are kept.';
export function deactivateDialogBody(): string {
  return DEACTIVATE_DIALOG_BODY;
}

/** ST-05/ST-07's dismissal — US-019/AC-03. Frame-verified (node `213:1092`). Changes to
 *  `CLOSE_LABEL` after a failure (ST-06, ST-08) — verified on `214:2724` and `214:1685`. */
export const KEEP_IT_ACTIVE_LABEL = 'Keep it active';

/** ST-06/ST-08's dismissal after a failure — US-019/AC-04, AC-11. Verified on `214:2724` and
 *  `214:1685`. Screen-private, matching `all-bookings/copy.ts`'s own `CANCEL_CLOSE_LABEL`
 *  precedent rather than importing across screens for one string. */
export const CLOSE_LABEL = 'Close';

/**
 * SCR-006 ST-06 — US-019/AC-04 (BR-001.9, V-09, PRIN-3). Verbatim against the real hi-fi frame
 * (node `214:1685`) for a count of 3. The desk number is IN the title (SCR-006:116 writes it as
 * one run-on sentence; the frame splits it) — never in the body alone.
 */
export function blockedDialogTitle(deskNumber: string): string {
  return `${deskNumber} can’t be deactivated yet.`;
}

/**
 * ST-06's body — US-019/AC-04. Frame-verified for a count of 3 (node `214:1685`); the singular is
 * derived, following this file's existing inline-pluralisation pattern (`upcomingHoldersWarning`),
 * because no approved frame draws a count of 1 (design note §8.4, open item 5(a)). The count is
 * the SERVER's, from the refusing response (design note §4) — never the row's own `bookedAhead`,
 * which is provably 0 on the one path that reaches here (§4.5, option E).
 */
export function blockedDialogBody(count: number): string {
  const holders = count === 1 ? '1 person has' : `${count} people have`;
  return `${holders} it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do.`;
}

/** ST-06's primary action label — US-019/AC-04, AC-06. Interpolated INDEPENDENTLY of the body
 *  (design note §4.2 — this is the whole reason the count travels as a typed `details` field
 *  rather than inside `message`). Frame-verified for 3 (node `214:1685`); singular derived,
 *  matching `blockedDialogBody`'s own pattern. */
export function seeBookingsLabel(count: number): string {
  return count === 1 ? 'See that 1 booking' : `See those ${count} bookings`;
}

/** ST-08's error — US-019/AC-11. Frame-verified (node `214:2724`). */
export function deactivateFailedAlert(deskNumber: string): string {
  return `We couldn’t deactivate ${deskNumber} just now. Try again.`;
}

/** ST-09's toast — US-019/AC-10. Frame-verified (node `215:2908`). Names the effect on
 *  bookability, not just the state — the same reasoning `deskAddedToast` states. */
export function deskDeactivatedToast(deskNumber: string): string {
  return `${deskNumber} is inactive. It’s no longer bookable.`;
}

/** ST-10's toast — US-019/AC-10. Frame-verified (node `215:3413`). */
export function deskActivatedToast(deskNumber: string): string {
  return `${deskNumber} is active. People can book it from today.`;
}

/**
 * The activation-failure banner — US-019, not frame-verified as approved copy (design note §8.4,
 * open item 5(b); `decisions.md` D-07). SCR-006:140 draws the behaviour but AC-11 covers
 * deactivation failure only, so this string is drafted rather than claimed as AC proof — mirrors
 * ST-08's wording, the nearest approved sibling.
 */
export function activateFailedAlert(deskNumber: string): string {
  return `We couldn’t activate ${deskNumber} just now. Try again.`;
}

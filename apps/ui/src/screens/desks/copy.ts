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

/** US-016/D-02. The reason each unbuilt control (Add desk, Edit, Deactivate, Activate) carries —
 *  as both a mouse `title` and a visually-hidden span, the pattern `AdminBookingRow` already uses
 *  for its own non-cancellable action. Commits to no story name or release date (design note §6.2
 *  open item 8; `decisions.md` D-02). */
export const UNAVAILABLE_CONTROL_REASON = 'Not available yet — coming in a later release.';

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

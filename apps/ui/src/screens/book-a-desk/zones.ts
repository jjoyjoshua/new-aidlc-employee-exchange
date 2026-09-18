/**
 * Zone grouping (US-006/AC-05) — screen-private, browser-only. Design note §3.1, §4.2: only the
 * browser groups; a server-side grouping function nothing calls would be dead code, and the
 * wire contract deliberately carries no zones (`@desk-booking/contracts/availability.ts`).
 */
import type { DeskAvailability } from '@desk-booking/contracts';

export interface Zone {
  letter: string;
  desks: DeskAvailability[];
}

/**
 * Groups by the first character of `deskNumber` and sorts, both by zone letter and by
 * `deskNumber` within a zone.
 *
 * **Lexicographic order is numeric order here, and that is a consequence of the database's
 * `desks_desk_number_format` CHECK, not a coincidence**: every desk number is exactly
 * `^[A-Z]-[0-9]{2}$`, fixed-width and zero-padded, so `'A-01' < 'A-02' < 'A-10' < 'B-01'` as
 * strings sorts exactly as AC-05 requires. This function sorts even though the server's own
 * query is already `ORDER BY desk_number` (design note §4.2), because AC-05 must be provable
 * without a database: feed it a shuffled array and the output is still correct.
 *
 * Total for any string the CHECK admits. For anything else it groups by whatever the first
 * character is rather than throwing — the right failure for a presentation grouping is one
 * oddly-labelled group, not a blank screen.
 */
export function groupByZone(desks: DeskAvailability[]): Zone[] {
  const sorted = [...desks].sort((a, b) => (a.deskNumber < b.deskNumber ? -1 : a.deskNumber > b.deskNumber ? 1 : 0));

  const byLetter = new Map<string, DeskAvailability[]>();
  for (const desk of sorted) {
    const letter = desk.deskNumber.charAt(0);
    const group = byLetter.get(letter);
    if (group) group.push(desk);
    else byLetter.set(letter, [desk]);
  }

  return [...byLetter.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([letter, deskGroup]) => ({ letter, desks: deskGroup }));
}

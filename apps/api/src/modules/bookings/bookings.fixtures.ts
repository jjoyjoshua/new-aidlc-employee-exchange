/**
 * The QA dataset this story's own QA notes describe: 40 active desks over three zones, plus one
 * retired desk that is simply absent from `listActiveDesks()`'s real output shape — not present
 * and marked some other way (US-006/AC-04). Shared by US-006, US-007 and US-009 so the three
 * stories argue about the same desks. Mirrors `supabase/seed/desks.dev.sql`'s counts.
 */
import type { DeskRow } from './bookings.repository.js';

const ZONE_COUNTS: ReadonlyArray<readonly [string, number]> = [
  ['A', 14],
  ['B', 14],
  ['C', 13],
];

/** The one desk in the dataset that is `is_active = false`. It never appears in `activeDesks()` —
 *  that absence IS the fixture, matching the shape of the real `.eq('is_active', true)` query. */
export const RETIRED_DESK_NUMBER = 'C-13';

function allDeskNumbers(): string[] {
  return ZONE_COUNTS.flatMap(([zone, count]) =>
    Array.from({ length: count }, (_, i) => `${zone}-${String(i + 1).padStart(2, '0')}`),
  );
}

function deskId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** 40 active desks over zones A/B/C, ordered by desk number — what `listActiveDesks()` returns
 *  for this dataset. */
export function activeDesks(): DeskRow[] {
  return allDeskNumbers()
    .filter((deskNumber) => deskNumber !== RETIRED_DESK_NUMBER)
    .map((desk_number, i) => ({ id: deskId(i + 1), desk_number }));
}

/**
 * The ids `listConfirmedDeskIds` would return for a partially-booked day: everything from the
 * 13th desk onward is taken, leaving exactly the first 12 free — the story's own AC-01 example,
 * "12 of 40 desks free".
 */
export function partiallyTakenDeskIds(desks: DeskRow[] = activeDesks()): string[] {
  return desks.slice(12).map((desk) => desk.id);
}

/** An office with no active desks at all (US-006/AC-09). */
export const emptyOffice: DeskRow[] = [];

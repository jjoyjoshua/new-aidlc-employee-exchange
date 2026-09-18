import type { OfficeDate } from '@desk-booking/contracts';

/**
 * NFR-001 — the office's own calendar date at a given instant. The ONE zone-dependent step in
 * US-005 (design note §1.1); everything downstream — the 30-day window, the weekend rule, the
 * calendar clamp — is civil-date arithmetic in `libs/contracts/src/booking-window.ts` and needs
 * no zone at all.
 *
 * Every input is an argument, including the clock reading — `domain/` never reads the clock and
 * never reads config (eslint Boundary 2). `Intl` is neither: it is a pure function of an instant
 * and a zone.
 *
 * `formatToParts`, not `format` with a locale that happens to emit ISO: assembling the parts
 * from their typed kind is not a bet on locale data staying put the way an `en-CA` string trick
 * would be. The zone is validated at boot (`config/index.ts`), so this assumes a real IANA name
 * and needs no error path of its own.
 */
export function officeToday(nowMs: number, timeZone: string): OfficeDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowMs));

  const at = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl.DateTimeFormat did not produce a "${type}" part`);
    return part.value;
  };

  return `${at('year')}-${at('month')}-${at('day')}`;
}

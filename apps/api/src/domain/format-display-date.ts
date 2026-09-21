import type { OfficeDate } from '@desk-booking/contracts';

/**
 * US-029/AC-02. `OfficeDate` is already a civil date with no timezone left to resolve
 * (`booking-window.ts`'s own note: "everything downstream is civil-date arithmetic and needs no
 * zone at all") — this anchors it at UTC noon purely to get a `Date` `Intl` can read, never to
 * express an instant.
 *
 * `formatToParts`, not `.format()`: `officeToday`'s own reasoning applies here too — reassembling
 * the parts in a fixed order pins the exact shape (no comma, `Sep` not `Sept`) rather than
 * betting on one locale's punctuation and abbreviation choices staying put.
 */
export function formatShortDate(date: OfficeDate): string {
  const [yearStr, monthStr, dayStr] = date.split('-') as [string, string, string];
  const anchor = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr), 12));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(anchor);

  const at = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl.DateTimeFormat did not produce a "${type}" part`);
    return part.value;
  };

  return `${at('weekday')} ${at('day')} ${at('month')}`;
}

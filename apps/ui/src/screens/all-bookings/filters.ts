/**
 * US-014's filter state — the pure functions AC-05, AC-06 and AC-08 rest on. One vocabulary
 * shared by the URL and the API call (design note §2.2, §7.1): the query-string parameter names
 * ARE the API's parameter names.
 */
import type { BookingDisplayStatus, OfficeDate } from '@desk-booking/contracts';

export interface AllBookingsFilters {
  from?: OfficeDate;
  to?: OfficeDate;
  status?: BookingDisplayStatus;
  deskId?: string;
}

/** AC-05's Clear target, and the default view (US-013/AC-02). */
export const NO_FILTERS: AllBookingsFilters = {};

const STATUS_VALUES: BookingDisplayStatus[] = ['confirmed', 'completed', 'cancelled'];
const OFFICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** AC-05, AC-06's whole discriminator — the ST-04/ST-03 branch is browser state, never a wire
 *  field (US-013 design note §6.2, this story's design note §5). */
export function isFiltered(filters: AllBookingsFilters): boolean {
  return (
    filters.from !== undefined ||
    filters.to !== undefined ||
    filters.status !== undefined ||
    filters.deskId !== undefined
  );
}

/**
 * AC-08's receiving half. Reads the screen's own query string on mount. A malformed value falls
 * back to the default for that FIELD rather than the whole result — a hand-mangled bookmark must
 * not produce ST-05 (design note §2.2). A well-formed but unknown `deskId` is passed through
 * unchanged; the control that cannot display it is `FilterBar`'s concern, not this function's.
 */
export function parseFilters(search: string): AllBookingsFilters {
  const params = new URLSearchParams(search);
  const filters: AllBookingsFilters = {};

  const from = params.get('from');
  if (from !== null && OFFICE_DATE_RE.test(from)) filters.from = from;

  const to = params.get('to');
  if (to !== null && OFFICE_DATE_RE.test(to)) filters.to = to;

  const status = params.get('status');
  if (status !== null && (STATUS_VALUES as string[]).includes(status)) {
    filters.status = status as BookingDisplayStatus;
  }

  const deskId = params.get('deskId');
  if (deskId !== null && UUID_RE.test(deskId)) filters.deskId = deskId;

  return filters;
}

/** The single vocabulary serving both the URL (`parseFilters`'s inverse) and the API call
 *  (`fetch-all-bookings.ts`). `page` rides alongside but is never itself written to the URL by
 *  the caller of `parseFilters` — see `use-all-bookings.ts`. */
export function toQueryString(filters: AllBookingsFilters, page: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (filters.from !== undefined) params.set('from', filters.from);
  if (filters.to !== undefined) params.set('to', filters.to);
  if (filters.status !== undefined) params.set('status', filters.status);
  if (filters.deskId !== undefined) params.set('deskId', filters.deskId);

  const query = params.toString();
  return query ? `?${query}` : '';
}

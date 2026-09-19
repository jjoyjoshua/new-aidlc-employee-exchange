/**
 * AdminBookingRow — SCR-005's `Admin booking row` (Figma node `170:42`), screen-private to
 * `all-bookings/` (design note §6.1, this story's folder in `inception/specs/`): SCR-002's
 * `BookingRow` is a flex `<div>`, this screen's `layout="Table"` is a real `<table>` row — there
 * is no shared DOM to extract between them.
 *
 * `layout` mirrors the Figma component's own prop exactly: `"table"` renders a `<tr>` (real
 * column headers, one screen-reader announcement per cell — SCR-005's own accessibility section);
 * `"card"` renders the two densities (one line at 768px, stacked at 360px) as ONE `<li>`, reflowed
 * by CSS alone (`all-bookings.css`), matching this codebase's zero-`matchMedia` precedent.
 *
 * **No action/cancel column, in either layout** (`decisions.md` D-06). `BookingRow.tsx`'s own
 * history is the precedent: US-010 shipped zero action affordance and US-011 added `onCancel`
 * later. AC-03 lists exactly four fields; US-015 owns the fifth.
 */
import type { AllBookingsListItem } from '@desk-booking/contracts';
import { StatusChip } from '../../components/status-chip/StatusChip.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';

/** The table's column headers — real `<th>`s, so a screen reader announces the column per cell
 *  (SCR-005's own accessibility section). Exported so `AllBookings.tsx` and this file's own spec
 *  share one definition of the column order rather than two that could drift. */
export function AdminBookingsTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Date</th>
        <th scope="col">Desk</th>
        <th scope="col">Employee</th>
        <th scope="col">Status</th>
      </tr>
    </thead>
  );
}

export type AdminBookingRowLayout = 'table' | 'card';

export interface AdminBookingRowProps {
  item: AllBookingsListItem;
  layout: AdminBookingRowLayout;
}

export function AdminBookingRow({ item, layout }: AdminBookingRowProps) {
  const dateLabel = formatOfficeDateLabel(item.date);

  if (layout === 'table') {
    return (
      <tr className="admin-bookings-table__row">
        <td>{dateLabel}</td>
        <td>{item.deskNumber}</td>
        <td className="admin-bookings-table__employee">{item.employeeName}</td>
        <td>
          <StatusChip kind="booking" status={item.status} />
        </td>
      </tr>
    );
  }

  return (
    <li className="admin-booking-card">
      <span className="admin-booking-card__meta">
        <span>{dateLabel}</span>
        <span className="admin-booking-card__dot" aria-hidden="true">
          ·
        </span>
        <span>{item.deskNumber}</span>
      </span>
      <span className="admin-booking-card__employee">{item.employeeName}</span>
      <StatusChip kind="booking" status={item.status} />
    </li>
  );
}

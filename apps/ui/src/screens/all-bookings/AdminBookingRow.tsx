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
 * **The fifth field, US-015/AC-01, AC-02** (`decisions.md` D-06 recorded its earlier, deliberate
 * absence — US-010 shipped `BookingRow` with zero action affordance and US-011 added `onCancel`
 * later; this is that same pattern's second application). Cancellability is `item.status ===
 * 'confirmed'` and NOTHING ELSE — never a date comparison, which would go stale across an office
 * midnight with the tab open (design note §5.4). A `confirmed` row renders a **Cancel** button;
 * every other status renders an em dash plus the reason, visible in the card layouts (AC-02) and
 * as an accessible label + `title` tooltip in the table layout (SCR-005's own accessibility note).
 */
import type { AllBookingsListItem } from '@desk-booking/contracts';
import { Button } from '../../components/button/Button.js';
import { StatusChip } from '../../components/status-chip/StatusChip.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import { cancelReason } from './copy.js';
import './all-bookings.css';

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
        <th scope="col">
          <span className="all-bookings__visually-hidden">Action</span>
        </th>
      </tr>
    </thead>
  );
}

export type AdminBookingRowLayout = 'table' | 'card';

export interface AdminBookingRowProps {
  item: AllBookingsListItem;
  layout: AdminBookingRowLayout;
  /** US-015/AC-01. Called with the row's own item — the screen owns the confirmation dialog,
   *  this row only reports the click. */
  onCancel: (item: AllBookingsListItem) => void;
}

export function AdminBookingRow({ item, layout, onCancel }: AdminBookingRowProps) {
  const dateLabel = formatOfficeDateLabel(item.date);
  const cancellable = item.status === 'confirmed';
  const reason = item.status === 'confirmed' ? undefined : cancelReason(item.status);

  const action = cancellable ? (
    <Button variant="secondary" onClick={() => onCancel(item)}>
      Cancel
    </Button>
  ) : (
    <span aria-hidden="true">—</span>
  );

  if (layout === 'table') {
    return (
      <tr className="admin-bookings-table__row" data-booking-row={item.id} tabIndex={-1}>
        <td>{dateLabel}</td>
        <td>{item.deskNumber}</td>
        <td className="admin-bookings-table__employee">{item.employeeName}</td>
        <td>
          <StatusChip kind="booking" status={item.status} />
        </td>
        <td title={reason}>
          {action}
          {reason ? <span className="all-bookings__visually-hidden">{reason}</span> : null}
        </td>
      </tr>
    );
  }

  return (
    <li className="admin-booking-card" data-booking-row={item.id} tabIndex={-1}>
      <span className="admin-booking-card__meta">
        <span>{dateLabel}</span>
        <span className="admin-booking-card__dot" aria-hidden="true">
          ·
        </span>
        <span>{item.deskNumber}</span>
      </span>
      <span className="admin-booking-card__employee">{item.employeeName}</span>
      <StatusChip kind="booking" status={item.status} />
      {cancellable ? (
        action
      ) : (
        <span className="admin-booking-card__reason">{reason}</span>
      )}
    </li>
  );
}

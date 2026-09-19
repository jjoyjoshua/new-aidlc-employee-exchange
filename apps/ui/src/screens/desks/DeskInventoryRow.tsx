/**
 * DeskInventoryRow — SCR-006's `Desk row` (Figma node `201:236`), screen-private to `screens/desks/`
 * (US-016 design note §5.1). Named `DeskInventoryRow`, not `DeskRow`, to avoid colliding in name
 * with the unrelated, shared, employee-facing `components/desk-row/DeskRow.tsx` (booking-selection
 * row) — different folders, no import collision, but an identical name for two unrelated things is
 * a needless reading hazard (`decisions.md` D-05).
 *
 * `layout="table"` renders a `<tr>` on this table's own 140/160/240 grid; `layout="card"` renders
 * ONE `<li>` reflowed by CSS alone between the 768px "one line" shape and the 360px stacked shape
 * (`desks.css`) — the same zero-`matchMedia`, dual-tree device `all-bookings/AdminBookingRow` uses
 * (US-016 design note §7.1).
 *
 * Both row actions (**Edit** and the Deactivate-or-Activate toggle) are always rendered and always
 * `disabled`: their destinations (US-017, US-018, US-019) do not exist yet, and AC-06/AC-08 make
 * the controls themselves the story's subject, so omitting them would fail those ACs rather than
 * merely under-deliver them (design note §6.2). Each carries `UNAVAILABLE_CONTROL_REASON` as a
 * mouse `title` and a visually-hidden span, the pattern `AdminBookingRow` already uses for its own
 * non-cancellable action.
 */
import type { AdminDesk } from '@desk-booking/contracts';
import { Button } from '../../components/button/Button.js';
import { StatusChip } from '../../components/status-chip/StatusChip.js';
import { bookedAheadLabel, bookedAheadAccessibleText, EDIT_LABEL, DEACTIVATE_LABEL, ACTIVATE_LABEL, UNAVAILABLE_CONTROL_REASON } from './copy.js';
import './desks.css';

/** Real `<th>`s, so a screen reader announces the column per cell — SCR-006's own accessibility
 *  section ("'Booked ahead, 3 upcoming' is meaningless without its header"). Exported so
 *  `Desks.tsx` and this file's own spec share one definition of the column order. */
export function DeskInventoryTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Desk</th>
        <th scope="col">Status</th>
        <th scope="col">Booked ahead</th>
        <th scope="col">
          <span className="desks__visually-hidden">Actions</span>
        </th>
      </tr>
    </thead>
  );
}

export type DeskInventoryRowLayout = 'table' | 'card';

export interface DeskInventoryRowProps {
  desk: AdminDesk;
  layout: DeskInventoryRowLayout;
}

function ActionButtons({ desk }: { desk: AdminDesk }) {
  const toggleLabel = desk.isActive ? DEACTIVATE_LABEL : ACTIVATE_LABEL;
  return (
    <>
      <Button variant="secondary" disabled title={UNAVAILABLE_CONTROL_REASON}>
        {EDIT_LABEL}
        <span className="desks__visually-hidden"> {UNAVAILABLE_CONTROL_REASON}</span>
      </Button>
      <Button variant="secondary" disabled title={UNAVAILABLE_CONTROL_REASON}>
        {toggleLabel}
        <span className="desks__visually-hidden"> {UNAVAILABLE_CONTROL_REASON}</span>
      </Button>
    </>
  );
}

function BookedAheadCell({ count }: { count: number }) {
  // AC-05: a non-zero count is already words ("3 upcoming") and needs no accessible duplicate.
  // Zero renders as an em dash, which is silent to a screen reader, so only THAT case pairs the
  // hidden dash with visually-hidden words (US-016 design note §7.2).
  if (count === 0) {
    return (
      <>
        <span aria-hidden="true">{bookedAheadLabel(0)}</span>
        <span className="desks__visually-hidden">{bookedAheadAccessibleText(0)}</span>
      </>
    );
  }
  return <span>{bookedAheadLabel(count)}</span>;
}

export function DeskInventoryRow({ desk, layout }: DeskInventoryRowProps) {
  const status = desk.isActive ? 'active' : 'inactive';

  if (layout === 'table') {
    return (
      <tr className="desk-inventory-table__row" data-desk-row={desk.id}>
        <td>{desk.deskNumber}</td>
        <td>
          <StatusChip kind="inventory" status={status} />
        </td>
        <td>
          <BookedAheadCell count={desk.bookedAhead} />
        </td>
        <td className="desk-inventory-table__actions">
          <ActionButtons desk={desk} />
        </td>
      </tr>
    );
  }

  return (
    <li className="desk-inventory-card" data-desk-row={desk.id}>
      <p className="desk-inventory-card__number">{desk.deskNumber}</p>
      <div className="desk-inventory-card__meta">
        <StatusChip kind="inventory" status={status} />
        <BookedAheadCell count={desk.bookedAhead} />
      </div>
      <div className="desk-inventory-card__actions">
        <ActionButtons desk={desk} />
      </div>
    </li>
  );
}

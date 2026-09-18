/**
 * BookingRow — SCR-002's `Booking row` (Figma node `83:5041`), screen-private (design note §0):
 * a design-system row and a shared React component are not the same claim, and US-013's admin
 * list shows a different row (it carries the employee's name) — extraction is that story's call,
 * with two real consumers in front of it.
 *
 * **No `Cancel` control** (`decisions.md` D-05), even though the approved frame shows one on
 * every Upcoming/Today row: cancellation's behaviour is explicitly US-011's, and a button with no
 * handler is a dead control, worse than a screen that has not reached that feature yet.
 *
 * `emphasis` is ST-05's TODAY treatment — a larger desk number (`heading/semibold`, confirmed
 * against the real frame), not a different component.
 */
import type { BookingDisplayStatus, OfficeDate } from '@desk-booking/contracts';
import { StatusChip } from '../../components/status-chip/StatusChip.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import './booking-row.css';

export interface BookingRowProps {
  deskNumber: string;
  date: OfficeDate;
  status: BookingDisplayStatus;
  /** ST-05's TODAY card — a larger desk number, nothing else (design note, this story's plan). */
  emphasis?: boolean;
}

export function BookingRow({ deskNumber, date, status, emphasis = false }: BookingRowProps) {
  return (
    <div className={`booking-row${emphasis ? ' booking-row--emphasis' : ''}`}>
      <span className="booking-row__main">
        <span className="booking-row__desk">Desk {deskNumber}</span>
        <span className="booking-row__separator">·</span>
        <span className="booking-row__date">{formatOfficeDateLabel(date)}</span>
      </span>
      <span className="booking-row__spacer" />
      <StatusChip kind="booking" status={status} />
    </div>
  );
}

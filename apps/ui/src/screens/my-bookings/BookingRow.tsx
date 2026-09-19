/**
 * BookingRow — SCR-002's `Booking row` (Figma node `83:5041`), screen-private (design note §0):
 * a design-system row and a shared React component are not the same claim, and US-013's admin
 * list shows a different row (it carries the employee's name) — extraction is that story's call,
 * with two real consumers in front of it.
 *
 * **`onCancel` (US-011/AC-01, design note §5.4)** replaces the deliberate absence
 * `decisions.md` D-05 recorded: cancellation's behaviour was explicitly deferred to this story.
 * Optional, and rendered iff supplied — `MyBookings` passes it only for the TODAY row and
 * Upcoming rows, by ADR-007's wire invariant (`status === 'confirmed'`), never for Past rows.
 *
 * `emphasis` is ST-05's TODAY treatment — a larger desk number (`heading/semibold`, confirmed
 * against the real frame), not a different component.
 */
import type { BookingDisplayStatus, OfficeDate } from '@desk-booking/contracts';
import { Button } from '../../components/button/Button.js';
import { StatusChip } from '../../components/status-chip/StatusChip.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import './booking-row.css';

export interface BookingRowProps {
  deskNumber: string;
  date: OfficeDate;
  status: BookingDisplayStatus;
  /** ST-05's TODAY card — a larger desk number, nothing else (design note, this story's plan). */
  emphasis?: boolean;
  /** US-011/AC-01. Rendered only when supplied — the screen decides eligibility, this row does
   *  not re-derive it from `date` (design note §5.4, §8.3). */
  onCancel?: () => void;
}

export function BookingRow({ deskNumber, date, status, emphasis = false, onCancel }: BookingRowProps) {
  return (
    <div className={`booking-row${emphasis ? ' booking-row--emphasis' : ''}`}>
      <span className="booking-row__main">
        <span className="booking-row__desk">Desk {deskNumber}</span>
        <span className="booking-row__separator">·</span>
        <span className="booking-row__date">{formatOfficeDateLabel(date)}</span>
      </span>
      <span className="booking-row__spacer" />
      <StatusChip kind="booking" status={status} />
      {onCancel ? (
        <span className="booking-row__cancel">
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </span>
      ) : null}
    </div>
  );
}

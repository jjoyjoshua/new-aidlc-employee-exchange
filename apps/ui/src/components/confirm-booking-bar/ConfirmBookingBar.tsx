/**
 * ConfirmBookingBar — SCR-003's confirm action (ST-07, ST-08).
 *
 * The label names the desk AND the date (US-007/AC-01) — "on a phone the chosen row has often
 * scrolled away by the time the thumb arrives" (the story's own UI commitment), so the button
 * itself must carry the fact the row above it already showed. Bottom-anchored above the bottom
 * bar below 768px, never a floating button covering the last row (`confirm-booking-bar.css`).
 *
 * `busy` (US-007/AC-09, FR-15) is `Button`'s own prop, unchanged: the label stays, a spinner
 * joins it, and the button becomes `disabled` — which is what actually stops a second request,
 * not an `onClick` guard (`Button.tsx`'s own reasoning, reused here rather than re-argued).
 */
import { Button } from '../button/Button.js';
import './confirm-booking-bar.css';

export interface ConfirmBookingBarProps {
  /** `undefined` when no desk is selected — the button stays disabled and reads a generic label.
   *  `| undefined` because `BookADesk` assigns this conditionally (`exactOptionalPropertyTypes`). */
  deskNumber?: string | undefined;
  /** The already-formatted date, e.g. "Wed 9 Sep" (`formatOfficeDateLabel`) — this component
   *  formats nothing itself. */
  dateLabel: string;
  busy?: boolean;
  onConfirm: () => void;
}

export function ConfirmBookingBar({ deskNumber, dateLabel, busy = false, onConfirm }: ConfirmBookingBarProps) {
  const label = deskNumber ? `Book ${deskNumber} for ${dateLabel}` : 'Select a desk to book';

  return (
    <div className="confirm-booking-bar">
      <Button variant="primary" size="lg" block busy={busy} disabled={!deskNumber} onClick={onConfirm}>
        {label}
      </Button>
    </div>
  );
}

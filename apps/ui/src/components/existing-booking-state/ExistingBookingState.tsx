/**
 * ExistingBookingState — SCR-003 ST-10. FR-11: replaces the desk list entirely when the caller
 * already holds a Confirmed booking for the selected date — no desk row, no confirm action, the
 * wasted choice never rendered in the first place.
 *
 * FR-12, AC-07: opens `ConfirmDialog` (D-06's shared primitive) to cancel that one booking; on
 * an `ok` outcome — which `cancel-booking.ts`'s real fetcher already treats a `404` the same as
 * a success (design note §3.4, F-6) — `onCancelled` fires so the caller reloads availability for
 * the same date and the desk list becomes selectable again.
 */
import { useState } from 'react';
import { Button } from '../button/Button.js';
import { ConfirmDialog } from '../confirm-dialog/ConfirmDialog.js';
import type { CancelBookingFetcher } from './cancel-booking.js';
import './existing-booking-state.css';

export interface ExistingBookingStateProps {
  bookingId: string;
  deskNumber: string;
  dateLabel: string;
  cancelBooking: CancelBookingFetcher;
  /** Fires once the booking is gone (cancelled, or already gone) so the caller can reload
   *  availability for the same date (FR-12). */
  onCancelled: () => void;
}

export function ExistingBookingState({
  bookingId,
  deskNumber,
  dateLabel,
  cancelBooking,
  onCancelled,
}: ExistingBookingStateProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirmCancel = async () => {
    setBusy(true);
    const outcome = await cancelBooking(bookingId);
    setBusy(false);

    // `failed` (a transport failure, a genuine 500) leaves the dialog open with nothing further
    // specified by this story — the employee can retry the same confirm action. Only `ok`
    // (cancelled, or already gone) closes the loop.
    if (outcome.kind === 'ok') {
      setDialogOpen(false);
      onCancelled();
    }
  };

  return (
    <section className="existing-booking-state" aria-labelledby="existing-booking-state-heading">
      {/* `tabIndex={-1}` — focusable programmatically only. `BookADesk.tsx` moves focus here
          after the AC-05 race variant's refetch resolves (ST-10's own commitment: "moves focus
          to the explanation rather than the cancel action"). */}
      <h2 id="existing-booking-state-heading" tabIndex={-1}>
        You already have a booking for this date
      </h2>
      <p className="existing-booking-state__detail">
        {deskNumber} for {dateLabel}
      </p>
      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        Cancel this booking
      </Button>

      {dialogOpen ? (
        <ConfirmDialog
          title="Cancel this booking?"
          body={`${deskNumber} for ${dateLabel} will be cancelled. You can book a different desk for this date afterwards.`}
          confirmLabel="Cancel booking"
          busy={busy}
          onConfirm={() => void confirmCancel()}
          onCancel={() => setDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

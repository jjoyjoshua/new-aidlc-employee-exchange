/**
 * Owns the cancel dialog's own state machine for `AllBookings` (US-015, design note §5.2).
 * Mirrors `my-bookings/use-cancel-dialog.ts` almost line for line — the same synchronous
 * `inFlight.current` guard, the same busy/outcome shape, the same `ConfirmDialog` composition —
 * with ONE deliberate divergence: `dismiss()` after `already_cancelled` calls `onAlreadyCancelled`,
 * never a refresh/refetch. Under an active `status=confirmed` filter (US-014), a refetch would
 * make the row vanish — the exact behaviour US-015/AC-04 forbids. `useAllBookings.markCancelled`
 * updates the row in place instead (design note §5.3) — this hook only needs to say WHICH item.
 */
import { useCallback, useRef, useState } from 'react';
import type { AllBookingsListItem } from '@desk-booking/contracts';
import type { CancelBookingFetcher } from '../../lib/cancel-booking.js';

export interface AdminCancelDialogState {
  item: AllBookingsListItem;
  busy: boolean;
  /** `already_cancelled` is ST-10's non-retryable branch (US-015/AC-09) — the dialog collapses to
   *  one "Close" action. `retryable` covers both `refused` (a past-dated booking, AC-02) and
   *  `failed` (a transport failure, AC-08) — the same non-distinction US-011's dialog makes,
   *  since neither has a message of its own approved for this screen (`decisions.md` D-07). */
  outcome?: 'already_cancelled' | 'retryable';
}

export interface UseAdminCancelDialogResult {
  dialog: AdminCancelDialogState | undefined;
  open: (item: AllBookingsListItem) => void;
  confirm: () => void;
  /** "Keep it" / Escape / the header close icon when retryable-or-none; "Close" when
   *  `already_cancelled` — the latter also triggers `onAlreadyCancelled`, never a refresh. */
  dismiss: () => void;
}

export function useAdminCancelDialog(
  cancelBooking: CancelBookingFetcher,
  onCancelled: (item: AllBookingsListItem) => void,
  onAlreadyCancelled: (item: AllBookingsListItem) => void,
): UseAdminCancelDialogResult {
  const [dialog, setDialog] = useState<AdminCancelDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const open = useCallback((item: AllBookingsListItem) => {
    setDialog({ item, busy: false });
  }, []);

  const confirm = useCallback(() => {
    if (inFlight.current || !dialog || dialog.busy) return;
    inFlight.current = true;
    const { item } = dialog;
    setDialog({ item, busy: true });

    void cancelBooking(item.id).then((outcome) => {
      inFlight.current = false;
      if (outcome.kind === 'ok') {
        onCancelled(item);
        setDialog(undefined);
        return;
      }
      setDialog({ item, busy: false, outcome: outcome.kind === 'already_cancelled' ? 'already_cancelled' : 'retryable' });
    });
  }, [dialog, cancelBooking, onCancelled]);

  const dismiss = useCallback(() => {
    if (dialog?.outcome === 'already_cancelled') onAlreadyCancelled(dialog.item);
    setDialog(undefined);
  }, [dialog, onAlreadyCancelled]);

  return { dialog, open, confirm, dismiss };
}

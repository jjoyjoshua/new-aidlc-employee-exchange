/**
 * Owns the cancel dialog's own state machine for `MyBookings` (US-011, design note §5.3, §5.4).
 * Mirrors `book-a-desk/use-book-desk.ts`'s in-flight-ref discipline (AC-07's own reasoning
 * applies here verbatim): `inFlight.current` is checked and set SYNCHRONOUSLY, before any state
 * read, so a second `confirm()` call landing in the same tick as the first is refused
 * regardless of whether React has re-rendered `busy: true` yet — the UI's disabled/busy button
 * is what a person experiences, this ref is what actually makes "one cancellation request
 * exists" true regardless.
 */
import { useCallback, useRef, useState } from 'react';
import type { MyBookingListItem } from '@desk-booking/contracts';
import type { CancelBookingFetcher } from '../../lib/cancel-booking.js';

export interface CancelDialogState {
  item: MyBookingListItem;
  busy: boolean;
  /** `already_cancelled` is ST-09's non-retryable branch (AC-09) — the dialog collapses to one
   *  "Close" action and dismissing it refreshes the list. `retryable` covers both `refused`
   *  (a past-dated booking, AC-02) and `failed` (a transport failure, AC-08): the design note's
   *  own default (open item 1) treats both the same until a PO/Designer call says otherwise. */
  outcome?: 'already_cancelled' | 'retryable';
}

export interface UseCancelDialogResult {
  dialog: CancelDialogState | undefined;
  open: (item: MyBookingListItem) => void;
  confirm: () => void;
  /** "Keep it" / Escape / the header close icon when retryable-or-none; "Close" when
   *  `already_cancelled` — the latter also triggers `onRefresh` (design note §5.3). */
  dismiss: () => void;
}

export function useCancelDialog(
  cancelBooking: CancelBookingFetcher,
  onCancelled: (item: MyBookingListItem) => void,
  onRefresh: () => void,
): UseCancelDialogResult {
  const [dialog, setDialog] = useState<CancelDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const open = useCallback((item: MyBookingListItem) => {
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
    if (dialog?.outcome === 'already_cancelled') onRefresh();
    setDialog(undefined);
  }, [dialog, onRefresh]);

  return { dialog, open, confirm, dismiss };
}

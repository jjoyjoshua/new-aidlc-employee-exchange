/**
 * Owns the add-desk dialog's own state machine for `Desks` (US-017, design note §6.2). Mirrors
 * `all-bookings/use-admin-cancel-dialog.ts`'s shape — the same synchronous `inFlight.current`
 * guard (AC-06's "exactly one desk is created"), the same busy/outcome device — with one addition:
 * `collidedOnCaseOnly`, computed here because the server holds only the normalised value and
 * cannot tell whether a collision was case-only (SCR-007 ST-04's conditional sentence).
 */
import { useCallback, useRef, useState } from 'react';
import { normalizeDeskNumber, type AdminDesk } from '@desk-booking/contracts';
import type { AddDeskFetcher } from '../../lib/add-desk.js';

export interface AddDeskDialogState {
  busy: boolean;
  /** `duplicate` is ST-04 (a warning Alert with a Title, ABOVE the field); `failed` is ST-07 (a
   *  danger Alert, and the confirm action's label becomes "Try again"). Two renderings, because
   *  AC-04 and AC-07 are two ACs — collapsing them is the likeliest slip. */
  outcome?: 'duplicate' | 'failed';
  /** ST-04's case sentence appears ONLY when case caused the collision (SCR-007's own condition:
   *  "only when the collision was case-insensitive rather than exact, because otherwise it
   *  explains something that did not happen"). */
  collidedOnCaseOnly: boolean;
}

export interface UseAddDeskDialogResult {
  dialog: AddDeskDialogState | undefined;
  open: () => void;
  submit: (raw: string) => void;
  dismiss: () => void;
}

export function useAddDeskDialog(addDesk: AddDeskFetcher, onAdded: (desk: AdminDesk) => void): UseAddDeskDialogResult {
  const [dialog, setDialog] = useState<AddDeskDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const open = useCallback(() => {
    setDialog({ busy: false, collidedOnCaseOnly: false });
  }, []);

  const submit = useCallback(
    (raw: string) => {
      if (inFlight.current || !dialog || dialog.busy) return;
      inFlight.current = true;
      setDialog({ busy: true, collidedOnCaseOnly: false });

      void addDesk(raw).then((outcome) => {
        inFlight.current = false;
        if (outcome.kind === 'ok') {
          onAdded(outcome.desk);
          setDialog(undefined);
          return;
        }
        const collidedOnCaseOnly = outcome.kind === 'duplicate' && raw.trim() !== normalizeDeskNumber(raw);
        setDialog({ busy: false, outcome: outcome.kind, collidedOnCaseOnly });
      });
    },
    [dialog, addDesk, onAdded],
  );

  const dismiss = useCallback(() => {
    setDialog(undefined);
  }, []);

  return { dialog, open, submit, dismiss };
}

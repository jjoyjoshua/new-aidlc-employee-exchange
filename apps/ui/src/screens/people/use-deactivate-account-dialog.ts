/**
 * Owns the row-menu deactivate dialog's own state machine (SCR-008 ST-05, ST-06, ST-07, ST-12–
 * ST-14). Mirrors `use-role-change-dialog.ts` almost line for line — the same synchronous
 * `inFlight.current` guard, the same busy/outcome shape, the same "one mounted dialog, outcome
 * switches its body" composition — extended with one phase that story has no equivalent of:
 * `open()` must fetch AC-05's preview BEFORE either confirmation body can be chosen, because
 * which of ST-05/ST-06 is correct depends on whether the account holds any upcoming bookings.
 */
import { useCallback, useRef, useState } from 'react';
import type { AdminUser } from '@desk-booking/contracts';
import type { DeactivateAccountFetcher, DeactivationPreviewBooking, DeactivationPreviewFetcher } from '../../lib/deactivate-account.js';

export interface DeactivateAccountDialogState {
  account: AdminUser;
  /** `loading`: the preview fetch is in flight, before either confirmation body can be chosen.
   *  `ready`: the preview resolved (or failed) and the dialog can render its final body. */
  phase: 'loading' | 'ready';
  bookings: DeactivationPreviewBooking[];
  busy: boolean;
  /** `preview_failed`: AC-05's preview could not be read, so neither ST-05 nor ST-06 can be shown
   *  honestly — nothing is known about upcoming bookings. `blocked` is ST-07 (BR-001.11's hard
   *  block, US-025/AC-10); `failed` is ST-13 (US-025/AC-11) — two renderings, because the block
   *  offers a route to the fix and the failure offers a retry. */
  outcome?: 'preview_failed' | 'blocked' | 'failed';
}

export interface UseDeactivateAccountDialogResult {
  dialog: DeactivateAccountDialogState | undefined;
  open: (account: AdminUser) => void;
  confirm: () => void;
  dismiss: () => void;
  /** ST-07's primary action — dismisses this dialog and focuses the People search field
   *  (US-025/AC-10, mirroring `use-role-change-dialog.ts`'s own `routeToPromote`). */
  routeToPromote: () => void;
}

export function useDeactivateAccountDialog(
  previewDeactivation: DeactivationPreviewFetcher,
  deactivateAccount: DeactivateAccountFetcher,
  onDeactivated: (account: AdminUser) => void,
  onRouteToPromote: () => void,
): UseDeactivateAccountDialogResult {
  const [dialog, setDialog] = useState<DeactivateAccountDialogState | undefined>(undefined);
  const inFlight = useRef(false);
  // Guards against a stale preview response landing after the dialog was dismissed and a
  // DIFFERENT account's dialog opened — `use-role-change-dialog.ts` has no equivalent because
  // that dialog's `open()` does no async work at all.
  const openToken = useRef(0);

  const open = useCallback(
    (account: AdminUser) => {
      const token = (openToken.current += 1);
      setDialog({ account, phase: 'loading', bookings: [], busy: false });

      const controller = new AbortController();
      void previewDeactivation(account.id, controller.signal).then((outcome) => {
        if (openToken.current !== token) return; // superseded by a dismiss + a new open()
        if (outcome.kind === 'failed') {
          setDialog({ account, phase: 'ready', bookings: [], busy: false, outcome: 'preview_failed' });
          return;
        }
        setDialog({ account, phase: 'ready', bookings: outcome.bookings, busy: false });
      });
    },
    [previewDeactivation],
  );

  const confirm = useCallback(() => {
    if (inFlight.current || !dialog || dialog.busy || dialog.phase !== 'ready') return;
    inFlight.current = true;
    const { account, bookings } = dialog;
    setDialog({ account, phase: 'ready', bookings, busy: true });

    void deactivateAccount(account.id).then((outcome) => {
      inFlight.current = false;
      if (outcome.kind === 'ok') {
        onDeactivated(outcome.account);
        setDialog(undefined);
        return;
      }
      setDialog({ account, phase: 'ready', bookings, busy: false, outcome: outcome.kind });
    });
  }, [dialog, deactivateAccount, onDeactivated]);

  const dismiss = useCallback(() => {
    openToken.current += 1; // invalidate any in-flight preview for the dialog being closed
    setDialog(undefined);
  }, []);

  const routeToPromote = useCallback(() => {
    openToken.current += 1;
    setDialog(undefined);
    // Deferred past this tick, deliberately — `use-role-change-dialog.ts`'s own reason:
    // `Dialog`'s unmount effect restores focus to the row's overflow trigger a moment later;
    // `setTimeout(..., 0)` runs after that commit, so the search field ends up focused instead.
    setTimeout(onRouteToPromote, 0);
  }, [onRouteToPromote]);

  return { dialog, open, confirm, dismiss, routeToPromote };
}

/**
 * Owns the row-menu reset-password dialog's own state machine (SCR-008 ST-10–ST-13). One mounted
 * `Dialog` switches its own body between two phases rather than unmounting and remounting a
 * different component per state — `DeactivateAccountDialog`'s own reason applies unchanged:
 * `Dialog` refocuses the opener on unmount, so switching components would unmount/remount and
 * bounce focus mid-flow.
 *
 * `confirm` phase mirrors `RoleChangeDialogState`'s shape (`busy`, `outcome?: 'failed'`) almost
 * exactly — the same synchronous `inFlight.current` guard, the same busy/outcome switch. `result`
 * phase is new: once the server has generated and set the password, this hook never asks for it
 * again and never re-derives it — `password` is set once, by `confirm()`'s own success branch,
 * and cleared for good by `dismiss()` (US-027/AC-05).
 */
import { useCallback, useRef, useState } from 'react';
import type { AdminUser } from '@desk-booking/contracts';
import type { ResetPasswordFetcher } from '../../lib/reset-password.js';

export type ResetPasswordDialogState =
  | { phase: 'confirm'; account: AdminUser; busy: boolean; outcome?: 'failed' }
  | { phase: 'result'; account: AdminUser; password: string };

export interface UseResetPasswordDialogResult {
  dialog: ResetPasswordDialogState | undefined;
  open: (account: AdminUser) => void;
  confirm: () => void;
  dismiss: () => void;
}

export function useResetPasswordDialog(resetPassword: ResetPasswordFetcher): UseResetPasswordDialogResult {
  const [dialog, setDialog] = useState<ResetPasswordDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const open = useCallback((account: AdminUser) => {
    setDialog({ phase: 'confirm', account, busy: false });
  }, []);

  const confirm = useCallback(() => {
    if (inFlight.current || !dialog || dialog.phase !== 'confirm' || dialog.busy) return;
    inFlight.current = true;
    const { account } = dialog;
    setDialog({ phase: 'confirm', account, busy: true });

    void resetPassword(account.id).then((outcome) => {
      inFlight.current = false;
      if (outcome.kind === 'ok') {
        // Stays mounted — the SAME Dialog switches from ST-10's confirm body to ST-11's result
        // body. Never a second `open()`, never an unmount in between.
        setDialog({ phase: 'result', account: outcome.account, password: outcome.password });
        return;
      }
      setDialog({ phase: 'confirm', account, busy: false, outcome: 'failed' });
    });
  }, [dialog, resetPassword]);

  const dismiss = useCallback(() => {
    // Clears the password from this hook's own state along with everything else (US-027/AC-05) —
    // there is no second place it is held, so this is the whole of "cannot be shown again."
    setDialog(undefined);
  }, []);

  return { dialog, open, confirm, dismiss };
}

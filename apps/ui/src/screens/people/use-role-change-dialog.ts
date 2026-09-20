/**
 * Owns the row-menu role-change dialog's own state machine (SCR-008 ST-08, ST-09, ST-12–ST-14).
 * Mirrors `use-admin-cancel-dialog.ts` almost line for line — the same synchronous `inFlight.current`
 * guard, the same busy/outcome shape, the same "one mounted dialog, outcome switches its body"
 * composition `DeskDeactivateDialog` uses for its own two-outcome shape.
 *
 * `open()` computes `targetRole` as the OPPOSITE of the account's current role — `role` is
 * binary (`UserRole`), so there is no third state to choose between (US-024/AC-01).
 */
import { useCallback, useRef, useState } from 'react';
import type { AdminUser, UserRole } from '@desk-booking/contracts';
import type { ChangeRoleFetcher } from '../../lib/change-role.js';

export interface RoleChangeDialogState {
  account: AdminUser;
  targetRole: UserRole;
  busy: boolean;
  /** `blocked` is ST-09 (BR-001.11's refusal, US-024/AC-04); `failed` is ST-13 (US-024/AC-10) —
   *  two renderings, because the block offers a route to the fix and the failure offers a retry. */
  outcome?: 'blocked' | 'failed';
}

export interface UseRoleChangeDialogResult {
  dialog: RoleChangeDialogState | undefined;
  open: (account: AdminUser) => void;
  confirm: () => void;
  dismiss: () => void;
  /** ST-09's primary action — dismisses the dialog AND routes to the fix (US-024/AC-05). */
  routeToPromote: () => void;
}

export function useRoleChangeDialog(
  changeRole: ChangeRoleFetcher,
  onChanged: (account: AdminUser) => void,
  onRouteToPromote: () => void,
): UseRoleChangeDialogResult {
  const [dialog, setDialog] = useState<RoleChangeDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const open = useCallback((account: AdminUser) => {
    const targetRole: UserRole = account.role === 'admin' ? 'employee' : 'admin';
    setDialog({ account, targetRole, busy: false });
  }, []);

  const confirm = useCallback(() => {
    if (inFlight.current || !dialog || dialog.busy) return;
    inFlight.current = true;
    const { account, targetRole } = dialog;
    setDialog({ account, targetRole, busy: true });

    void changeRole(account.id, targetRole).then((outcome) => {
      inFlight.current = false;
      if (outcome.kind === 'ok') {
        onChanged(outcome.account);
        setDialog(undefined);
        return;
      }
      setDialog({ account, targetRole, busy: false, outcome: outcome.kind });
    });
  }, [dialog, changeRole, onChanged]);

  const dismiss = useCallback(() => {
    setDialog(undefined);
  }, []);

  const routeToPromote = useCallback(() => {
    setDialog(undefined);
    // Deferred past this tick, deliberately: `Dialog`'s own unmount effect restores focus to
    // whatever had it before the dialog opened (the row's overflow trigger) — synchronously
    // here would only be overridden a moment later when React commits the unmount and that
    // effect's cleanup runs. `setTimeout(..., 0)` runs after that commit, so the search field
    // is what ends up focused, matching ST-09's "focuses the search field ready for a name."
    setTimeout(onRouteToPromote, 0);
  }, [onRouteToPromote]);

  return { dialog, open, confirm, dismiss, routeToPromote };
}

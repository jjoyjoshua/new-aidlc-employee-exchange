/**
 * RoleChangeDialog — SCR-008 ST-08, ST-09, ST-12, ST-13 (US-024), from one mounted `Dialog` that
 * switches its own body, footer and header icon on the outcome — `DeskDeactivateDialog.tsx`'s own
 * shape and its own stated reason: `Dialog` refocuses the opener on unmount, so rendering a
 * different component per outcome would unmount/remount and bounce focus out to the row and back.
 *
 * Screen-private (`screens/people/`), the same distinction `DeskDeactivateDialog`/`UserFormDialog`
 * each draw for themselves.
 */
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Dialog } from '../../components/dialog/Dialog.js';
import type { AdminUser, UserRole } from '@desk-booking/contracts';
import {
  CHANGE_ROLE_LABEL,
  CLOSE_LABEL,
  KEEP_AS_IS_LABEL,
  LAST_ACTIVE_ADMIN_REFUSAL_BODY,
  lastActiveAdminRefusalTitle,
  MAKE_SOMEONE_ADMIN_LABEL,
  roleChangeConfirmBody,
  roleChangeConfirmTitle,
  roleChangeFailedAlert,
  TRY_AGAIN_LABEL,
} from './copy.js';

export interface RoleChangeDialogState {
  account: AdminUser;
  targetRole: UserRole;
  busy: boolean;
  /** `blocked` is ST-09 (BR-001.11's hard block, US-024/AC-04); `failed` is ST-13 (US-024/AC-10) —
   *  two renderings, because the block offers a route to the fix and the failure offers a retry. */
  outcome?: 'blocked' | 'failed';
}

export interface RoleChangeDialogProps {
  dialog: RoleChangeDialogState;
  onConfirm: () => void;
  onDismiss: () => void;
  /** ST-09's primary action (US-024/AC-05) — dismisses this dialog and focuses the People search
   *  field, so promoting somebody is one click and one keystroke away, never a second dialog. */
  onRouteToPromote: () => void;
}

/** SCR-008 ST-09's warning triangle, the same mark `DeskDeactivateDialog.tsx`'s own `WarningIcon`
 *  draws for its own last-resource refusal — one glyph, not a second asset for the same meaning. */
function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2.2 18.4 17.3H1.6Z" strokeLinejoin="round" />
      <path d="M10 7.6v4" strokeLinecap="round" />
      <path d="M10 14.6v.2" strokeLinecap="round" />
    </svg>
  );
}

export function RoleChangeDialog({ dialog, onConfirm, onDismiss, onRouteToPromote }: RoleChangeDialogProps) {
  const { account, targetRole, busy, outcome } = dialog;

  if (outcome === 'blocked') {
    return (
      <Dialog title={lastActiveAdminRefusalTitle(account.fullName)} role="alertdialog" icon={<WarningIcon />} onDismiss={onDismiss}
        footer={
          <>
            <Button variant="secondary" onClick={onDismiss}>
              {CLOSE_LABEL}
            </Button>
            {/* No override, no "I understand the risk" — BR-001.11 is a rejection, not a warning
                (US-024/AC-06). This is the ONLY action besides dismissal. */}
            <Button variant="primary" onClick={onRouteToPromote}>
              {MAKE_SOMEONE_ADMIN_LABEL}
            </Button>
          </>
        }
      >
        <p>{LAST_ACTIVE_ADMIN_REFUSAL_BODY}</p>
      </Dialog>
    );
  }

  const failed = outcome === 'failed';

  return (
    <Dialog
      title={roleChangeConfirmTitle(account.fullName, targetRole)}
      role="alertdialog"
      busy={busy}
      onDismiss={onDismiss}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss} disabled={busy}>
            {failed ? CLOSE_LABEL : KEEP_AS_IS_LABEL}
          </Button>
          <Button variant="primary" onClick={onConfirm} busy={busy}>
            {failed ? TRY_AGAIN_LABEL : CHANGE_ROLE_LABEL}
          </Button>
        </>
      }
    >
      <p>{roleChangeConfirmBody(targetRole)}</p>
      {failed ? (
        <Alert tone="danger" live="assertive">
          {roleChangeFailedAlert(account.fullName)}
        </Alert>
      ) : null}
    </Dialog>
  );
}

/**
 * DeactivateAccountDialog — SCR-008 ST-05, ST-06, ST-07, ST-12, ST-13 (US-025), one mounted
 * `Dialog` switching its own body, footer and header icon on `phase`/`outcome` —
 * `RoleChangeDialog.tsx`/`DeskDeactivateDialog.tsx`'s own shape and its own stated reason:
 * `Dialog` refocuses the opener on unmount, so rendering a different component per state would
 * unmount/remount and bounce focus out to the row and back.
 *
 * Screen-private (`screens/people/`), the same distinction every dialog in this folder draws.
 */
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Dialog } from '../../components/dialog/Dialog.js';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import {
  CLOSE_LABEL,
  DEACTIVATE_CONFIRM_BODY_NO_BOOKINGS,
  DEACTIVATE_LABEL,
  DEACTIVATE_LAST_ACTIVE_ADMIN_REFUSAL_BODY,
  deactivateAndCancelLabel,
  deactivateBookingListItem,
  deactivateConfirmBodyWithBookings,
  deactivateConfirmTitle,
  deactivateFailedAlert,
  KEEP_ACTIVE_LABEL,
  lastActiveAdminRefusalTitle,
  MAKE_SOMEONE_ADMIN_LABEL,
  TRY_AGAIN_LABEL,
} from './copy.js';
import type { DeactivateAccountDialogState } from './use-deactivate-account-dialog.js';

export interface DeactivateAccountDialogProps {
  dialog: DeactivateAccountDialogState;
  onConfirm: () => void;
  onDismiss: () => void;
  /** ST-07's primary action (US-025/AC-10) — dismisses this dialog and focuses the People search
   *  field, so promoting somebody is one click and one keystroke away, never a second dialog. */
  onRouteToPromote: () => void;
}

/** SCR-008 ST-07's warning triangle — the identical mark `RoleChangeDialog.tsx`/
 *  `DeskDeactivateDialog.tsx` draw for their own last-resource refusal, one glyph for one meaning. */
function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2.2 18.4 17.3H1.6Z" strokeLinejoin="round" />
      <path d="M10 7.6v4" strokeLinecap="round" />
      <path d="M10 14.6v.2" strokeLinecap="round" />
    </svg>
  );
}

export function DeactivateAccountDialog({ dialog, onConfirm, onDismiss, onRouteToPromote }: DeactivateAccountDialogProps) {
  const { account, phase, bookings, busy, outcome } = dialog;

  if (outcome === 'blocked') {
    return (
      <Dialog title={lastActiveAdminRefusalTitle(account.fullName)} role="alertdialog" icon={<WarningIcon />} onDismiss={onDismiss}
        footer={
          <>
            <Button variant="secondary" onClick={onDismiss}>
              {CLOSE_LABEL}
            </Button>
            {/* No override, no "I understand the risk" — BR-001.11 is a rejection, not a warning
                (US-025/AC-10). This is the ONLY action besides dismissal. */}
            <Button variant="primary" onClick={onRouteToPromote}>
              {MAKE_SOMEONE_ADMIN_LABEL}
            </Button>
          </>
        }
      >
        <p>{DEACTIVATE_LAST_ACTIVE_ADMIN_REFUSAL_BODY}</p>
      </Dialog>
    );
  }

  if (outcome === 'preview_failed') {
    return (
      <Dialog title={deactivateConfirmTitle(account.fullName)} role="alertdialog" onDismiss={onDismiss}
        footer={
          <Button variant="secondary" onClick={onDismiss}>
            {CLOSE_LABEL}
          </Button>
        }
      >
        {/* Nothing is known about this account's upcoming bookings, so neither ST-05 nor ST-06 can
            be shown honestly — this dialog offers no confirming action at all rather than guess. */}
        <Alert tone="danger" live="assertive">
          {deactivateFailedAlert(account.fullName)}
        </Alert>
      </Dialog>
    );
  }

  const failed = outcome === 'failed';
  const loading = phase === 'loading';
  const hasBookings = bookings.length > 0;

  return (
    <Dialog
      title={deactivateConfirmTitle(account.fullName)}
      role="alertdialog"
      busy={busy || loading}
      onDismiss={onDismiss}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss} disabled={busy || loading}>
            {failed ? CLOSE_LABEL : KEEP_ACTIVE_LABEL}
          </Button>
          <Button variant="danger" onClick={onConfirm} busy={busy} disabled={loading}>
            {failed ? TRY_AGAIN_LABEL : hasBookings ? deactivateAndCancelLabel(bookings.length) : DEACTIVATE_LABEL}
          </Button>
        </>
      }
    >
      {loading ? (
        <p aria-live="polite">Checking their upcoming bookings…</p>
      ) : (
        <p>
          {hasBookings
            ? deactivateConfirmBodyWithBookings(
                account.fullName,
                bookings.map((b) => deactivateBookingListItem(b.deskNumber, formatOfficeDateLabel(b.date))),
              )
            : DEACTIVATE_CONFIRM_BODY_NO_BOOKINGS}
        </p>
      )}
      {failed ? (
        <Alert tone="danger" live="assertive">
          {deactivateFailedAlert(account.fullName)}
        </Alert>
      ) : null}
    </Dialog>
  );
}

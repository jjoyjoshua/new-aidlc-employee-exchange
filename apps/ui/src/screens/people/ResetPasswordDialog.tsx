/**
 * ResetPasswordDialog — SCR-008 ST-10 (confirm), ST-12 (busy, shared shape), ST-13 (failed,
 * shared shape), ST-11 (result). One mounted `Dialog` switches its own body across the confirm
 * and result phases — `RoleChangeDialog.tsx`/`DeactivateAccountDialog.tsx`'s own reason applies
 * unchanged: `Dialog` refocuses the opener on unmount, so a component swap per phase would
 * unmount/remount and bounce focus mid-flow.
 *
 * Screen-private (`screens/people/`), the same distinction every other row-action dialog here
 * draws for itself.
 */
import { useRef, useState } from 'react';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Dialog } from '../../components/dialog/Dialog.js';
import type { ResetPasswordDialogState } from './use-reset-password-dialog.js';
import {
  CANCEL_LABEL,
  CLOSE_LABEL,
  COPIED_LABEL,
  COPY_LABEL,
  DONE_LABEL,
  RESET_PASSWORD_CONFIRM_BODY,
  RESET_PASSWORD_CONFIRM_LABEL,
  resetPasswordConfirmTitle,
  resetPasswordFailedAlert,
  resetPasswordResultBody,
  resetPasswordResultTitle,
  TRY_AGAIN_LABEL,
} from './copy.js';
import './people.css';

export interface ResetPasswordDialogProps {
  dialog: ResetPasswordDialogState;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ResetPasswordDialog({ dialog, onConfirm, onDismiss }: ResetPasswordDialogProps) {
  // Declared unconditionally (Rules of Hooks) even though only the result phase's JSX below uses
  // them — the confirm phase simply never reads them.
  const [copied, setCopied] = useState(false);
  const passwordFieldRef = useRef<HTMLInputElement>(null);

  if (dialog.phase === 'result') {
    const { account, password } = dialog;

    const handleCopy = async () => {
      await navigator.clipboard.writeText(password);
      // Confirms IN PLACE (SCR-008-people.md:227) — the button's own label changes, not a toast,
      // and the visually-hidden live region below announces the same word for a screen reader.
      setCopied(true);
    };

    return (
      <Dialog
        title={resetPasswordResultTitle(account.fullName)}
        role="alertdialog"
        // US-027/AC-04. No ✕, Escape does nothing (Dialog.tsx's own dismissible prop) — only
        // Done, below, ever calls onDismiss for this phase.
        dismissible={false}
        // US-027/AC-03. A screen-reader user hears the credential before the instructions
        // (SCR-008-people.md:225) — the field, not the dialog shell, gets initial focus.
        initialFocusRef={passwordFieldRef}
        onDismiss={onDismiss}
        footer={
          <Button variant="primary" onClick={onDismiss}>
            {DONE_LABEL}
          </Button>
        }
      >
        <p>{resetPasswordResultBody(account.fullName)}</p>
        <div className="reset-password__credential">
          <input
            ref={passwordFieldRef}
            className="reset-password__credential-value"
            type="text"
            readOnly
            value={password}
            aria-label={resetPasswordResultTitle(account.fullName)}
          />
          <Button variant="secondary" onClick={() => void handleCopy()}>
            {copied ? COPIED_LABEL : COPY_LABEL}
          </Button>
        </div>
        <p aria-live="polite" className="people__visually-hidden">
          {copied ? COPIED_LABEL : ''}
        </p>
      </Dialog>
    );
  }

  const { account, busy, outcome } = dialog;
  const failed = outcome === 'failed';

  return (
    <Dialog
      title={resetPasswordConfirmTitle(account.fullName)}
      role="alertdialog"
      busy={busy}
      onDismiss={onDismiss}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss} disabled={busy}>
            {failed ? CLOSE_LABEL : CANCEL_LABEL}
          </Button>
          <Button variant="primary" onClick={onConfirm} busy={busy}>
            {failed ? TRY_AGAIN_LABEL : RESET_PASSWORD_CONFIRM_LABEL}
          </Button>
        </>
      }
    >
      <p>{RESET_PASSWORD_CONFIRM_BODY}</p>
      {failed ? (
        <Alert tone="danger" live="assertive">
          {resetPasswordFailedAlert(account.fullName)}
        </Alert>
      ) : null}
    </Dialog>
  );
}

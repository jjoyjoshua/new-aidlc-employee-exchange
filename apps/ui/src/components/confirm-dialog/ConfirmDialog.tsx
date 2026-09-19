/**
 * ConfirmDialog — the cancel confirmation dialog SCR-002 ST-07 and SCR-003 ST-10 both name
 * ("reused from SCR-002 ST-07"). D-06: built here as a generic, `bookings`-free primitive
 * (title/body/confirm/cancel) rather than inlined into `existing-booking-state`, because no
 * dialog/modal component existed anywhere in `apps/ui/src/components` before this story — US-011
 * needs the identical dialog for its own cancel flow and extends this one rather than
 * reconciling two copies later.
 *
 * US-017 (design note §5.2) pulled the shared chrome — scrim, focus trap, focus restore, the
 * mobile-first sheet/card treatment, the header and its close icon — into `components/dialog/Dialog`,
 * because SCR-007's own form needs that same chrome under `role="dialog"` with a non-destructive
 * confirm action, which this component's original hardcoded `role="alertdialog"` and `danger`
 * button could not give it. This file now composes `Dialog`, unchanged in every behaviour this
 * component's own tests assert.
 *
 * The confirm action uses `Button`'s `danger` variant, the solid destructive fill added
 * 2026-09-08 in the design file.
 */
import type { ReactNode } from 'react';
import { Button } from '../button/Button.js';
import { Alert } from '../alert/Alert.js';
import { Dialog } from '../dialog/Dialog.js';

export interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Defaults to "Cancel" — every caller so far wants exactly that word for the non-destructive
   *  action, and a generic component should not invent copy a caller never asked to override. */
  cancelLabel?: string;
  /** SCR-002 ST-09 — an error region INSIDE the dialog, which stays open (US-011/AC-08). Rendered
   *  through `Alert`, announced when it appears. */
  error?: ReactNode;
  /** ST-09's non-retryable branch: the footer collapses to the one dismissal action
   *  (`cancelLabel`, e.g. "Close"), and the destructive confirm action is not rendered — nothing
   *  is left worth confirming (US-011/AC-09). */
  singleAction?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  error,
  singleAction = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      role="alertdialog"
      busy={busy}
      onDismiss={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          {singleAction ? null : (
            <Button variant="danger" onClick={onConfirm} busy={busy}>
              {confirmLabel}
            </Button>
          )}
        </>
      }
    >
      {body}
      {error ? (
        <Alert tone="danger" live="assertive">
          {error}
        </Alert>
      ) : null}
    </Dialog>
  );
}

/**
 * ConfirmDialog — the cancel confirmation dialog SCR-002 ST-07 and SCR-003 ST-10 both name
 * ("reused from SCR-002 ST-07"). D-06: built here as a generic, `bookings`-free primitive
 * (title/body/confirm/cancel) rather than inlined into `existing-booking-state`, because no
 * dialog/modal component existed anywhere in `apps/ui/src/components` before this story — US-011
 * needs the identical dialog for its own cancel flow and extends this one rather than
 * reconciling two copies later.
 *
 * Escape dismisses (calls `onCancel`, never `onConfirm`) — the story's own commitment for this
 * state. The confirm action uses `Button`'s new `danger` variant, the solid destructive fill
 * added 2026-09-08 in the design file.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../button/Button.js';
import './confirm-dialog.css';

export interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Defaults to "Cancel" — every caller so far wants exactly that word for the non-destructive
   *  action, and a generic component should not invent copy a caller never asked to override. */
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus moves into the dialog on mount — a person using a screen reader or the keyboard must
  // not be left focused on a row that is about to sit behind an overlay.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-dialog__overlay">
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        <div className="confirm-dialog__body">{body}</div>
        <div className="confirm-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

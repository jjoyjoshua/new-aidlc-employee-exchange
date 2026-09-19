/**
 * ConfirmDialog — the cancel confirmation dialog SCR-002 ST-07 and SCR-003 ST-10 both name
 * ("reused from SCR-002 ST-07"). D-06: built here as a generic, `bookings`-free primitive
 * (title/body/confirm/cancel) rather than inlined into `existing-booking-state`, because no
 * dialog/modal component existed anywhere in `apps/ui/src/components` before this story — US-011
 * needs the identical dialog for its own cancel flow and extends this one rather than
 * reconciling two copies later.
 *
 * US-011 (design note §5.1) brings this component up to its own approved Figma master component
 * (`Dialog`, node `34:122`), which this file never fully matched: a header close (✕) icon, a
 * focus trap with focus restored to the triggering element on unmount, an Escape handler that is
 * suppressed while `busy` (previously unconditional — a live defect, SCR-002 ST-08's own
 * requirement), and two additive props (`error`, `singleAction`) for ST-09's non-retryable
 * branch. None of this changes the existing caller's (`ExistingBookingState`) behaviour — it is
 * a pure improvement toward the component's own approved design.
 *
 * The confirm action uses `Button`'s `danger` variant, the solid destructive fill added
 * 2026-09-08 in the design file.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../button/Button.js';
import { Alert } from '../alert/Alert.js';
import closeIconMarkup from '../../assets/icon-close.svg?raw';
import './confirm-dialog.css';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  // The element that had focus before this dialog opened (US-011/AC-03) — captured once, on
  // mount, before focus moves into the dialog below.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // US-011/AC-07, SCR-002 ST-08 — "Escape is suppressed while in flight". Previously
      // unconditional: a live defect, since it let Escape dismiss a dialog whose request was
      // still in flight, contradicting AC-07's "the dialog stays open" (design note §5.1b).
      if (event.key === 'Escape') {
        if (!busy) onCancel();
        return;
      }

      // A focus trap, so Tab never leaves the dialog while it is open (SCR-002 ST-07 — "Focus is
      // trapped in the dialog"). Only acts on Tab; every other key passes through untouched.
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last?.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

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
        <div className="confirm-dialog__header">
          <h2 id="confirm-dialog-title" className="confirm-dialog__title">
            {title}
          </h2>
          {/* Figma `Icon / close` (node 11:50) — "Dismiss a dialog", the same icon and asset
              `StatusChip` already uses for the Cancelled booking variant. Calls the same
              `onCancel` as "Keep it" / Escape — not a new prop, not a third dismissal path. */}
          <button
            type="button"
            className="confirm-dialog__close"
            aria-label="Dismiss"
            onClick={onCancel}
            disabled={busy}
          >
            <span className="confirm-dialog__close-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: closeIconMarkup }} />
          </button>
        </div>
        <div className="confirm-dialog__body">
          {body}
          {error ? (
            <Alert tone="danger" live="assertive">
              {error}
            </Alert>
          ) : null}
        </div>
        <div className="confirm-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          {singleAction ? null : (
            <Button variant="danger" onClick={onConfirm} busy={busy}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

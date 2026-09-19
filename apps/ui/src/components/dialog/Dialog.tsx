/**
 * Dialog — the shared shell every popup in this file composes (US-017 design note §5.2). Extracted
 * from `ConfirmDialog`, which held this behaviour first (D-06) but hardcoded `role="alertdialog"`
 * and a `danger` confirm action — assumptions that fit a confirmation, not a form. `ConfirmDialog`
 * now composes this component; its own tests are unedited and green, which is the proof the
 * extraction changed nothing about its behaviour.
 *
 * Figma's own `Desk form popup` (SCR-007) names the shared pieces this pulls out: "built on the
 * shared Dialog header (76px) and Dialog footer so the chrome cannot drift."
 *
 * Owns: the scrim overlay, the mobile-first bottom-sheet/centred-card treatment, the header (title
 * + close icon), the focus trap, focus capture/restore, and Escape-suppressed-while-busy. Does NOT
 * own: what the footer's buttons are, or what the body contains — those are the caller's, exactly
 * as `Desk form popup`'s own two component sets (one shared chrome) are.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import closeIconMarkup from '../../assets/icon-close.svg?raw';
import './dialog.css';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: string;
  /** `alertdialog` for a confirmation (`ConfirmDialog`'s own use, asserted by its own spec);
   *  `dialog` for a form (SCR-007). Defaults to `dialog` — the safer default for a new caller. */
  role?: 'dialog' | 'alertdialog';
  /** SCR-006 ST-06 (US-019/AC-04) — rendered before the title in the header, `aria-hidden`.
   *  NFR-008's non-colour signal for a dialog that carries a refusal rather than a question.
   *  Caller-owned, exactly as `footer` is: a `tone` prop would start this shell growing a second
   *  component's vocabulary. Omitted renders exactly as before this prop existed. */
  icon?: ReactNode;
  children: ReactNode;
  /** The footer's contents, right-aligned above the border rule. Each caller owns its own
   *  buttons — the labels, variants and order are caller-specific, and a `confirmLabel` prop is
   *  what would make this shell start growing a second component's vocabulary. */
  footer: ReactNode;
  /** Escape and the close icon are suppressed while true. */
  busy?: boolean;
  /** Focused on open. Omitted -> the dialog itself, `ConfirmDialog`'s existing behaviour. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}

export function Dialog({ title, role = 'dialog', icon, children, footer, busy = false, initialFocusRef, onDismiss }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The element that had focus before this dialog opened — captured once, on mount, before focus
  // moves into the dialog below.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? dialogRef.current)?.focus();

    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busy) onDismiss();
        return;
      }

      // A focus trap, so Tab never leaves the dialog while it is open.
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
  }, [busy, onDismiss]);

  return (
    <div className="dialog__overlay">
      <div ref={dialogRef} className="dialog" role={role} aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="dialog__header">
          {icon ? (
            <span className="dialog__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          {/* Figma `Icon / close` (node 11:50) — "Dismiss a dialog". */}
          <button
            type="button"
            className="dialog__close"
            aria-label="Dismiss"
            onClick={onDismiss}
            disabled={busy}
          >
            <span className="dialog__close-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: closeIconMarkup }} />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        <div className="dialog__footer">{footer}</div>
      </div>
    </div>
  );
}

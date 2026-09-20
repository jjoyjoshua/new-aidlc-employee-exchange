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
 *
 * **US-020 evaluated a `scrim?: boolean` prop here, for SCR-008 ST-15's row-overflow menu, and
 * declined it (design note §5.1, §5.2, §8.2 item 1).** An anchored, non-modal menu is a different
 * widget from this one, on six counts at once, not just the scrim: `role="menu"` with `menuitem`
 * children rather than `role="dialog"`/`"alertdialog"`; no `aria-modal` (a popover hanging off its
 * trigger is not modal, at any width); no focus trap (arrow keys move between items, Tab is free
 * to leave); no required `title`/header/close icon (the ≥768px popover has none); no required
 * `footer` (a menu has no footer at all); and it is anchored to its trigger, never centred or
 * bottom-sheeted by this component's own layout rules. `scrim`, `anchor` and `modal` props are
 * refused BY DESIGN here, not overlooked — `AccountRowMenu` (`screens/people/`) was built beside
 * this component rather than through it. If a second screen ever needs a menu, extracting a
 * shared one is that story's call (`components/README.md:6`'s two-real-consumers bar), not a prop
 * added to `Dialog`.
 *
 * **US-027 admits `dismissible`, the first prop since the paragraph above.** It is not the same
 * kind of prop as `scrim`/`anchor`/`modal`: those were refused because they would import a
 * DIFFERENT WIDGET's vocabulary into this one (a menu's anchored, non-modal, trap-free shape).
 * `dismissible` instead turns off chrome this component already owns outright — the header's
 * close icon and Escape-suppression are both in its own "Owns" list two paragraphs up. A prop
 * that mutes an owned affordance is not a prop that changes what kind of thing this is (design
 * note §7.2).
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
  /** US-027/AC-04. When `false`, the close icon is not rendered at all (not merely disabled) and
   *  Escape is suppressed regardless of `busy` — for a result the caller must not let the person
   *  lose by accident (SCR-008 ST-11: "no ✕ in its header", design note §7.1/§7.3). Defaults
   *  `true` — every existing caller's behaviour is unchanged. `onDismiss` stays required even
   *  when `false`: the caller's own footer button (e.g. **Done**) still calls it directly; this
   *  component simply never calls it itself while `dismissible` is `false`. */
  dismissible?: boolean;
  /** Focused on open. Omitted -> the dialog itself, `ConfirmDialog`'s existing behaviour. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}

export function Dialog({
  title,
  role = 'dialog',
  icon,
  children,
  footer,
  busy = false,
  dismissible = true,
  initialFocusRef,
  onDismiss,
}: DialogProps) {
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
        // `dismissible` is checked FIRST: a result the caller marked non-dismissible stays that
        // way regardless of `busy` (design note §7.3) — the two flags are independent, and this
        // combination (dismissible=false, busy=false) is exactly what ST-11 ships.
        if (dismissible && !busy) onDismiss();
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
  }, [busy, dismissible, onDismiss]);

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
          {/* Figma `Icon / close` (node 11:50) — "Dismiss a dialog". Omitted entirely, not
             merely disabled, when `dismissible` is false (US-027/AC-04, design note §7.1): a
             disabled-but-visible icon still looks like a dismiss control the person cannot use
             yet, where ST-11 needs one that was never offered. */}
          {dismissible ? (
            <button type="button" className="dialog__close" aria-label="Dismiss" onClick={onDismiss} disabled={busy}>
              <span className="dialog__close-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: closeIconMarkup }} />
            </button>
          ) : null}
        </div>
        <div className="dialog__body">{children}</div>
        <div className="dialog__footer">{footer}</div>
      </div>
    </div>
  );
}

/**
 * AccountRowMenu — SCR-008 ST-15's row overflow menu (US-020/AC-10, AC-11, AC-12). New,
 * screen-private component, built independently of `Dialog` (`decisions.md` D-05; design note
 * §5.1, §5.2 — confirmed, not merely proposed: a menu is `role="menu"` with `menuitem` children,
 * never modal, never focus-trapped, anchored rather than centred, and `Dialog`'s five required
 * props — `title`, `footer`, `aria-modal`, the focus trap, the centred/sheet-only shape — are
 * every one of them wrong for this widget).
 *
 * **One DOM at every width, two CSS presentations** (design note §5.2/§5.3): this codebase has
 * ZERO `matchMedia` calls and this story does not add the first one. `.people-menu__overlay` is
 * the same element at 360px and at 1280px; `people.css`'s 768px boundary alone decides whether it
 * renders as a scrimmed, viewport-fixed bottom sheet or a transparent popover anchored to the
 * trigger's on-screen position.
 *
 * **Portalled to `document.body`, not rendered in place.** `.people-table-wrapper` clips to its
 * own rounded corners (`overflow: hidden` — a `<table>` with `border-collapse: collapse` does not
 * reliably clip a colour-filled `<thead>` to a `border-radius` any other way; `people.css` has the
 * full account), and this menu must be able to render outside that box at every width. A portalled
 * node is no longer the trigger's DOM descendant, so it can no longer anchor to it via CSS alone —
 * `useLayoutEffect` below measures `triggerRef.current.getBoundingClientRect()` once, before
 * paint, and hands the result to `people.css`'s >=768px rule as `--menu-anchor-*` custom
 * properties; the <768px bottom sheet ignores them (it was always a plain `position: fixed;
 * inset: 0`, independent of the trigger's position).
 *
 * **The four items are `aria-disabled="true"` and FOCUSABLE — never the HTML `disabled`
 * attribute** (design note §6, ADR-010, ADR-010's decision record). `Button` renders `disabled`
 * as a real HTML attribute, which drops a control from the tab order and most screen readers'
 * browse mode; four such items inside a `role="menu"` would leave NOTHING focusable when it
 * opens, so AC-12's focus-return has nothing to test and the arrow keys below have nothing to
 * move between. Plain `<button>`s are used here, not the shared `Button` component, so this
 * component owns every one of `aria-disabled`, `title` and the visually-hidden reason directly —
 * `Button` is not modified, and no prop is added to it for this (`aria-disabled` would pass
 * through its `...rest` if it WERE used, which is the whole argument against adding a prop).
 *
 * **Outside-click dismissal** is implemented as a document-level listener scoped to the menu's
 * own DOM subtree, not the overlay element's own click target — the overlay is a zero-size
 * positioning point at >=768px (`width: 0; height: 0`, `people.css`), so a click anywhere on the
 * page except the menu itself would never bubble through the overlay's own (nonexistent) box. A
 * document listener works identically at every width and is what actually delivers AC-12's "a
 * click away dismisses it."
 *
 * **Focus returns to the trigger EXPLICITLY**, via the `triggerRef` the caller (`AccountRow`)
 * passes in — never `document.activeElement` capture/restore the way `Dialog.tsx` does it. The
 * row already knows which button opened this menu; asking the DOM to remember is an unnecessary
 * indirection here (design note §5.4).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { AdminUser } from '@desk-booking/contracts';
import {
  ACTIVATE_LABEL,
  DEACTIVATE_LABEL,
  disabledMenuItemReason,
  EDIT_LABEL,
  RESET_PASSWORD_LABEL,
  roleActionLabel,
} from './copy.js';
import './people.css';

export interface AccountRowMenuProps {
  account: AdminUser;
  /** The overflow trigger that opened this menu (`AccountRow`'s own ref) — focus returns here
   *  explicitly on Escape or an outside click (AC-12). */
  triggerRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}

interface MenuItemSpec {
  label: string;
  danger?: boolean;
}

/** `--menu-anchor-*` are read by `people.css`'s >=768px rule only; the <768px bottom sheet is a
 *  plain viewport-fixed `inset: 0` and never references them. */
type AnchorStyle = CSSProperties & {
  '--menu-anchor-bottom'?: string;
  '--menu-anchor-right'?: string;
};

export function AccountRowMenu({ account, triggerRef, onDismiss }: AccountRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const titleId = `people-menu-title-${account.id}`;

  // Measured once, before paint (`useLayoutEffect`, not `useEffect` — this avoids a one-frame
  // flash at the `var(..., 0px)` fallback position). `.people-table-wrapper` clips its content
  // to its rounded corners (people.css), so this menu is portalled to `document.body` below
  // rather than rendered in place — a portalled node can't anchor itself to the trigger via CSS
  // any more (the two are no longer ancestor/descendant), hence measuring the trigger's own
  // screen position explicitly and handing it to `people.css`'s >=768px rule as custom
  // properties. The <768px bottom sheet ignores this entirely (design note §5.2/§5.3 — it was
  // always `position: fixed; inset: 0`, independent of the trigger's position).
  const [anchorStyle, setAnchorStyle] = useState<AnchorStyle | undefined>(undefined);
  useLayoutEffect(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchorStyle({
      '--menu-anchor-bottom': `${rect.bottom}px`,
      '--menu-anchor-right': `${rect.right}px`,
    });
  }, [triggerRef]);

  const dismissAndReturnFocus = () => {
    triggerRef.current?.focus();
    onDismiss();
  };

  // Focus the first item on open — a menu with nothing focused when it opens has nowhere for
  // the arrow keys below (or AC-12's focus-return) to start from.
  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, []);

  // AC-12, at every width: a click anywhere outside this menu's own DOM subtree dismisses it and
  // returns focus to the trigger. A `mousedown` listener, not `click` — it fires before this
  // menu could unmount from some OTHER interaction, and it matches the point at which a user's
  // intent to click away is registered.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Prevent the browser's own default mousedown focus-handling (which would otherwise
        // blur whatever `dismissAndReturnFocus` just focused, since the actual click target is
        // rarely focusable itself) from running after this listener and undoing the explicit
        // focus-return AC-12 requires.
        event.preventDefault();
        dismissAndReturnFocus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
    // Deliberately `[]` — this attaches once per mount. `dismissAndReturnFocus` closes over
    // `account`/`triggerRef`/`onDismiss`, none of which change for the lifetime of one open menu
    // (a new `account.id` or a new trigger means a new mount, via React's own `key` semantics on
    // the row), so re-subscribing on every render would be pure churn, not correctness.
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissAndReturnFocus();
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    // Wraps at both ends — the standard WAI-ARIA menu pattern, and simpler than clamping for a
    // fixed four-item list with no reason to dead-end.
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  // Every item shares the same shape: real, correctly labelled, `aria-disabled`, focusable,
  // carrying its reason via `title` AND a visually-hidden span (the pair `AdminBookingRow.tsx`'s
  // own docblock establishes — "`title` alone is not an accessible name in practice"). `onClick`
  // returns immediately; nothing this story builds ever runs (ADR-010).
  function renderItem({ label, danger }: MenuItemSpec) {
    return (
      <button
        key={label}
        type="button"
        role="menuitem"
        aria-disabled="true"
        title={disabledMenuItemReason}
        className={danger ? 'people-menu__item people-menu__item--danger' : 'people-menu__item'}
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        {label}
        <span className="people__visually-hidden">{disabledMenuItemReason}</span>
      </button>
    );
  }

  return createPortal(
    <div className="people-menu__overlay" style={anchorStyle}>
      <div ref={menuRef} role="menu" aria-labelledby={titleId} className="people-menu" onKeyDown={handleKeyDown}>
        <p id={titleId} className="people-menu__title">
          {account.fullName}
        </p>
        {renderItem({ label: EDIT_LABEL })}
        {renderItem({ label: roleActionLabel(account.role) })}
        {renderItem({ label: RESET_PASSWORD_LABEL })}
        <hr className="people-menu__divider" aria-hidden="true" />
        {renderItem({ label: account.isActive ? DEACTIVATE_LABEL : ACTIVATE_LABEL, danger: true })}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The shell's account menu (US-002/AC-01).
 *
 * A disclosure — `<button aria-expanded aria-controls>` revealing ordinary buttons — not a full
 * `role="menu"` (design note §6.1). A real ARIA menu obliges arrow-key roving, `aria-activedescendant`,
 * typeahead and wrap-around; a half-built one announces affordances it does not have, which is
 * worse for a screen-reader user than this. AC-01 asks for "present and operable by keyboard",
 * which a disclosure meets exactly.
 *
 * Holds **Sign out** alone. SCR-002's component table lists Settings beside it, but `/settings`
 * does not exist yet — that row arrives with the Settings screen.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth/auth-context.js';
import './account-menu.css';

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (listRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!user) return null;

  const close = () => setOpen(false);

  // On the wrapper, not the list: focus is on the trigger when Escape is the very first key
  // pressed after opening, and the trigger is not a descendant of the list.
  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    close();
    triggerRef.current?.focus();
  };

  return (
    <div className="account-menu" onKeyDown={onRootKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="account-menu__trigger"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        Account
      </button>

      {open && (
        <div id={listId} className="account-menu__list" ref={listRef}>
          <button
            type="button"
            className="account-menu__item"
            onClick={() => {
              close();
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

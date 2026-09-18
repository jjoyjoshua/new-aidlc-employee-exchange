/**
 * The shell's account footer (US-002/AC-01).
 *
 * Unconditionally visible — Whoami (avatar + name) and **Sign out**, both always rendered, no
 * click-to-open step. This supersedes US-002's original disclosure (`D-05`/`FR-09`): that
 * decision flagged its own open question — "confirm the pattern with UX before building" — and
 * the approved hi-fi Figma sidebar (file `xjFVgBbMrJUl7Ys3EX3Cbn`, node `51:359`) is that
 * confirmation, put to the human directly and answered. Recorded as `US-002/D-06`.
 *
 * AC-01 ("present and operable by keyboard") holds more directly than before: Tab reaches
 * **Sign out** with no open step in between.
 *
 * Holds **Sign out** alone, still. SCR-002's component table lists Settings beside it, but
 * `/settings` does not exist yet — that row arrives with the Settings screen (unchanged from
 * US-002's original scoping).
 */
import { useAuth } from '../../lib/auth/auth-context.js';
import './account-menu.css';

export function AccountMenu() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const initial = user.fullName.trim().charAt(0).toUpperCase();

  return (
    <div className="account-menu">
      <div className="account-menu__whoami" data-testid="account-menu-whoami">
        <span className="account-menu__avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="account-menu__name">{user.fullName}</span>
      </div>

      <button type="button" className="account-menu__item" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

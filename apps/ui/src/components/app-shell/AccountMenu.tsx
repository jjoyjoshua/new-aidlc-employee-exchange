/**
 * The shell's account footer (US-002/AC-01).
 *
 * Unconditionally visible — Whoami (avatar + name), **Settings** and **Sign out**, all always
 * rendered, no click-to-open step. This supersedes US-002's original disclosure (`D-05`/`FR-09`):
 * that decision flagged its own open question — "confirm the pattern with UX before building" —
 * and the approved hi-fi Figma sidebar (file `xjFVgBbMrJUl7Ys3EX3Cbn`, node `51:359`) is that
 * confirmation, put to the human directly and answered. Recorded as `US-002/D-06`.
 *
 * AC-01 ("present and operable by keyboard") holds more directly than before: Tab reaches
 * **Sign out** with no open step in between.
 *
 * **US-031 fills the Settings row** SCR-002's component table always listed beside Sign out but
 * `/settings` did not exist to link to yet. It reuses `app-shell__link` — the exact class the
 * main nav items style their active indicator with — so the account menu's own **Settings** row
 * carries the SAME three cues (indicator bar, medium-weight label, `--c-fill-subtle` pill) when
 * `NavLink` marks it `aria-current="page"` (SCR-004's own structural decision: a screen reached
 * from the account menu needs its own shell state, since leaving **Bookings** lit would claim
 * the wrong page and lighting nothing looks like a rendering fault).
 */
import { NavLink } from 'react-router-dom';
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

      {/* SCR-004's own open question 2, resolved: push is employee-only (REQ-026), so an
          admin has no Settings screen to configure — sign-out stays in the admin shell's
          account menu alone. */}
      {user.role === 'employee' ? (
        <NavLink to="/settings" className="app-shell__link account-menu__settings-link">
          <span className="app-shell__label">Settings</span>
        </NavLink>
      ) : null}

      <button type="button" className="account-menu__item" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

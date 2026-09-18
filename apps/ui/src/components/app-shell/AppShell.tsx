/**
 * The shell every screen except SCR-001 and SCR-010 sits inside.
 *
 * **Two shells, one component** (`ia.md` §Shell, INSIGHT-08): the employee and administrator
 * navigations are the same component with different items — one navigation to build, one to
 * learn. The items come from the role, which comes from `user_profiles` on every request, never
 * from a JWT claim.
 *
 * US-001 built this as a structural stub; its hi-fi treatment (product lockup, icons, the
 * absolutely-positioned active bar, the 240px/72px rail) comes from the approved Figma sidebar
 * — file `xjFVgBbMrJUl7Ys3EX3Cbn`, node `51:359` — per US-001's implementation-plan.md addendum
 * "hi-fi sidebar". Nav labels are the short form the Figma component's own description names
 * ("Bookings", "Book" — not "My bookings", "Book a desk", which wrap at 240px).
 *
 * The `< 768px` bottom bar is unchanged: no mobile design has been supplied yet, so the product
 * lockup, icons and account footer stay hidden there and it keeps its original text-only links.
 */
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth/auth-context.js';
import { AccountMenu } from './AccountMenu.js';
import { NavIcon, type NavIconName } from './NavIcon.js';
import './app-shell.css';

type NavItem = { to: string; label: string; icon: NavIconName };

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/bookings', label: 'Bookings', icon: 'clock' },
  { to: '/book', label: 'Book', icon: 'calendar' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/bookings', label: 'Bookings', icon: 'clock' },
  { to: '/admin/desks', label: 'Desks', icon: 'grid' },
  { to: '/admin/people', label: 'People', icon: 'person' },
];

export function AppShell() {
  const { user } = useAuth();
  const items = user?.role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className="app-shell">
      <nav className="app-shell__sidebar" aria-label="Main">
        <div className="app-shell__brand">
          {/* The "D" mark is a placeholder, carried over from the wireframes and Figma's own
              component description — not derived from a token, awaiting the real logo. */}
          <span className="app-shell__mark" aria-hidden="true">
            D
          </span>
          <span className="app-shell__wordmark">Desk Booking</span>
        </div>

        <ul className="app-shell__nav-list">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className="app-shell__link">
                <NavIcon name={item.icon} className="app-shell__icon" />
                <span className="app-shell__label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="app-shell__footer">
          <AccountMenu />
        </div>
      </nav>

      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}

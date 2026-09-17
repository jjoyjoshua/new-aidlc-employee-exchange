/**
 * The shell every screen except SCR-001 and SCR-010 sits inside.
 *
 * **Two shells, one component** (`ia.md` §Shell, INSIGHT-08): the employee and administrator
 * navigations are the same component with different items — one navigation to build, one to
 * learn. The items come from the role, which comes from `user_profiles` on every request, never
 * from a JWT claim.
 *
 * US-001 builds this because AC-02 requires the admin navigation to be *present* on landing.
 * The screens it frames are US-010's and US-013's.
 */
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth/auth-context.js';
import './app-shell.css';

const EMPLOYEE_NAV = [
  { to: '/bookings', label: 'My bookings' },
  { to: '/book', label: 'Book a desk' },
];

const ADMIN_NAV = [
  { to: '/admin/bookings', label: 'Bookings' },
  { to: '/admin/desks', label: 'Desks' },
  { to: '/admin/people', label: 'People' },
];

export function AppShell() {
  const { user } = useAuth();
  const items = user?.role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className="app-shell">
      <nav className="app-shell__nav" aria-label="Main">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className="app-shell__link">
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}

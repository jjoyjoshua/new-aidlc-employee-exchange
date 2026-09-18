/**
 * Client-side guard for SCR-010 — the exact complement of `RequireSession`'s mark redirect.
 *
 * **This is convenience, not the guarantee.** The guarantee is `POST /api/auth/set-password`
 * answering `403 password_change_not_required` when the mark is already clear
 * (`auth.routes.spec.ts`) — there is no voluntary password change in this release (BRD-001
 * §10), and the server enforces that regardless of what address the browser renders.
 *
 * For every `(user, status)` pair, exactly one of this component and `RequireSession` renders
 * its children (US-004 design note §7.2).
 */
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context.js';
import { landingPathFor } from './landing.js';

export interface RequirePasswordChangeProps {
  children: ReactNode;
}

export function RequirePasswordChange({ children }: RequirePasswordChangeProps) {
  const { user, status } = useAuth();

  if (status === 'booting') return null;
  if (!user) return <Navigate to="/sign-in" replace />;
  // US-004/AC-03 — sent to where they do belong, the way `RequireRole` returns an employee to
  // My bookings rather than showing an empty error page.
  if (!user.mustChangePassword) return <Navigate to={landingPathFor(user)} replace />;

  return <>{children}</>;
}

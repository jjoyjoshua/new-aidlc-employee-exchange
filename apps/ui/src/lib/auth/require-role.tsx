/**
 * Client-side role gate.
 *
 * **This is convenience, not the guarantee.** US-001/AC-03's guarantee is on the server:
 * `requireAdmin` is mounted on `/api/admin` itself, so every admin route is refused before it
 * is routed, and no admin data reaches a browser holding an Employee session. The story's own
 * QA note is blunt about it — "a UI test that only checks the nav is absent proves nothing".
 *
 * What this adds is the second half of AC-03's sentence: an employee who types an admin address
 * is *returned to My bookings* rather than shown an empty error page.
 */
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { UserRole } from '@desk-booking/contracts';
import { useAuth } from './auth-context.js';

export interface RequireRoleProps {
  role: UserRole;
  children: ReactNode;
}

export function RequireRole({ role, children }: RequireRoleProps) {
  const { user } = useAuth();

  // No session at all: back to the start. SCR-001 is where every expired session returns.
  if (!user) return <Navigate to="/sign-in" replace />;

  // Wrong role: AC-03's "they are returned to My bookings".
  if (user.role !== role) return <Navigate to="/bookings" replace />;

  return <>{children}</>;
}

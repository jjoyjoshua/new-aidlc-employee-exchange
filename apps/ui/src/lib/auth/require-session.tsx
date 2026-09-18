/**
 * Client-side session gate (US-002/AC-03, US-003/AC-01).
 *
 * Wraps the shell's route element, not individual routes — the same reasoning `app.ts` uses for
 * `requireAdmin` on the `/api/admin` mount point: a per-route guard is forgettable, and mounting
 * it once means every route the shell contains inherits it before it is written.
 *
 * **This is convenience, not the guarantee.** The guarantee is the server refusing the revoked
 * or expired token on the next request (`auth.routes.spec.ts`). What this adds is AC-03's other
 * half: after sign-out or expiry, a back navigation to a signed-in address renders a redirect
 * instead of the screen — the screen component never mounts, so it never fetches and never
 * shows stale data.
 *
 * **Holds while `status === 'booting'`** (US-003 design note §5.2): a cold boot with a valid
 * 30-day session takes one round trip to confirm. Redirecting before that resolves would send
 * every reload to sign-in regardless of session age, failing AC-01 in a way that looks like a
 * flicker rather than a bug.
 */
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context.js';

export interface RequireSessionProps {
  children: ReactNode;
}

export function RequireSession({ children }: RequireSessionProps) {
  const { user, status } = useAuth();

  if (status === 'booting') return null;
  if (!user) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
}

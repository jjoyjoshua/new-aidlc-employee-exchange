/**
 * Client-side session gate (US-002/AC-03).
 *
 * Wraps the shell's route element, not individual routes — the same reasoning `app.ts` uses for
 * `requireAdmin` on the `/api/admin` mount point: a per-route guard is forgettable, and mounting
 * it once means every route the shell contains inherits it before it is written.
 *
 * **This is convenience, not the guarantee.** The guarantee is the server refusing the revoked
 * token on the next request (`auth.routes.spec.ts`). What this adds is AC-03's other half: after
 * sign-out, a back navigation to a signed-in address renders a redirect instead of the screen —
 * the screen component never mounts, so it never fetches and never shows stale data.
 */
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context.js';

export interface RequireSessionProps {
  children: ReactNode;
}

export function RequireSession({ children }: RequireSessionProps) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
}

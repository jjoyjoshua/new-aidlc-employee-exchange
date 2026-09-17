/**
 * The browser's address table.
 *
 * Nothing in `ia.md` or the ten screen specs fixes URLs — the Architect settled them in the
 * US-001 design note §9.1 and UX may veto the strings. `/admin/*` on the client mirrors
 * `/api/admin/*` on the server, and that symmetry is not decoration: it makes "is this surface
 * guarded?" answerable by looking at the address.
 *
 * Addresses reserved but not built by US-001 are listed in the design note rather than stubbed
 * here — a route with no screen behind it is a 404 that looks like a bug.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { SignIn } from './screens/sign-in/SignIn.js';
import { MyBookings } from './screens/my-bookings/MyBookings.js';
import { AllBookings } from './screens/all-bookings/AllBookings.js';
import { AppShell } from './components/app-shell/AppShell.js';
import { RequireRole } from './lib/auth/require-role.js';
import { RequireSession } from './lib/auth/require-session.js';

export function AppRoutes() {
  return (
    <Routes>
      {/* SCR-001 is the root an unauthenticated user lands on, and where every expired
          session returns. */}
      <Route path="/sign-in" element={<SignIn />} />

      {/* US-002/AC-03 — every screen the shell contains inherits the session guard before it
          is written; a per-route guard is the one that gets forgotten. */}
      <Route
        element={
          <RequireSession>
            <AppShell />
          </RequireSession>
        }
      >
        <Route path="/bookings" element={<MyBookings />} />
        <Route
          path="/admin/bookings"
          element={
            <RequireRole role="admin">
              <AllBookings />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
  );
}

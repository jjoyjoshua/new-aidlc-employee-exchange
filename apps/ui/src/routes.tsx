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
import { BookADesk } from './screens/book-a-desk/BookADesk.js';
import { AllBookings } from './screens/all-bookings/AllBookings.js';
import { Desks } from './screens/desks/Desks.js';
import { People } from './screens/people/People.js';
import { SetPassword } from './screens/set-password/SetPassword.js';
import { AppShell } from './components/app-shell/AppShell.js';
import { RequireRole } from './lib/auth/require-role.js';
import { RequireSession } from './lib/auth/require-session.js';
import { RequirePasswordChange } from './lib/auth/require-password-change.js';

export function AppRoutes() {
  return (
    <Routes>
      {/* SCR-001 is the root an unauthenticated user lands on, and where every expired
          session returns. */}
      <Route path="/sign-in" element={<SignIn />} />

      {/* US-004 — reserved by US-001's design note §9.1. No app-shell here: the navigation
          appears only once the account's password is the holder's own, so this sits outside
          the shell's route element rather than inside it (design note §7.2). */}
      <Route
        path="/set-password"
        element={
          <RequirePasswordChange>
            <SetPassword />
          </RequirePasswordChange>
        }
      />

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
        {/* US-005 — SCR-003's date controls only (ST-01/02/03); reserved by US-001 design
            note §9.1. The desk list and confirm action are US-006's and US-007's. */}
        <Route path="/book" element={<BookADesk />} />
        <Route
          path="/admin/bookings"
          element={
            <RequireRole role="admin">
              <AllBookings />
            </RequireRole>
          }
        />
        {/* US-016. `AppShell.tsx`'s ADMIN_NAV has carried this address since US-001's hi-fi
            pass; it fell through to the catch-all below until this route existed. */}
        <Route
          path="/admin/desks"
          element={
            <RequireRole role="admin">
              <Desks />
            </RequireRole>
          }
        />
        {/* US-020. `AppShell.tsx`'s ADMIN_NAV has carried this address since US-001's hi-fi
            pass; it fell through to the catch-all below until this route existed — the same
            live-wrong-behaviour-fixed-as-a-consequence US-016 corrected for `/admin/desks`
            (design note §9.1). */}
        <Route
          path="/admin/people"
          element={
            <RequireRole role="admin">
              <People />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
  );
}

import { render, screen } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell.js';
import { RequireRole } from '../../lib/auth/require-role.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { AuthenticatedUser } from '@desk-booking/contracts';

const EMPLOYEE: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};
const ADMIN: AuthenticatedUser = { ...EMPLOYEE, role: 'admin', fullName: 'Marcus Webb' };

/**
 * Signs a user in through the **real** provider, so no context is faked.
 *
 * Faking the context would test a stub's shape rather than the provider's behaviour, and the
 * thing under test here — what the shell renders for a given role — depends on how the role
 * gets into the context in the first place.
 */
function SignedIn({ as, children }: { as: AuthenticatedUser; children: ReactNode }) {
  const client = {
    request: async () => ({
      kind: 'ok' as const,
      data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user: as },
    }),
  };

  return (
    <AuthProvider client={client as never} onSession={() => undefined}>
      <Primer>{children}</Primer>
    </AuthProvider>
  );
}

/** Performs the sign-in once on mount, then renders its children. */
function Primer({ children }: { children: ReactNode }) {
  const auth: AuthContextValue = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.signIn('priya@company.com', 'correct').then(() => setReady(true));
    // `auth.signIn` is stable for the life of the provider; re-running would sign in twice.
  }, [auth]);

  return ready ? <>{children}</> : null;
}

describe('AppShell (US-001/AC-02)', () => {
  it('shows the admin navigation for an administrator (US-001/AC-02)', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/bookings']}>
        <SignedIn as={ADMIN}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/admin/bookings" element={<h1>All bookings</h1>} />
            </Route>
          </Routes>
        </SignedIn>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Desks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument();
  });

  it('shows the employee navigation, without the admin items (US-001/AC-02)', async () => {
    render(
      <MemoryRouter initialEntries={['/bookings']}>
        <SignedIn as={EMPLOYEE}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/bookings" element={<h1>My bookings</h1>} />
            </Route>
          </Routes>
        </SignedIn>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'My bookings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Desks' })).not.toBeInTheDocument();
  });

  it('names its navigation landmark so a screen reader can jump to it (NFR-008)', async () => {
    render(
      <MemoryRouter initialEntries={['/bookings']}>
        <SignedIn as={EMPLOYEE}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/bookings" element={<h1>My bookings</h1>} />
            </Route>
          </Routes>
        </SignedIn>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});

describe('RequireRole (US-001/AC-03)', () => {
  it('returns an employee to My bookings from an admin address (US-001/AC-03)', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/bookings']}>
        <SignedIn as={EMPLOYEE}>
          <Routes>
            <Route path="/bookings" element={<h1>My bookings</h1>} />
            <Route
              path="/admin/bookings"
              element={
                <RequireRole role="admin">
                  <h1>All bookings</h1>
                </RequireRole>
              }
            />
          </Routes>
        </SignedIn>
      </MemoryRouter>,
    );

    // The guarantee is the server's 403 (auth.routes.spec.ts). This is the second half of
    // AC-03's sentence: the employee is RETURNED to My bookings.
    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All bookings' })).not.toBeInTheDocument();
  });

  it('lets an administrator through (US-001/AC-02)', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/bookings']}>
        <SignedIn as={ADMIN}>
          <Routes>
            <Route path="/bookings" element={<h1>My bookings</h1>} />
            <Route
              path="/admin/bookings"
              element={
                <RequireRole role="admin">
                  <h1>All bookings</h1>
                </RequireRole>
              }
            />
          </Routes>
        </SignedIn>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'All bookings' })).toBeInTheDocument();
  });
});

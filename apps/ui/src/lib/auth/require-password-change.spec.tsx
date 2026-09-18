import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@desk-booking/contracts';
import { RequirePasswordChange } from './require-password-change.js';
import { AuthProvider } from './auth-context.js';

/**
 * US-004/AC-03 — there is no voluntary password change in this release (BRD-001 §10), so a
 * signed-in user whose password is already their own must never be served SCR-010, even by
 * typing its address directly. This is the exact complement of `RequireSession`'s new mark
 * redirect (`require-session.spec.tsx`): for every `(user, status)` pair, exactly one of the
 * two guards renders its children.
 */

const EMPLOYEE_OWN_PASSWORD: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

const EMPLOYEE_MUST_CHANGE: AuthenticatedUser = { ...EMPLOYEE_OWN_PASSWORD, mustChangePassword: true };
const ADMIN_OWN_PASSWORD: AuthenticatedUser = { ...EMPLOYEE_OWN_PASSWORD, role: 'admin' };

function renderScreen(storedUser: AuthenticatedUser | undefined) {
  const client = {
    request: async () => (storedUser ? { kind: 'ok' as const, data: { user: storedUser } } : { kind: 'unavailable' as const }),
    requestNoContent: async () => ({ kind: 'unavailable' as const }),
  };
  const screenMounted = vi.fn();

  render(
    <MemoryRouter initialEntries={['/set-password']}>
      <AuthProvider
        client={client as never}
        onSession={() => undefined}
        getStoredSession={async () => (storedUser ? { accessToken: 'a-token' } : undefined)}
      >
        <Routes>
          <Route path="/sign-in" element={<h1>Sign in</h1>} />
          <Route path="/bookings" element={<h1>My bookings</h1>} />
          <Route path="/admin/bookings" element={<h1>All bookings</h1>} />
          <Route
            path="/set-password"
            element={
              <RequirePasswordChange>
                <ScreenThatMounts onMount={screenMounted} />
              </RequirePasswordChange>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  return { screenMounted };
}

function ScreenThatMounts({ onMount }: { onMount: () => void }) {
  onMount();
  return <h1>Set your password</h1>;
}

describe('RequirePasswordChange (US-004/AC-03)', () => {
  it('redirects to sign-in when no user is signed in, and never mounts the screen', async () => {
    const { screenMounted } = renderScreen(undefined);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screenMounted).not.toHaveBeenCalled();
  });

  it('renders the screen for a user whose password is administrator-set (US-004/AC-02, US-004/AC-03)', async () => {
    const { screenMounted } = renderScreen(EMPLOYEE_MUST_CHANGE);

    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
    expect(screenMounted).toHaveBeenCalledOnce();
  });

  it('redirects an employee whose password is already their own to My bookings, not the screen (US-004/AC-03)', async () => {
    const { screenMounted } = renderScreen(EMPLOYEE_OWN_PASSWORD);

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument();
    expect(screenMounted).not.toHaveBeenCalled();
  });

  it('redirects an admin whose password is already their own to All bookings, not the screen (US-004/AC-03)', async () => {
    const { screenMounted } = renderScreen(ADMIN_OWN_PASSWORD);

    expect(await screen.findByRole('heading', { name: 'All bookings' })).toBeInTheDocument();
    expect(screenMounted).not.toHaveBeenCalled();
  });

  it('holds — renders nothing — while the stored session is still being confirmed', () => {
    const client = {
      request: () => new Promise(() => undefined),
      requestNoContent: async () => ({ kind: 'unavailable' as const }),
    };

    render(
      <MemoryRouter initialEntries={['/set-password']}>
        <AuthProvider
          client={client as never}
          onSession={() => undefined}
          getStoredSession={async () => ({ accessToken: 'still-checking' })}
        >
          <Routes>
            <Route path="/sign-in" element={<h1>Sign in</h1>} />
            <Route path="/set-password" element={<RequirePasswordChange><h1>Set your password</h1></RequirePasswordChange>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Set your password' })).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireSession } from './require-session.js';
import { AuthProvider } from './auth-context.js';

/**
 * US-002/AC-03 — "going back does not undo it": after sign-out, an address that used to render a
 * signed-in screen must redirect to sign-in and the screen behind it must never mount, not
 * merely be visually replaced. The server half (the token itself is refused) is
 * `auth.routes.spec.ts`'s; this is the browser's half of the same sentence.
 */

function renderAt(path: string) {
  const client = {
    request: async () => ({ kind: 'unavailable' as const }),
    requestNoContent: async () => ({ kind: 'unavailable' as const }),
  };
  const screenMounted = vi.fn();

  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider
        client={client as never}
        onSession={() => undefined}
        getStoredSession={async () => undefined}
      >
        <Routes>
          <Route path="/sign-in" element={<h1>Sign in</h1>} />
          <Route
            path="/bookings"
            element={
              <RequireSession>
                <ScreenThatMounts onMount={screenMounted} />
              </RequireSession>
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
  return <h1>My bookings</h1>;
}

const MUST_CHANGE_USER = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee' as const,
  mustChangePassword: true,
};

describe('RequireSession (US-002/AC-03)', () => {
  it('redirects to sign-in when no user is signed in, and never mounts the screen (US-002/AC-03)', async () => {
    const { screenMounted } = renderAt('/bookings');

    // NFR-009: with no stored session, the boot resolves to signedOut asynchronously (US-003)
    // rather than redirecting synchronously on the first render.
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My bookings' })).not.toBeInTheDocument();
    expect(screenMounted).not.toHaveBeenCalled();
  });

  it('holds — renders neither screen — while the stored session is still being confirmed (US-003)', () => {
    const client = {
      request: () => new Promise(() => undefined),
      requestNoContent: async () => ({ kind: 'unavailable' as const }),
    };

    render(
      <MemoryRouter initialEntries={['/bookings']}>
        <AuthProvider
          client={client as never}
          onSession={() => undefined}
          getStoredSession={async () => ({ accessToken: 'still-checking' })}
        >
          <Routes>
            <Route path="/sign-in" element={<h1>Sign in</h1>} />
            <Route
              path="/bookings"
              element={
                <RequireSession>
                  <h1>My bookings</h1>
                </RequireSession>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My bookings' })).not.toBeInTheDocument();
  });

  it('redirects to /set-password when the signed-in user\'s password is administrator-set, and never mounts the screen (US-004/AC-02)', async () => {
    const client = {
      request: async () => ({ kind: 'ok' as const, data: { user: MUST_CHANGE_USER } }),
      requestNoContent: async () => ({ kind: 'unavailable' as const }),
    };
    const screenMounted = vi.fn();

    render(
      <MemoryRouter initialEntries={['/bookings']}>
        <AuthProvider
          client={client as never}
          onSession={() => undefined}
          getStoredSession={async () => ({ accessToken: 'a-token' })}
        >
          <Routes>
            <Route path="/set-password" element={<h1>Set your password</h1>} />
            <Route
              path="/bookings"
              element={
                <RequireSession>
                  <ScreenThatMounts onMount={screenMounted} />
                </RequireSession>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My bookings' })).not.toBeInTheDocument();
    expect(screenMounted).not.toHaveBeenCalled();
  });
});

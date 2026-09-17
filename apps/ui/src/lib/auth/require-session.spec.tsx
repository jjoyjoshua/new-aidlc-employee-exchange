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
      <AuthProvider client={client as never} onSession={() => undefined}>
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

describe('RequireSession (US-002/AC-03)', () => {
  it('redirects to sign-in when no user is signed in, and never mounts the screen (US-002/AC-03)', () => {
    const { screenMounted } = renderAt('/bookings');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My bookings' })).not.toBeInTheDocument();
    expect(screenMounted).not.toHaveBeenCalled();
  });
});

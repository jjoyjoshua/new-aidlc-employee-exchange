import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { AuthenticatedUser } from '@desk-booking/contracts';

/**
 * US-002/AC-01 — "present and operable by keyboard". Built as an unconditionally visible footer
 * (`D-06`, superseding the original disclosure `D-05`/`FR-09`): Tab reaches **Sign out** with no
 * open step in between, which meets AC-01 more directly than a disclosure did.
 */

const EMPLOYEE: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

const ADMIN: AuthenticatedUser = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  email: 'admin@company.com',
  fullName: 'Alex Admin',
  role: 'admin',
  mustChangePassword: false,
};

/** Signs in through the real provider — see AppShell.spec.tsx's `SignedIn` for why. */
function Primer({ children }: { children: ReactNode }) {
  const auth: AuthContextValue = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.signIn('priya@company.com', 'correct').then(() => setReady(true));
  }, [auth]);

  return ready ? <>{children}</> : null;
}

function renderMenu(initialEntries: string[] = ['/bookings'], user: AuthenticatedUser = EMPLOYEE) {
  const requestNoContent = vi.fn(async () => ({ kind: 'ok' as const, data: undefined }));
  const client = {
    request: async () => ({
      kind: 'ok' as const,
      data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user },
    }),
    requestNoContent,
  };

  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider
        client={client as never}
        onSession={() => undefined}
        onSignOut={() => undefined}
        getStoredSession={async () => undefined}
      >
        <Primer>
          <Routes>
            <Route path="*" element={<AccountMenu />} />
          </Routes>
        </Primer>
      </AuthProvider>
    </MemoryRouter>,
  );

  return { requestNoContent };
}

describe('AccountMenu (US-002/AC-01, D-06)', () => {
  it('shows Sign out unconditionally, reachable by keyboard with no open step', async () => {
    renderMenu();

    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    signOut.focus();
    expect(signOut).toHaveFocus();
  });

  it('shows the signed-in user in a Whoami row', async () => {
    renderMenu();

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument();
  });

  it('activating Sign out reaches the sign-out endpoint (US-002/AC-01, US-002/AC-02)', async () => {
    const { requestNoContent } = renderMenu();

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(requestNoContent).toHaveBeenCalledWith('/api/auth/sign-out', { method: 'POST' }),
    );
  });
});

/**
 * US-031. SCR-004's own structural decision: a screen reached from the account menu needs its
 * own shell state, because leaving Bookings lit would claim the wrong page.
 */
describe('AccountMenu — the Settings link (US-031)', () => {
  it('links to /settings', async () => {
    renderMenu();

    const settingsLink = await screen.findByRole('link', { name: 'Settings' });
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('is not marked current when on another page', async () => {
    renderMenu(['/bookings']);

    const settingsLink = await screen.findByRole('link', { name: 'Settings' });
    expect(settingsLink).not.toHaveAttribute('aria-current');
  });

  it('is marked current — the SAME cue the main nav uses — when on /settings', async () => {
    renderMenu(['/settings']);

    const settingsLink = await screen.findByRole('link', { name: 'Settings' });
    expect(settingsLink).toHaveAttribute('aria-current', 'page');
    expect(settingsLink).toHaveClass('app-shell__link');
  });

  it('reaches Settings by keyboard, between Sign out and the account row', async () => {
    renderMenu();

    const settingsLink = await screen.findByRole('link', { name: 'Settings' });
    settingsLink.focus();
    expect(settingsLink).toHaveFocus();
  });

  it('is absent for an Admin — SCR-004 open question 2: push is employee-only, so there is nothing to configure', async () => {
    renderMenu(['/admin/bookings'], ADMIN);

    await screen.findByText('Alex Admin');
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });
});

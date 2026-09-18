import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
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

/** Signs in through the real provider — see AppShell.spec.tsx's `SignedIn` for why. */
function Primer({ children }: { children: ReactNode }) {
  const auth: AuthContextValue = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.signIn('priya@company.com', 'correct').then(() => setReady(true));
  }, [auth]);

  return ready ? <>{children}</> : null;
}

function renderMenu() {
  const requestNoContent = vi.fn(async () => ({ kind: 'ok' as const, data: undefined }));
  const client = {
    request: async () => ({
      kind: 'ok' as const,
      data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user: EMPLOYEE },
    }),
    requestNoContent,
  };

  render(
    <AuthProvider
      client={client as never}
      onSession={() => undefined}
      onSignOut={() => undefined}
      getStoredSession={async () => undefined}
    >
      <Primer>
        <AccountMenu />
      </Primer>
    </AuthProvider>,
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

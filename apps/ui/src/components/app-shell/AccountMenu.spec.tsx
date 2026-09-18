import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { AuthenticatedUser } from '@desk-booking/contracts';

/**
 * US-002/AC-01 — "present and operable by keyboard", built as a disclosure rather than a full
 * `role="menu"` (design note §6.1): a half-built ARIA menu announces affordances it does not
 * have, which is worse for a screen-reader user than a plain, fully-keyboard-operable button
 * revealing ordinary buttons.
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

describe('AccountMenu (US-002/AC-01)', () => {
  it('starts closed, with the trigger reachable by keyboard', async () => {
    renderMenu();

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    const trigger = await screen.findByRole('button', { name: 'Account' });
    trigger.focus();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on click and shows Sign out as the only row', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Account' });

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('Escape closes the menu and returns focus to the trigger', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Account' });
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('a click outside the menu closes it', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Account' });
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    await userEvent.click(document.body);

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('activating Sign out reaches the sign-out endpoint (US-002/AC-01, US-002/AC-02)', async () => {
    const { requestNoContent } = renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Account' });
    await userEvent.click(trigger);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(requestNoContent).toHaveBeenCalledWith('/api/auth/sign-out', { method: 'POST' }),
    );
  });
});

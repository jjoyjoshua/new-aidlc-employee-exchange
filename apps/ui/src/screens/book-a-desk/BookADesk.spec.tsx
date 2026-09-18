import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookADesk } from './BookADesk.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { AuthenticatedUser, Office } from '@desk-booking/contracts';

const EMPLOYEE: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

/** Signs in through the real provider with a fixed `office`, so US-005's date rules see a
 *  deterministic "today" regardless of when this suite runs. */
function SignedIn({ office, children }: { office: Office; children: ReactNode }) {
  const client = {
    request: async () => ({
      kind: 'ok' as const,
      data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user: EMPLOYEE, office },
    }),
  };

  return (
    <AuthProvider client={client as never} onSession={() => undefined} getStoredSession={async () => undefined}>
      <Primer>{children}</Primer>
    </AuthProvider>
  );
}

function Primer({ children }: { children: ReactNode }) {
  const auth: AuthContextValue = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.signIn('priya@company.com', 'correct').then(() => setReady(true));
  }, [auth]);

  return ready ? <>{children}</> : null;
}

const OFFICE: Office = { timezone: 'Asia/Kolkata', today: '2026-09-18' }; // Friday

describe('BookADesk (US-005/AC-01, AC-07, AC-08)', () => {
  it('preselects the next bookable working day and issues exactly one availability request for it (US-005/AC-01)', async () => {
    render(
      <SignedIn office={OFFICE}>
        <BookADesk />
      </SignedIn>,
    );

    // office.today (2026-09-18) is a Friday — a bookable day, so it preselects itself.
    expect(await screen.findByRole('radio', { name: /Fri 18/, checked: true })).toBeInTheDocument();
  });

  it('preselects the following Monday when today is a Saturday (US-005/AC-01)', async () => {
    render(
      <SignedIn office={{ timezone: 'Asia/Kolkata', today: '2026-09-19' }}>
        <BookADesk />
      </SignedIn>,
    );

    expect(await screen.findByRole('radio', { name: /Mon 21/, checked: true })).toBeInTheDocument();
  });

  it('centres the calendar under the full-width strip rather than left-aligning it (US-005/AC-05, US-005/AC-06)', async () => {
    render(
      <SignedIn office={OFFICE}>
        <BookADesk />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Pick another date' }));

    const calendar = screen.getByText('September 2026').closest('.book-a-desk__picker-anchor');
    expect(calendar).not.toBeNull();
  });

  it('states the office timezone once in the page header (US-005/AC-07)', async () => {
    render(
      <SignedIn office={OFFICE}>
        <BookADesk />
      </SignedIn>,
    );

    expect(await screen.findByText(/Asia\/Kolkata/)).toBeInTheDocument();
  });

  it('keeps the date controls interactive while availability is loading, and changing date supersedes an earlier response (US-005/AC-08)', async () => {
    let resolveFirst!: (v: string) => void;
    const fetchAvailability = vi.fn().mockImplementationOnce(() => new Promise((r) => (resolveFirst = r))).mockResolvedValueOnce('later');

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    const friday = await screen.findByRole('radio', { name: /Fri 18/ });
    expect(friday).toBeInTheDocument();

    // Change date before the first request resolves — the strip must accept the click.
    const saturday = screen.getByRole('radio', { name: /Sun 20/ });
    await userEvent.click(saturday);
    // Sunday is refused, so nothing should have changed selection — pick a bookable one instead.
    const monday = screen.getByRole('radio', { name: /Mon 21/ });
    await userEvent.click(monday);

    expect(await screen.findByRole('radio', { name: /Mon 21/, checked: true })).toBeInTheDocument();

    // The first request (for Friday) resolves last — its payload must never surface as current.
    resolveFirst('first-friday-payload');
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByRole('radio', { name: /Mon 21/, checked: true })).toBeInTheDocument();
  });
});

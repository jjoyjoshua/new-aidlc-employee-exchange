import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AllBookings } from './AllBookings.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AllBookingsResponse, AuthenticatedUser, Office } from '@desk-booking/contracts';
import type { AllBookingsFetcher, AllBookingsOutcome } from './use-all-bookings.js';

const ADMIN: AuthenticatedUser = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  email: 'marcus@company.com',
  fullName: 'Marcus Webb',
  role: 'admin',
  mustChangePassword: false,
};

const OFFICE: Office = { timezone: 'Asia/Kolkata', today: '2026-09-16' };

/**
 * Signs in through the real provider (same reasoning `MyBookings.spec.tsx`'s own `SignedIn`
 * gives: faking the context would test a stub's shape, not the provider's behaviour), then
 * renders `AllBookings` at `/admin/bookings`, optionally with navigation state (the toast).
 */
function SignedIn({
  initialEntries,
  fetchAllBookings,
}: {
  initialEntries: Array<string | { pathname: string; state?: unknown }>;
  fetchAllBookings?: AllBookingsFetcher;
}) {
  const client: ApiClient = {
    request: (async () => ({
      kind: 'ok',
      data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user: ADMIN, office: OFFICE },
    })) as ApiClient['request'],
    requestNoContent: (async () => ({ kind: 'ok', data: undefined })) as ApiClient['requestNoContent'],
  };

  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
        <Primer>
          <Routes>
            <Route path="/admin/bookings" element={<AllBookings fetchAllBookings={fetchAllBookings} />} />
          </Routes>
        </Primer>
      </AuthProvider>
    </MemoryRouter>
  );
}

function Primer({ children }: { children: ReactNode }) {
  const auth: AuthContextValue = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.signIn('marcus@company.com', 'correct').then(() => setReady(true));
  }, [auth]);

  return ready ? <>{children}</> : null;
}

const ok = (data: AllBookingsResponse): AllBookingsOutcome => ({ kind: 'ok', data });
const failed: AllBookingsOutcome = { kind: 'failed' };

const emptyResponse: AllBookingsResponse = { today: OFFICE.today, total: 0, items: [], nextPage: null };

describe('AllBookings — the password-saved toast (US-004/AC-07)', () => {
  it('renders the confirmation when it arrives via navigation state', async () => {
    render(
      <SignedIn
        initialEntries={[{ pathname: '/admin/bookings', state: { toast: 'password-saved' } }]}
        fetchAllBookings={async () => ok(emptyResponse)}
      />,
    );

    expect(await screen.findByText(/Password saved/i)).toBeInTheDocument();
  });

  it('renders no toast on an ordinary visit', async () => {
    render(<SignedIn initialEntries={['/admin/bookings']} fetchAllBookings={async () => ok(emptyResponse)} />);

    await screen.findByText('Nobody has booked a desk yet.'); // wait for the screen to settle
    expect(screen.queryByText(/Password saved/i)).not.toBeInTheDocument();
  });
});

describe('AllBookings — the default view (US-013/AC-02, AC-03, AC-07)', () => {
  it('renders the count line and both the table and card rows for each booking', async () => {
    const response: AllBookingsResponse = {
      today: OFFICE.today,
      total: 1,
      items: [{ id: 'a', date: '2026-09-16', deskNumber: 'A-01', employeeName: 'Priya Raman', status: 'confirmed' }],
      nextPage: null,
    };
    render(<SignedIn initialEntries={['/admin/bookings']} fetchAllBookings={async () => ok(response)} />);

    expect(await screen.findByText('1 booking · from Wed 16 Sep · all statuses')).toBeInTheDocument();
    expect(screen.getAllByText('Priya Raman')).toHaveLength(2); // one per layout (table + card)
  });
});

describe('AllBookings — loading (ST-02, US-013/AC-09)', () => {
  it('renders skeleton rows while the initial page is in flight', async () => {
    let resolveFetch: (outcome: AllBookingsOutcome) => void = () => {};
    const fetchAllBookings: AllBookingsFetcher = () => new Promise((resolve) => { resolveFetch = resolve; });

    render(<SignedIn initialEntries={['/admin/bookings']} fetchAllBookings={fetchAllBookings} />);

    await waitFor(() => expect(document.querySelectorAll('.admin-bookings-skeleton-row').length).toBeGreaterThan(0));
    resolveFetch(ok(emptyResponse));
  });
});

describe('AllBookings — empty system (ST-03, US-013/AC-08)', () => {
  it('renders only the empty-system message, with no "Add desks" action', async () => {
    render(<SignedIn initialEntries={['/admin/bookings']} fetchAllBookings={async () => ok(emptyResponse)} />);

    expect(await screen.findByText('Nobody has booked a desk yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add desks/i })).not.toBeInTheDocument();
  });
});

describe('AllBookings — load error (ST-05, US-013/AC-09)', () => {
  it('renders the alert with Try again, replacing the table', async () => {
    render(<SignedIn initialEntries={['/admin/bookings']} fetchAllBookings={async () => failed} />);

    expect(await screen.findByText("We couldn't load bookings.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('Try again retries the fetch', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const fetchAllBookings: AllBookingsFetcher = async () => {
      calls += 1;
      return calls === 1 ? failed : ok(emptyResponse);
    };

    render(<SignedIn initialEntries={['/admin/bookings']} fetchAllBookings={fetchAllBookings} />);

    await screen.findByText("We couldn't load bookings.");
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await screen.findByText('Nobody has booked a desk yet.');
  });
});

describe('AllBookings — Show more (US-013/AC-04)', () => {
  it('is present iff nextPage is not null, and a press appends rows', async () => {
    const page1: AllBookingsResponse = {
      today: OFFICE.today,
      total: 2,
      items: [{ id: 'a', date: '2026-09-16', deskNumber: 'A-01', employeeName: 'Priya Raman', status: 'confirmed' }],
      nextPage: 2,
    };
    const page2: AllBookingsResponse = {
      today: OFFICE.today,
      total: 2,
      items: [{ id: 'b', date: '2026-09-17', deskNumber: 'B-02', employeeName: 'Sam Okoro', status: 'confirmed' }],
      nextPage: null,
    };
    const user = userEvent.setup();
    let calls = 0;
    const fetchAllBookings: AllBookingsFetcher = async () => {
      calls += 1;
      return ok(calls === 1 ? page1 : page2);
    };

    render(<SignedIn initialEntries={['/admin/bookings']} fetchAllBookings={fetchAllBookings} />);

    const showMore = await screen.findByRole('button', { name: /show more/i });
    await user.click(showMore);

    await waitFor(() => expect(screen.getAllByText('Sam Okoro')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });
});

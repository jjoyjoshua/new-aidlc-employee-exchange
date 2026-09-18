import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MyBookings } from './MyBookings.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AuthenticatedUser, MyBookingsResponse, Office } from '@desk-booking/contracts';
import type { MyBookingsFetcher, MyBookingsOutcome } from './use-my-bookings.js';
import { formatOfficeDateLong } from '../../lib/format-office-date.js';
import { SHOW_MORE_ARIA_LABEL } from './copy.js';

const EMPLOYEE: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

const OFFICE: Office = { timezone: 'Asia/Kolkata', today: '2026-09-16' };

/**
 * Signs in through the real provider (same reasoning `BookADesk.spec.tsx`'s own `SignedIn`
 * gives: faking the context would test a stub's shape, not the provider's behaviour), then
 * renders `MyBookings` at `/bookings`, optionally with navigation state (for the two `Toast`s).
 */
function SignedIn({
  initialEntries,
  fetchMyBookings,
}: {
  initialEntries: Array<string | { pathname: string; state?: unknown }>;
  fetchMyBookings?: MyBookingsFetcher;
}) {
  const client: ApiClient = {
    request: (async () => ({
      kind: 'ok',
      data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user: EMPLOYEE, office: OFFICE },
    })) as ApiClient['request'],
    requestNoContent: (async () => ({ kind: 'ok', data: undefined })) as ApiClient['requestNoContent'],
  };

  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
        <Primer>
          <Routes>
            <Route path="/bookings" element={<MyBookings fetchMyBookings={fetchMyBookings} />} />
            {/* Where the "Book a desk" action leads — a bare probe, not the real BookADesk
                screen; that rendering is BookADesk.spec.tsx's own job. */}
            <Route path="/book" element={<p data-testid="landed-on-book-a-desk">Book a desk screen</p>} />
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
    void auth.signIn('priya@company.com', 'correct').then(() => setReady(true));
  }, [auth]);

  return ready ? <>{children}</> : null;
}

const ok = (data: MyBookingsResponse): MyBookingsOutcome => ({ kind: 'ok', data });
const failed: MyBookingsOutcome = { kind: 'failed' };

const emptyResponse: MyBookingsResponse = { today: OFFICE.today, items: [], nextBefore: null };

describe('MyBookings — the password-saved toast (US-004/AC-07)', () => {
  it('renders the confirmation when it arrives via navigation state', async () => {
    render(
      <SignedIn
        initialEntries={[{ pathname: '/bookings', state: { toast: 'password-saved' } }]}
        fetchMyBookings={async () => ok(emptyResponse)}
      />,
    );

    expect(await screen.findByText(/Password saved/i)).toBeInTheDocument();
  });

  it('renders no password-saved toast on an ordinary visit', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(emptyResponse)} />);

    await screen.findByText("You haven't booked a desk yet."); // wait for the screen to settle
    expect(screen.queryByText(/Password saved/i)).not.toBeInTheDocument();
  });
});

describe('MyBookings — the booking confirmation toast (US-007/AC-03, AC-04)', () => {
  it("names the desk and the date (US-007/AC-03) and the confirmation email verbatim (US-007/AC-04)", async () => {
    render(
      <SignedIn
        initialEntries={[
          {
            pathname: '/bookings',
            state: {
              bookingConfirmation: { deskNumber: 'A-02', dateLabel: 'Wed 9 Sep', confirmationEmail: 'priya@company.com' },
            },
          },
        ]}
        fetchMyBookings={async () => ok(emptyResponse)}
      />,
    );

    expect(
      await screen.findByText('A-02 booked for Wed 9 Sep. Confirmation emailed to priya@company.com.'),
    ).toBeInTheDocument();
  });

  it('renders no booking-confirmation toast on an ordinary visit', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(emptyResponse)} />);

    await screen.findByText("You haven't booked a desk yet.");
    expect(screen.queryByText(/booked for/i)).not.toBeInTheDocument();
  });
});

describe('MyBookings — AC-10, the office timezone stated once', () => {
  it('states the timezone in the page header (US-010/AC-10)', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(emptyResponse)} />);

    expect(await screen.findByText('Office time (Asia/Kolkata)')).toBeInTheDocument();
  });
});

describe('MyBookings — AC-08, loading', () => {
  it('shows skeleton rows and a single loading announcement, hidden from assistive technology (US-010/AC-08)', async () => {
    render(
      <SignedIn initialEntries={['/bookings']} fetchMyBookings={() => new Promise<MyBookingsOutcome>(() => undefined)} />,
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Loading your bookings');
    const skeletons = document.querySelectorAll('.skeleton-row');
    expect(skeletons.length).toBeGreaterThan(0);
    skeletons.forEach((el) => expect(el.closest('[aria-hidden="true"]')).toBeTruthy());
  });
});

describe('MyBookings — AC-09, load error', () => {
  it('shows the alert with Try again and hides Book a desk; the shell stays usable', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => failed} />);

    expect(await screen.findByText("We couldn't load your bookings. They're safe — this is a display problem.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Book a desk' })).not.toBeInTheDocument();
    expect(screen.getByText('My bookings')).toBeInTheDocument(); // the header, still rendered
  });

  it('Try again retries the fetch', async () => {
    const fetchMyBookings = vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(ok(emptyResponse));
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={fetchMyBookings} />);

    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Try again' });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText("You haven't booked a desk yet.")).toBeInTheDocument();
  });
});

describe('MyBookings — AC-06, never booked', () => {
  it('shows the empty state with Book a desk, and no Upcoming/Past headings', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(emptyResponse)} />);

    expect(await screen.findByText("You haven't booked a desk yet.")).toBeInTheDocument();
    expect(screen.getByText("Pick a day and a desk — we'll email you a confirmation.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book a desk' })).toBeInTheDocument();
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
    expect(screen.queryByText('Past bookings')).not.toBeInTheDocument();
  });
});

describe('MyBookings — AC-07, nothing upcoming but past bookings exist (distinct from AC-06)', () => {
  it('shows the ST-04 empty state, not ST-03, with the past bookings still readable (US-010/AC-07)', async () => {
    const response: MyBookingsResponse = {
      today: OFFICE.today,
      items: [{ id: 'p1', deskNumber: 'A-01', date: '2026-09-10', status: 'completed' }],
      nextBefore: null,
    };
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(response)} />);

    expect(await screen.findByText('Nothing booked coming up.')).toBeInTheDocument();
    expect(screen.queryByText("You haven't booked a desk yet.")).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book a desk' })).toBeInTheDocument();
    expect(screen.getByText('Past bookings')).toBeInTheDocument();
    expect(screen.getByText('Desk A-01')).toBeInTheDocument();
  });

  it('shows ST-04 even when the Past section itself is empty but older bookings exist beyond the floor (design note §4.2, §7.3)', async () => {
    const response: MyBookingsResponse = { today: OFFICE.today, items: [], nextBefore: '2026-08-01' };
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(response)} />);

    expect(await screen.findByText('Nothing booked coming up.')).toBeInTheDocument();
    expect(screen.queryByText("You haven't booked a desk yet.")).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: SHOW_MORE_ARIA_LABEL(formatOfficeDateLong('2026-08-01')) }),
    ).toBeInTheDocument();
  });
});

describe('MyBookings — AC-01, AC-02, upcoming and today (design note §4.1, §7.1)', () => {
  const response: MyBookingsResponse = {
    today: OFFICE.today,
    items: [
      { id: 'future1', deskNumber: 'A-01', date: '2026-09-18', status: 'confirmed' },
      { id: 'today', deskNumber: 'B-02', date: '2026-09-16', status: 'confirmed' },
      { id: 'future2', deskNumber: 'C-03', date: '2026-09-17', status: 'confirmed' },
      { id: 'future-cancelled', deskNumber: 'D-04', date: '2026-09-20', status: 'cancelled' },
      { id: 'past', deskNumber: 'A-01', date: '2026-09-10', status: 'completed' },
    ],
    nextBefore: null,
  };

  it('puts the booking dated today in its own TODAY card, separate from Upcoming (US-010/AC-02)', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(response)} />);

    expect(await screen.findByText('TODAY')).toBeInTheDocument();
    const upcomingSection = screen.getByText('Upcoming').closest('section');
    if (!upcomingSection) throw new Error('Upcoming section not found');
    expect(within(upcomingSection).queryByText('Desk B-02')).not.toBeInTheDocument();
  });

  it('orders Upcoming ascending, nearest first, excluding the row dated today (US-010/AC-01)', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(response)} />);

    await screen.findByText('Upcoming');
    const upcomingSection = screen.getByText('Upcoming').closest('section');
    if (!upcomingSection) throw new Error('Upcoming section not found');
    const desks = within(upcomingSection).getAllByText(/^Desk /).map((el) => el.textContent);
    expect(desks).toEqual(['Desk C-03', 'Desk A-01']); // Sep 17 then Sep 18
  });

  it("puts a Cancelled row dated in the FUTURE in Past, never in Upcoming, with no Cancel control anywhere on the screen (design note §7.1, decisions.md D-05)", async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(response)} />);

    await screen.findByText('Past bookings');
    const pastSection = screen.getByText('Past bookings').closest('details');
    if (!pastSection) throw new Error('Past section not found');
    expect(within(pastSection).getByText('Desk D-04')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});

describe('MyBookings — AC-03, "load older" (design note §4.3)', () => {
  it('is absent when nextBefore is null', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(emptyResponse)} />);

    await screen.findByText("You haven't booked a desk yet.");
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('requests the unchanged nextBefore and appends the response when pressed', async () => {
    const page1: MyBookingsResponse = {
      today: OFFICE.today,
      items: [{ id: 'p1', deskNumber: 'A-01', date: '2026-09-01', status: 'completed' }],
      nextBefore: '2026-08-01',
    };
    const page2: MyBookingsResponse = {
      today: OFFICE.today,
      items: [{ id: 'p2', deskNumber: 'B-02', date: '2026-07-20', status: 'cancelled' }],
      nextBefore: null,
    };
    const fetchMyBookings = vi.fn().mockResolvedValueOnce(ok(page1)).mockResolvedValueOnce(ok(page2));

    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={fetchMyBookings} />);

    const user = userEvent.setup();
    const showMore = await screen.findByRole('button', {
      name: SHOW_MORE_ARIA_LABEL(formatOfficeDateLong('2026-08-01')),
    });
    await user.click(showMore);

    await waitFor(() => expect(fetchMyBookings).toHaveBeenLastCalledWith('2026-08-01', expect.any(AbortSignal)));
    expect(await screen.findByText('Desk B-02')).toBeInTheDocument();
    expect(screen.getByText('Desk A-01')).toBeInTheDocument(); // page 1's row is still there — appended, not replaced
    expect(screen.queryByText('Show more')).not.toBeInTheDocument(); // page 2's nextBefore is null
  });
});

describe('MyBookings — Book a desk navigates to /book', () => {
  it('navigates on click', async () => {
    render(<SignedIn initialEntries={['/bookings']} fetchMyBookings={async () => ok(emptyResponse)} />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Book a desk' }));

    expect(await screen.findByTestId('landed-on-book-a-desk')).toBeInTheDocument();
  });
});

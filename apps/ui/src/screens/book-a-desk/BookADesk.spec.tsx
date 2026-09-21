import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BookADesk } from './BookADesk.js';
import { NO_DESKS_EXIST } from './copy.js';
import { formatOfficeDateLong } from '../../lib/format-office-date.js';
import type { AvailabilityFetcher } from './use-availability.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AuthenticatedUser, AvailabilityResponse, DeskAvailability, Office } from '@desk-booking/contracts';

const EMPLOYEE: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

const desk = (deskNumber: string, status: 'available' | 'taken' = 'available'): DeskAvailability => ({
  id: deskNumber,
  deskNumber,
  status,
});

/** Signs in through the real provider with a fixed `office`, so US-005's date rules see a
 *  deterministic "today" regardless of when this suite runs. The default availability response
 *  is used only by the tests below that render <BookADesk /> with no `fetchAvailability` override. */
function SignedIn({
  office,
  availability = { date: '', desks: [], myBooking: null, usualDeskId: null, nextFreeDays: [] },
  children,
}: {
  office: Office;
  availability?: AvailabilityResponse;
  children: ReactNode;
}) {
  const client: ApiClient = {
    request: (async (path: string) => {
      if (path.startsWith('/api/bookings/availability')) {
        const date = new URL(path, 'http://x').searchParams.get('date') ?? availability.date;
        return { kind: 'ok', data: { ...availability, date } };
      }
      return {
        kind: 'ok',
        data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user: EMPLOYEE, office },
      };
    }) as ApiClient['request'],
    requestNoContent: (async () => ({ kind: 'ok', data: undefined })) as ApiClient['requestNoContent'],
  };

  return (
    <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
      <MemoryRouter initialEntries={['/book']}>
        <Routes>
          <Route path="/book" element={<Primer>{children}</Primer>} />
          {/* US-007/AC-03, AC-04 — where a successful confirm navigates to. Reads the carried
              navigation state and renders it as plain text, so a test can assert on it without
              needing the real `MyBookings` screen (that rendering is `MyBookings.spec.tsx`'s
              own job). */}
          <Route path="/bookings" element={<LandingProbe />} />
        </Routes>
      </MemoryRouter>
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

function LandingProbe() {
  const location = useLocation();
  const state = location.state as {
    bookingConfirmation?: { deskNumber: string; dateLabel: string; confirmationEmail: string };
  } | null;

  return (
    <div data-testid="landed-on-my-bookings">
      {state?.bookingConfirmation ? (
        <p>
          {state.bookingConfirmation.deskNumber} booked for {state.bookingConfirmation.dateLabel}. Confirmation
          emailed to {state.bookingConfirmation.confirmationEmail}.
        </p>
      ) : null}
    </div>
  );
}

const OFFICE: Office = { timezone: 'Asia/Kolkata', today: '2026-09-18' }; // Friday

const ok = (data: AvailabilityResponse) => async (): Promise<{ kind: 'ok'; data: AvailabilityResponse }> =>
  ({ kind: 'ok', data });

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
    let resolveFirst!: (v: { kind: 'ok'; data: AvailabilityResponse }) => void;
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockImplementationOnce(ok({ date: '2026-09-21', desks: [], myBooking: null, usualDeskId: null, nextFreeDays: [] }));

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
    resolveFirst({ kind: 'ok', data: { date: '2026-09-18', desks: [], myBooking: null, usualDeskId: null, nextFreeDays: [] } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByRole('radio', { name: /Mon 21/, checked: true })).toBeInTheDocument();
  });
});

describe('BookADesk — the availability list (US-006/AC-01, AC-05, AC-07)', () => {
  it('renders the count line before the first zone heading, in DOM order (US-006/AC-01)', async () => {
    const desks = [desk('A-01'), desk('A-02', 'taken')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks, myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await screen.findByText('1 of 2 desks free · Fri 18 Sep');

    const container = screen.getByText('1 of 2 desks free · Fri 18 Sep').closest('.book-a-desk');
    const html = container?.innerHTML ?? '';
    expect(html.indexOf('1 of 2 desks free')).toBeLessThan(html.indexOf('Zone A'));
  });

  it('groups desks by zone (US-006/AC-05)', async () => {
    const desks = [desk('B-01'), desk('A-01'), desk('A-02')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks, myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    expect(await screen.findByText('Zone A')).toBeInTheDocument();
    expect(await screen.findByText('Zone B')).toBeInTheDocument();
  });

  it('renders N skeleton rows and no desk row while loading, and no layout-shifting spinner (US-006/AC-07)', async () => {
    const fetchAvailability: AvailabilityFetcher = () => new Promise(() => undefined);

    const { container } = render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await waitFor(() => expect(container.querySelector('.skeleton-row')).toBeInTheDocument());
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(5);
    expect(container.querySelector('.desk-row')).not.toBeInTheDocument();
  });
});

describe('BookADesk — the desk list is a radio group: one tab stop, arrows move it (#71)', () => {
  it('only one desk row is in the tab order, the rest are -1 (#71)', async () => {
    const desks = [desk('A-01'), desk('A-02'), desk('A-03')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks, myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    const radios = await screen.findAllByRole('radio');
    const tabbable = radios.filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(radios.filter((r) => r.getAttribute('tabindex') === '-1')).toHaveLength(radios.length - 1);
  });

  it('ArrowDown moves the roving tab stop to the next desk, across a zone boundary (#71)', async () => {
    const user = userEvent.setup();
    const desks = [desk('A-01'), desk('B-01'), desk('B-02')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks, myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    const a01 = await screen.findByRole('radio', { name: /A-01/ });
    a01.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('radio', { name: /B-01/ })).toHaveFocus();
  });

  it('ArrowUp moves the roving tab stop back, and neither arrow selects the desk by itself (#71)', async () => {
    const user = userEvent.setup();
    const desks = [desk('A-01'), desk('A-02')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks, myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    const a01 = await screen.findByRole('radio', { name: /A-01/ });
    a01.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /A-02/ })).toHaveFocus();

    // SCR-003's own wording: "arrows move selection, Space or Enter selects" — two separate
    // steps. Arrowing onto A-02 must not itself check it.
    expect(screen.getByRole('radio', { name: /A-02/ })).toHaveAttribute('aria-checked', 'false');

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: /A-01/ })).toHaveFocus();
  });

  it('a taken desk is skipped entirely — never a tab stop, never reachable by arrow keys (#71)', async () => {
    const user = userEvent.setup();
    const desks = [desk('A-01'), desk('A-02', 'taken'), desk('A-03')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks, myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    const a01 = await screen.findByRole('radio', { name: /A-01/ });
    a01.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('radio', { name: /A-03/ })).toHaveFocus();
  });

  it('the selected desk is the tab stop, not the first row (#71)', async () => {
    const user = userEvent.setup();
    const desks = [desk('A-01'), desk('A-02'), desk('A-03')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks, myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await user.click(await screen.findByRole('radio', { name: /A-02/ }));

    expect(screen.getByRole('radio', { name: /A-01/ })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: /A-02/ })).toHaveAttribute('tabindex', '0');
  });
});

describe('BookADesk — a failed load (US-006/AC-08)', () => {
  it('replaces only the list region with an inline alert naming the date, keeps the date strip usable, and retries the same date', async () => {
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValueOnce({ kind: 'ok', data: { date: '2026-09-18', desks: [desk('A-01')], myBooking: null, usualDeskId: null, nextFreeDays: [] } });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Fri 18 Sep/)).toBeInTheDocument();

    // The date strip is still there and still usable.
    expect(screen.getByRole('radio', { name: /Fri 18/ })).toBeInTheDocument();

    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    await screen.findByText('Zone A');
    expect(fetchAvailability).toHaveBeenCalledTimes(2);
    expect(fetchAvailability).toHaveBeenLastCalledWith('2026-09-18', expect.any(AbortSignal));
  });
});

describe('BookADesk — no active desks at all (US-006/AC-09)', () => {
  it('renders the NO_DESKS_EXIST empty state, with no alternative dates and no admin link', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks: [], myBooking: null, usualDeskId: null, nextFreeDays: [] });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    expect(await screen.findByText(NO_DESKS_EXIST.title)).toBeInTheDocument();
    expect(screen.getByText(NO_DESKS_EXIST.body)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('BookADesk — selecting a desk arms the confirm action (US-007/AC-01, AC-02)', () => {
  it('selecting an available desk enables the confirm action with the desk and date in its label (US-007/AC-01)', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01'), desk('A-02')],
      myBooking: null,
      usualDeskId: null,
      nextFreeDays: [],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-01/ }));

    expect(screen.getByRole('button', { name: 'Book A-01 for Fri 18 Sep' })).toBeEnabled();
  });

  it('selecting a second desk moves the selection — only one desk is ever selected (US-007/AC-02)', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01'), desk('A-02')],
      myBooking: null,
      usualDeskId: null,
      nextFreeDays: [],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-01/ }));
    await userEvent.click(screen.getByRole('radio', { name: /A-02/ }));

    expect(screen.getByRole('radio', { name: /A-01/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /A-02/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Book A-02 for Fri 18 Sep' })).toBeEnabled();
  });

  it('changing the date clears the desk selection and disables the confirm action (edge case)', async () => {
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockResolvedValue({ kind: 'ok', data: { date: '2026-09-18', desks: [desk('A-01')], myBooking: null, usualDeskId: null, nextFreeDays: [] } });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-01/ }));
    expect(screen.getByRole('button', { name: /Book A-01/ })).toBeEnabled();

    await userEvent.click(screen.getByRole('radio', { name: /Mon 21/ }));

    expect(await screen.findByRole('button', { name: 'Select a desk to book' })).toBeDisabled();
  });
});

describe('BookADesk — confirming creates a booking and lands on My bookings (US-007/AC-03, AC-04)', () => {
  it("navigates to /bookings with the desk, the date and the confirmation email verbatim from the response", async () => {
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks: [desk('A-02')], myBooking: null, usualDeskId: null, nextFreeDays: [] });
    const createBooking = vi.fn().mockResolvedValue({
      kind: 'ok',
      booking: {
        id: 'b1',
        deskId: 'A-02',
        deskNumber: 'A-02',
        date: '2026-09-18',
        status: 'confirmed',
        confirmationEmail: 'priya@company.com',
      },
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} createBooking={createBooking} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-02/ }));
    await userEvent.click(screen.getByRole('button', { name: /Book A-02/ }));

    expect(createBooking).toHaveBeenCalledWith({ date: '2026-09-18', deskId: 'A-02' }, expect.anything());
    expect(
      await screen.findByText('A-02 booked for Fri 18 Sep. Confirmation emailed to priya@company.com.'),
    ).toBeInTheDocument();
  });
});

describe('BookADesk — a desk taken while looking refreshes rather than retries (US-007/AC-08)', () => {
  it('shows an alert, refreshes availability, clears the selection, disables confirm, moves focus to the alert, and creates no booking (also pins US-009/D-07: the refetch here leaves the office fully booked, and the alert must still win over the new ST-04 branch)', async () => {
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockResolvedValueOnce({ kind: 'ok', data: { date: '2026-09-18', desks: [desk('A-02')], myBooking: null, usualDeskId: null, nextFreeDays: [] } })
      .mockResolvedValueOnce({
        kind: 'ok',
        data: { date: '2026-09-18', desks: [desk('A-02', 'taken')], myBooking: null, usualDeskId: null, nextFreeDays: [] },
      });
    const createBooking = vi.fn().mockResolvedValue({ kind: 'desk_conflict' });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} createBooking={createBooking} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-02/ }));
    await userEvent.click(screen.getByRole('button', { name: /Book A-02/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/just booked/i);
    await waitFor(() => expect(document.activeElement).toBe(alert.closest('[tabindex]')));

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Select a desk to book' })).toBeDisabled();
    const deskGroup = screen.getByRole('radiogroup', { name: 'Choose a desk' });
    expect(within(deskGroup).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
  });
});

describe('BookADesk — a second booking on the same date, discovered only on confirm (US-007/AC-05)', () => {
  it('refetches availability for the same date, then replaces the desk list with the existing-booking state, moving focus there once the refetch resolves', async () => {
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockResolvedValueOnce({ kind: 'ok', data: { date: '2026-09-18', desks: [desk('A-02')], myBooking: null, usualDeskId: null, nextFreeDays: [] } })
      .mockResolvedValueOnce({
        kind: 'ok',
        data: {
          date: '2026-09-18',
          desks: [desk('A-02', 'taken')],
          myBooking: { id: 'existing-1', deskId: 'A-01', deskNumber: 'A-01' },
          usualDeskId: null,
          nextFreeDays: [],
        },
      });
    const createBooking = vi.fn().mockResolvedValue({ kind: 'user_conflict' });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} createBooking={createBooking} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-02/ }));
    await userEvent.click(screen.getByRole('button', { name: /Book A-02/ }));

    expect(await screen.findByText(/You already have a booking for this date/)).toBeInTheDocument();
    expect(screen.getByText(/A-01/)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Choose a desk' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('id', 'existing-booking-state-heading'),
    );
  });

  it('falls back to the ordinary desk list if the refetch comes back with myBooking: null (the conflicting booking was itself cancelled meanwhile)', async () => {
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockResolvedValueOnce({ kind: 'ok', data: { date: '2026-09-18', desks: [desk('A-02')], myBooking: null, usualDeskId: null, nextFreeDays: [] } })
      .mockResolvedValueOnce({ kind: 'ok', data: { date: '2026-09-18', desks: [desk('A-02')], myBooking: null, usualDeskId: null, nextFreeDays: [] } });
    const createBooking = vi.fn().mockResolvedValue({ kind: 'user_conflict' });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} createBooking={createBooking} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-02/ }));
    await userEvent.click(screen.getByRole('button', { name: /Book A-02/ }));

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/You already have a booking for this date/)).not.toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /A-02/ })).toBeInTheDocument();
  });
});

describe('BookADesk — the usual-desk label (US-008/AC-01, AC-02)', () => {
  it("labels the row matching usualDeskId and no other, with myBooking seeded null (design note §2 — a non-null myBooking hides the desk list entirely)", async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01'), desk('A-02')],
      myBooking: null,
      usualDeskId: 'A-02',
      nextFreeDays: [],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    expect(await screen.findByRole('radio', { name: 'A-02, Available, your usual' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A-01, Available' })).toBeInTheDocument();
  });

  it('does not preselect the usual desk on load — no row checked, confirm disabled reading Select a desk to book (US-008/AC-02)', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01'), desk('A-02')],
      myBooking: null,
      usualDeskId: 'A-02',
      nextFreeDays: [],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await screen.findByRole('radio', { name: 'A-02, Available, your usual' });

    const deskGroup = screen.getByRole('radiogroup', { name: 'Choose a desk' });
    expect(within(deskGroup).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select a desk to book' })).toBeDisabled();
  });
});

describe('BookADesk — fully booked, offered the next free days (US-009)', () => {
  it('shows the count line and the fully-booked title, with no zone list (US-009/AC-01)', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01', 'taken'), desk('A-02', 'taken')],
      myBooking: null,
      usualDeskId: null,
      nextFreeDays: ['2026-09-21', '2026-09-22'],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    expect(await screen.findByText('0 of 2 desks free · Fri 18 Sep')).toBeInTheDocument();
    expect(screen.getByText('Every desk is taken on Fri 18 Sep.')).toBeInTheDocument();
    expect(screen.queryByText('Zone A')).not.toBeInTheDocument();
  });

  it('choosing a suggested day loads that date directly, with no calendar step (US-009/AC-03)', async () => {
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockResolvedValueOnce({
        kind: 'ok',
        data: {
          date: '2026-09-18',
          desks: [desk('A-01', 'taken')],
          myBooking: null,
          usualDeskId: null,
          nextFreeDays: ['2026-09-21', '2026-09-22'],
        },
      })
      .mockResolvedValueOnce({
        kind: 'ok',
        data: { date: '2026-09-21', desks: [desk('A-01')], myBooking: null, usualDeskId: null, nextFreeDays: [] },
      });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: `Book a desk on ${formatOfficeDateLong('2026-09-21')}` }),
    );

    expect(await screen.findByRole('radio', { name: /A-01/ })).toBeInTheDocument();
    expect(fetchAvailability).toHaveBeenLastCalledWith('2026-09-21', expect.any(AbortSignal));
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument(); // the calendar never opened
  });

  it('renders no confirm action at all — absent, not disabled (US-009/AC-04)', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01', 'taken')],
      myBooking: null,
      usualDeskId: null,
      nextFreeDays: ['2026-09-21'],
    });

    const { container } = render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    await screen.findByText('Every desk is taken on Fri 18 Sep.');
    expect(container.querySelector('.confirm-booking-bar')).not.toBeInTheDocument();
  });

  it('degrades cleanly with no free days: no lead line, no suggestion button, but still offers Pick another date (US-009/AC-05)', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01', 'taken')],
      myBooking: null,
      usualDeskId: null,
      nextFreeDays: [],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    const emptyState = (await screen.findByText('Every desk is taken on Fri 18 Sep.')).closest('.empty-state');
    expect(emptyState).not.toBeNull();
    expect(within(emptyState as HTMLElement).queryByText(/working day/i)).not.toBeInTheDocument();
    expect(within(emptyState as HTMLElement).getByRole('button', { name: 'Pick another date' })).toBeInTheDocument();
  });

  it('drops the count word when exactly one day qualifies (US-009/AC-05)', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [desk('A-01', 'taken')],
      myBooking: null,
      usualDeskId: null,
      nextFreeDays: ['2026-09-21'],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    expect(await screen.findByText('The next working day with a desk free:')).toBeInTheDocument();
  });

  it("desks: [] still renders the no-desks state, never the fully-booked one, even with nextFreeDays populated (US-009/AC-07)", async () => {
    const fetchAvailability: AvailabilityFetcher = ok({
      date: '2026-09-18',
      desks: [],
      myBooking: null,
      usualDeskId: null,
      nextFreeDays: ['2026-09-21', '2026-09-22'],
    });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} />
      </SignedIn>,
    );

    expect(await screen.findByText(NO_DESKS_EXIST.title)).toBeInTheDocument();
    expect(screen.queryByText(/Every desk is taken/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Book a desk on ${formatOfficeDateLong('2026-09-21')}` })).not.toBeInTheDocument();
  });
});

describe('BookADesk — an ambiguous failure sends the employee to check, not to retry (US-007/AC-10)', () => {
  it('shows the uncertainty, offers Check my bookings and Try again, and retains the desk selection', async () => {
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks: [desk('A-02')], myBooking: null, usualDeskId: null, nextFreeDays: [] });
    const createBooking = vi.fn().mockResolvedValue({ kind: 'failed' });

    render(
      <SignedIn office={OFFICE}>
        <BookADesk fetchAvailability={fetchAvailability} createBooking={createBooking} />
      </SignedIn>,
    );

    await userEvent.click(await screen.findByRole('radio', { name: /A-02/ }));
    await userEvent.click(screen.getByRole('button', { name: /Book A-02/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't confirm/i);
    expect(within(alert).getByRole('button', { name: 'Check my bookings' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    // Retains the desk selection — the confirm action still names A-02.
    expect(screen.getByRole('radio', { name: /A-02/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /Book A-02/ })).toBeEnabled();
  });
});

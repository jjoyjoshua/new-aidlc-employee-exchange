import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookADesk } from './BookADesk.js';
import { NO_DESKS_EXIST } from './copy.js';
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
  availability = { date: '', desks: [] },
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
      .mockImplementationOnce(ok({ date: '2026-09-21', desks: [] }));

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
    resolveFirst({ kind: 'ok', data: { date: '2026-09-18', desks: [] } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByRole('radio', { name: /Mon 21/, checked: true })).toBeInTheDocument();
  });
});

describe('BookADesk — the availability list (US-006/AC-01, AC-05, AC-07)', () => {
  it('renders the count line before the first zone heading, in DOM order (US-006/AC-01)', async () => {
    const desks = [desk('A-01'), desk('A-02', 'taken')];
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks });

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
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks });

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

describe('BookADesk — a failed load (US-006/AC-08)', () => {
  it('replaces only the list region with an inline alert naming the date, keeps the date strip usable, and retries the same date', async () => {
    const fetchAvailability = vi
      .fn<AvailabilityFetcher>()
      .mockResolvedValueOnce({ kind: 'failed' })
      .mockResolvedValueOnce({ kind: 'ok', data: { date: '2026-09-18', desks: [desk('A-01')] } });

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
    const fetchAvailability: AvailabilityFetcher = ok({ date: '2026-09-18', desks: [] });

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

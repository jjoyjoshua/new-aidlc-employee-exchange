import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { People } from './People.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import { RequireRole } from '../../lib/auth/require-role.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AdminSummary, AdminUser, AuthenticatedUser, Office } from '@desk-booking/contracts';
import type { UsersOutcome } from '../../lib/use-users.js';
import type { FetchUsers } from '../../lib/fetch-users.js';
import { PAGE_TITLE } from './copy.js';

const ADMIN: AuthenticatedUser = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  email: 'marcus@company.com',
  fullName: 'Marcus Vale',
  role: 'admin',
  mustChangePassword: false,
};
const EMPLOYEE: AuthenticatedUser = { ...ADMIN, id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', role: 'employee' };
const OFFICE: Office = { timezone: 'Asia/Kolkata', today: '2026-09-19' };

const DANA: AdminUser = { id: 'a', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true };
const MARCUS: AdminUser = { id: ADMIN.id, fullName: 'Marcus Vale', email: 'marcus@company.com', role: 'admin', isActive: true };
const PRIYA: AdminUser = { id: 'c', fullName: 'Priya Raman', email: 'priya@company.com', role: 'employee', isActive: false };

const SUMMARY: AdminSummary = { total: 38, employees: 36, admins: 2, deactivated: 1 };

function SignedIn({
  fetchUsers,
  user = ADMIN,
  guarded = false,
}: {
  fetchUsers: FetchUsers;
  user?: AuthenticatedUser;
  guarded?: boolean;
}) {
  const client: ApiClient = {
    request: (async () => ({
      kind: 'ok',
      data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user, office: OFFICE },
    })) as ApiClient['request'],
    requestNoContent: (async () => ({ kind: 'ok', data: undefined })) as ApiClient['requestNoContent'],
  };

  const screenEl = <People fetchUsers={fetchUsers} />;

  return (
    <MemoryRouter initialEntries={['/admin/people']}>
      <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
        <Primer user={user}>
          <Routes>
            <Route path="/bookings" element={<p>My bookings</p>} />
            <Route path="/admin/people" element={guarded ? <RequireRole role="admin">{screenEl}</RequireRole> : screenEl} />
          </Routes>
        </Primer>
      </AuthProvider>
    </MemoryRouter>
  );
}

function Primer({ children, user = ADMIN }: { children: ReactNode; user?: AuthenticatedUser }) {
  const auth: AuthContextValue = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.signIn(user.email, 'correct').then(() => setReady(true));
  }, [auth]);

  return ready ? <>{children}</> : null;
}

const okUsers = (users: AdminUser[], summary: AdminSummary = SUMMARY): UsersOutcome => ({ kind: 'ok', users, summary });
const failed: UsersOutcome = { kind: 'failed' };

describe('People — the ready view (US-020/AC-01, AC-02)', () => {
  it('renders the summary line derived from the summary, admins named explicitly (US-020/AC-02)', async () => {
    const fetchUsers: FetchUsers = async () => okUsers([DANA, MARCUS, PRIYA]);
    render(<SignedIn fetchUsers={fetchUsers} />);

    expect(await screen.findByRole('status')).toHaveTextContent('38 people · 36 employees, 2 admins · 1 deactivated');
  });
});

describe('People — search (US-020/AC-04, AC-05)', () => {
  it('a committed search filters the shown rows, keeps the term, offers a clear control, and shows the match line (US-020/AC-05)', async () => {
    let lastQ: string | undefined;
    const fetchUsers: FetchUsers = async (q) => {
      lastQ = q;
      return q ? okUsers([DANA]) : okUsers([DANA, MARCUS, PRIYA]);
    };
    render(<SignedIn fetchUsers={fetchUsers} />);
    await screen.findAllByText('Dana Silva');

    const field = screen.getByLabelText('Search name or email');
    await userEvent.type(field, 'dana{Enter}');

    await waitFor(() => expect(lastQ).toBe('dana'));
    expect(await screen.findByText('Showing 1 of 38')).toBeInTheDocument();
    expect(field).toHaveValue('dana');
    expect(screen.getByRole('button', { name: 'Clear search field' })).toBeInTheDocument();
    expect(screen.queryByText('Priya Raman')).not.toBeInTheDocument();
  });
});

describe('People — the summary does not re-count under a search (US-020/AC-06)', () => {
  it('the summary line is unchanged before and after a committed search (US-020/AC-06)', async () => {
    const fetchUsers: FetchUsers = async (q) => (q ? okUsers([DANA], SUMMARY) : okUsers([DANA, MARCUS, PRIYA], SUMMARY));
    render(<SignedIn fetchUsers={fetchUsers} />);
    const before = await screen.findByRole('status');
    expect(before).toHaveTextContent('38 people · 36 employees, 2 admins · 1 deactivated');

    await userEvent.type(screen.getByLabelText('Search name or email'), 'dana{Enter}');
    await screen.findByText('Showing 1 of 38');

    expect(screen.getByRole('status')).toHaveTextContent('38 people · 36 employees, 2 admins · 1 deactivated');
  });
});

describe('People — no match (US-020/AC-07)', () => {
  it('names the term and offers Clear search and Add person (US-020/AC-07)', async () => {
    const fetchUsers: FetchUsers = async (q) => (q ? okUsers([]) : okUsers([DANA]));
    render(<SignedIn fetchUsers={fetchUsers} />);
    await screen.findAllByText('Dana Silva');

    await userEvent.type(screen.getByLabelText('Search name or email'), 'danna{Enter}');

    expect(await screen.findByText('Nobody matches "danna".')).toBeInTheDocument();
    expect(screen.getByLabelText('Search name or email')).toHaveValue('danna');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    // Two "Add person" buttons render at once here — the page header's (always present except on
    // error) and the empty state's own — the same header-plus-empty-state duplication
    // `Desks.spec.tsx` already asserts with `getAllByRole` for "Add desk".
    expect(screen.getAllByRole('button', { name: 'Add person' }).length).toBeGreaterThan(0);
  });

  it('Clear search restores the full list', async () => {
    const fetchUsers: FetchUsers = async (q) => (q ? okUsers([]) : okUsers([DANA]));
    render(<SignedIn fetchUsers={fetchUsers} />);
    await screen.findAllByText('Dana Silva');
    await userEvent.type(screen.getByLabelText('Search name or email'), 'danna{Enter}');
    await screen.findByText('Nobody matches "danna".');

    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(await screen.findAllByText('Dana Silva')).not.toHaveLength(0);
    expect(screen.getByLabelText('Search name or email')).toHaveValue('');
  });
});

describe('People — no truly empty list (US-020/AC-08)', () => {
  it('never renders a no-accounts-at-all message in any state — only the no-match branch is reachable (US-020/AC-08)', async () => {
    const NEGATIVE = /no (people|accounts)|nobody (yet|here)/i;

    const { unmount: unmountLoading } = render(<SignedIn fetchUsers={() => new Promise(() => {})} />);
    expect(screen.queryByText(NEGATIVE)).not.toBeInTheDocument();
    unmountLoading();

    const { unmount: unmountReady } = render(<SignedIn fetchUsers={async () => okUsers([DANA])} />);
    await screen.findAllByText('Dana Silva');
    expect(screen.queryByText(NEGATIVE)).not.toBeInTheDocument();
    unmountReady();

    const { unmount: unmountError } = render(<SignedIn fetchUsers={async () => failed} />);
    await screen.findByText('Try again');
    expect(screen.queryByText(NEGATIVE)).not.toBeInTheDocument();
    unmountError();

    const fetchUsers: FetchUsers = async (q) => (q ? okUsers([]) : okUsers([DANA]));
    render(<SignedIn fetchUsers={fetchUsers} />);
    await screen.findAllByText('Dana Silva');
    await userEvent.type(screen.getByLabelText('Search name or email'), 'zzz{Enter}');
    await screen.findByText(/Nobody matches/);
    expect(screen.queryByText(NEGATIVE)).not.toBeInTheDocument();
  });
});

describe('People — loading and failure (US-020/AC-09)', () => {
  it('renders skeleton rows in both trees, search disabled, Add person enabled, while loading (US-020/AC-09)', async () => {
    const { container } = render(<SignedIn fetchUsers={() => new Promise(() => {})} />);

    await waitFor(() => expect(container.querySelectorAll('.people-skeleton-row').length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Search name or email')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add person' })).toBeEnabled();
  });

  it('on a load failure, shows Try again, no table, and Add person entirely absent (US-020/AC-09)', async () => {
    render(<SignedIn fetchUsers={async () => failed} />);

    expect(await screen.findByText("We couldn't load the people list.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add person' })).not.toBeInTheDocument();
  });

  it('a committed re-search on an already-loaded list leaves the search field ENABLED (US-020/AC-09, design note §7.4, A7)', async () => {
    let calls = 0;
    const fetchUsers: FetchUsers = async (q) => {
      calls += 1;
      return q ? okUsers([DANA]) : okUsers([DANA, PRIYA]);
    };
    render(<SignedIn fetchUsers={fetchUsers} />);
    await screen.findAllByText('Dana Silva');
    expect(screen.getByLabelText('Search name or email')).toBeEnabled();

    await userEvent.type(screen.getByLabelText('Search name or email'), 'dana{Enter}');

    // Skeletons may appear for the re-fetch, but the field itself must stay enabled throughout —
    // otherwise the term and focus would be dropped mid-search (the trap no AC names).
    expect(screen.getByLabelText('Search name or email')).toBeEnabled();
    await waitFor(() => expect(calls).toBe(2));
    expect(screen.getByLabelText('Search name or email')).toBeEnabled();
  });

  it('Try again retries the fetch', async () => {
    let calls = 0;
    const fetchUsers: FetchUsers = async () => {
      calls += 1;
      return calls === 1 ? failed : okUsers([DANA]);
    };
    render(<SignedIn fetchUsers={fetchUsers} />);
    await screen.findByText('Try again');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findAllByText('Dana Silva')).not.toHaveLength(0);
  });
});

describe('People — admin only (US-020/AC-13)', () => {
  it('an Employee session is redirected to /bookings, never shown the people list', async () => {
    render(<SignedIn fetchUsers={async () => okUsers([])} user={EMPLOYEE} guarded />);

    expect(await screen.findByText('My bookings')).toBeInTheDocument();
    expect(screen.queryByText(PAGE_TITLE)).not.toBeInTheDocument();
  });

  it('an Admin session under the same guard renders the screen', async () => {
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} user={ADMIN} guarded />);

    expect(await screen.findAllByText('Dana Silva')).not.toHaveLength(0);
  });
});

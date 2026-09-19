import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Desks } from './Desks.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import { RequireRole } from '../../lib/auth/require-role.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AdminDesk, AuthenticatedUser, Office } from '@desk-booking/contracts';
import type { DesksFetcher, DesksOutcome } from '../../lib/use-desks.js';
import type { AddDeskFetcher, AddDeskOutcome } from '../../lib/add-desk.js';
import { PAGE_TITLE } from './copy.js';

const ADMIN: AuthenticatedUser = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  email: 'marcus@company.com',
  fullName: 'Marcus Webb',
  role: 'admin',
  mustChangePassword: false,
};

const EMPLOYEE: AuthenticatedUser = { ...ADMIN, id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', role: 'employee' };

const OFFICE: Office = { timezone: 'Asia/Kolkata', today: '2026-09-19' };

function SignedIn({
  fetchDesks,
  addDesk,
  user = ADMIN,
  guarded = false,
}: {
  fetchDesks: DesksFetcher;
  addDesk?: AddDeskFetcher;
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

  const screen = <Desks fetchDesks={fetchDesks} addDesk={addDesk} />;

  return (
    <MemoryRouter initialEntries={['/admin/desks']}>
      <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
        <Primer user={user}>
          <Routes>
            <Route path="/bookings" element={<p>My bookings</p>} />
            <Route path="/admin/desks" element={guarded ? <RequireRole role="admin">{screen}</RequireRole> : screen} />
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

const ACTIVE: AdminDesk = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 };
const INACTIVE: AdminDesk = { id: 'b', deskNumber: 'C-05', isActive: false, bookedAhead: 0 };

const okDesks = (desks: AdminDesk[]): DesksOutcome => ({ kind: 'ok', desks });
const failed: DesksOutcome = { kind: 'failed' };

describe('Desks — the ready view (US-016/AC-01, AC-02, AC-04, AC-05)', () => {
  it('renders every desk, active and inactive, in the order the fetch returns them', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE, INACTIVE])} />);

    await screen.findAllByText('A-01'); // one per layout (table + card)
    expect(screen.getAllByText('C-05').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  });

  it('renders the summary line derived from the array', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE, INACTIVE])} />);
    expect(await screen.findByText('2 desks · 1 active, 1 inactive')).toBeInTheDocument();
  });
});

describe('Desks — empty inventory (US-016/AC-06)', () => {
  it('renders the empty state with no table and an enabled Add desk action (US-017 deletes US-016\'s disabled treatment)', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([])} />);

    expect(await screen.findByText('No desks yet. Nobody can book until you add one.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const addDeskButtons = screen.getAllByRole('button', { name: /^Add desk/ });
    expect(addDeskButtons.length).toBeGreaterThan(0);
    for (const button of addDeskButtons) expect(button).toBeEnabled();
  });
});

describe('Desks — loading and error (US-016/AC-07)', () => {
  it('renders skeleton rows in both trees while loading, with Add desk present (US-016/AC-07)', async () => {
    let resolveFetch!: (outcome: DesksOutcome) => void;
    const fetchDesks: DesksFetcher = () => new Promise((resolve) => { resolveFetch = resolve; });

    const { container } = render(<SignedIn fetchDesks={fetchDesks} />);

    await waitFor(() => expect(container.querySelectorAll('.desk-inventory-skeleton-row').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: /^Add desk/ })).toBeInTheDocument();

    resolveFetch(okDesks([]));
  });

  it('on a load failure, shows the alert with Try again, no table, and Add desk entirely absent (US-016/AC-07)', async () => {
    render(<SignedIn fetchDesks={async () => failed} />);

    expect(await screen.findByText("We couldn't load the desk list.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add desk/ })).not.toBeInTheDocument();
  });
});

describe('Desks — no search, filter or delete (US-016/AC-09)', () => {
  it('has no textbox, combobox, or a control named search/filter/delete/remove (US-016/AC-09)', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE, INACTIVE])} />);
    await screen.findAllByText('A-01');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /search|filter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument();
  });
});

describe('Desks — no overflow menu at any width (US-016/AC-08)', () => {
  it('renders exactly one Edit control per desk in each tree, and no "more" control', async () => {
    const { container } = render(<SignedIn fetchDesks={async () => okDesks([ACTIVE, INACTIVE])} />);
    await screen.findAllByText('A-01');

    const table = container.querySelector('.desk-inventory-table')!;
    const cards = container.querySelector('.desks-cards')!;
    expect(table.querySelectorAll('button')).toHaveLength(4); // Edit + toggle, per row, 2 rows
    expect(cards.querySelectorAll('button')).toHaveLength(4);
    expect(screen.queryAllByRole('button', { name: /more|options/i })).toHaveLength(0);
  });
});

describe('Desks — add a desk (US-017/AC-01, AC-04, AC-06)', () => {
  it('opens the add-desk dialog from the header action', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Add desk/ }));

    expect(screen.getByRole('dialog', { name: 'Add desk' })).toBeInTheDocument();
  });

  it('a successful add inserts the new desk into the list, in number order, with no second GET /desks fetch, and shows a toast (US-017/AC-01)', async () => {
    let fetchCount = 0;
    const fetchDesks: DesksFetcher = async () => {
      fetchCount += 1;
      return okDesks([ACTIVE, INACTIVE]); // A-01, C-05
    };
    const addDesk: AddDeskFetcher = async () => ({
      kind: 'ok',
      desk: { id: 'new', deskNumber: 'B-03', isActive: true, bookedAhead: 0 },
    });

    render(<SignedIn fetchDesks={fetchDesks} addDesk={addDesk} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Add desk/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add desk' });
    await userEvent.type(within(dialog).getByLabelText('Desk number'), 'b-03');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add desk' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchCount).toBe(1); // still one — the list was updated in place, never refetched
    expect(await screen.findByText('Desk B-03 added. People can book it from today.')).toBeInTheDocument();
    expect(await screen.findByText('3 desks · 2 active, 1 inactive')).toBeInTheDocument();
  });

  it('a duplicate desk number keeps the dialog open with the collision named (US-017/AC-04)', async () => {
    const addDesk: AddDeskFetcher = async () => ({ kind: 'duplicate' });
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} addDesk={addDesk} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Add desk/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add desk' });
    await userEvent.type(within(dialog).getByLabelText('Desk number'), 'A-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add desk' }));

    expect(await screen.findByText('A-01 is already taken by another desk.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Add desk' })).toBeInTheDocument();
  });

  it('Cancel closes the dialog without adding anything', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Add desk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a second activation while the first save is in flight issues exactly one request (US-017/AC-06)', async () => {
    let resolveAdd!: (outcome: AddDeskOutcome) => void;
    let calls = 0;
    const addDesk: AddDeskFetcher = () => {
      calls += 1;
      return new Promise((resolve) => (resolveAdd = resolve));
    };
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} addDesk={addDesk} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Add desk/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add desk' });
    await userEvent.type(within(dialog).getByLabelText('Desk number'), 'B-03');
    const confirm = within(dialog).getByRole('button', { name: 'Add desk' });
    await userEvent.click(confirm);
    await userEvent.click(confirm);

    expect(calls).toBe(1);
    resolveAdd({ kind: 'ok', desk: { id: 'new', deskNumber: 'B-03', isActive: true, bookedAhead: 0 } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Desks — admin only (US-016/AC-10)', () => {
  it('an Employee session is redirected to /bookings, never shown the inventory', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([])} user={EMPLOYEE} guarded />);

    expect(await screen.findByText('My bookings')).toBeInTheDocument();
    expect(screen.queryByText(PAGE_TITLE)).not.toBeInTheDocument();
  });

  it('an Admin session under the same guard renders the screen', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([])} user={ADMIN} guarded />);

    expect(await screen.findByText('No desks yet. Nobody can book until you add one.')).toBeInTheDocument();
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import type { RenameDeskFetcher, RenameDeskOutcome } from '../../lib/rename-desk.js';
import type { DeactivateDeskFetcher, DeactivateDeskOutcome } from '../../lib/deactivate-desk.js';
import type { ActivateDeskFetcher, ActivateDeskOutcome } from '../../lib/activate-desk.js';
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
  renameDesk,
  deactivateDesk,
  activateDesk,
  user = ADMIN,
  guarded = false,
}: {
  fetchDesks: DesksFetcher;
  addDesk?: AddDeskFetcher;
  renameDesk?: RenameDeskFetcher;
  deactivateDesk?: DeactivateDeskFetcher;
  activateDesk?: ActivateDeskFetcher;
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

  const screen = (
    <Desks
      fetchDesks={fetchDesks}
      addDesk={addDesk}
      renameDesk={renameDesk}
      deactivateDesk={deactivateDesk}
      activateDesk={activateDesk}
    />
  );

  return (
    <MemoryRouter initialEntries={['/admin/desks']}>
      <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
        <Primer user={user}>
          <Routes>
            <Route path="/bookings" element={<p>My bookings</p>} />
            <Route path="/admin/desks" element={guarded ? <RequireRole role="admin">{screen}</RequireRole> : screen} />
            <Route path="/admin/bookings" element={<p>All bookings</p>} />
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
  it('renders the empty state with no table and an enabled Add desk action (US-016/AC-06 — US-017 deletes US-016\'s disabled treatment)', async () => {
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

describe('Desks — edit a desk (US-018/AC-01, AC-02, AC-04, AC-08)', () => {
  it('clicking Edit on a row with upcoming bookings opens the dialog showing the warning', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} />);
    await screen.findAllByText('A-01');

    const [edit] = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(edit!);

    const dialog = screen.getByRole('dialog', { name: 'Edit desk A-01' });
    expect(within(dialog).getByLabelText('Desk number')).toHaveValue('A-01');
    expect(
      within(dialog).getByText("3 people have this desk booked. Renaming it changes what they see — they won't be told."),
    ).toBeInTheDocument();
  });

  it('clicking Edit on a row with no upcoming bookings opens the dialog with NO warning', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([INACTIVE])} />);
    await screen.findAllByText('C-05');

    const [edit] = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(edit!);

    expect(screen.getByRole('dialog', { name: 'Edit desk C-05' })).toBeInTheDocument();
    expect(screen.queryByText(/have this desk booked/)).not.toBeInTheDocument();
  });

  it('saving a new number re-sorts the row into position, refetches nothing, and shows the saved toast (US-018/AC-01)', async () => {
    let fetchCount = 0;
    const fetchDesks: DesksFetcher = async () => {
      fetchCount += 1;
      return okDesks([ACTIVE, INACTIVE]); // A-01, C-05
    };
    const renameDesk: RenameDeskFetcher = async () => ({
      kind: 'ok',
      desk: { id: ACTIVE.id, deskNumber: 'B-05', isActive: true },
    });

    render(<SignedIn fetchDesks={fetchDesks} renameDesk={renameDesk} />);
    await screen.findAllByText('A-01');

    const [edit] = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(edit!);
    const dialog = screen.getByRole('dialog', { name: 'Edit desk A-01' });
    await userEvent.clear(within(dialog).getByLabelText('Desk number'));
    await userEvent.type(within(dialog).getByLabelText('Desk number'), 'b-05');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchCount).toBe(1); // no refetch — updated in place
    expect(await screen.findByText('Desk number updated to B-05.')).toBeInTheDocument();
    expect(screen.getAllByText('B-05').length).toBeGreaterThan(0);
  });

  it('a duplicate desk number keeps the edit dialog open with the collision named (US-018/AC-02)', async () => {
    const renameDesk: RenameDeskFetcher = async () => ({ kind: 'duplicate' });
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE, INACTIVE])} renameDesk={renameDesk} />);
    await screen.findAllByText('A-01');

    const [edit] = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(edit!);
    const dialog = screen.getByRole('dialog', { name: 'Edit desk A-01' });
    await userEvent.clear(within(dialog).getByLabelText('Desk number'));
    await userEvent.type(within(dialog).getByLabelText('Desk number'), 'C-05');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('C-05 is already taken by another desk.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit desk A-01' })).toBeInTheDocument();
  });

  it('Cancel closes the edit dialog without renaming anything', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} />);
    await screen.findAllByText('A-01');

    const [edit] = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(edit!);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('A-01').length).toBeGreaterThan(0);
  });

  it('a second activation while the first save is in flight issues exactly one request (US-018/AC-08)', async () => {
    let resolveRename!: (outcome: RenameDeskOutcome) => void;
    let calls = 0;
    const renameDesk: RenameDeskFetcher = () => {
      calls += 1;
      return new Promise((resolve) => (resolveRename = resolve));
    };
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} renameDesk={renameDesk} />);
    await screen.findAllByText('A-01');

    const [edit] = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(edit!);
    const dialog = screen.getByRole('dialog', { name: 'Edit desk A-01' });
    await userEvent.clear(within(dialog).getByLabelText('Desk number'));
    await userEvent.type(within(dialog).getByLabelText('Desk number'), 'B-05');
    const confirm = within(dialog).getByRole('button', { name: 'Save changes' });
    await userEvent.click(confirm);
    await userEvent.click(confirm);

    expect(calls).toBe(1);
    resolveRename({ kind: 'ok', desk: { id: ACTIVE.id, deskNumber: 'B-05', isActive: true } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Desks — activate a desk (US-019/AC-01, AC-09, AC-10)', () => {
  it('clicking Activate issues the request with NO dialog rendered at any point (US-019/AC-09)', async () => {
    const activateDesk: ActivateDeskFetcher = async () => ({
      kind: 'ok',
      desk: { id: INACTIVE.id, deskNumber: INACTIVE.deskNumber, isActive: true },
    });
    render(<SignedIn fetchDesks={async () => okDesks([INACTIVE])} activateDesk={activateDesk} />);
    await screen.findAllByText('C-05');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    const [toggle] = screen.getAllByRole('button', { name: 'Activate' });
    await userEvent.click(toggle!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('updates the row in place, no refetch, and shows the toast (US-019/AC-01, AC-10)', async () => {
    let fetchCount = 0;
    const fetchDesks: DesksFetcher = async () => {
      fetchCount += 1;
      return okDesks([ACTIVE, INACTIVE]);
    };
    const activateDesk: ActivateDeskFetcher = async () => ({
      kind: 'ok',
      desk: { id: INACTIVE.id, deskNumber: INACTIVE.deskNumber, isActive: true },
    });
    render(<SignedIn fetchDesks={fetchDesks} activateDesk={activateDesk} />);
    await screen.findAllByText('C-05');

    const [toggle] = screen.getAllByRole('button', { name: 'Activate' });
    await userEvent.click(toggle!);

    expect(await screen.findByText('C-05 is active. People can book it from today.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Deactivate/ }).length).toBeGreaterThan(0);
    expect(fetchCount).toBe(1);
  });

  it('a second click while the first activation is in flight issues exactly one request', async () => {
    let resolveActivate!: (outcome: ActivateDeskOutcome) => void;
    let calls = 0;
    const activateDesk: ActivateDeskFetcher = () => {
      calls += 1;
      return new Promise((resolve) => (resolveActivate = resolve));
    };
    render(<SignedIn fetchDesks={async () => okDesks([INACTIVE])} activateDesk={activateDesk} />);
    await screen.findAllByText('C-05');

    const [toggle] = screen.getAllByRole('button', { name: 'Activate' });
    await userEvent.click(toggle!);
    await userEvent.click(toggle!);

    expect(calls).toBe(1);
    resolveActivate({ kind: 'ok', desk: { id: INACTIVE.id, deskNumber: INACTIVE.deskNumber, isActive: true } });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Deactivate/ }).length).toBeGreaterThan(0));
  });

  it('a failed activation shows a page-level alert with the row unchanged (design note §8.4)', async () => {
    const activateDesk: ActivateDeskFetcher = async () => ({ kind: 'failed' });
    render(<SignedIn fetchDesks={async () => okDesks([INACTIVE])} activateDesk={activateDesk} />);
    await screen.findAllByText('C-05');

    const [toggle] = screen.getAllByRole('button', { name: 'Activate' });
    await userEvent.click(toggle!);

    expect(await screen.findByText("We couldn’t activate C-05 just now. Try again.")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Activate' }).length).toBeGreaterThan(0);
  });
});

describe('Desks — deactivate a desk (US-019/AC-01, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-10, AC-11)', () => {
  it('clicking Deactivate on an eligible desk opens ST-05 with the confirmation (US-019/AC-03)', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);

    expect(screen.getByRole('alertdialog', { name: 'Deactivate A-01?' })).toBeInTheDocument();
    expect(
      screen.getByText('It disappears from everyone’s booking options straight away. Past bookings on it are kept.'),
    ).toBeInTheDocument();
  });

  it('confirming issues the request and on success updates the row in place, no refetch, and shows the toast (US-019/AC-01, AC-10)', async () => {
    let fetchCount = 0;
    const fetchDesks: DesksFetcher = async () => {
      fetchCount += 1;
      return okDesks([ACTIVE, INACTIVE]);
    };
    const deactivateDesk: DeactivateDeskFetcher = async () => ({
      kind: 'ok',
      desk: { id: ACTIVE.id, deskNumber: ACTIVE.deskNumber, isActive: false },
    });
    render(<SignedIn fetchDesks={fetchDesks} deactivateDesk={deactivateDesk} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(await screen.findByText('A-01 is inactive. It’s no longer bookable.')).toBeInTheDocument();
    expect(fetchCount).toBe(1);
  });

  it('the row keeps its position among the desk rows after deactivation (US-019/AC-10)', async () => {
    const deactivateDesk: DeactivateDeskFetcher = async () => ({
      kind: 'ok',
      desk: { id: ACTIVE.id, deskNumber: ACTIVE.deskNumber, isActive: false },
    });
    const { container } = render(
      <SignedIn fetchDesks={async () => okDesks([ACTIVE, INACTIVE])} deactivateDesk={deactivateDesk} />,
    );
    await screen.findAllByText('A-01');

    const rowsBefore = [...container.querySelectorAll('.desk-inventory-table [data-desk-row]')].map((el) =>
      el.getAttribute('data-desk-row'),
    );

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    const rowsAfter = [...container.querySelectorAll('.desk-inventory-table [data-desk-row]')].map((el) =>
      el.getAttribute('data-desk-row'),
    );
    expect(rowsAfter).toEqual(rowsBefore);
  });

  it('Keep it active closes the dialog without deactivating anything', async () => {
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    await userEvent.click(screen.getByRole('button', { name: 'Keep it active' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('A-01').length).toBeGreaterThan(0);
  });

  it('a blocked response switches the SAME mounted dialog to ST-06 with the server’s count, not the row’s own — provably 0 on this path (US-019/AC-04, AC-08)', async () => {
    const deactivateDesk: DeactivateDeskFetcher = async () => ({ kind: 'blocked', upcomingBookings: 3 });
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} deactivateDesk={deactivateDesk} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    expect(screen.getByRole('alertdialog', { name: 'Deactivate A-01?' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }));

    const blocked = await screen.findByRole('alertdialog', { name: 'A-01 can’t be deactivated yet.' });
    expect(blocked).toBeInTheDocument();
    expect(
      screen.getByText('3 people have it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See those 3 bookings' })).toBeInTheDocument();
  });

  it('a row whose held bookedAhead is stale-high still shows ST-06 correctly with the SERVER count (US-019/AC-08)', async () => {
    const staleHigh = { ...ACTIVE, bookedAhead: 99 };
    const deactivateDesk: DeactivateDeskFetcher = async () => ({ kind: 'blocked', upcomingBookings: 3 });
    render(<SignedIn fetchDesks={async () => okDesks([staleHigh])} deactivateDesk={deactivateDesk} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText(/^3 people have it booked/)).toBeInTheDocument();
    expect(screen.queryByText(/^99 people/)).not.toBeInTheDocument();
  });

  it('the primary action in the blocked dialog navigates to All bookings (US-019/AC-06)', async () => {
    const deactivateDesk: DeactivateDeskFetcher = async () => ({ kind: 'blocked', upcomingBookings: 3 });
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} deactivateDesk={deactivateDesk} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }));
    await userEvent.click(await screen.findByRole('link', { name: 'See those 3 bookings' }));

    expect(await screen.findByText('All bookings')).toBeInTheDocument();
  });

  it('a failure that is not the block keeps the dialog open, shows the danger alert, and the desk is unchanged (US-019/AC-11)', async () => {
    const deactivateDesk: DeactivateDeskFetcher = async () => ({ kind: 'failed' });
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} deactivateDesk={deactivateDesk} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText("We couldn’t deactivate A-01 just now. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    // Nothing changed — the toggle everywhere else still reads Deactivate for this desk.
    expect(screen.getAllByRole('button', { name: /^Deactivate/ }).length).toBeGreaterThan(0);
  });

  it('a second confirm click while the first save is in flight issues exactly one request (US-019/AC-03)', async () => {
    let resolveDeactivate!: (outcome: DeactivateDeskOutcome) => void;
    let calls = 0;
    const deactivateDesk: DeactivateDeskFetcher = () => {
      calls += 1;
      return new Promise((resolve) => (resolveDeactivate = resolve));
    };
    render(<SignedIn fetchDesks={async () => okDesks([ACTIVE])} deactivateDesk={deactivateDesk} />);
    await screen.findAllByText('A-01');

    const [toggle] = screen.getAllByRole('button', { name: /^Deactivate/ });
    await userEvent.click(toggle!);
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' });
    await userEvent.click(confirm);
    await userEvent.click(confirm);

    expect(calls).toBe(1);
    resolveDeactivate({ kind: 'ok', desk: { id: ACTIVE.id, deskNumber: ACTIVE.deskNumber, isActive: false } });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
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

describe('Desks — table/card breakpoint at 768px (US-033/AC-03)', () => {
  it('is stacked cards at 768px — the table needs 1024px (US-033/AC-03)', () => {
    // jsdom performs no layout, so the stylesheet is the honest proxy for the breakpoint (same
    // device Dialog.spec.tsx uses). `.desk-inventory-table` is `display: none` by default
    // (unguarded), only becoming a table inside the 1024px query — 768px is still below it.
    const HERE = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(HERE, 'desks.css'), 'utf8');
    const defaultRules = css.split('@media')[0] ?? '';
    expect(defaultRules).toMatch(/\.desk-inventory-table\s*\{[^}]*display:\s*none/);

    const tableBreakpoint = css.match(/@media \(min-width: 1024px\) \{[\s\S]*\}/)?.[0] ?? '';
    expect(tableBreakpoint).toMatch(/\.desk-inventory-table\s*\{[^}]*display:\s*table/);
  });
});

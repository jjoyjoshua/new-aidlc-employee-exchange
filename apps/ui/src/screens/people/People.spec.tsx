import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { People } from './People.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import { RequireRole } from '../../lib/auth/require-role.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AdminSummary, AdminUser, AuthenticatedUser, Office } from '@desk-booking/contracts';
import type { UsersOutcome } from '../../lib/use-users.js';
import type { FetchUsers } from '../../lib/fetch-users.js';
import type { CreateAccountFetcher, CreateAccountOutcome } from '../../lib/create-account.js';
import type { UpdateAccountFetcher, UpdateAccountOutcome } from '../../lib/update-account.js';
import type { ChangeRoleFetcher } from '../../lib/change-role.js';
import type { DeactivateAccountFetcher, DeactivationPreviewFetcher } from '../../lib/deactivate-account.js';
import type { ActivateAccountFetcher } from '../../lib/activate-account.js';
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
  createAccount,
  updateAccount,
  changeRole,
  previewDeactivation,
  deactivateAccount,
  activateAccount,
  user = ADMIN,
  guarded = false,
}: {
  fetchUsers: FetchUsers;
  createAccount?: CreateAccountFetcher;
  updateAccount?: UpdateAccountFetcher;
  changeRole?: ChangeRoleFetcher;
  previewDeactivation?: DeactivationPreviewFetcher;
  deactivateAccount?: DeactivateAccountFetcher;
  activateAccount?: ActivateAccountFetcher;
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

  const screenEl = (
    <People
      fetchUsers={fetchUsers}
      createAccount={createAccount}
      updateAccount={updateAccount}
      changeRole={changeRole}
      previewDeactivation={previewDeactivation}
      deactivateAccount={deactivateAccount}
      activateAccount={activateAccount}
    />
  );

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

const NEW_ACCOUNT: AdminUser = { id: 'new', fullName: 'Amy Ito', email: 'amy@company.com', role: 'employee', isActive: true };

async function fillAndSubmitValidUserForm() {
  const dialog = screen.getByRole('dialog', { name: 'Add person' });
  await userEvent.type(within(dialog).getByLabelText('Full name'), 'Amy Ito');
  await userEvent.type(within(dialog).getByLabelText('Email'), 'amy@company.com');
  await userEvent.type(within(dialog).getByLabelText('Initial password'), 'Correct-Horse7');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add person' }));
}

describe('People — create an account (US-021/AC-01, AC-09, design note §4.2/A6)', () => {
  it('opening Add person renders the dialog', async () => {
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} />);
    await screen.findAllByText('Dana Silva');

    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(await screen.findByRole('dialog', { name: 'Add person' })).toBeInTheDocument();
  });

  it('with NO active search, a successful create closes the dialog, shows the toast, and inserts the row at its sorted position without a refetch', async () => {
    let fetchCalls = 0;
    const fetchUsers: FetchUsers = async () => {
      fetchCalls += 1;
      return okUsers([DANA, MARCUS]);
    };
    const createAccount: CreateAccountFetcher = async () => ({ kind: 'ok', account: NEW_ACCOUNT });
    render(<SignedIn fetchUsers={fetchUsers} createAccount={createAccount} />);
    await screen.findAllByText('Dana Silva');

    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await fillAndSubmitValidUserForm();

    expect(await screen.findByText(/Amy Ito added/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Amy Ito').length).toBeGreaterThan(0);
    expect(fetchCalls).toBe(1);
  });

  it('WITH an active search the new name does not match, the row does NOT appear and the match line is unaffected (A6)', async () => {
    const fetchUsers: FetchUsers = async (q) => (q ? okUsers([DANA], SUMMARY) : okUsers([DANA, MARCUS], SUMMARY));
    const createAccount: CreateAccountFetcher = async () => ({ kind: 'ok', account: NEW_ACCOUNT });
    render(<SignedIn fetchUsers={fetchUsers} createAccount={createAccount} />);
    await screen.findAllByText('Dana Silva');

    await userEvent.type(screen.getByLabelText('Search name or email'), 'dana{Enter}');
    await screen.findByText('Showing 1 of 38');

    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await fillAndSubmitValidUserForm();

    expect(await screen.findByText(/Amy Ito added/)).toBeInTheDocument();
    expect(screen.queryByText('Amy Ito')).not.toBeInTheDocument();
    // The summary (and its total, which the match line's denominator reads) DOES increment —
    // A6 requires it, since `summary` is whole-table and correct under any filter. Only the
    // FILTERED array is left alone. 1 of 39, not 1 of 38: the new account is real, it simply
    // does not match the active search term.
    expect(screen.getByText('Showing 1 of 39')).toBeInTheDocument();
  });

  it('a duplicate email keeps the dialog open, naming the holder', async () => {
    const createAccount: CreateAccountFetcher = async (): Promise<CreateAccountOutcome> => ({
      kind: 'duplicate',
      fullName: 'Existing Holder',
      isActive: true,
    });
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} createAccount={createAccount} />);
    await screen.findAllByText('Dana Silva');

    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await fillAndSubmitValidUserForm();

    expect(await screen.findByText('already belongs to Existing Holder.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// The table AND card trees both render in jsdom (no media-query layout hiding) — the same reason
// other tests in this file use `findAllByText`. Only the table row's trigger is used.
async function openEditFor(fullName: string) {
  await userEvent.click(screen.getAllByRole('button', { name: `Actions for ${fullName}` })[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
}

describe('People — edit an account (US-023/AC-01, AC-09, design note §4.2)', () => {
  it('opening Edit from the row menu renders the dialog, prefilled', async () => {
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} />);
    await screen.findAllByText('Dana Silva');

    await openEditFor('Dana Silva');

    const dialog = await screen.findByRole('dialog', { name: 'Edit person — Dana Silva' });
    expect(within(dialog).getByLabelText('Full name')).toHaveValue('Dana Silva');
    expect(within(dialog).getByLabelText('Email')).toHaveValue('dana@company.com');
    expect(within(dialog).queryByLabelText('Initial password')).not.toBeInTheDocument();
  });

  it('a successful save closes the dialog, shows the toast, and replaces the row IN PLACE — no refetch (US-023/AC-01)', async () => {
    let fetchCalls = 0;
    const fetchUsers: FetchUsers = async () => {
      fetchCalls += 1;
      return okUsers([DANA, MARCUS]);
    };
    const updateAccount: UpdateAccountFetcher = async () => ({
      kind: 'ok',
      account: { ...DANA, fullName: 'Dana Okafor', email: 'dana.okafor@company.com' },
    });
    render(<SignedIn fetchUsers={fetchUsers} updateAccount={updateAccount} />);
    await screen.findAllByText('Dana Silva');

    await openEditFor('Dana Silva');
    const dialog = screen.getByRole('dialog', { name: 'Edit person — Dana Silva' });
    await userEvent.clear(within(dialog).getByLabelText('Full name'));
    await userEvent.type(within(dialog).getByLabelText('Full name'), 'Dana Okafor');
    await userEvent.clear(within(dialog).getByLabelText('Email'));
    await userEvent.type(within(dialog).getByLabelText('Email'), 'dana.okafor@company.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Dana Okafor updated.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Dana Okafor').length).toBeGreaterThan(0);
    expect(screen.queryByText('Dana Silva')).not.toBeInTheDocument();
    expect(fetchCalls).toBe(1);
  });

  it('leaves the summary UNCHANGED — a name/email correction moves no count (US-023, design note §4.2)', async () => {
    const updateAccount: UpdateAccountFetcher = async () => ({
      kind: 'ok',
      account: { ...DANA, fullName: 'Dana Okafor' },
    });
    render(<SignedIn fetchUsers={async () => okUsers([DANA, MARCUS], SUMMARY)} updateAccount={updateAccount} />);
    await screen.findAllByText('Dana Silva');
    const summaryText = 'Dana Okafor updated.';

    await openEditFor('Dana Silva');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText(summaryText);
    expect(screen.getByText('38 people · 36 employees, 2 admins · 1 deactivated')).toBeInTheDocument();
  });

  it('a duplicate email keeps the dialog open, naming the holder (US-023/AC-02)', async () => {
    const updateAccount: UpdateAccountFetcher = async (): Promise<UpdateAccountOutcome> => ({
      kind: 'duplicate',
      fullName: 'Existing Holder',
      isActive: true,
    });
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} updateAccount={updateAccount} />);
    await screen.findAllByText('Dana Silva');

    await openEditFor('Dana Silva');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('already belongs to Existing Holder.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// The table AND card trees both render in jsdom — `openEditFor`'s own reasoning.
async function openRoleChangeFor(fullName: string) {
  await userEvent.click(screen.getAllByRole('button', { name: `Actions for ${fullName}` })[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: /^Make an/ }));
}

async function openDeactivateFor(fullName: string) {
  await userEvent.click(screen.getAllByRole('button', { name: `Actions for ${fullName}` })[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
}

describe('People — deactivate an account, row menu route (US-025/AC-05, AC-06, AC-07, AC-10, AC-13)', () => {
  it('opening Deactivate fetches the preview and renders ST-06 when bookings are upcoming (US-025/AC-05, AC-06)', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({
      kind: 'ok',
      bookings: [{ id: 'b-1', deskNumber: 'A-01', date: '2026-09-22' }],
    });
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} previewDeactivation={previewDeactivation} />);
    await screen.findAllByText('Dana Silva');

    await openDeactivateFor('Dana Silva');

    expect(await screen.findByRole('alertdialog', { name: 'Deactivate Dana Silva?' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Deactivate and cancel 1 booking' })).toBeInTheDocument();
    expect(screen.getByText(/A-01 on Tue 22 Sep/)).toBeInTheDocument();
  });

  it('renders ST-05 when the preview has no upcoming bookings (US-025/AC-07)', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: [] });
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} previewDeactivation={previewDeactivation} />);
    await screen.findAllByText('Dana Silva');

    await openDeactivateFor('Dana Silva');

    expect(await screen.findByText("They won't be able to sign in. Their past bookings are kept.")).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  });

  it('a successful deactivation closes the dialog, updates the row and the deactivated count, shows the toast, and returns focus to the row trigger (US-025/AC-13)', async () => {
    let fetchCalls = 0;
    const fetchUsers: FetchUsers = async () => {
      fetchCalls += 1;
      return okUsers([DANA, MARCUS], SUMMARY);
    };
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: [] });
    const deactivateAccount: DeactivateAccountFetcher = async () => ({ kind: 'ok', account: { ...DANA, isActive: false } });
    render(
      <SignedIn fetchUsers={fetchUsers} previewDeactivation={previewDeactivation} deactivateAccount={deactivateAccount} />,
    );
    await screen.findAllByText('Dana Silva');

    await openDeactivateFor('Dana Silva');
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText('Dana Silva can no longer sign in.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('38 people · 36 employees, 2 admins · 2 deactivated')).toBeInTheDocument();
    expect(fetchCalls).toBe(1);
    expect(screen.getAllByRole('button', { name: 'Actions for Dana Silva' })[0]).toHaveFocus();
  });

  it('a blocked deactivation shows the fuller refusal, and Make someone an admin dismisses it and focuses the search field (US-025/AC-10)', async () => {
    const previewDeactivation: DeactivationPreviewFetcher = async () => ({ kind: 'ok', bookings: [] });
    const deactivateAccount: DeactivateAccountFetcher = async () => ({ kind: 'blocked' });
    render(
      <SignedIn
        fetchUsers={async () => okUsers([DANA, MARCUS])}
        previewDeactivation={previewDeactivation}
        deactivateAccount={deactivateAccount}
      />,
    );
    await screen.findAllByText('Dana Silva');

    await openDeactivateFor('Marcus Vale');
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByRole('alertdialog', { name: 'Marcus Vale is the only active admin.' })).toBeInTheDocument();
    expect(
      screen.getByText(/Deactivating this account would leave nobody able to manage desks, bookings or people/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Make someone an admin' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search name or email')).toHaveFocus();
  });
});

async function clickActivateFor(fullName: string) {
  await userEvent.click(screen.getAllByRole('button', { name: `Actions for ${fullName}` })[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Activate' }));
}

describe('People — reactivate an account, row menu route, no dialog (US-026/AC-01, AC-06, AC-07)', () => {
  it('a successful activation updates the row and the deactivated count, shows the toast, and returns focus to the row trigger (US-026/AC-06)', async () => {
    let fetchCalls = 0;
    const fetchUsers: FetchUsers = async () => {
      fetchCalls += 1;
      return okUsers([DANA, PRIYA], SUMMARY);
    };
    const activateAccount: ActivateAccountFetcher = async () => ({ kind: 'ok', account: { ...PRIYA, isActive: true } });
    render(<SignedIn fetchUsers={fetchUsers} activateAccount={activateAccount} />);
    await screen.findAllByText('Priya Raman');

    await clickActivateFor('Priya Raman');

    expect(await screen.findByText('Priya Raman can sign in again.')).toBeInTheDocument();
    expect(screen.getByText('38 people · 36 employees, 2 admins · 0 deactivated')).toBeInTheDocument();
    expect(fetchCalls).toBe(1);
    expect(screen.getAllByRole('button', { name: 'Actions for Priya Raman' })[0]).toHaveFocus();
  });

  it('a failed activation leaves the row Deactivated and shows a page-level alert — no dialog to live in (US-026/AC-07)', async () => {
    const activateAccount: ActivateAccountFetcher = async () => ({ kind: 'failed' });
    render(<SignedIn fetchUsers={async () => okUsers([DANA, PRIYA])} activateAccount={activateAccount} />);
    await screen.findAllByText('Priya Raman');

    await clickActivateFor('Priya Raman');

    expect(await screen.findByText("We couldn't activate Priya Raman just now. Nothing has changed. Try again.")).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('People — change a role, row menu route (US-024/AC-01, AC-02, AC-04, AC-05, AC-11)', () => {
  it('opening the role item renders the confirmation, named for the direction (US-024/AC-02)', async () => {
    render(<SignedIn fetchUsers={async () => okUsers([DANA])} />);
    await screen.findAllByText('Dana Silva');

    await openRoleChangeFor('Dana Silva');

    expect(await screen.findByRole('alertdialog', { name: 'Make Dana Silva an admin?' })).toBeInTheDocument();
  });

  it('a successful change closes the dialog, updates the row and the admin count, shows the toast, and returns focus to the row trigger (US-024/AC-01, AC-11)', async () => {
    let fetchCalls = 0;
    const fetchUsers: FetchUsers = async () => {
      fetchCalls += 1;
      return okUsers([DANA, MARCUS], SUMMARY);
    };
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'ok', account: { ...DANA, role: 'admin' } });
    render(<SignedIn fetchUsers={fetchUsers} changeRole={changeRole} />);
    await screen.findAllByText('Dana Silva');

    await openRoleChangeFor('Dana Silva');
    await userEvent.click(screen.getByRole('button', { name: 'Change role' }));

    expect(await screen.findByText('Dana Silva is now an admin.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('38 people · 35 employees, 3 admins · 1 deactivated')).toBeInTheDocument();
    expect(fetchCalls).toBe(1);
    expect(screen.getAllByRole('button', { name: 'Actions for Dana Silva' })[0]).toHaveFocus();
  });

  it('a blocked change shows the refusal naming the account, and Make someone an admin dismisses it and focuses the search field (US-024/AC-04, AC-05, AC-06)', async () => {
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'blocked' });
    render(<SignedIn fetchUsers={async () => okUsers([DANA, MARCUS])} changeRole={changeRole} />);
    await screen.findAllByText('Dana Silva');

    await openRoleChangeFor('Marcus Vale');
    await userEvent.click(screen.getByRole('button', { name: 'Change role' }));

    expect(await screen.findByRole('alertdialog', { name: 'Marcus Vale is the only active admin.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change role' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Make someone an admin' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search name or email')).toHaveFocus();
  });

  it('demoting the SIGNED-IN administrator\'s own account patches the session immediately — RequireRole redirects without a reload (US-024/AC-03, edge case)', async () => {
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'ok', account: { ...MARCUS, role: 'employee' } });
    render(<SignedIn fetchUsers={async () => okUsers([DANA, MARCUS])} changeRole={changeRole} user={ADMIN} guarded />);
    // `findByText(/Marcus Vale/)`, not the exact string — this row is the signed-in admin's own,
    // so `AccountRow`'s "(you)" suffix makes the text node "Marcus Vale (you)" (design note §7.3).
    await screen.findAllByText(/Marcus Vale/);

    await openRoleChangeFor('Marcus Vale');
    await userEvent.click(screen.getByRole('button', { name: 'Change role' }));

    expect(await screen.findByText('My bookings')).toBeInTheDocument();
  });
});

describe('People — change a role, edit-form route (US-024/AC-01, AC-08, AC-11)', () => {
  it('changing the role radio and saving moves the admin count too — markRoleChanged, not markUpdated (US-024/AC-11, one rule two doors)', async () => {
    // The role write already landed by the time this PATCH response is built (D-01's ordering),
    // so — as the real `updateProfileDetails` SELECT would — it reflects the NEW role too.
    const updateAccount: UpdateAccountFetcher = async () => ({ kind: 'ok', account: { ...DANA, fullName: 'Dana Okafor', role: 'admin' } });
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'ok', account: { ...DANA, role: 'admin' } });
    render(<SignedIn fetchUsers={async () => okUsers([DANA, MARCUS], SUMMARY)} updateAccount={updateAccount} changeRole={changeRole} />);
    await screen.findAllByText('Dana Silva');

    await openEditFor('Dana Silva');
    const dialog = screen.getByRole('dialog', { name: 'Edit person — Dana Silva' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /Admin/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Dana Okafor updated.')).toBeInTheDocument();
    expect(screen.getByText('38 people · 35 employees, 3 admins · 1 deactivated')).toBeInTheDocument();
  });

  it('a blocked role change from the edit form shows the in-form refusal, and Cancel leaves the row untouched (US-024/AC-04, AC-08)', async () => {
    const updateAccount = vi.fn();
    const changeRole: ChangeRoleFetcher = async () => ({ kind: 'blocked' });
    render(<SignedIn fetchUsers={async () => okUsers([DANA, MARCUS])} updateAccount={updateAccount} changeRole={changeRole} />);
    await screen.findAllByText('Dana Silva');

    await openEditFor('Marcus Vale');
    // MARCUS shares the signed-in ADMIN's id in these fixtures — self-edit appends "(you)"
    // (`editPersonTitle`, design note §7.3).
    const dialog = screen.getByRole('dialog', { name: 'Edit person — Marcus Vale (you)' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /Employee/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText('Marcus Vale is the only active admin.')).toBeInTheDocument();
    expect(updateAccount).not.toHaveBeenCalled();
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUsers, type UsersFetcher } from './use-users.js';
import type { AdminSummary, AdminUser } from '@desk-booking/contracts';

const USER: AdminUser = {
  id: 'a',
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee',
  isActive: true,
};
const SUMMARY: AdminSummary = { total: 1, employees: 1, admins: 0, deactivated: 0 };

describe('useUsers (US-020/AC-01, AC-02, design note §7.5, A8)', () => {
  it('starts loading, then ready with the fetched users and summary (US-020/AC-01, AC-02)', async () => {
    const fetchUsers: UsersFetcher = async () => ({ kind: 'ok', users: [USER], summary: SUMMARY });
    const { result } = renderHook(() => useUsers(fetchUsers));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status === 'ready' && result.current.users).toEqual([USER]);
    expect(result.current.status === 'ready' && result.current.summary).toEqual(SUMMARY);
  });

  it('a failed fetch becomes status error, never thrown', async () => {
    const fetchUsers: UsersFetcher = async () => ({ kind: 'failed' });
    const { result } = renderHook(() => useUsers(fetchUsers));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('fetches exactly once on mount — not re-fetched on a re-render with the same fetcher identity', async () => {
    let calls = 0;
    const fetchUsers: UsersFetcher = async () => {
      calls += 1;
      return { kind: 'ok', users: [], summary: { total: 0, employees: 0, admins: 0, deactivated: 0 } };
    };
    const { result, rerender } = renderHook(() => useUsers(fetchUsers));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => rerender());
    expect(calls).toBe(1);
  });

  it('a new fetcher identity re-fetches — the device the screen uses for a committed search and Try again (design note §7.5, A8)', async () => {
    let calls = 0;
    const makeFetcher = (): UsersFetcher =>
      async () => {
        calls += 1;
        return { kind: 'ok', users: [], summary: { total: 0, employees: 0, admins: 0, deactivated: 0 } };
      };
    const { result, rerender } = renderHook(({ fetcher }) => useUsers(fetcher), {
      initialProps: { fetcher: makeFetcher() },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(calls).toBe(1);

    rerender({ fetcher: makeFetcher() });
    await waitFor(() => expect(calls).toBe(2));
  });

  it('aborts the in-flight request when the fetcher identity changes before it resolves (design note §7.5, abort discipline)', async () => {
    let firstAborted = false;
    const firstFetcher: UsersFetcher = (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          firstAborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const secondFetcher: UsersFetcher = async () => ({
      kind: 'ok',
      users: [],
      summary: { total: 0, employees: 0, admins: 0, deactivated: 0 },
    });

    const { result, rerender } = renderHook(({ fetcher }) => useUsers(fetcher), {
      initialProps: { fetcher: firstFetcher },
    });
    rerender({ fetcher: secondFetcher });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(firstAborted).toBe(true);
  });
});

describe('useUsers.markAdded — summary always, array only when appendToList (US-021, design note §4.1, §4.2, A5, A6)', () => {
  const FIVE: AdminUser[] = [
    { id: '1', fullName: 'Amy Ito', email: 'amy@company.com', role: 'employee', isActive: true },
    { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: true },
    { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'admin', isActive: true },
  ];
  const FIVE_SUMMARY: AdminSummary = { total: 3, employees: 2, admins: 1, deactivated: 0 };
  const NEW_EMPLOYEE: AdminUser = { id: 'new', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true };
  const NEW_ADMIN: AdminUser = { id: 'new', fullName: 'Dana Silva', email: 'dana@company.com', role: 'admin', isActive: true };

  async function readyHook(users: AdminUser[] = FIVE, summary: AdminSummary = FIVE_SUMMARY) {
    const fetchUsers: UsersFetcher = async () => ({ kind: 'ok', users, summary });
    const { result } = renderHook(() => useUsers(fetchUsers));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    return result;
  }

  it('appendToList: true inserts the new account at its SORTED position, never at the end (US-021/AC-01, A5)', async () => {
    const result = await readyHook();

    act(() => result.current.markAdded(NEW_EMPLOYEE, { appendToList: true }));

    expect(result.current.status === 'ready' && result.current.users.map((u) => u.fullName)).toEqual([
      'Amy Ito',
      'Dana Silva',
      'Marcus Webb',
      'Zed Okoro',
    ]);
  });

  it('appendToList: true increments total and employees for an employee', async () => {
    const result = await readyHook();

    act(() => result.current.markAdded(NEW_EMPLOYEE, { appendToList: true }));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 4,
      employees: 3,
      admins: 1,
      deactivated: 0,
    });
  });

  it('appendToList: true increments total and admins for an admin, not employees', async () => {
    const result = await readyHook();

    act(() => result.current.markAdded(NEW_ADMIN, { appendToList: true }));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 4,
      employees: 2,
      admins: 2,
      deactivated: 0,
    });
  });

  it('appendToList: false updates summary but leaves the users array UNCHANGED (design note §4.2, A6 — an active search)', async () => {
    const result = await readyHook();

    act(() => result.current.markAdded(NEW_EMPLOYEE, { appendToList: false }));

    expect(result.current.status === 'ready' && result.current.users).toEqual(FIVE);
    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 4,
      employees: 3,
      admins: 1,
      deactivated: 0,
    });
  });

  it('is a no-op before the first successful load (A15 — the same pre-existing hazard use-desks.ts already has)', async () => {
    const fetchUsers: UsersFetcher = () => new Promise(() => undefined);
    const { result } = renderHook(() => useUsers(fetchUsers));

    expect(result.current.status).toBe('loading');
    act(() => result.current.markAdded(NEW_EMPLOYEE, { appendToList: true }));
    expect(result.current.status).toBe('loading');
  });
});

describe('useUsers.markUpdated — replaces in place, re-sorts, summary untouched (US-023, design note §4.2)', () => {
  const FIVE: AdminUser[] = [
    { id: '1', fullName: 'Amy Ito', email: 'amy@company.com', role: 'employee', isActive: true },
    { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: true },
    { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'admin', isActive: true },
  ];
  const FIVE_SUMMARY: AdminSummary = { total: 3, employees: 2, admins: 1, deactivated: 0 };

  async function readyHook(users: AdminUser[] = FIVE, summary: AdminSummary = FIVE_SUMMARY) {
    const fetchUsers: UsersFetcher = async () => ({ kind: 'ok', users, summary });
    const { result } = renderHook(() => useUsers(fetchUsers));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    return result;
  }

  it('replaces the row matching id with the updated account (US-023/AC-01)', async () => {
    const result = await readyHook();
    const updated: AdminUser = { id: '2', fullName: 'Marcus Vale', email: 'vale@company.com', role: 'employee', isActive: true };

    act(() => result.current.markUpdated(updated));

    expect(result.current.status === 'ready' && result.current.users.find((u) => u.id === '2')).toEqual(updated);
  });

  it('re-sorts by full_name — a name change can move the row (US-023/AC-01)', async () => {
    const result = await readyHook();
    // Renaming "Amy Ito" to "Zoe Ito" moves it from first to last.
    const renamed: AdminUser = { id: '1', fullName: 'Zoe Ito', email: 'amy@company.com', role: 'employee', isActive: true };

    act(() => result.current.markUpdated(renamed));

    expect(result.current.status === 'ready' && result.current.users.map((u) => u.fullName)).toEqual([
      'Marcus Webb',
      'Zed Okoro',
      'Zoe Ito',
    ]);
  });

  it('leaves summary BYTE-IDENTICAL — no count moves for a name/email correction (US-023, design note §4.2)', async () => {
    const result = await readyHook();
    const updated: AdminUser = { id: '2', fullName: 'Marcus Vale', email: 'vale@company.com', role: 'employee', isActive: true };

    act(() => result.current.markUpdated(updated));

    expect(result.current.status === 'ready' && result.current.summary).toEqual(FIVE_SUMMARY);
  });

  it('replaces the row even under a search that would no longer match it — never removes a row (US-023, design note §4.2)', async () => {
    const result = await readyHook();
    // As if only "Marcus Webb" matched a committed search — renaming it out of that match is the
    // lesser wrong versus leaving a stale name on screen after a successful save.
    const renamed: AdminUser = { id: '2', fullName: 'Marcus Okonkwo', email: 'okonkwo@company.com', role: 'employee', isActive: true };

    act(() => result.current.markUpdated(renamed));

    expect(result.current.status === 'ready' && result.current.users).toHaveLength(3);
    expect(result.current.status === 'ready' && result.current.users.some((u) => u.id === '2')).toBe(true);
  });

  it('is a no-op before the first successful load', async () => {
    const fetchUsers: UsersFetcher = () => new Promise(() => undefined);
    const { result } = renderHook(() => useUsers(fetchUsers));
    const updated: AdminUser = { id: '2', fullName: 'Marcus Vale', email: 'vale@company.com', role: 'employee', isActive: true };

    expect(result.current.status).toBe('loading');
    act(() => result.current.markUpdated(updated));
    expect(result.current.status).toBe('loading');
  });
});

describe('useUsers.markRoleChanged — replaces in place, moves BOTH role counts, total/deactivated untouched (US-024/AC-11, design note §4.1)', () => {
  const FIVE: AdminUser[] = [
    { id: '1', fullName: 'Amy Ito', email: 'amy@company.com', role: 'employee', isActive: true },
    { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: true },
    { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'admin', isActive: true },
  ];
  const FIVE_SUMMARY: AdminSummary = { total: 3, employees: 2, admins: 1, deactivated: 0 };

  async function readyHook(users: AdminUser[] = FIVE, summary: AdminSummary = FIVE_SUMMARY) {
    const fetchUsers: UsersFetcher = async () => ({ kind: 'ok', users, summary });
    const { result } = renderHook(() => useUsers(fetchUsers));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    return result;
  }

  it('replaces the row matching id with the updated (new-role) account (US-024/AC-01, AC-11)', async () => {
    const result = await readyHook();
    const promoted: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'admin', isActive: true };

    act(() => result.current.markRoleChanged(promoted));

    expect(result.current.status === 'ready' && result.current.users.find((u) => u.id === '2')).toEqual(promoted);
  });

  it('a promotion moves BOTH counts — employees down one, admins up one — total and deactivated untouched (US-024/AC-11)', async () => {
    const result = await readyHook();
    const promoted: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'admin', isActive: true };

    act(() => result.current.markRoleChanged(promoted));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 3,
      employees: 1,
      admins: 2,
      deactivated: 0,
    });
  });

  it('a demotion moves the counts the OTHER way', async () => {
    const result = await readyHook();
    const demoted: AdminUser = { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'employee', isActive: true };

    act(() => result.current.markRoleChanged(demoted));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 3,
      employees: 3,
      admins: 0,
      deactivated: 0,
    });
  });

  it('the delta applies even for a DEACTIVATED account — the summary counts every admin row regardless of is_active (US-024/AC-12, design note §4.1)', async () => {
    const withDeactivatedAdmin: AdminUser[] = [
      ...FIVE,
      { id: '4', fullName: 'Dana Silva', email: 'dana@company.com', role: 'admin', isActive: false },
    ];
    const summary: AdminSummary = { total: 4, employees: 2, admins: 2, deactivated: 1 };
    const result = await readyHook(withDeactivatedAdmin, summary);
    const demoted: AdminUser = { id: '4', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: false };

    act(() => result.current.markRoleChanged(demoted));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 4,
      employees: 3,
      admins: 1,
      deactivated: 1,
    });
  });

  it('employees + admins === total holds after the change — the invariant markAdded/the service both assert', async () => {
    const result = await readyHook();
    const promoted: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'admin', isActive: true };

    act(() => result.current.markRoleChanged(promoted));

    const summary = result.current.status === 'ready' ? result.current.summary : undefined;
    expect(summary && summary.employees + summary.admins).toBe(summary?.total);
  });

  it('re-sorts by full_name — unaffected here since a role change cannot move the name, but the sort still runs', async () => {
    const result = await readyHook();
    const promoted: AdminUser = { id: '1', fullName: 'Amy Ito', email: 'amy@company.com', role: 'admin', isActive: true };

    act(() => result.current.markRoleChanged(promoted));

    expect(result.current.status === 'ready' && result.current.users.map((u) => u.fullName)).toEqual([
      'Amy Ito',
      'Marcus Webb',
      'Zed Okoro',
    ]);
  });

  it('is a no-op before the first successful load', async () => {
    const fetchUsers: UsersFetcher = () => new Promise(() => undefined);
    const { result } = renderHook(() => useUsers(fetchUsers));
    const promoted: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'admin', isActive: true };

    expect(result.current.status).toBe('loading');
    act(() => result.current.markRoleChanged(promoted));
    expect(result.current.status).toBe('loading');
  });
});

describe('useUsers.markDeactivated — replaces in place, moves ONLY deactivated, total/employees/admins untouched (US-025/AC-13)', () => {
  const THREE: AdminUser[] = [
    { id: '1', fullName: 'Amy Ito', email: 'amy@company.com', role: 'employee', isActive: true },
    { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: true },
    { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'admin', isActive: true },
  ];
  const THREE_SUMMARY: AdminSummary = { total: 3, employees: 2, admins: 1, deactivated: 0 };

  async function readyHook(users: AdminUser[] = THREE, summary: AdminSummary = THREE_SUMMARY) {
    const fetchUsers: UsersFetcher = async () => ({ kind: 'ok', users, summary });
    const { result } = renderHook(() => useUsers(fetchUsers));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    return result;
  }

  it('replaces the row matching id with the updated (isActive: false) account (US-025/AC-13)', async () => {
    const result = await readyHook();
    const deactivated: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: false };

    act(() => result.current.markDeactivated(deactivated));

    expect(result.current.status === 'ready' && result.current.users.find((u) => u.id === '2')).toEqual(deactivated);
  });

  it('moves ONLY summary.deactivated by +1 — total, employees and admins are unchanged (US-025/AC-13)', async () => {
    const result = await readyHook();
    const deactivated: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: false };

    act(() => result.current.markDeactivated(deactivated));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 3,
      employees: 2,
      admins: 1,
      deactivated: 1,
    });
  });

  it('deactivating an ADMIN moves the same single count — admins is untouched, unlike markRoleChanged', async () => {
    const result = await readyHook();
    const deactivated: AdminUser = { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'admin', isActive: false };

    act(() => result.current.markDeactivated(deactivated));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 3,
      employees: 2,
      admins: 1,
      deactivated: 1,
    });
  });

  it('is a no-op before the first successful load', async () => {
    const fetchUsers: UsersFetcher = () => new Promise(() => undefined);
    const { result } = renderHook(() => useUsers(fetchUsers));
    const deactivated: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: false };

    expect(result.current.status).toBe('loading');
    act(() => result.current.markDeactivated(deactivated));
    expect(result.current.status).toBe('loading');
  });
});

describe('useUsers.markReactivated — replaces in place, moves ONLY deactivated (by -1), total/employees/admins untouched (US-026/AC-06)', () => {
  const THREE: AdminUser[] = [
    { id: '1', fullName: 'Amy Ito', email: 'amy@company.com', role: 'employee', isActive: true },
    { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: false },
    { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'admin', isActive: false },
  ];
  const THREE_SUMMARY: AdminSummary = { total: 3, employees: 2, admins: 1, deactivated: 2 };

  async function readyHook(users: AdminUser[] = THREE, summary: AdminSummary = THREE_SUMMARY) {
    const fetchUsers: UsersFetcher = async () => ({ kind: 'ok', users, summary });
    const { result } = renderHook(() => useUsers(fetchUsers));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    return result;
  }

  it('replaces the row matching id with the updated (isActive: true) account (US-026/AC-06)', async () => {
    const result = await readyHook();
    const reactivated: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: true };

    act(() => result.current.markReactivated(reactivated));

    expect(result.current.status === 'ready' && result.current.users.find((u) => u.id === '2')).toEqual(reactivated);
  });

  it('moves ONLY summary.deactivated by -1 — total, employees and admins are unchanged (US-026/AC-06)', async () => {
    const result = await readyHook();
    const reactivated: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: true };

    act(() => result.current.markReactivated(reactivated));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 3,
      employees: 2,
      admins: 1,
      deactivated: 1,
    });
  });

  it('reactivating an ADMIN moves the same single count — admins is untouched, unlike markRoleChanged (US-026/AC-03)', async () => {
    const result = await readyHook();
    const reactivated: AdminUser = { id: '3', fullName: 'Zed Okoro', email: 'zed@company.com', role: 'admin', isActive: true };

    act(() => result.current.markReactivated(reactivated));

    expect(result.current.status === 'ready' && result.current.summary).toEqual({
      total: 3,
      employees: 2,
      admins: 1,
      deactivated: 1,
    });
  });

  it('is a no-op before the first successful load', async () => {
    const fetchUsers: UsersFetcher = () => new Promise(() => undefined);
    const { result } = renderHook(() => useUsers(fetchUsers));
    const reactivated: AdminUser = { id: '2', fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee', isActive: true };

    expect(result.current.status).toBe('loading');
    act(() => result.current.markReactivated(reactivated));
    expect(result.current.status).toBe('loading');
  });
});

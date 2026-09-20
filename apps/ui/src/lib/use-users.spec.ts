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

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

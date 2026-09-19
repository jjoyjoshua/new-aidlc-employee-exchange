import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDesks, type DesksFetcher } from './use-desks.js';

const DESK = { id: 'a', deskNumber: 'A-01', isActive: true };

describe('useDesks (US-014/AC-03, §7.6)', () => {
  it('starts loading, then ready with the fetched desks', async () => {
    const fetchDesks: DesksFetcher = async () => ({ kind: 'ok', desks: [DESK] });
    const { result } = renderHook(() => useDesks(fetchDesks));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', desks: [DESK] });
  });

  it('a failed fetch becomes status error, never thrown', async () => {
    const fetchDesks: DesksFetcher = async () => ({ kind: 'failed' });
    const { result } = renderHook(() => useDesks(fetchDesks));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('fetches exactly once on mount — not re-fetched on a re-render with the same fetcher', async () => {
    let calls = 0;
    const fetchDesks: DesksFetcher = async () => {
      calls += 1;
      return { kind: 'ok', desks: [] };
    };
    const { result, rerender } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => rerender());
    expect(calls).toBe(1);
  });
});

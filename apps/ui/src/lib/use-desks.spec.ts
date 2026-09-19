import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDesks, type DesksFetcher } from './use-desks.js';

const DESK = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 };

describe('useDesks (US-014/AC-03, §7.6)', () => {
  it('starts loading, then ready with the fetched desks', async () => {
    const fetchDesks: DesksFetcher = async () => ({ kind: 'ok', desks: [DESK] });
    const { result } = renderHook(() => useDesks(fetchDesks));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status).toBe('ready');
    expect(result.current.status === 'ready' && result.current.desks).toEqual([DESK]);
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

describe('useDesks.markAdded (US-017/AC-01, AC-06, design note §6.5)', () => {
  it('inserts the new desk into the ready list, sorted by deskNumber, without refetching', async () => {
    const A01 = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 };
    const B03 = { id: 'b', deskNumber: 'B-03', isActive: true, bookedAhead: 0 };
    let calls = 0;
    const fetchDesks: DesksFetcher = async () => {
      calls += 1;
      return { kind: 'ok', desks: [A01, B03] };
    };
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const A12 = { id: 'new', deskNumber: 'A-12', isActive: true, bookedAhead: 0 };
    act(() => result.current.markAdded(A12));

    expect(result.current.status).toBe('ready');
    expect(result.current.status === 'ready' && result.current.desks).toEqual([A01, A12, B03]);
    // Still exactly one fetch — no refetch, no skeleton flash (design note §6.5).
    expect(calls).toBe(1);
  });

  it('is a no-op when not yet ready', async () => {
    const fetchDesks: DesksFetcher = () => new Promise(() => {}); // never resolves — stays loading
    const { result } = renderHook(() => useDesks(fetchDesks));

    expect(result.current.status).toBe('loading');
    act(() => result.current.markAdded({ id: 'new', deskNumber: 'A-01', isActive: true, bookedAhead: 0 }));
    expect(result.current.status).toBe('loading');
  });
});

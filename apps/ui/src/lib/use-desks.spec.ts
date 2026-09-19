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

describe('useDesks.markRenamed (US-018/AC-01, AC-06 — rename in place, re-sort, never refetch)', () => {
  it('replaces the desk\'s number in place, without refetching, when the sort order is unaffected', async () => {
    const A01 = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 };
    const A02 = { id: 'b', deskNumber: 'A-02', isActive: true, bookedAhead: 0 };
    let calls = 0;
    const fetchDesks: DesksFetcher = async () => {
      calls += 1;
      return { kind: 'ok', desks: [A01, A02] };
    };
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.markRenamed('a', 'A-05'));

    expect(result.current.status).toBe('ready');
    expect(result.current.status === 'ready' && result.current.desks).toEqual([
      A02,
      { ...A01, deskNumber: 'A-05' },
    ]);
    expect(calls).toBe(1);
  });

  it('re-sorts the row across a zone-letter boundary (A-01 -> B-05) rather than merely updating it in place', async () => {
    const A01 = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 };
    const B03 = { id: 'b', deskNumber: 'B-03', isActive: true, bookedAhead: 0 };
    const fetchDesks: DesksFetcher = async () => ({ kind: 'ok', desks: [A01, B03] });
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.markRenamed('a', 'B-05'));

    expect(result.current.status === 'ready' && result.current.desks.map((d) => d.deskNumber)).toEqual(['B-03', 'B-05']);
  });

  it('preserves bookedAhead — the response does not carry it, so the count must not be clobbered', async () => {
    const A01 = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 };
    const fetchDesks: DesksFetcher = async () => ({ kind: 'ok', desks: [A01] });
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.markRenamed('a', 'A-09'));

    expect(result.current.status === 'ready' && result.current.desks[0]?.bookedAhead).toBe(3);
  });

  it('is a no-op when not yet ready', async () => {
    const fetchDesks: DesksFetcher = () => new Promise(() => {});
    const { result } = renderHook(() => useDesks(fetchDesks));

    expect(result.current.status).toBe('loading');
    act(() => result.current.markRenamed('a', 'A-01'));
    expect(result.current.status).toBe('loading');
  });
});

describe('useDesks.markStateChanged (US-019/AC-10 — in place, no re-sort, never refetched)', () => {
  it('flips isActive to false and sets bookedAhead to 0 on deactivation, even when the held count was stale-high (US-019/AC-10)', async () => {
    const A01 = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 };
    let calls = 0;
    const fetchDesks: DesksFetcher = async () => {
      calls += 1;
      return { kind: 'ok', desks: [A01] };
    };
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.markStateChanged('a', false));

    expect(result.current.status === 'ready' && result.current.desks).toEqual([
      { ...A01, isActive: false, bookedAhead: 0 },
    ]);
    expect(calls).toBe(1); // no refetch
  });

  it('flips isActive to true on activation and leaves bookedAhead untouched — the server never read it (US-019/AC-10)', async () => {
    const B03 = { id: 'b', deskNumber: 'B-03', isActive: false, bookedAhead: 0 };
    const fetchDesks: DesksFetcher = async () => ({ kind: 'ok', desks: [B03] });
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.markStateChanged('b', true));

    expect(result.current.status === 'ready' && result.current.desks).toEqual([{ ...B03, isActive: true }]);
  });

  it('does NOT re-sort — the row stays at its index, since desk_number is untouched (US-019/AC-10)', async () => {
    const A01 = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 };
    const B03 = { id: 'b', deskNumber: 'B-03', isActive: true, bookedAhead: 0 };
    const fetchDesks: DesksFetcher = async () => ({ kind: 'ok', desks: [B03, A01] }); // deliberately out of number order
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.markStateChanged('a', false));

    expect(result.current.status === 'ready' && result.current.desks.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('leaves every other desk untouched', async () => {
    const A01 = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 2 };
    const B03 = { id: 'b', deskNumber: 'B-03', isActive: true, bookedAhead: 1 };
    const fetchDesks: DesksFetcher = async () => ({ kind: 'ok', desks: [A01, B03] });
    const { result } = renderHook(() => useDesks(fetchDesks));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.markStateChanged('a', false));

    expect(result.current.status === 'ready' && result.current.desks[1]).toEqual(B03);
  });

  it('is a no-op when not yet ready', async () => {
    const fetchDesks: DesksFetcher = () => new Promise(() => {});
    const { result } = renderHook(() => useDesks(fetchDesks));

    expect(result.current.status).toBe('loading');
    act(() => result.current.markStateChanged('a', false));
    expect(result.current.status).toBe('loading');
  });
});

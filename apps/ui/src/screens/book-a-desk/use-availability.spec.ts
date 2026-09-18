import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAvailability } from './use-availability.js';

describe('useAvailability (US-005/AC-01, AC-08)', () => {
  it('issues exactly one request for the date it is given (US-005/AC-01)', async () => {
    const fetchAvailability = vi.fn().mockResolvedValue('ok');

    renderHook(() => useAvailability('2026-09-18', fetchAvailability));

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));
    expect(fetchAvailability).toHaveBeenCalledWith('2026-09-18', expect.any(AbortSignal));
  });

  it('issues a new request when the date changes', async () => {
    const fetchAvailability = vi.fn().mockResolvedValue('ok');
    const { rerender } = renderHook(({ date }) => useAvailability(date, fetchAvailability), {
      initialProps: { date: '2026-09-18' },
    });
    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));

    rerender({ date: '2026-09-21' });

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
    expect(fetchAvailability).toHaveBeenLastCalledWith('2026-09-21', expect.any(AbortSignal));
  });

  it('discards a response that resolves after a later one — latest wins, not last-resolved (US-005/AC-08)', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const fetchAvailability = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));

    const { result, rerender } = renderHook(({ date }) => useAvailability(date, fetchAvailability), {
      initialProps: { date: '2026-09-18' },
    });
    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));

    rerender({ date: '2026-09-21' });
    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));

    // The SECOND request resolves first, then the FIRST resolves after it. The first request's
    // payload must never be the one rendered — resolution order is the trap, not call order.
    resolveSecond('second-payload');
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: 'second-payload' }));

    resolveFirst('first-payload');
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual({ status: 'ready', data: 'second-payload' });
  });

  it('reports loading while the request for the current date is outstanding', () => {
    const fetchAvailability = vi.fn().mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useAvailability('2026-09-18', fetchAvailability));

    expect(result.current).toEqual({ status: 'loading' });
  });
});

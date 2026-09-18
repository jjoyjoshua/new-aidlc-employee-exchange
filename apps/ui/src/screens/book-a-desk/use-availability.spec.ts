import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAvailability, type AvailabilityOutcome } from './use-availability.js';
import type { AvailabilityResponse } from '@desk-booking/contracts';

const ok = (data: AvailabilityResponse): AvailabilityOutcome => ({ kind: 'ok', data });
const failed: AvailabilityOutcome = { kind: 'failed' };

const RESPONSE_A: AvailabilityResponse = { date: '2026-09-18', desks: [] };
const RESPONSE_B: AvailabilityResponse = { date: '2026-09-21', desks: [] };

describe('useAvailability (US-005/AC-01, AC-08; US-006/AC-08)', () => {
  it('issues exactly one request for the date it is given (US-005/AC-01)', async () => {
    const fetchAvailability = vi.fn().mockResolvedValue(ok(RESPONSE_A));

    renderHook(() => useAvailability('2026-09-18', fetchAvailability));

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));
    expect(fetchAvailability).toHaveBeenCalledWith('2026-09-18', expect.any(AbortSignal));
  });

  it('issues a new request when the date changes', async () => {
    const fetchAvailability = vi.fn().mockResolvedValue(ok(RESPONSE_A));
    const { rerender } = renderHook(({ date }) => useAvailability(date, fetchAvailability), {
      initialProps: { date: '2026-09-18' },
    });
    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));

    rerender({ date: '2026-09-21' });

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
    expect(fetchAvailability).toHaveBeenLastCalledWith('2026-09-21', expect.any(AbortSignal));
  });

  it('discards a response that resolves after a later one — latest wins, not last-resolved (US-005/AC-08)', async () => {
    let resolveFirst!: (value: AvailabilityOutcome) => void;
    let resolveSecond!: (value: AvailabilityOutcome) => void;
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
    resolveSecond(ok(RESPONSE_B));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: RESPONSE_B }));

    resolveFirst(ok(RESPONSE_A));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toMatchObject({ status: 'ready', data: RESPONSE_B });
  });

  it('reports loading while the request for the current date is outstanding', () => {
    const fetchAvailability = vi.fn().mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useAvailability('2026-09-18', fetchAvailability));

    expect(result.current).toMatchObject({ status: 'loading' });
  });

  it('a failed outcome for the current request yields status: error (US-006/AC-08)', async () => {
    const fetchAvailability = vi.fn().mockResolvedValue(failed);

    const { result } = renderHook(() => useAvailability('2026-09-18', fetchAvailability));

    await waitFor(() => expect(result.current).toMatchObject({ status: 'error' }));
  });

  it('a superseded request\'s failure — including one caused by ITS OWN abort — never paints over the current date\'s data (US-006 design note §4.1, the story\'s most likely defect)', async () => {
    let resolveFirst!: (value: AvailabilityOutcome) => void;
    const fetchAvailability = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => Promise.resolve(ok(RESPONSE_B)));

    const { result, rerender } = renderHook(({ date }) => useAvailability(date, fetchAvailability), {
      initialProps: { date: '2026-09-18' },
    });
    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));

    rerender({ date: '2026-09-21' });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: RESPONSE_B }));

    // The FIRST request's failure (its own abort, or a genuine race) resolves AFTER the second
    // one has already succeeded. It must never flip the screen to the error state for a date
    // that is no longer even selected.
    resolveFirst(failed);
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toMatchObject({ status: 'ready', data: RESPONSE_B });
  });

  it('retry() re-issues a request for the same date (US-006/AC-08)', async () => {
    const fetchAvailability = vi.fn().mockResolvedValue(ok(RESPONSE_A));

    const { result } = renderHook(() => useAvailability('2026-09-18', fetchAvailability));
    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));

    result.current.retry();

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
    expect(fetchAvailability).toHaveBeenLastCalledWith('2026-09-18', expect.any(AbortSignal));
  });
});

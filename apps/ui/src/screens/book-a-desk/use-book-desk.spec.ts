import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBookDesk, type CreateBookingFetcher, type CreateBookingOutcome } from './use-book-desk.js';

const ok = (): CreateBookingOutcome => ({
  kind: 'ok',
  booking: {
    id: 'b1',
    deskId: 'd1',
    deskNumber: 'A-02',
    date: '2026-09-16',
    status: 'confirmed',
    confirmationEmail: 'priya@company.com',
  },
});

describe('useBookDesk — busy state (US-007/AC-09, FR-15)', () => {
  it('is not busy before any confirm call', () => {
    const { result } = renderHook(() => useBookDesk(vi.fn()));
    expect(result.current.busy).toBe(false);
  });

  it('is busy while a confirm request is in flight, and idle again once it resolves', async () => {
    let resolveFetch!: (value: CreateBookingOutcome) => void;
    const createBooking: CreateBookingFetcher = () => new Promise((resolve) => (resolveFetch = resolve));
    const { result } = renderHook(() => useBookDesk(createBooking));

    act(() => {
      void result.current.confirm({ date: '2026-09-16', deskId: 'd1' });
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      resolveFetch(ok());
    });
    expect(result.current.busy).toBe(false);
  });

  it('a second confirm() call before the first resolves issues no second request — exactly one booking exists (US-007/AC-09)', async () => {
    let resolveFetch!: (value: CreateBookingOutcome) => void;
    const createBooking = vi.fn<CreateBookingFetcher>(() => new Promise((resolve) => (resolveFetch = resolve)));
    const { result } = renderHook(() => useBookDesk(createBooking));

    let second: CreateBookingOutcome | undefined;
    act(() => {
      void result.current.confirm({ date: '2026-09-16', deskId: 'd1' });
    });
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));

    await act(async () => {
      second = await result.current.confirm({ date: '2026-09-16', deskId: 'd1' });
    });

    // The de-dup happens at THIS layer (design's own point: not just the button's disabled
    // prop) — createBooking is still called exactly once even though confirm() was invoked
    // twice.
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(second).toBeUndefined();

    await act(async () => {
      resolveFetch(ok());
    });
  });

  it('a confirm call after a previous one resolved is allowed — the guard is per in-flight request, not permanent', async () => {
    const createBooking = vi.fn<CreateBookingFetcher>().mockResolvedValue(ok());
    const { result } = renderHook(() => useBookDesk(createBooking));

    await act(async () => {
      await result.current.confirm({ date: '2026-09-16', deskId: 'd1' });
    });
    await act(async () => {
      await result.current.confirm({ date: '2026-09-16', deskId: 'd1' });
    });

    expect(createBooking).toHaveBeenCalledTimes(2);
  });
});

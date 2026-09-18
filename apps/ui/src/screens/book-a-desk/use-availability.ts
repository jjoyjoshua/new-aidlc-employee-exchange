/**
 * The latest-wins fetch seam behind `BookADesk` (US-005/AC-01, AC-08; US-006/AC-08).
 *
 * Private to this screen, not `lib/api-client.ts` — latest-wins is a property of THIS screen's
 * interaction (US-005/D-04). `fetchAvailability` is the real `GET /api/bookings/availability`
 * call, adapted from `ApiResult` by `fetch-availability.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import type { AvailabilityResponse, OfficeDate } from '@desk-booking/contracts';

export type AvailabilityOutcome =
  | { kind: 'ok'; data: AvailabilityResponse }
  /** Everything US-006/AC-08 covers: a transport failure, a timeout, a 5xx, a 4xx refusal, a
   *  body this build cannot parse. One outcome, because ST-06 is one state (design note §2.7). */
  | { kind: 'failed' };

export type AvailabilityFetcher = (date: OfficeDate, signal: AbortSignal) => Promise<AvailabilityOutcome>;

export type AvailabilityState =
  | { status: 'loading' }
  | { status: 'ready'; data: AvailabilityResponse }
  | { status: 'error' };

/** US-006/AC-08 — `retry` re-issues the request for the same date. Re-setting the date would not
 *  re-fire the effect below, since the dependency would not change. */
export type UseAvailabilityResult = AvailabilityState & { retry: () => void };

/**
 * Issues exactly one request per `date` change (or `retry()` call). A monotonically increasing
 * request id — not response order — decides what paints: if a later request's response arrives
 * before an earlier one's, the earlier one is discarded on arrival rather than allowed to paint
 * over it (US-005/AC-08).
 *
 * **The failure path shares the exact same guard as the success path (US-006 design note §4.1 —
 * the story's most likely defect).** `controller.abort()` in the cleanup below makes a
 * superseded request's OWN abort resolve as a failure too, because `api-client`'s catch does not
 * distinguish our own abort from a real network error. Painting an error without this guard
 * means: change the date, the old request's abort lands, and a fresh render for the NEW date is
 * replaced by a stale failure.
 */
export function useAvailability(date: OfficeDate, fetchAvailability: AvailabilityFetcher): UseAvailabilityResult {
  const [state, setState] = useState<AvailabilityState>({ status: 'loading' });
  const latestRequestId = useRef(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchAvailability(date, controller.signal).then(
      (outcome) => {
        if (latestRequestId.current !== requestId) return; // superseded OR aborted — discard
        setState(outcome.kind === 'ok' ? { status: 'ready', data: outcome.data } : { status: 'error' });
      },
      // A fetcher that rejects is a defect, not an outcome — guarded identically so a
      // superseded rejection cannot paint over fresh data either.
      () => {
        if (latestRequestId.current === requestId) setState({ status: 'error' });
      },
    );

    return () => controller.abort();
  }, [date, fetchAvailability, attempt]);

  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

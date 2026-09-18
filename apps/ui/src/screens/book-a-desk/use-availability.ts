/**
 * The latest-wins fetch seam behind `BookADesk` (US-005/AC-01, AC-08).
 *
 * Private to this screen, not `lib/api-client.ts` — latest-wins is a property of THIS screen's
 * interaction, not of the transport (US-005/D-04). `fetchAvailability` is declared here and
 * filled in for real by US-006 (design note §4); this story only owns *when* a request is
 * issued and *which* response is allowed to paint.
 */
import { useEffect, useRef, useState } from 'react';
import type { OfficeDate } from '@desk-booking/contracts';

export type AvailabilityFetcher = (date: OfficeDate, signal: AbortSignal) => Promise<unknown>;

export type AvailabilityState = { status: 'loading' } | { status: 'ready'; data: unknown };

/**
 * Issues exactly one request per `date` change. A monotonically increasing request id — not
 * response order — decides what paints: if a later request's response arrives before an
 * earlier one's, the earlier one is discarded on arrival rather than allowed to paint over it
 * (AC-08). The date control's own interactivity is this screen's concern, not this hook's; this
 * hook never disables anything.
 */
export function useAvailability(date: OfficeDate, fetchAvailability: AvailabilityFetcher): AvailabilityState {
  const [state, setState] = useState<AvailabilityState>({ status: 'loading' });
  const latestRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchAvailability(date, controller.signal).then(
      (data) => {
        if (latestRequestId.current === requestId) setState({ status: 'ready', data });
      },
      () => {
        // Error handling belongs to US-006's ST-06 (availability load failure), which owns what
        // the request actually returns. Out of scope here.
      },
    );

    return () => controller.abort();
  }, [date, fetchAvailability]);

  return state;
}

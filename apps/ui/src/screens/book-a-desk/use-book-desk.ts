/**
 * Owns the confirm request's in-flight state for `BookADesk` (US-007/AC-09, FR-15).
 *
 * The de-dup guarantee lives HERE, at the data layer, not only in `ConfirmBookingBar`'s
 * `disabled`/`busy` prop (Architect design note §7 makes the analogous point for selection —
 * this is the same discipline applied to the request itself): a second `confirm()` call while
 * one is already in flight issues no second request, whatever called it. The UI's disabled
 * button is what a person experiences; this ref is what actually makes "exactly one booking
 * exists" true regardless.
 */
import { useCallback, useRef, useState } from 'react';
import type { Booking, OfficeDate } from '@desk-booking/contracts';

export type CreateBookingOutcome =
  | { kind: 'ok'; booking: Booking }
  /** US-007/AC-08 — the desk-per-day index fired. */
  | { kind: 'desk_conflict' }
  /** US-007/AC-05 — the user-per-day index fired. */
  | { kind: 'user_conflict' }
  /**
   * US-007/AC-10. Everything else collapses here on purpose: `date_not_bookable`,
   * `desk_not_found` and `desk_inactive` are unreachable through this screen's own controls
   * (the same reasoning `fetch-availability.ts` already applies to `GET /availability`'s date
   * guard), and a genuine 5xx, a timeout or a lost connection are indistinguishable from each
   * other to a person on the other end — the interface genuinely cannot tell which happened,
   * and AC-10's own edge case says that plainly rather than guessing.
   */
  | { kind: 'failed' };

export type CreateBookingFetcher = (
  input: { date: OfficeDate; deskId: string },
  signal: AbortSignal,
) => Promise<CreateBookingOutcome>;

export interface UseBookDeskResult {
  busy: boolean;
  /** `undefined` means "ignored — a request was already in flight," never a network outcome. */
  confirm: (input: { date: OfficeDate; deskId: string }) => Promise<CreateBookingOutcome | undefined>;
}

export function useBookDesk(createBooking: CreateBookingFetcher): UseBookDeskResult {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const confirm = useCallback<UseBookDeskResult['confirm']>(
    async (input) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setBusy(true);
      try {
        const controller = new AbortController();
        return await createBooking(input, controller.signal);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [createBooking],
  );

  return { busy, confirm };
}

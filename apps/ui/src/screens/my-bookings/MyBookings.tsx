/**
 * SCR-002 — My bookings. **A stub.**
 *
 * US-001 delivers this address because AC-01 lands an employee here and AC-03 bounces one here
 * from an admin address. Its content — the booking list, the 30-day window, cancellation — is
 * US-010's and US-011's, under those stories' review and against SCR-002's own frames. AC-03's
 * "visible in Upcoming" half is consequently not provable yet: there is no list here for a row to
 * be visible IN until US-010 builds it. That is a gap in US-007 discovered during
 * implementation, not a silent decision — see `decisions.md` D-08 in this story's spec package.
 *
 * US-004/AC-07 adds one piece of behaviour ahead of that content: SCR-010 ST-05's confirmation,
 * carried here on the navigation that follows a successful forced password change. US-007/AC-04
 * adds a second, same shape: the booking confirmation naming the desk, the date and the address
 * the confirmation email went to. Both `Toast`s have no dismiss control (Figma node 31:11 for the
 * first; the story text's "carried by the destination rather than needing to be dismissed" for
 * the second) — the decision to show either is captured once at mount rather than re-derived on
 * every render, so a later navigation to this same address starts clean.
 */
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Toast } from '../../components/toast/Toast.js';

interface BookingConfirmationState {
  deskNumber: string;
  dateLabel: string;
  confirmationEmail: string;
}

export function MyBookings() {
  const location = useLocation();
  const state = location.state as { toast?: string; bookingConfirmation?: BookingConfirmationState } | null;
  const [showPasswordToast] = useState(() => state?.toast === 'password-saved');
  // Captured once, same reasoning as `showPasswordToast` — a later visit to `/bookings` (e.g. a
  // second booking) must not keep re-showing a stale confirmation from a `location.state` object
  // React Router still carries.
  const [bookingConfirmation] = useState(() => state?.bookingConfirmation);

  return (
    <>
      {showPasswordToast ? <Toast>Password saved. This is the one to use from now on.</Toast> : null}
      {bookingConfirmation ? (
        <Toast>
          {bookingConfirmation.deskNumber} booked for {bookingConfirmation.dateLabel}. Confirmation emailed to{' '}
          {bookingConfirmation.confirmationEmail}.
        </Toast>
      ) : null}
      <h1>My bookings</h1>
    </>
  );
}

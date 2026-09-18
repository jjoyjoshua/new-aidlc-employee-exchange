/**
 * SCR-002 — My bookings. **A stub.**
 *
 * US-001 delivers this address because AC-01 lands an employee here and AC-03 bounces one here
 * from an admin address. Its content — the booking list, the 30-day window, cancellation — is
 * US-010's and US-011's, under those stories' review and against SCR-002's own frames.
 *
 * US-004/AC-07 adds one piece of behaviour ahead of that content: SCR-010 ST-05's confirmation,
 * carried here on the navigation that follows a successful forced password change. The `Toast`
 * itself has no dismiss control (Figma node 31:11 — "not a screen she has to dismiss: the
 * destination carries it"), so the decision to show it is captured once at mount rather than
 * re-derived on every render — a later navigation to this same address starts clean.
 */
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Toast } from '../../components/toast/Toast.js';

export function MyBookings() {
  const location = useLocation();
  const [showToast] = useState(() => (location.state as { toast?: string } | null)?.toast === 'password-saved');

  return (
    <>
      {showToast ? <Toast>Password saved. This is the one to use from now on.</Toast> : null}
      <h1>My bookings</h1>
    </>
  );
}

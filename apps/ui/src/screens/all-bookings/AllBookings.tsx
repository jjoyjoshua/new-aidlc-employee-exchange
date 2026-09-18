/**
 * SCR-005 — All bookings. **A stub.**
 *
 * US-001 delivers this address because AC-02 lands an administrator here. Its content — the
 * paged list, the filters, cancel-on-behalf — is US-013's, US-014's and US-015's.
 *
 * US-004/AC-07 adds SCR-010 ST-05's confirmation ahead of that content — the admin path of the
 * toast, deferred by SCR-010's own handoff to this screen's eventual build for the frame, but
 * the same component either way. The `Toast` itself has no dismiss control (Figma node 31:11),
 * so the decision to show it is captured once at mount rather than re-derived on every render.
 */
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Toast } from '../../components/toast/Toast.js';

export function AllBookings() {
  const location = useLocation();
  const [showToast] = useState(() => (location.state as { toast?: string } | null)?.toast === 'password-saved');

  return (
    <>
      {showToast ? <Toast>Password saved. This is the one to use from now on.</Toast> : null}
      <h1>All bookings</h1>
    </>
  );
}

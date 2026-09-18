/**
 * Toast — the design system's own component (Figma node 31:11), reused rather than invented.
 *
 * Its own documentation is explicit: *"This is not a screen she has to dismiss: the destination
 * carries it."* SCR-003 ST-11's booking confirmation and SCR-010 ST-05's password confirmation
 * are the same object — no dismiss control, no auto-dismiss timer, no queue. One component, one
 * message per page visit.
 *
 * `role="status"` — announced politely, not `alert`'s interrupting assertive delivery. This is
 * a confirmation of something that already succeeded, not a failure demanding attention.
 */
import type { ReactNode } from 'react';
import './toast.css';

export interface ToastProps {
  children: ReactNode;
}

export function Toast({ children }: ToastProps) {
  return (
    <div className="toast" role="status">
      {/* Figma node 11:29, Icon / check — the check carries the state as well as the green
          fill (NFR-008); exact path from the design asset. */}
      <svg className="toast__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4.16667 10.6667L8 14.5L15.8333 5.83333" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="toast__message">{children}</p>
    </div>
  );
}

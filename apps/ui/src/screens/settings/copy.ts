/**
 * SCR-004's approved copy (US-031), confirmed word-for-word against the real Figma frames
 * (`HF / SCR-004 · Settings`, file `xjFVgBbMrJUl7Ys3EX3Cbn`) — not transcribed from the
 * written spec alone.
 */

export const BROWSER_ALERTS_LABEL = 'Browser alerts';
export const BROWSER_ALERTS_DESCRIPTION = 'Get an alert when a booking is made or cancelled.';
export const REMINDERS_EMAIL_ONLY = 'Day-before reminders are email only.';
export const WAITING_FOR_BROWSER = 'Waiting for your browser to allow alerts…';

export const emailPromise = (email: string): string =>
  `Booking emails are always sent to ${email} — including your day-before reminder. You can't turn those off.`;

export const PERMISSION_DENIED_NOTE =
  "Your browser is blocking alerts for this site. We can't turn them on from here — you'd need " +
  "to allow notifications in your browser settings. Your booking emails are unaffected.";

export const UNSUPPORTED_NOTE = "This browser doesn't support alerts. Booking emails still arrive as usual.";

/** US-031/D-05. The opt-out sentence is the direct mirror of the approved opt-in sentence below
 *  — SCR-004 only approved the opt-in wording; this half is DEV's call, flagged for UX sign-off
 *  in the PR rather than blocking on it (design note §11, open item 3). */
export const changeFailedNote = (direction: 'opt-in' | 'opt-out'): string =>
  direction === 'opt-in' ? "We couldn't save that change. Your alerts are still off." : "We couldn't save that change. Your alerts are still on.";

export const LOAD_ERROR_NOTE = "We couldn't check your alert settings. Your booking emails are unaffected.";

export const TRY_AGAIN = 'Try again';
export const SIGN_OUT = 'Sign out';

export const NOTIFICATIONS_HEADING = 'Notifications';
export const YOUR_DETAILS_HEADING = 'Your details';
export const YOUR_DETAILS_OWNER_NOTE = 'Your office admin looks after these — and passwords.';

export const stateLabel = (checked: boolean): string => (checked ? 'On' : 'Off');

/** Screen-local, matching `screens/people/copy.ts`'s own `ROLE_LABEL` — each screen owns its
 *  copy rather than importing across screen boundaries. */
export const ROLE_LABEL: Record<'employee' | 'admin', string> = { employee: 'Employee', admin: 'Admin' };

/**
 * Alert — Figma `Alert` (node 32:123).
 *
 * Inline, not a toast: it sits in the flow above what it concerns. On SCR-001 it is the
 * form-level error region for ST-04 and ST-05.
 *
 * **`role="alert"` is the default, and it is load-bearing.** SCR-001 requires the error region
 * to be announced once when it appears; a `<div>` that merely becomes visible is silent to a
 * screen reader. Callers that render an alert on page load rather than in response to an action
 * should pass `live="off"` — announcing something that was always there is noise.
 *
 * **Props and events are a Complex surface.** Scoped to what SCR-001 and SCR-010 need.
 */
import type { ReactNode } from 'react';
import './alert.css';

export type AlertTone = 'danger' | 'warning';

export interface AlertProps {
  tone?: AlertTone;
  /** Leads with the fact. Off by default — SCR-007 ST-04 is what wanted it (PRIN-3). */
  title?: string;
  children: ReactNode;
  /** Recovery controls, right-aligned inside the alert. SCR-001 ST-05's **Try again**. */
  actions?: ReactNode;
  /** `assertive` announces on appearance; `off` for an alert that was always on the page. */
  live?: 'assertive' | 'off';
}

export function Alert({ tone = 'danger', title, children, actions, live = 'assertive' }: AlertProps) {
  return (
    <div
      className={`alert alert--${tone}`}
      role={live === 'off' ? undefined : 'alert'}
      aria-live={live === 'off' ? undefined : 'assertive'}
    >
      {/*
       * Figma `Icon / error-circle` (node 11:34) — "a failure with an unknown or server-side
       * cause". It is half of NFR-008's non-colour signalling: the icon and the words carry the
       * state, the border is the second cue, the fill is the third and weakest. aria-hidden
       * because the message says everything the icon does.
       */}
      <svg
        className="alert__icon"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="8" />
        <path d="M10 5.5v5" strokeLinecap="round" />
        <path d="M10 13.9v.2" strokeLinecap="round" />
      </svg>

      <div className="alert__body">
        {title ? <p className="alert__title">{title}</p> : null}
        <p className="alert__message">{children}</p>
        {actions ? <div className="alert__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/**
 * Spinner — Figma `Icon / spinner` (node 13:4).
 *
 * Decorative by default. The busy state is announced by the control it sits in — a button with
 * `aria-busy` — not by the spinner, because two announcements for one state is noise. A caller
 * that needs it to speak passes a `label`.
 */
import './spinner.css';

export interface SpinnerProps {
  /** When given, the spinner is announced. Omit it inside a control that already announces. */
  label?: string;
}

export function Spinner({ label }: SpinnerProps) {
  return (
    <svg
      className="spinner"
      viewBox="0 0 20 20"
      fill="none"
      // The rule SCR-001 names: the in-button spinner takes the BUTTON'S label colour.
      // Declared here rather than in the stylesheet so it is visible where the shape is, and
      // so a component test can actually assert it.
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      role={label ? 'status' : 'presentation'}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      {/* An arc, not a full ring: the gap is what makes the rotation legible. */}
      <circle cx="10" cy="10" r="7" strokeDasharray="33 11" />
    </svg>
  );
}

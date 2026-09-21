/**
 * Toggle — SCR-004's `toggle` component (US-031). Figma library addition: `Toggle` (`Off` /
 * `On` / `Busy` / `Disabled`), confirmed against `HF / SCR-004 · Settings` — every variant
 * carries its state as a **word** beside the switch, never the switch's colour or position
 * alone (NFR-008).
 *
 * A native `<button role="switch">`, not `<input type="checkbox">`: SCR-004's keyboard model
 * is "Tab reaches the toggle... Space toggles", which a button gives for free.
 *
 * `checked`'s rendered position is driven ENTIRELY by the caller (US-031/AC-07) — there is no
 * internal state here to go optimistic. `busy` renders the switch in its indeterminate,
 * not-yet-confirmed position (SCR-004 ST-03: "NOT snapped to on — the browser has not agreed
 * yet"), on top of whatever `checked` last confirmed.
 *
 * **Never the native `disabled` attribute.** SCR-004's own accessibility note for ST-05:
 * "A disabled toggle stays focusable so its explanation can be read by a screen reader — a
 * disabled control removed from the tab order is a disabled control nobody can find out
 * about." `aria-disabled` carries the same semantic without pulling the control out of Tab
 * order; the click handler below is what actually blocks the change.
 */
import type { ReactNode } from 'react';
import './toggle.css';

export interface ToggleProps {
  checked: boolean;
  /** SCR-004 ST-03 — in flight; the switch has not moved from its last confirmed position. */
  busy?: boolean;
  /** SCR-004 ST-05 — the browser has refused; there is nothing this control can do about it. */
  disabled?: boolean;
  /** The visible word carrying the state — "On" / "Off" / "Waiting…". Required rather than
   *  derived from `checked`, so the screen's own approved copy stays the one source of it. */
  label: ReactNode;
  onChange: (checked: boolean) => void;
  id?: string;
  'aria-describedby'?: string;
}

export function Toggle({ checked, busy = false, disabled = false, label, onChange, id, ...rest }: ToggleProps) {
  const isInert = disabled || busy;

  return (
    <span className="toggle-field">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-disabled={isInert || undefined}
        className={[
          'toggle',
          checked ? 'toggle--on' : 'toggle--off',
          busy ? 'toggle--busy' : undefined,
          disabled ? 'toggle--disabled' : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (isInert) return;
          onChange(!checked);
        }}
        {...rest}
      >
        <span className="toggle__track">
          <span className="toggle__knob" />
        </span>
      </button>
      <span className="toggle__label">{label}</span>
    </span>
  );
}

/**
 * Password field — Figma `Password field` (node 130:39).
 *
 * Built on `TextField`, so the control edge, radius and focus ring are literally the same
 * object. The frame shows the only differences: a `--s-12` gap to the toggle, and the toggle
 * set in `--t-body-sm` / `--fw-medium` / `--c-action`.
 *
 * **Tab order is field then toggle.** The toggle sits inside the field, at its right edge, and
 * is reached after it. SCR-001 used to specify the opposite; that was corrected on 2026-09-10,
 * and built as written it would have put the tab after email onto a visibility toggle for a
 * field the user had not reached yet.
 */
import { useState } from 'react';
import { TextField, type TextFieldProps } from '../text-field/TextField.js';
import './password-field.css';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing'> {
  /** Announced labels for the toggle. Defaults match SCR-001's copy. */
  showLabel?: string;
  hideLabel?: string;
  /**
   * Controlled visibility (US-021/AC-04, D-07). Every existing caller (SCR-001, SCR-010) omits
   * this and keeps the original uncontrolled, always-starts-hidden behaviour untouched.
   *
   * SCR-009 ST-09 needs it: **Suggest a password** must reveal the generated value immediately —
   * "there is no point hiding a value that must be read aloud" — and that has to happen from
   * OUTSIDE this component, on a value it did not receive from its own toggle. Internal state
   * alone cannot do that; a parent needs to be able to set visibility as a fact, not just read it.
   */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}

export function PasswordField({
  showLabel = 'Show',
  hideLabel = 'Hide',
  disabled,
  readOnly,
  visible: controlledVisible,
  onVisibleChange,
  ...rest
}: PasswordFieldProps) {
  // Never persisted. The toggle resets to hidden on every load — SCR-001's security surface
  // note, and the reason this is component state rather than anything durable. Used only when
  // the caller does not pass `visible` — every existing caller's own behaviour, unchanged.
  const [uncontrolledVisible, setUncontrolledVisible] = useState(false);
  const visible = controlledVisible ?? uncontrolledVisible;

  function setVisible(next: boolean) {
    if (onVisibleChange) onVisibleChange(next);
    else setUncontrolledVisible(next);
  }

  return (
    <TextField
      {...rest}
      type={visible ? 'text' : 'password'}
      disabled={disabled}
      readOnly={readOnly}
      trailing={
        <button
          type="button"
          className="password-field__toggle"
          // Announces which mode it is in, not merely that it was pressed.
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          disabled={disabled || readOnly}
          onClick={() => setVisible(!visible)}
        >
          {visible ? hideLabel : showLabel}
        </button>
      }
    />
  );
}

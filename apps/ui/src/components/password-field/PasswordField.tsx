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
}

export function PasswordField({
  showLabel = 'Show',
  hideLabel = 'Hide',
  disabled,
  readOnly,
  ...rest
}: PasswordFieldProps) {
  // Never persisted. The toggle resets to hidden on every load — SCR-001's security surface
  // note, and the reason this is component state rather than anything durable.
  const [visible, setVisible] = useState(false);

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
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? hideLabel : showLabel}
        </button>
      }
    />
  );
}

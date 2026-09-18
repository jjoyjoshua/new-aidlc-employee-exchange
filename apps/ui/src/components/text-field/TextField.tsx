/**
 * Text field — Figma `Text field` (node 129:30).
 *
 * Labelled text input. The Figma component description fixes three rules this implementation
 * must not drift from:
 *
 *   - the edge is `--c-border-control`, never `--c-border` (WCAG 1.4.11)
 *   - focus is the ring plus a `--bw-2` offset gap
 *   - an error carries an icon and a message, not colour alone (NFR-008)
 *
 * **Props and events are a Complex surface.** Scoped to SCR-001 and SCR-010's needs.
 */
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './text-field.css';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  label: string;
  /** The error message. Its presence is what puts the field in its invalid state. */
  error?: string | undefined;
  /**
   * Invalid styling with no message of its own (US-004/AC-04, SCR-010 ST-02) — for a field
   * whose explanation lives beside it in another element (the policy checklist), where a
   * second sentence here would either duplicate it or invent a rule nobody wrote. `error` still
   * takes precedence when both a message and this are relevant to a caller.
   */
  invalid?: boolean;
  /** Rendered inside the control, after the input — SCR-001's show/hide toggle. */
  trailing?: ReactNode;
  /** Supplied by a parent that needs to move focus here (US-001/AC-05, AC-04). */
  inputRef?: React.Ref<HTMLInputElement>;
}

export function TextField({ label, error, invalid, trailing, inputRef, readOnly, ...rest }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const isInvalid = Boolean(error) || Boolean(invalid);

  const classes = [
    'field',
    isInvalid ? 'field--invalid' : undefined,
    readOnly ? 'field--readonly' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      <div className="field__control">
        <input
          id={id}
          ref={inputRef}
          className="field__input"
          readOnly={readOnly}
          // Both are what a screen reader needs to announce the field as invalid and to read
          // the reason. `aria-invalid` alone announces "invalid" with no explanation.
          aria-invalid={isInvalid ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          {...rest}
        />
        {trailing}
      </div>

      {error ? (
        <p className="field__message" id={messageId}>
          {/* The icon is half of NFR-008's non-colour signalling; the text is the other half.
              aria-hidden because the message beside it already says everything. */}
          <svg
            className="field__message-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.5v4" strokeLinecap="round" />
            <path d="M8 11.2v.2" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Button — Figma `Button` (node 15:125), primary default variant `15:2`.
 *
 * **Its props and events are a Complex surface** (`ai/standards/task-surfaces.md`): this story
 * fixes them for the next nine screens. They are scoped to what SCR-001 and SCR-010 actually
 * need and nothing beyond — no speculative props.
 *
 * `danger` is outlined rather than solid on this component. The palette does have a
 * `--c-danger-action` fill, but it is for the destructive *dialog* confirm (SCR-002, SCR-003),
 * and introducing it here would be a token decision taken by a component. When a screen needs
 * the solid destructive button, it gets a variant then.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from '../spinner/Spinner.js';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  /** `lg` is the bottom-anchored confirm: control/lg, reached by overriding vertical padding. */
  size?: ButtonSize;
  /** Full width of its container — SCR-001's Sign in. */
  block?: boolean;
  /**
   * A request this button started is in flight (Figma `Type=Primary, State=Busy`, node 15:30).
   *
   * The label **stays** and a spinner joins it. Swapping the label for a spinner would move
   * everything below the button, and SCR-001 ST-03 requires no layout shift.
   */
  busy?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  busy = false,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'button',
    `button--${variant}`,
    size === 'lg' ? 'button--lg' : undefined,
    block ? 'button--block' : undefined,
    busy ? 'button--busy' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      // A busy button must not fire again — US-001/AC-06's "only one sign-in request exists".
      // `disabled` rather than an onClick guard, so the browser stops Enter and Space too.
      disabled={disabled || busy}
      // Announces the state change without the label changing, which is exactly what ST-03
      // asks for: the label is retained and the button announces that it is working.
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

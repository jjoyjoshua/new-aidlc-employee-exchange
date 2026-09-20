/**
 * SCR-009's Role control (US-021/AC-02). Screen-private, not `apps/ui/src/components/` —
 * `components/README.md`'s two-real-consumer bar isn't met yet (design note §4.4, `decisions.md`
 * D-03): US-024's presumed second consumer is most likely this same screen's `UserFormDialog`
 * gaining an edit mode, not a second file. Extract to `components/` only when a genuinely
 * separate screen needs one.
 *
 * Built on native `<input type="radio">` elements sharing one `name`, inside a
 * `<fieldset>`/`<legend>` — one tab stop and arrow-key movement between options come from the
 * platform for free (design note §6.4), rather than hand-rolling a `role="radiogroup"` widget's
 * roving tabindex, the exact shape US-020's own `AccountRowMenu` got wrong on its first pass.
 */
import './radio-group.css';

export interface RadioOption {
  value: string;
  /** One wrapping line — "Employee — books a desk for themselves" — the label IS the
   *  description; SCR-009 draws no separate description text. */
  label: string;
}

export interface RadioGroupProps {
  legend: string;
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Introduced by US-023/ADR-010 for the edit form's role radios, no longer used there since
   * US-024 made that control live — kept as a generic capability for a future ariaDisabled radio
   * group. Additive to `disabled` above, never a replacement. Renders `aria-disabled="true"` and a
   * per-option reason instead of the native `disabled` attribute, which would drop every radio
   * from the tab order (`AccountRowMenu.tsx`'s own reasoning, `disabledMenuItemReason` — one
   * vocabulary). A selection attempt is swallowed rather than reaching `onChange`, the same
   * "return immediately; nothing runs" shape that component uses.
   */
  ariaDisabled?: boolean;
  /** The reason announced for each option when `ariaDisabled` is set — required together with it,
   *  since an `aria-disabled` control with no stated reason is exactly the failure ADR-010 exists
   *  to prevent. */
  ariaDisabledReason?: string;
}

export function RadioGroup({
  legend,
  name,
  options,
  value,
  onChange,
  disabled,
  ariaDisabled,
  ariaDisabledReason,
}: RadioGroupProps) {
  return (
    <fieldset className="radio-group" disabled={disabled}>
      <legend className="radio-group__legend">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="radio-group__option"
          title={ariaDisabled ? ariaDisabledReason : undefined}
        >
          <input
            type="radio"
            className="radio-group__input"
            name={name}
            value={option.value}
            checked={value === option.value}
            aria-disabled={ariaDisabled ? 'true' : undefined}
            onChange={() => {
              if (ariaDisabled) return;
              onChange(option.value);
            }}
          />
          <span className="radio-group__label">{option.label}</span>
          {ariaDisabled ? <span className="people__visually-hidden">{ariaDisabledReason}</span> : null}
        </label>
      ))}
    </fieldset>
  );
}

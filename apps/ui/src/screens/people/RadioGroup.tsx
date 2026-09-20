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
}

export function RadioGroup({ legend, name, options, value, onChange, disabled }: RadioGroupProps) {
  return (
    <fieldset className="radio-group" disabled={disabled}>
      <legend className="radio-group__legend">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="radio-group__option">
          <input
            type="radio"
            className="radio-group__input"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="radio-group__label">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

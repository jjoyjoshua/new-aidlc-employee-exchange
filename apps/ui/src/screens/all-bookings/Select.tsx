/**
 * A labelled dropdown, screen-private to `all-bookings/` (US-014 design note §7.3). A CUSTOM
 * listbox, not a native `<select>` — a native select's OPTIONS POPUP is drawn by the OS/browser
 * chrome, not this page, and on Windows Chrome (confirmed against the real running app, both in
 * a desktop browser and in Claude's own browser pane) it renders in the OS's light listbox
 * regardless of `color-scheme` on the element: a fix reachable from CSS in some browsers is not
 * reachable in this one. Rendering the options ourselves, inside a `role="listbox"` this page
 * paints, is the only reliable way to keep the dropdown in the app's own dark theme everywhere.
 *
 * Reuses the shared `field`/`field__label`/`field__control`/`field__input` classes from
 * `components/text-field/text-field.css` for the trigger's chrome, matching the design note's own
 * reasoning for `Select` (visual identity travels through tokens, not through a shared-component
 * surface — `components/README.md`'s rule).
 */
import { useEffect, useId, useRef, useState } from 'react';
import '../../components/text-field/text-field.css';
import './all-bookings.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  /** Empty string is "no selection" — every filter field here is optional. */
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}

export function Select({ label, options, value, onChange, placeholder, disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const labelId = `${triggerId}-label`;
  const listboxId = `${triggerId}-listbox`;

  const allOptions = [{ value: '', label: placeholder }, ...options];
  const selected = allOptions.find((option) => option.value === value) ?? allOptions[0]!;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function choose(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className="field all-bookings-select" ref={rootRef}>
      <span className="field__label" id={labelId}>
        {label}
      </span>
      <div className="field__control all-bookings-select__control">
        <button
          type="button"
          id={triggerId}
          className="field__input all-bookings-select__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${labelId} ${triggerId}`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={onTriggerKeyDown}
        >
          {selected.label}
        </button>
        <span className="all-bookings-select__chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        {open ? (
          <ul className="all-bookings-select__listbox" role="listbox" id={listboxId} aria-labelledby={labelId}>
            {allOptions.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={
                  option.value === value
                    ? 'all-bookings-select__option all-bookings-select__option--selected'
                    : 'all-bookings-select__option'
                }
                onClick={() => choose(option.value)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

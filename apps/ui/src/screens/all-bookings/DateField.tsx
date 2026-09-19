/**
 * A labelled date filter, screen-private to `all-bookings/`. A custom HTML calendar dropdown
 * (`Calendar`), not the browser's native `<input type="date">` popup and not the shared
 * `components/date-picker/DatePicker`: that component clamps navigation to the 30-day forward
 * booking window and strikes through weekend dates — REQ-006's rules for a BOOKING control. This
 * filter must reach back over a year with no ceiling (US-013/AC-05) and forward past 30 days;
 * reusing `DatePicker` would silently cap it (US-014 design note §7.4). Requested directly: the
 * same rendered-HTML calendar style used elsewhere in the app, not the OS/browser's own popup.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { OfficeDate } from '@desk-booking/contracts';
import { formatOfficeDateLabel } from '../../lib/format-office-date.js';
import { Calendar } from './Calendar.js';
import '../../components/text-field/text-field.css';
import './all-bookings.css';

export interface DateFieldProps {
  label: string;
  value: OfficeDate | undefined;
  onChange: (value: OfficeDate | undefined) => void;
  today: OfficeDate;
  /** Refuses a range whose end precedes its start IN THE CONTROL (US-014 edge case) — days
   *  outside `[min, max]` render struck through and are not selectable. */
  min?: OfficeDate | undefined;
  max?: OfficeDate | undefined;
}

export function DateField({ label, value, onChange, today, min, max }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="field" ref={rootRef}>
      <span className="field__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="field__control all-bookings-select__control">
        <button
          type="button"
          id={id}
          className="field__input all-bookings-select__trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${id}-label ${id}`}
          onClick={() => setOpen((current) => !current)}
        >
          {value !== undefined ? formatOfficeDateLabel(value) : '—'}
        </button>

        {open ? (
          <div className="all-bookings-calendar-popover">
            <Calendar
              value={value}
              min={min}
              max={max}
              today={today}
              onChange={(next) => {
                onChange(next);
                setOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * SCR-005's filter bar (US-014/AC-01–AC-03, AC-05, AC-10). One row at 1280px, two rows at 768px
 * (a `Dates` group and a `Status`/`Desk`/`Clear` group — Figma's own grouping), collapsed behind
 * a **Filters** toggle at 360px.
 *
 * AC-10's collapse is CSS-only, the same device US-013 §6.5 chose for its table/card switch: the
 * toggle AND the panel are ALWAYS in the DOM; only a narrow media query hides the panel when it
 * carries the `--collapsed` class, so widening the viewport reveals it regardless of the toggle's
 * own state (design note §7.5 — "the panel stays open at 768 and 1280, where it costs no
 * content").
 */
import { useState } from 'react';
import type { AdminDesk, OfficeDate } from '@desk-booking/contracts';
import { Button } from '../../components/button/Button.js';
import { DateField } from './DateField.js';
import { Select } from './Select.js';
import { NO_FILTERS, type AllBookingsFilters } from './filters.js';
import './all-bookings.css';

/** Merges one field into `filters`, OMITTING the key entirely when `value` is undefined —
 *  `exactOptionalPropertyTypes` distinguishes an absent key from one explicitly set to
 *  `undefined`, and `AllBookingsFilters`'s fields are all optional (absent), never nullable. */
function setField<K extends keyof AllBookingsFilters>(
  filters: AllBookingsFilters,
  key: K,
  value: AllBookingsFilters[K] | undefined,
): AllBookingsFilters {
  const next = { ...filters };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export interface FilterBarProps {
  filters: AllBookingsFilters;
  onChange: (filters: AllBookingsFilters) => void;
  desks: AdminDesk[];
  /** US-014 §7.6 — a desk-list failure disables the desk Select rather than taking the screen to
   *  ST-05; bookings are the screen, desks are its vocabulary. */
  desksDisabled: boolean;
  /** The `DateField`s' calendar "Today" shortcut and initial view month. */
  today: OfficeDate;
}

export function FilterBar({ filters, onChange, desks, desksDisabled, today }: FilterBarProps) {
  const [open, setOpen] = useState(false);

  const deskOptions = desks.map((desk) => ({
    value: desk.id,
    label: desk.isActive ? desk.deskNumber : `${desk.deskNumber} (Inactive)`,
  }));

  return (
    <div className="all-bookings-filter-bar">
      <div className="all-bookings-filter-bar__toggle-row">
        <button
          type="button"
          className="all-bookings-filter-bar__toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="all-bookings-filter-bar__toggle-chevron" data-open={open} aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Filters
        </button>
        <Button variant="ghost" onClick={() => onChange(NO_FILTERS)}>
          Clear
        </Button>
      </div>

      <div
        className={`all-bookings-filter-bar__panel${open ? '' : ' all-bookings-filter-bar__panel--collapsed'}`}
      >
        <div className="all-bookings-filter-bar__group all-bookings-filter-bar__group--dates">
          <DateField
            label="Date from"
            value={filters.from}
            max={filters.to}
            today={today}
            onChange={(from) => onChange(setField(filters, 'from', from))}
          />
          <DateField
            label="Date to"
            value={filters.to}
            min={filters.from}
            today={today}
            onChange={(to) => onChange(setField(filters, 'to', to))}
          />
        </div>
        <div className="all-bookings-filter-bar__group all-bookings-filter-bar__group--rest">
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={filters.status ?? ''}
            placeholder="All statuses"
            onChange={(value) =>
              onChange(setField(filters, 'status', value === '' ? undefined : (value as AllBookingsFilters['status'])))
            }
          />
          <Select
            label="Desk"
            options={deskOptions}
            value={filters.deskId ?? ''}
            placeholder="All desks"
            disabled={desksDisabled}
            onChange={(value) => onChange(setField(filters, 'deskId', value === '' ? undefined : value))}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * A custom HTML calendar dropdown for `DateField`, screen-private to `all-bookings/`. Reuses
 * `components/date-picker/date-picker.css`'s classes — the same grid, header and cell chrome
 * `DatePicker` (the "Choose a booking date" screen's calendar) uses — but is its own component,
 * not that one reused: `DatePicker` clamps navigation to the 30-day forward booking window and
 * strikes through weekends (REQ-006's rules), and this filter must reach back over a year with no
 * ceiling (US-013/AC-05) and forward past 30 days (US-014 design note §7.4). Requested directly:
 * a rendered HTML calendar, not the browser's own native `<input type="date">` popup.
 *
 * `min`/`max` (not a fixed booking window) are the only bounds a day can be disabled by, and a
 * disabled day still shows struck through rather than removed — the same non-colour cue AC-06's
 * `DatePicker` cousin uses for its own refused days.
 *
 * The first and last week's empty slots show the ADJACENT month's days, dimmed and
 * non-interactive, rather than sitting blank — a plain blank trailing row read as "cut short"
 * when a human tested it live (`decisions.md` D-09). `DatePicker` itself is unaffected; this is
 * this component's own rendering only.
 */
import { useState } from 'react';
import type { OfficeDate } from '@desk-booking/contracts';
import { formatMonthYear, formatWeekdayNarrow } from '../../lib/format-office-date.js';
import '../../components/date-picker/date-picker.css';
import './all-bookings.css';

type MonthKey = string;

function monthKeyOf(date: OfficeDate): MonthKey {
  return date.slice(0, 7);
}

function daysInMonth(monthKey: MonthKey): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year as number, month as number, 0)).getUTCDate();
}

/** Monday = 0 … Sunday = 6, matching the Mo…Su header row. */
function firstWeekdayMondayIndex(monthKey: MonthKey): number {
  const [year, month] = monthKey.split('-').map(Number);
  const jsDay = new Date(Date.UTC(year as number, (month as number) - 1, 1)).getUTCDay();
  return (jsDay + 6) % 7;
}

function dateInMonth(monthKey: MonthKey, day: number): OfficeDate {
  return `${monthKey}-${String(day).padStart(2, '0')}` as OfficeDate;
}

function addMonths(monthKey: MonthKey, delta: number): MonthKey {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const zeroBased = month - 1 + delta;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12;
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
}

export interface CalendarProps {
  value: OfficeDate | undefined;
  onChange: (date: OfficeDate | undefined) => void;
  min?: OfficeDate | undefined;
  max?: OfficeDate | undefined;
  today: OfficeDate;
}

/** A grid cell: either a day IN the viewed month, or one bled in from the month before/after to
 *  fill out the first/last week — shown dimmed and non-interactive, purely so every row fills
 *  the full width instead of trailing off (a plain empty cell looked "cut short" — a human
 *  reported it live). */
interface Cell {
  date: OfficeDate;
  adjacent: boolean;
}

export function Calendar({ value, onChange, min, max, today }: CalendarProps) {
  const [viewMonth, setViewMonth] = useState<MonthKey>(monthKeyOf(value ?? today));

  const leadingCount = firstWeekdayMondayIndex(viewMonth);
  const totalDays = daysInMonth(viewMonth);

  const prevMonth = addMonths(viewMonth, -1);
  const prevMonthDays = daysInMonth(prevMonth);
  const leading: Cell[] = Array.from({ length: leadingCount }, (_, i) => ({
    date: dateInMonth(prevMonth, prevMonthDays - leadingCount + i + 1),
    adjacent: true,
  }));

  const current: Cell[] = Array.from({ length: totalDays }, (_, i) => ({
    date: dateInMonth(viewMonth, i + 1),
    adjacent: false,
  }));

  const cells: Cell[] = [...leading, ...current];
  const nextMonth = addMonths(viewMonth, 1);
  let trailingDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: dateInMonth(nextMonth, trailingDay), adjacent: true });
    trailingDay += 1;
  }

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const weekdayHeadings = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];

  const minMonth = min !== undefined ? monthKeyOf(min) : undefined;
  const maxMonth = max !== undefined ? monthKeyOf(max) : undefined;
  const canGoBack = minMonth === undefined || viewMonth > minMonth;
  const canGoForward = maxMonth === undefined || viewMonth < maxMonth;

  return (
    <div className="date-picker all-bookings-calendar">
      <div className="date-picker__header">
        <button
          type="button"
          className="date-picker__nav"
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft />
        </button>
        <p className="date-picker__month">{formatMonthYear(`${viewMonth}-01`)}</p>
        <button
          type="button"
          className="date-picker__nav"
          aria-label="Next month"
          disabled={!canGoForward}
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight />
        </button>
      </div>

      <div className="date-picker__weekdays" role="presentation">
        {weekdayHeadings.map((d) => (
          <span key={d}>{formatWeekdayNarrow(d)}</span>
        ))}
      </div>

      <div className="date-picker__grid" role="grid">
        {weeks.map((week, weekIndex) => (
          <div className="date-picker__week" role="row" key={weekIndex}>
            {week.map((cell, dayIndex) => {
              if (cell.adjacent) {
                return (
                  <span
                    key={`${weekIndex}-${dayIndex}`}
                    className="date-picker__cell all-bookings-calendar__cell--adjacent"
                    aria-hidden="true"
                  >
                    {Number(cell.date.slice(8, 10))}
                  </span>
                );
              }

              const { date } = cell;
              const isRefused = (min !== undefined && date < min) || (max !== undefined && date > max);
              const isSelected = date === value;
              const isToday = date === today;

              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  aria-disabled={isRefused || undefined}
                  className={[
                    'date-picker__cell',
                    isSelected && 'date-picker__cell--selected',
                    isRefused && 'date-picker__cell--refused',
                    isToday && !isSelected && 'date-picker__cell--today',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    if (!isRefused) onChange(date);
                  }}
                >
                  {Number(date.slice(8, 10))}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="all-bookings-calendar__footer">
        <button
          type="button"
          className="all-bookings-calendar__link"
          onClick={() => onChange(undefined)}
        >
          Clear
        </button>
        <button
          type="button"
          className="all-bookings-calendar__link"
          onClick={() => {
            setViewMonth(monthKeyOf(today));
            onChange(today);
          }}
        >
          Today
        </button>
      </div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M7.5 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

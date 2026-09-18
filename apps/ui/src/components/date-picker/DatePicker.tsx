/**
 * DatePicker — the full calendar behind "Pick another date" (US-005/AC-05, AC-06).
 *
 * Clamped to the month containing `today` and the month containing `today + 30`: navigation
 * stops at those edges rather than scrolling into a month where every day would be refused
 * (SCR-003 structural decisions). A 40px cell cannot hold "Too far ahead", so a refused day is
 * struck through — a non-colour, non-textual cue — and the two rules ("weekends are closed",
 * the last bookable date) are stated once in the footer rather than repeated per cell.
 */
import { useState } from 'react';
import type { OfficeDate } from '@desk-booking/contracts';
import { lastBookableDate, refusalFor } from '@desk-booking/contracts';
import { formatMonthYear, formatOfficeDateLabel, formatWeekdayNarrow } from '../../lib/format-office-date.js';
import './date-picker.css';

export interface DatePickerProps {
  today: OfficeDate;
  selectedDate: OfficeDate;
  onSelectDate: (date: OfficeDate) => void;
}

/** 'YYYY-MM' — a month, with no day attached. Compares lexicographically like `OfficeDate` does. */
type MonthKey = string;

function monthKeyOf(date: OfficeDate): MonthKey {
  return date.slice(0, 7);
}

function daysInMonth(monthKey: MonthKey): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year as number, (month as number), 0)).getUTCDate();
}

/** Monday = 0 … Sunday = 6, matching the Mo…Su header row. */
function firstWeekdayMondayIndex(monthKey: MonthKey): number {
  const [year, month] = monthKey.split('-').map(Number);
  const jsDay = new Date(Date.UTC(year as number, (month as number) - 1, 1)).getUTCDay();
  return (jsDay + 6) % 7;
}

function dateInMonth(monthKey: MonthKey, day: number): OfficeDate {
  const dayStr = String(day).padStart(2, '0');
  return `${monthKey}-${dayStr}`;
}

function addMonths(monthKey: MonthKey, delta: number): MonthKey {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const zeroBased = month - 1 + delta;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12;
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
}

export function DatePicker({ today, selectedDate, onSelectDate }: DatePickerProps) {
  const firstMonth = monthKeyOf(today);
  const lastMonth = monthKeyOf(lastBookableDate(today));
  const [viewMonth, setViewMonth] = useState<MonthKey>(firstMonth);

  const leadingBlanks = firstWeekdayMondayIndex(viewMonth);
  const totalDays = daysInMonth(viewMonth);
  const cells: (OfficeDate | undefined)[] = [
    ...Array.from({ length: leadingBlanks }, () => undefined),
    ...Array.from({ length: totalDays }, (_, i) => dateInMonth(viewMonth, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(undefined);
  const weeks: (OfficeDate | undefined)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // A known Monday-through-Sunday week, used only to read off the two-letter weekday labels —
  // the day-of-week name never depends on which specific week it is.
  const weekdayHeadings = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];

  return (
    <div className="date-picker">
      <div className="date-picker__header">
        <button
          type="button"
          className="date-picker__nav"
          aria-label="Previous month"
          disabled={viewMonth <= firstMonth}
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft />
        </button>
        <p className="date-picker__month">{formatMonthYear(`${viewMonth}-01`)}</p>
        <button
          type="button"
          className="date-picker__nav"
          aria-label="Next month"
          disabled={viewMonth >= lastMonth}
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
            {week.map((date, dayIndex) => {
              if (!date) {
                return <span className="date-picker__cell date-picker__cell--empty" key={dayIndex} />;
              }

              const reason = refusalFor(date, today);
              const isRefused = reason !== undefined;
              const isSelected = date === selectedDate;
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
                    if (!isRefused) onSelectDate(date);
                  }}
                >
                  {Number(date.slice(8, 10))}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="date-picker__footer">
        <p>Weekends are closed — the office is not bookable.</p>
        <p>You can book up to {formatOfficeDateLabel(lastBookableDate(today))}. Struck-out days cannot be chosen.</p>
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

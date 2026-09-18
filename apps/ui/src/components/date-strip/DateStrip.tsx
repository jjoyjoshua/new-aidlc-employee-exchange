/**
 * DateStrip — SCR-003's rolling 7-day date control (US-005).
 *
 * A single tab stop, roving-tabindex `radiogroup` — 30 chips as 30 tab stops would bury the
 * desk list below (interaction notes, SCR-003). Arrow keys move the roving focus between
 * bookable days, skipping a refused one; a refused chip stays in the accessibility tree via
 * `aria-disabled` rather than the native `disabled` attribute, so a screen reader browsing
 * outside the roving tab stop can still reach it and hear its reason (AC-04).
 *
 * The rendered window is always 7 days, starting at `windowStart` (defaulting to `today`) and
 * paging by exactly one day at a time — "the same interaction at every width" (SCR-003
 * structural decisions). Which of those 7 chips are visually shown at a given viewport width is
 * a CSS concern (`date-strip.css`), not a re-render: the full 7 stay in the DOM and in the tab
 * order regardless of viewport, so a keyboard or screen-reader user never loses a day the mouse
 * can still page to.
 */
import { useRef, useState } from 'react';
import type { DateRefusal, OfficeDate } from '@desk-booking/contracts';
import { addDays, refusalFor } from '@desk-booking/contracts';
import { formatWeekdayShort, getDayOfMonth } from '../../lib/format-office-date.js';
import './date-strip.css';

const WINDOW_SIZE = 7;

const REFUSAL_LABEL: Record<DateRefusal, string> = {
  past: 'Past',
  'too-far-ahead': 'Too far ahead',
  closed: 'Closed',
};

export interface DateStripProps {
  today: OfficeDate;
  selectedDate: OfficeDate;
  onSelectDate: (date: OfficeDate) => void;
  /** Opens the full calendar (US-005's `DatePicker`), clamped to the same window. */
  onOpenPicker?: () => void;
  /** The first rendered day. Defaults to `today`; a prop mainly so a test can position the
   *  window without paging through it first. */
  windowStart?: OfficeDate;
}

export function DateStrip({ today, selectedDate, onSelectDate, onOpenPicker, windowStart: initialWindowStart }: DateStripProps) {
  const [windowStart, setWindowStart] = useState<OfficeDate>(initialWindowStart ?? today);
  const chipRefs = useRef<Map<OfficeDate, HTMLButtonElement>>(new Map());

  const days: OfficeDate[] = Array.from({ length: WINDOW_SIZE }, (_, i) => addDays(windowStart, i));
  const bookable = (date: OfficeDate) => refusalFor(date, today) === undefined;

  const focusDate = (date: OfficeDate) => {
    chipRefs.current.get(date)?.focus();
  };

  const moveFocus = (fromIndex: number, direction: 1 | -1) => {
    for (let i = fromIndex + direction; i >= 0 && i < days.length; i += direction) {
      const candidate = days[i];
      if (candidate !== undefined && bookable(candidate)) {
        focusDate(candidate);
        return;
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = days.findIndex((d) => d === document.activeElement?.getAttribute('data-date'));
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(currentIndex, 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(currentIndex, -1);
    }
  };

  const canPageBack = windowStart > today;

  return (
    <div className="date-strip">
      <div className="date-strip__row">
        <button
          type="button"
          className="date-strip__page"
          aria-label="Earlier dates"
          disabled={!canPageBack}
          onClick={() => setWindowStart((s) => addDays(s, -1))}
        >
          <ChevronLeft />
        </button>

        <div role="radiogroup" aria-label="Choose a date" className="date-strip__days" onKeyDown={handleKeyDown}>
          {days.map((date) => {
            const reason = refusalFor(date, today);
            const isRefused = reason !== undefined;
            const isSelected = date === selectedDate;
            // Roving tabindex: the selected chip is the stop, unless it happens to be refused
            // (unreachable in practice — a refused date is never the selected one) in which
            // case the first bookable chip takes it, so the group is never entirely untabbable.
            const isTabStop = isSelected || (!bookable(selectedDate) && date === days.find(bookable));

            return (
              <button
                key={date}
                ref={(el) => {
                  if (el) chipRefs.current.set(date, el);
                  else chipRefs.current.delete(date);
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={isRefused || undefined}
                data-date={date}
                tabIndex={isTabStop ? 0 : -1}
                className={[
                  'date-strip__chip',
                  isSelected && 'date-strip__chip--selected',
                  isRefused && 'date-strip__chip--refused',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  if (!isRefused) onSelectDate(date);
                }}
              >
                <span className="date-strip__weekday">{formatWeekdayShort(date)}</span>
                <span className="date-strip__day">{getDayOfMonth(date)}</span>
                {isRefused ? (
                  <span className="date-strip__reason">
                    <ReasonIcon />
                    {REFUSAL_LABEL[reason]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <button type="button" className="date-strip__page" aria-label="Later dates" onClick={() => setWindowStart((s) => addDays(s, 1))}>
          <ChevronRight />
        </button>
      </div>

      {onOpenPicker ? (
        <button type="button" className="date-strip__pick-another" onClick={onOpenPicker}>
          <CalendarIcon />
          Pick another date
        </button>
      ) : null}
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <path d="M3 8h14M7 2v4M13 2v4" strokeLinecap="round" />
    </svg>
  );
}

/** A date the rules forbid — a weekend, or outside the window. The word beside it says which. */
function ReasonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M4.5 11.5l7-7" strokeLinecap="round" />
    </svg>
  );
}

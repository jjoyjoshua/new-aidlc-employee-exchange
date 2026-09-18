import { afterEach, describe, expect, it } from 'vitest';
import {
  formatMonthYear,
  formatOfficeDateLabel,
  formatWeekdayNarrow,
  getDayOfMonth,
} from './format-office-date.js';

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('formatOfficeDateLabel (US-005/AC-07, D-03)', () => {
  it('renders weekday, day and short month for an office date (US-005/AC-07)', () => {
    expect(formatOfficeDateLabel('2026-10-03')).toBe('Sat 3 Oct');
  });

  it('never shifts the day backward for a viewer west of Greenwich — the trap the design note names (US-005/AC-07)', () => {
    // The naive `new Date('2026-10-03').toLocaleDateString()` renders "Oct 2" here, because it
    // formats in the LOCAL zone rather than the office's. Every formatter in this module forces
    // `timeZone: 'UTC'` so the civil date it was given is the civil date it shows, regardless of
    // where the browser happens to be.
    process.env.TZ = 'America/New_York';

    expect(formatOfficeDateLabel('2026-10-03')).toBe('Sat 3 Oct');
  });
});

describe('formatMonthYear (US-005/AC-05)', () => {
  it('renders the full month name and year, for the calendar header', () => {
    expect(formatMonthYear('2026-09-18')).toBe('September 2026');
    expect(formatMonthYear('2026-01-05')).toBe('January 2026');
  });
});

describe('formatWeekdayNarrow (US-005/AC-06)', () => {
  it('renders the two-letter weekday headings the calendar grid uses', () => {
    expect(formatWeekdayNarrow('2026-09-14')).toBe('Mo'); // Monday
    expect(formatWeekdayNarrow('2026-09-15')).toBe('Tu');
    expect(formatWeekdayNarrow('2026-09-16')).toBe('We');
    expect(formatWeekdayNarrow('2026-09-17')).toBe('Th');
    expect(formatWeekdayNarrow('2026-09-18')).toBe('Fr');
    expect(formatWeekdayNarrow('2026-09-19')).toBe('Sa');
    expect(formatWeekdayNarrow('2026-09-20')).toBe('Su');
  });
});

describe('getDayOfMonth', () => {
  it('reads the day-of-month digits directly, with no Date parsing', () => {
    expect(getDayOfMonth('2026-09-05')).toBe(5);
    expect(getDayOfMonth('2026-09-18')).toBe(18);
  });
});

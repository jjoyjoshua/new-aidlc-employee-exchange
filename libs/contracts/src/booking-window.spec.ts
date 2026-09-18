import { describe, expect, it } from 'vitest';
import {
  BOOKING_WINDOW_DAYS,
  addDays,
  isWeekend,
  lastBookableDate,
  nextBookableDate,
  refusalFor,
} from './booking-window.js';

// A fixed Wednesday, used as "today" across this file so every test asserts the same
// literals regardless of when the suite runs (design note §8 — no computed expectations).
const TODAY = '2026-09-16'; // Wednesday

describe('addDays', () => {
  it('adds whole calendar days, crossing a month boundary', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('adds zero days as a no-op', () => {
    expect(addDays(TODAY, 0)).toBe(TODAY);
  });
});

describe('isWeekend', () => {
  it('reports Saturday and Sunday as weekend (BR-001.3)', () => {
    expect(isWeekend('2026-09-19')).toBe(true); // Saturday
    expect(isWeekend('2026-09-20')).toBe(true); // Sunday
  });

  it('reports Monday through Friday as not weekend', () => {
    expect(isWeekend('2026-09-14')).toBe(false); // Monday
    expect(isWeekend('2026-09-15')).toBe(false); // Tuesday
    expect(isWeekend(TODAY)).toBe(false); // Wednesday
    expect(isWeekend('2026-09-17')).toBe(false); // Thursday
    expect(isWeekend('2026-09-18')).toBe(false); // Friday
  });
});

describe('lastBookableDate', () => {
  it("is exactly today + BOOKING_WINDOW_DAYS calendar days, weekend or not (US-005/AC-02)", () => {
    expect(BOOKING_WINDOW_DAYS).toBe(30);
    expect(lastBookableDate(TODAY)).toBe(addDays(TODAY, 30));
    expect(lastBookableDate(TODAY)).toBe('2026-10-16');
  });
});

describe('refusalFor (US-005/AC-02, AC-03, AC-04)', () => {
  it('is bookable at today and at today + 30, the classic off-by-one boundary the QA note names (US-005/AC-02)', () => {
    expect(refusalFor('2026-09-16', TODAY)).toBeUndefined();
    expect(refusalFor('2026-10-16', TODAY)).toBeUndefined();
  });

  it('refuses today + 31 as too-far-ahead (US-005/AC-02)', () => {
    expect(refusalFor('2026-10-17', TODAY)).toBe('too-far-ahead');
  });

  it('refuses today - 1 as past (US-005/AC-02)', () => {
    expect(refusalFor('2026-09-15', TODAY)).toBe('past');
  });

  it('refuses a Saturday and a Sunday inside the window as closed (US-005/AC-03)', () => {
    expect(refusalFor('2026-09-19', TODAY)).toBe('closed'); // Saturday
    expect(refusalFor('2026-09-20', TODAY)).toBe('closed'); // Sunday
  });

  it('refuses a past Saturday as past, not closed — the precedence is load-bearing (US-005/AC-04, US-005/D-05)', () => {
    // 2026-09-05 is a Saturday before TODAY (2026-09-16).
    expect(refusalFor('2026-09-05', TODAY)).toBe('past');
  });

  it('refuses a Saturday beyond the window as too-far-ahead, not closed (US-005/AC-04)', () => {
    // 2026-10-24 is a Saturday, and today + 30 is 2026-10-16, so it is both out of range and a
    // weekend. The out-of-range reason must win.
    expect(refusalFor('2026-10-24', TODAY)).toBe('too-far-ahead');
  });
});

describe('nextBookableDate (US-005/AC-01)', () => {
  it('preselects today itself when today is a weekday (US-005/AC-01)', () => {
    expect(nextBookableDate(TODAY)).toBe(TODAY); // Wednesday
  });

  it('preselects the following Monday when today is a Saturday (US-005/AC-01)', () => {
    expect(nextBookableDate('2026-09-19')).toBe('2026-09-21');
  });

  it('preselects the following Monday when today is a Sunday (US-005/AC-01)', () => {
    expect(nextBookableDate('2026-09-20')).toBe('2026-09-21');
  });

  it('is total: never returns undefined, for any day of the week (US-005/AC-01)', () => {
    for (let i = 0; i < 7; i += 1) {
      const date = addDays('2026-09-14', i);
      expect(nextBookableDate(date)).toBeDefined();
    }
  });
});

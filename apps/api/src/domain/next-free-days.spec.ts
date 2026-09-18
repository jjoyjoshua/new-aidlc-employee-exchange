import { describe, expect, it } from 'vitest';
import { pickNextFreeDays } from './next-free-days.js';

// Wed 2026-09-09. `today` is the window's origin throughout — never `after`, which is the
// fully-booked date itself and can be well inside the window.
const TODAY = '2026-09-09';

describe('pickNextFreeDays', () => {
  it('returns the next two working days with a free desk, ascending (US-009/AC-02)', () => {
    // Literal expected dates — never computed by calling the function under test.
    const free = new Set(['2026-09-10', '2026-09-11', '2026-09-14']); // Thu, Fri, Mon
    const result = pickNextFreeDays({
      after: TODAY,
      today: TODAY,
      limit: 2,
      hasFreeDesk: (date) => free.has(date),
      alreadyBooked: () => false,
    });

    expect(result).toEqual(['2026-09-10', '2026-09-11']);
  });

  it('skips weekends and a date the caller already holds, even when free (US-009/AC-06)', () => {
    // Thu 10, Fri 11 free but already booked by the caller; Sat/Sun closed; Mon 14 free.
    const free = new Set(['2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15']);
    const result = pickNextFreeDays({
      after: TODAY,
      today: TODAY,
      limit: 2,
      hasFreeDesk: (date) => free.has(date),
      alreadyBooked: (date) => date === '2026-09-10' || date === '2026-09-11',
    });

    expect(result).toEqual(['2026-09-14', '2026-09-15']);
  });

  it('includes a candidate at exactly today + 30 and excludes today + 31 (US-009/AC-06, V-02)', () => {
    // today + 30 = 2026-10-09 (Fri); today + 31 = 2026-10-10 (Sat, also excluded by the weekend rule).
    const result = pickNextFreeDays({
      after: '2026-10-08', // Thu, still inside the window
      today: TODAY,
      limit: 2,
      hasFreeDesk: () => true,
      alreadyBooked: () => false,
    });

    expect(result).toEqual(['2026-10-09']);
  });

  it('returns exactly one entry when only one candidate day is free (US-009/AC-05)', () => {
    const free = new Set(['2026-09-14']); // only Monday
    const result = pickNextFreeDays({
      after: TODAY,
      today: TODAY,
      limit: 2,
      hasFreeDesk: (date) => free.has(date),
      alreadyBooked: () => false,
    });

    expect(result).toEqual(['2026-09-14']);
  });

  it('returns [] AND TERMINATES when a window full to its edge has nothing free (US-009/AC-05)', () => {
    // The sharpest edge in this function: a loop that stops only when `limit` days are found
    // never returns here. This test hangs/times out on that regression rather than merely
    // failing an assertion.
    const result = pickNextFreeDays({
      after: TODAY,
      today: TODAY,
      limit: 2,
      hasFreeDesk: () => false,
      alreadyBooked: () => false,
    });

    expect(result).toEqual([]);
  });

  it('never returns the selected date itself or anything before it', () => {
    const result = pickNextFreeDays({
      after: TODAY,
      today: TODAY,
      limit: 2,
      hasFreeDesk: () => true,
      alreadyBooked: () => false,
    });

    expect(result.every((date) => date > TODAY)).toBe(true);
  });
});

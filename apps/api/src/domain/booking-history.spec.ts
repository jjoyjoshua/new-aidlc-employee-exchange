import { addDays, type BookingDisplayStatus, type BookingStatus } from '@desk-booking/contracts';
import { describe, expect, it } from 'vitest';
import {
  bookingDisplayStatus,
  displayStatusPredicate,
  historyFloor,
  HISTORY_WINDOW_DAYS,
} from './booking-history.js';

describe('HISTORY_WINDOW_DAYS (US-010/AC-03)', () => {
  it('is 30 — the same number as BOOKING_WINDOW_DAYS today, but a separate constant', () => {
    expect(HISTORY_WINDOW_DAYS).toBe(30);
  });
});

describe('historyFloor — the boundary (US-010/AC-03)', () => {
  it('is INCLUSIVE at exactly 30 days back — a literal, never computed by calling the function under test', () => {
    // Fri 2026-09-18 minus 30 days = Wed 2026-08-19.
    expect(historyFloor('2026-09-18')).toBe('2026-08-19');
  });
});

describe('bookingDisplayStatus (US-010/AC-04, BR-001.5, ADR-007)', () => {
  const TODAY = '2026-09-18';

  it('reads a Confirmed booking dated yesterday as Completed', () => {
    expect(bookingDisplayStatus('confirmed', '2026-09-17', TODAY)).toBe('completed');
  });

  it('reads a Confirmed booking dated TODAY as still Confirmed — today has not passed (BR-001.6 still allows cancelling it)', () => {
    expect(bookingDisplayStatus('confirmed', TODAY, TODAY)).toBe('confirmed');
  });

  it('reads a Confirmed booking dated in the future as Confirmed', () => {
    expect(bookingDisplayStatus('confirmed', '2026-09-25', TODAY)).toBe('confirmed');
  });

  it('reads a Cancelled booking dated yesterday as Cancelled, not Completed', () => {
    expect(bookingDisplayStatus('cancelled', '2026-09-17', TODAY)).toBe('cancelled');
  });

  it('reads a Cancelled booking dated NEXT WEEK as Cancelled — cancelling a future booking does not make it "completed" (design note §4.1)', () => {
    expect(bookingDisplayStatus('cancelled', '2026-09-25', TODAY)).toBe('cancelled');
  });
});

describe('displayStatusPredicate (US-014/AC-02) — the inverse of bookingDisplayStatus', () => {
  const TODAY = '2026-09-18';

  it("confirmed: stored='confirmed', from=today (inclusive), no upper bound", () => {
    expect(displayStatusPredicate('confirmed', TODAY)).toEqual({ stored: 'confirmed', from: TODAY });
  });

  it("completed: stored='confirmed', before=today (exclusive), no lower bound", () => {
    expect(displayStatusPredicate('completed', TODAY)).toEqual({ stored: 'confirmed', before: TODAY });
  });

  it("cancelled: stored='cancelled', no date bound at all — a Cancelled booking stays Cancelled whatever its date", () => {
    expect(displayStatusPredicate('cancelled', TODAY)).toEqual({ stored: 'cancelled' });
  });
});

describe('bookingDisplayStatus / displayStatusPredicate — round-trip property (US-014/AC-02, ADR-007)', () => {
  const TODAY = '2026-09-18';
  const STORED: BookingStatus[] = ['confirmed', 'cancelled'];
  const DATES = [addDays(TODAY, -1), TODAY, addDays(TODAY, 1)];
  const PRESENTED: BookingDisplayStatus[] = ['confirmed', 'completed', 'cancelled'];

  function matchesDateBound(date: string, s: BookingDisplayStatus): boolean {
    const p = displayStatusPredicate(s, TODAY);
    return (p.from === undefined || date >= p.from) && (p.before === undefined || date < p.before);
  }

  it('bookingDisplayStatus(stored, date, today) === s if and only if the row satisfies displayStatusPredicate(s, today)', () => {
    for (const stored of STORED) {
      for (const date of DATES) {
        const actual = bookingDisplayStatus(stored, date, TODAY);
        for (const s of PRESENTED) {
          const predicate = displayStatusPredicate(s, TODAY);
          const rowSatisfiesPredicate = predicate.stored === stored && matchesDateBound(date, s);
          const rowPresentsAsS = actual === s;
          expect(rowPresentsAsS).toBe(rowSatisfiesPredicate);
        }
      }
    }
  });
});

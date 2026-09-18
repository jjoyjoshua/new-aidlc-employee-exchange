import { describe, expect, it } from 'vitest';
import { bookingDisplayStatus, historyFloor, HISTORY_WINDOW_DAYS } from './booking-history.js';

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

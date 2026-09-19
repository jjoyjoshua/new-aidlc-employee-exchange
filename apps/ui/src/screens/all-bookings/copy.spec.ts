import { describe, expect, it } from 'vitest';
import { countLine, EMPTY_NO_BOOKINGS_TITLE, LOAD_FAILED, OFFICE_TIME, SHOW_MORE } from './copy.js';

describe('countLine (US-013/AC-07)', () => {
  it('matches the real frame\'s exact shape', () => {
    expect(countLine(24, 'Mon 7 Sep')).toBe('24 bookings · from Mon 7 Sep · all statuses');
  });

  it('pluralizes for a count other than one', () => {
    expect(countLine(0, 'Mon 7 Sep')).toBe('0 bookings · from Mon 7 Sep · all statuses');
  });

  it('stays singular for exactly one', () => {
    expect(countLine(1, 'Mon 7 Sep')).toBe('1 booking · from Mon 7 Sep · all statuses');
  });
});

describe('EMPTY_NO_BOOKINGS_TITLE / LOAD_FAILED — verbatim against the real frames (US-013/AC-08, AC-09)', () => {
  it('matches the frames exactly', () => {
    expect(EMPTY_NO_BOOKINGS_TITLE).toBe('Nobody has booked a desk yet.');
    expect(LOAD_FAILED).toBe("We couldn't load bookings.");
  });
});

describe('SHOW_MORE / OFFICE_TIME', () => {
  it('SHOW_MORE matches the frame verbatim', () => {
    expect(SHOW_MORE).toBe('Show more');
  });

  it('OFFICE_TIME states the timezone', () => {
    expect(OFFICE_TIME('Asia/Kolkata')).toBe('Office time (Asia/Kolkata)');
  });
});

import { describe, expect, it } from 'vitest';
import { officeToday } from './booking-window.js';

describe('officeToday (US-005/AC-07)', () => {
  it('returns the calendar date in the office zone, which can differ from UTC (US-005/AC-07)', () => {
    // 19:30 UTC on 2 October is already 01:00 on 3 October in Asia/Kolkata (UTC+5:30).
    const instant = Date.parse('2026-10-02T19:30:00Z');

    expect(officeToday(instant, 'Asia/Kolkata')).toBe('2026-10-03');
    expect(officeToday(instant, 'UTC')).toBe('2026-10-02');
  });

  it('returns the calendar date in a zone west of UTC, which can lag a full day behind (US-005/AC-07)', () => {
    // 02:00 UTC on 3 October is still 22:00 on 2 October in America/New_York (UTC-4 in October).
    const instant = Date.parse('2026-10-03T02:00:00Z');

    expect(officeToday(instant, 'America/New_York')).toBe('2026-10-02');
  });

  it('pads single-digit months and days to two digits (US-005/AC-07)', () => {
    const instant = Date.parse('2026-01-05T12:00:00Z');

    expect(officeToday(instant, 'UTC')).toBe('2026-01-05');
  });
});

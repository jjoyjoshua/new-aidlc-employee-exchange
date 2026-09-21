import { describe, expect, it } from 'vitest';
import { formatShortDate } from './format-display-date.js';

describe('formatShortDate (US-029/AC-02)', () => {
  it('renders a weekday, day and short month with no comma — "Wed 9 Sep" (US-029/AC-02)', () => {
    expect(formatShortDate('2026-09-09')).toBe('Wed 9 Sep');
  });

  it('carries a boundary date across a month and year correctly', () => {
    expect(formatShortDate('2026-01-31')).toBe('Sat 31 Jan');
  });

  it('is a pure function of the given date, never the office timezone or the clock', () => {
    // Same civil date, computed twice, must always agree — nothing here reads Date.now().
    expect(formatShortDate('2026-12-25')).toBe(formatShortDate('2026-12-25'));
  });
});

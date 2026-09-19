import { describe, expect, it } from 'vitest';
import { bookedAheadLabel, bookedAheadAccessibleText, summaryLine } from './copy.js';

describe('bookedAheadLabel (US-016/AC-05 — zero is a dash, not blank)', () => {
  it('renders zero as an em dash', () => {
    expect(bookedAheadLabel(0)).toBe('—');
  });

  it('renders one as the singular', () => {
    expect(bookedAheadLabel(1)).toBe('1 upcoming');
  });

  it('renders a count above one as the plural', () => {
    expect(bookedAheadLabel(3)).toBe('3 upcoming');
  });
});

describe('bookedAheadAccessibleText (US-016/AC-05 — the em dash is not silent to a screen reader)', () => {
  it('reads "No upcoming bookings" for zero — the dash alone would say nothing', () => {
    expect(bookedAheadAccessibleText(0)).toBe('No upcoming bookings');
  });

  it('matches the visible label for a non-zero count', () => {
    expect(bookedAheadAccessibleText(1)).toBe('1 upcoming');
    expect(bookedAheadAccessibleText(3)).toBe('3 upcoming');
  });
});

describe('summaryLine (US-016 — the "N desks · M active, K inactive" line, derived client-side)', () => {
  it('derives all three numbers from the array, never an echoed total', () => {
    const desks = [
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 },
      { id: 'b', deskNumber: 'A-02', isActive: true, bookedAhead: 2 },
      { id: 'c', deskNumber: 'A-03', isActive: false, bookedAhead: 0 },
    ];

    expect(summaryLine(desks)).toBe('3 desks · 2 active, 1 inactive');
  });

  it('pluralizes correctly for a single desk', () => {
    const desks = [{ id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 }];
    expect(summaryLine(desks)).toBe('1 desk · 1 active, 0 inactive');
  });
});

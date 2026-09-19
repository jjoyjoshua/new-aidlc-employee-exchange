import { describe, expect, it } from 'vitest';
import {
  bookedAheadLabel,
  bookedAheadAccessibleText,
  deskAddedToast,
  deskNumberFormatError,
  deskRenamedToast,
  duplicateDeskTitle,
  editDeskDialogTitle,
  summaryLine,
  upcomingHoldersWarning,
} from './copy.js';

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

describe('deskAddedToast (US-017/AC-01, SCR-007 ST-06)', () => {
  it('names the effect on bookability, not just the outcome', () => {
    expect(deskAddedToast('A-12')).toBe('Desk A-12 added. People can book it from today.');
  });
});

describe('duplicateDeskTitle (US-017/AC-04, PRIN-3 — leads with the colliding number)', () => {
  it('names the colliding desk number', () => {
    expect(duplicateDeskTitle('A-01')).toBe('A-01 is already taken by another desk.');
  });
});

describe('deskNumberFormatError (US-017/AC-02 — two messages, empty vs bad shape)', () => {
  it('asks for a number when the entry is empty or whitespace only', () => {
    expect(deskNumberFormatError('')).toBe('Give the desk a number.');
    expect(deskNumberFormatError('   ')).toBe('Give the desk a number.');
  });

  it('restates the rule when the shape is wrong', () => {
    expect(deskNumberFormatError('A-1')).toBe('Use one letter, a dash and two digits — like A-01.');
    expect(deskNumberFormatError('Window seat 3')).toBe('Use one letter, a dash and two digits — like A-01.');
  });
});

describe('editDeskDialogTitle (US-018/AC-01, SCR-007 ST-02 — frame-verified: "Edit desk A-01")', () => {
  it('names the desk being edited', () => {
    expect(editDeskDialogTitle('A-01')).toBe('Edit desk A-01');
  });
});

describe('upcomingHoldersWarning (US-018/AC-04, RISK-012 — frame-verified for 3; singular derived)', () => {
  it('states the exact count and the consequence, matching the verified frame verbatim for 3', () => {
    expect(upcomingHoldersWarning(3)).toBe(
      "3 people have this desk booked. Renaming it changes what they see — they won't be told.",
    );
  });

  it('uses the singular for exactly one holder', () => {
    expect(upcomingHoldersWarning(1)).toBe(
      "1 person has this desk booked. Renaming it changes what they see — they won't be told.",
    );
  });
});

describe('deskRenamedToast (US-018/AC-01, SCR-007 ST-06 — spec-sourced, no edit-mode frame drawn)', () => {
  it('names the new number', () => {
    expect(deskRenamedToast('A-12')).toBe('Desk number updated to A-12.');
  });
});

import { describe, expect, it } from 'vitest';
import { AVAILABILITY_LOAD_FAILED, FULLY_BOOKED, FULLY_BOOKED_LEAD, NO_DESKS_EXIST } from './copy.js';

describe('NO_DESKS_EXIST (US-006/AC-09)', () => {
  it('does not contain the word "taken" — it must not be confusable with the fully-booked state', () => {
    expect(`${NO_DESKS_EXIST.title} ${NO_DESKS_EXIST.body}`.toLowerCase()).not.toContain('taken');
  });

  it('names no date and no alternative — every date is equally empty', () => {
    const text = `${NO_DESKS_EXIST.title} ${NO_DESKS_EXIST.body}`;
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text.toLowerCase()).not.toContain('try');
  });
});

describe('AVAILABILITY_LOAD_FAILED (US-006/AC-08)', () => {
  it('names the date it was given', () => {
    expect(AVAILABILITY_LOAD_FAILED('Wed 9 Sep')).toBe("We couldn't load desk availability for Wed 9 Sep.");
  });
});

describe('FULLY_BOOKED (US-009/AC-01)', () => {
  it('names the date it was given', () => {
    expect(FULLY_BOOKED('Wed 9 Sep')).toBe('Every desk is taken on Wed 9 Sep.');
  });

  it('differs from NO_DESKS_EXIST — the two empty states must read differently (US-006/AC-09 + copy.ts:42)', () => {
    expect(FULLY_BOOKED('Wed 9 Sep')).not.toBe(NO_DESKS_EXIST.title);
    expect(FULLY_BOOKED('Wed 9 Sep')).not.toBe(NO_DESKS_EXIST.body);
  });
});

describe('FULLY_BOOKED_LEAD (US-009/AC-05 — must read correctly at every suggestion count)', () => {
  it('names "two" only when there are exactly two suggestions', () => {
    expect(FULLY_BOOKED_LEAD(2)).toBe('The next two working days with desks free:');
  });

  it('drops the count word for exactly one suggestion — never claims "two" when there is one', () => {
    expect(FULLY_BOOKED_LEAD(1)).toBe('The next working day with a desk free:');
    expect(FULLY_BOOKED_LEAD(1)).not.toContain('two');
  });

  it('returns undefined for zero suggestions — no lead-in above an empty slot', () => {
    expect(FULLY_BOOKED_LEAD(0)).toBeUndefined();
  });
});

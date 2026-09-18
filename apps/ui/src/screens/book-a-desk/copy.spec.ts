import { describe, expect, it } from 'vitest';
import { AVAILABILITY_LOAD_FAILED, NO_DESKS_EXIST } from './copy.js';

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

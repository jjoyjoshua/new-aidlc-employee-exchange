import { describe, expect, it } from 'vitest';
import { NEVER_BOOKED, NOTHING_UPCOMING, readyAnnouncement, SHOW_MORE_ARIA_LABEL } from './copy.js';

describe('NEVER_BOOKED vs NOTHING_UPCOMING — the pair most likely to collapse (US-010/AC-06 vs AC-07, story QA note)', () => {
  it('renders different titles', () => {
    expect(NEVER_BOOKED.title).not.toBe(NOTHING_UPCOMING.title);
  });

  it('NEVER_BOOKED carries a body line; NOTHING_UPCOMING has none (matching the real frame)', () => {
    expect(NEVER_BOOKED.body).toBeTruthy();
    expect('body' in NOTHING_UPCOMING).toBe(false);
  });
});

describe('readyAnnouncement (US-010/AC-08)', () => {
  it('pluralizes for a count other than one', () => {
    expect(readyAnnouncement(0)).toBe('0 upcoming bookings');
    expect(readyAnnouncement(3)).toBe('3 upcoming bookings');
  });

  it('stays singular for exactly one', () => {
    expect(readyAnnouncement(1)).toBe('1 upcoming booking');
  });
});

describe('SHOW_MORE_ARIA_LABEL (design note §4.6)', () => {
  it('names the date in the long form', () => {
    expect(SHOW_MORE_ARIA_LABEL('Wednesday 19 August')).toBe('Show bookings older than Wednesday 19 August');
  });
});

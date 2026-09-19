import { describe, expect, it } from 'vitest';
import {
  CANCEL_ALREADY_CANCELLED,
  CANCEL_CLOSE_LABEL,
  CANCEL_CONFIRM_LABEL,
  CANCEL_DIALOG_TITLE,
  CANCEL_FAILED_RETRYABLE,
  CANCEL_KEEP_LABEL,
  cancelDialogBody,
  cancelledToast,
  LOAD_FAILED,
  NEVER_BOOKED,
  NOTHING_UPCOMING,
  QUIET_REFRESH_FAILED,
  readyAnnouncement,
  SHOW_MORE_ARIA_LABEL,
} from './copy.js';

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

// US-011/ST-07–ST-10 — verified verbatim against the live Figma frames (traceability.md's node
// ids), not the written screen spec alone.
describe('cancel dialog copy (US-011/AC-03, AC-08, AC-09, design note §5.5)', () => {
  it('CANCEL_DIALOG_TITLE, CANCEL_CONFIRM_LABEL and CANCEL_KEEP_LABEL match the Figma frame verbatim', () => {
    expect(CANCEL_DIALOG_TITLE).toBe('Cancel your desk?');
    expect(CANCEL_CONFIRM_LABEL).toBe('Cancel booking');
    expect(CANCEL_KEEP_LABEL).toBe('Keep it');
  });

  it('cancelDialogBody builds the sentence from the ROW\'s own desk and date, not a literal (SCR-002 designer handoff)', () => {
    expect(cancelDialogBody('B-02', 'Wed 9 Sep')).toBe(
      "B-02 · Wed 9 Sep. The desk goes back into the pool and we'll email you a confirmation.",
    );
    expect(cancelDialogBody('A-01', 'Thu 10 Sep')).toBe(
      "A-01 · Thu 10 Sep. The desk goes back into the pool and we'll email you a confirmation.",
    );
  });

  it('CANCEL_FAILED_RETRYABLE and CANCEL_ALREADY_CANCELLED are distinct (ST-09 two outcomes, US-011/AC-08 vs AC-09)', () => {
    expect(CANCEL_FAILED_RETRYABLE).toBe("We couldn't cancel that just now. Try again.");
    expect(CANCEL_ALREADY_CANCELLED).toBe('That booking has already been cancelled.');
    expect(CANCEL_FAILED_RETRYABLE).not.toBe(CANCEL_ALREADY_CANCELLED);
  });

  it('CANCEL_CLOSE_LABEL is the non-retryable branch\'s single action', () => {
    expect(CANCEL_CLOSE_LABEL).toBe('Close');
  });

  it('cancelledToast names the desk, the date and the email address (ST-10, PRIN-5)', () => {
    expect(cancelledToast('B-02', 'Wed 9 Sep', 'priya@company.com')).toBe(
      'Desk B-02 released for Wed 9 Sep. Cancellation emailed to priya@company.com.',
    );
  });
});

describe('QUIET_REFRESH_FAILED — US-012/AC-04', () => {
  it('is distinct from LOAD_FAILED (a still-showing list, not a gone one)', () => {
    expect(QUIET_REFRESH_FAILED).not.toBe(LOAD_FAILED);
    expect(QUIET_REFRESH_FAILED).toBeTruthy();
  });
});

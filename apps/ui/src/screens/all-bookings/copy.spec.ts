import { describe, expect, it } from 'vitest';
import {
  countLine,
  EMPTY_FILTERED_BODY,
  EMPTY_FILTERED_TITLE,
  CLEAR_FILTERS,
  EMPTY_NO_BOOKINGS_TITLE,
  LOAD_FAILED,
  OFFICE_TIME,
  SHOW_MORE,
  statusLabel,
  cancelReason,
  cancelDialogTitle,
  cancelDialogBody,
  CANCEL_CONFIRM_LABEL,
  CANCEL_KEEP_LABEL,
  CANCEL_FAILED_RETRYABLE,
  CANCEL_RETRY_LABEL,
  alreadyCancelledMessage,
  CANCEL_CLOSE_LABEL,
  cancelledToast,
} from './copy.js';

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

describe('countLine — US-014 filters, matching the real hi-fi frame exactly', () => {
  it('restates a desk and a status: "3 bookings · desk B-03 · from Mon 7 Sep · Confirmed"', () => {
    expect(countLine(3, 'Mon 7 Sep', { deskLabel: 'B-03', statusLabel: 'Confirmed' })).toBe(
      '3 bookings · desk B-03 · from Mon 7 Sep · Confirmed',
    );
  });

  it('restates a desk alone, defaulting the status clause to "all statuses"', () => {
    expect(countLine(3, 'Mon 7 Sep', { deskLabel: 'B-03' })).toBe('3 bookings · desk B-03 · from Mon 7 Sep · all statuses');
  });

  it('restates a to-date when the range has an end', () => {
    expect(countLine(3, 'Mon 7 Sep', { toLabel: 'Tue 8 Sep' })).toBe(
      '3 bookings · from Mon 7 Sep to Tue 8 Sep · all statuses',
    );
  });
});

describe('statusLabel (US-014/AC-02, AC-07) — capitalized, matching the real frame', () => {
  it.each<[Parameters<typeof statusLabel>[0], string]>([
    ['confirmed', 'Confirmed'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ])('%s -> %s', (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe('ST-04 filtered-empty copy — verbatim against the real hi-fi frame (US-014/AC-06)', () => {
  it('matches the frame exactly, and is distinct from ST-03\'s unfiltered copy', () => {
    expect(EMPTY_FILTERED_TITLE).toBe('No bookings match this filter.');
    expect(EMPTY_FILTERED_BODY).toBe('Try a wider date range, or a different status.');
    expect(CLEAR_FILTERS).toBe('Clear filters');
    expect(EMPTY_FILTERED_TITLE).not.toBe(EMPTY_NO_BOOKINGS_TITLE);
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

describe('cancelReason — ST-07 (US-015/AC-01, AC-02)', () => {
  it('matches the real frame exactly for each non-cancellable status', () => {
    expect(cancelReason('completed')).toBe("Past bookings can't be cancelled");
    expect(cancelReason('cancelled')).toBe('Already cancelled');
  });
});

describe('cancel dialog copy — ST-08 (US-015/AC-03)', () => {
  it('titles and bodies the dialog with the FULL employee name, matching the real frame exactly (US-015/AC-03)', () => {
    expect(cancelDialogTitle('Priya Raman')).toBe("Cancel Priya Raman's desk?");
    expect(cancelDialogBody('A-01', 'Mon 7 Sep', 'Priya Raman')).toBe(
      'A-01 · Mon 7 Sep. The desk goes back into the pool and Priya Raman is emailed.',
    );
  });

  it('uses the plain possessive for a name already ending in s, with no special-casing (decisions.md D-05)', () => {
    expect(cancelDialogTitle('James Rollins')).toBe("Cancel James Rollins's desk?");
  });

  it('action labels match the real frame — "Cancel this booking", not my-bookings\' "Cancel booking"', () => {
    expect(CANCEL_CONFIRM_LABEL).toBe('Cancel this booking');
    expect(CANCEL_KEEP_LABEL).toBe('Keep it');
  });
});

describe('cancel failure copy — ST-10 (US-015/AC-08, AC-09)', () => {
  it('the retryable message and its button label match the real frame', () => {
    expect(CANCEL_FAILED_RETRYABLE).toBe("We couldn't cancel that just now. Try again.");
    expect(CANCEL_RETRY_LABEL).toBe('Try again');
  });

  it('the already-cancelled message names the row\'s employee and offers only Close', () => {
    expect(alreadyCancelledMessage('Priya Raman')).toBe('Priya Raman has already cancelled this booking.');
    expect(CANCEL_CLOSE_LABEL).toBe('Close');
  });
});

describe('cancelledToast — ST-11 (US-015/AC-05, AC-06)', () => {
  it('matches the real frame exactly, naming the employee, never an email address (US-015/AC-05, US-015/AC-06)', () => {
    expect(cancelledToast('A-01', 'Mon 7 Sep', 'Priya Raman')).toBe(
      'A-01 released for Mon 7 Sep. Priya Raman has been emailed.',
    );
  });
});

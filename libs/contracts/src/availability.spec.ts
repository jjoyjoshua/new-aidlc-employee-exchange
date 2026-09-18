import { describe, expect, it } from 'vitest';
import {
  availabilityQuerySchema,
  availabilityResponseSchema,
  deskAvailabilityStatusSchema,
} from './availability.js';

describe('availabilityQuerySchema', () => {
  it('accepts a single valid date', () => {
    expect(availabilityQuerySchema.safeParse({ date: '2026-09-16' }).success).toBe(true);
  });

  it('rejects a missing date', () => {
    expect(availabilityQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown query field (US-006 design note §2.2 — .strict())', () => {
    expect(availabilityQuerySchema.safeParse({ date: '2026-09-16', extra: 'x' }).success).toBe(false);
  });

  it('rejects a repeated ?date=&date= param, which Express hands over as an array', () => {
    // z.string() rejects a non-string value with no special-casing needed.
    expect(availabilityQuerySchema.safeParse({ date: ['2026-09-16', '2026-09-17'] }).success).toBe(false);
  });

  it('rejects a date that does not exist on the calendar', () => {
    expect(availabilityQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
  });
});

describe('deskAvailabilityStatusSchema', () => {
  it('accepts exactly available and taken, and nothing else (US-006/AC-06)', () => {
    expect(deskAvailabilityStatusSchema.options).toEqual(['available', 'taken']);
    expect(deskAvailabilityStatusSchema.safeParse('selected').success).toBe(false);
  });
});

describe('availabilityResponseSchema', () => {
  const DESK = { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', deskNumber: 'A-01', status: 'available' as const };
  const MY_BOOKING = { id: '9c858901-8a57-4791-81fe-4c455b099bc9', deskId: DESK.id, deskNumber: 'A-01' };

  it('parses a response carrying a mix of available and taken desks', () => {
    const result = availabilityResponseSchema.safeParse({
      date: '2026-09-16',
      desks: [DESK, { ...DESK, id: '9c858901-8a57-4791-81fe-4c455b099bc9', deskNumber: 'A-02', status: 'taken' }],
      myBooking: null,
    });

    expect(result.success).toBe(true);
  });

  it('parses an empty desks array (US-006/AC-09 — no active desks)', () => {
    expect(availabilityResponseSchema.safeParse({ date: '2026-09-16', desks: [], myBooking: null }).success).toBe(
      true,
    );
  });

  it('parses myBooking: null (US-007/AC-06 — no existing booking for the date)', () => {
    const result = availabilityResponseSchema.safeParse({ date: '2026-09-16', desks: [DESK], myBooking: null });
    expect(result.success).toBe(true);
    expect(result.data?.myBooking).toBeNull();
  });

  it('parses a populated myBooking (US-007/AC-06 — the caller already holds a booking that date)', () => {
    const result = availabilityResponseSchema.safeParse({ date: '2026-09-16', desks: [DESK], myBooking: MY_BOOKING });
    expect(result.success).toBe(true);
    expect(result.data?.myBooking).toEqual(MY_BOOKING);
  });

  it('an OLD fixture with no myBooking key at all still parses, defaulting to null (additive field, ADR-002)', () => {
    const result = availabilityResponseSchema.safeParse({ date: '2026-09-16', desks: [DESK] });
    expect(result.success).toBe(true);
    expect(result.data?.myBooking).toBeNull();
  });

  it('rejects a desk with a third status value', () => {
    const result = availabilityResponseSchema.safeParse({
      date: '2026-09-16',
      desks: [{ ...DESK, status: 'reserved' }],
    });

    expect(result.success).toBe(false);
  });

  it('does not require .strict() and so tolerates an unexpected additive field (ADR-002\'s asymmetry)', () => {
    const result = availabilityResponseSchema.safeParse({
      date: '2026-09-16',
      desks: [{ ...DESK, futureField: 'ignored' }],
    });

    expect(result.success).toBe(true);
  });
});

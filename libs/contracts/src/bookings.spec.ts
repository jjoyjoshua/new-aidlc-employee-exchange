import { describe, expect, it } from 'vitest';
import { bookingCreateSchema, bookingSchema, cancelBookingParamsSchema } from './bookings.js';

const VALID_DESK_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('bookingCreateSchema (US-007/AC-03)', () => {
  it('accepts a well-formed date and deskId', () => {
    const result = bookingCreateSchema.safeParse({ date: '2026-09-16', deskId: VALID_DESK_ID });
    expect(result.success).toBe(true);
  });

  it('rejects a missing date', () => {
    expect(bookingCreateSchema.safeParse({ deskId: VALID_DESK_ID }).success).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(bookingCreateSchema.safeParse({ date: 'not-a-date', deskId: VALID_DESK_ID }).success).toBe(false);
  });

  it('rejects a date that does not exist on the calendar', () => {
    expect(bookingCreateSchema.safeParse({ date: '2026-02-30', deskId: VALID_DESK_ID }).success).toBe(false);
  });

  it('rejects a non-uuid deskId', () => {
    expect(bookingCreateSchema.safeParse({ date: '2026-09-16', deskId: 'A-02' }).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      bookingCreateSchema.safeParse({ date: '2026-09-16', deskId: VALID_DESK_ID, status: 'confirmed' }).success,
    ).toBe(false);
  });
});

describe('bookingSchema (US-007/AC-03, AC-04)', () => {
  const VALID = {
    id: VALID_DESK_ID,
    deskId: VALID_DESK_ID,
    deskNumber: 'A-02',
    date: '2026-09-16',
    status: 'confirmed' as const,
    confirmationEmail: 'priya@company.com',
  };

  it('parses a well-formed Confirmed booking', () => {
    expect(bookingSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a confirmationEmail that is not an email address', () => {
    expect(bookingSchema.safeParse({ ...VALID, confirmationEmail: 'not-an-email' }).success).toBe(false);
  });

  it('tolerates an unexpected additive field (ADR-002 asymmetry, not .strict())', () => {
    expect(bookingSchema.safeParse({ ...VALID, futureField: 'ignored' }).success).toBe(true);
  });
});

describe('cancelBookingParamsSchema (US-007/AC-07)', () => {
  it('accepts a uuid id', () => {
    expect(cancelBookingParamsSchema.safeParse({ id: VALID_DESK_ID }).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(cancelBookingParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(cancelBookingParamsSchema.safeParse({ id: VALID_DESK_ID, extra: 'x' }).success).toBe(false);
  });
});

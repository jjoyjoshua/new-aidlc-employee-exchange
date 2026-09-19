import { describe, expect, it } from 'vitest';
import {
  allBookingsListItemSchema,
  allBookingsQuerySchema,
  allBookingsResponseSchema,
  bookingCreateSchema,
  bookingDisplayStatusSchema,
  bookingSchema,
  bookingStatusSchema,
  cancelBookingParamsSchema,
  MAX_PAGE,
  myBookingListItemSchema,
  myBookingsQuerySchema,
  myBookingsResponseSchema,
} from './bookings.js';

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

describe('myBookingsQuerySchema (US-010/AC-03)', () => {
  it('accepts no query at all (the default page)', () => {
    expect(myBookingsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a well-formed before date', () => {
    expect(myBookingsQuerySchema.safeParse({ before: '2026-08-19' }).success).toBe(true);
  });

  it('rejects a malformed before date', () => {
    expect(myBookingsQuerySchema.safeParse({ before: 'not-a-date' }).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(myBookingsQuerySchema.safeParse({ before: '2026-08-19', limit: 10 }).success).toBe(false);
  });
});

describe('bookingDisplayStatusSchema — a distinct schema from bookingStatusSchema, never merged (US-010/AC-04, ADR-007)', () => {
  it('accepts confirmed, completed and cancelled', () => {
    expect(bookingDisplayStatusSchema.safeParse('confirmed').success).toBe(true);
    expect(bookingDisplayStatusSchema.safeParse('completed').success).toBe(true);
    expect(bookingDisplayStatusSchema.safeParse('cancelled').success).toBe(true);
  });

  it('bookingStatusSchema — the stored, two-value shape — rejects completed', () => {
    expect(bookingStatusSchema.safeParse('completed').success).toBe(false);
  });
});

describe('myBookingListItemSchema (US-010/AC-01, AC-04, AC-05)', () => {
  const VALID = {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    deskNumber: 'A-02',
    date: '2026-09-16',
    status: 'completed' as const,
  };

  it('parses a well-formed item, including a completed status', () => {
    expect(myBookingListItemSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects an empty deskNumber', () => {
    expect(myBookingListItemSchema.safeParse({ ...VALID, deskNumber: '' }).success).toBe(false);
  });
});

describe('myBookingsResponseSchema (US-010/AC-01, AC-03)', () => {
  it('parses an empty page with nextBefore null', () => {
    const result = myBookingsResponseSchema.safeParse({ today: '2026-09-18', items: [], nextBefore: null });
    expect(result.success).toBe(true);
  });

  it('defaults nextBefore to null when the key is missing (additive-safe, ADR-002)', () => {
    const result = myBookingsResponseSchema.safeParse({ today: '2026-09-18', items: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nextBefore).toBeNull();
  });

  it('tolerates an unexpected additive field (not .strict(), matching every other response)', () => {
    const result = myBookingsResponseSchema.safeParse({
      today: '2026-09-18',
      items: [],
      nextBefore: null,
      futureField: 'ignored',
    });
    expect(result.success).toBe(true);
  });
});

describe('allBookingsQuerySchema (US-013/AC-04)', () => {
  it('accepts no query at all (page 1)', () => {
    expect(allBookingsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a well-formed page number', () => {
    const result = allBookingsQuerySchema.safeParse({ page: '2' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(2);
  });

  it('rejects page 0', () => {
    expect(allBookingsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects a non-numeric page', () => {
    expect(allBookingsQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
  });

  it('rejects a page beyond MAX_PAGE', () => {
    expect(allBookingsQuerySchema.safeParse({ page: String(MAX_PAGE + 1) }).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(allBookingsQuerySchema.safeParse({ page: '1', limit: '10' }).success).toBe(false);
  });
});

describe('allBookingsQuerySchema — US-014 filters (US-014/AC-01, AC-02, AC-03, AC-04)', () => {
  it('accepts from alone', () => {
    expect(allBookingsQuerySchema.safeParse({ from: '2026-01-01' }).success).toBe(true);
  });

  it('accepts to alone', () => {
    expect(allBookingsQuerySchema.safeParse({ to: '2026-12-31' }).success).toBe(true);
  });

  it('accepts a well-formed from/to range', () => {
    const result = allBookingsQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-30' });
    expect(result.success).toBe(true);
  });

  it('rejects to before from (US-014/AC-01 edge case — an inverted range is refused, not silently empty)', () => {
    const result = allBookingsQuerySchema.safeParse({ from: '2026-09-30', to: '2026-09-01' });
    expect(result.success).toBe(false);
  });

  it('accepts from equal to to (a single-day range)', () => {
    expect(allBookingsQuerySchema.safeParse({ from: '2026-09-10', to: '2026-09-10' }).success).toBe(true);
  });

  it.each(['confirmed', 'completed', 'cancelled'])('accepts status=%s', (status) => {
    expect(allBookingsQuerySchema.safeParse({ status }).success).toBe(true);
  });

  it('rejects an unknown status word', () => {
    expect(allBookingsQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
  });

  it('accepts a well-formed deskId', () => {
    expect(allBookingsQuerySchema.safeParse({ deskId: VALID_DESK_ID }).success).toBe(true);
  });

  it('rejects a non-uuid deskId', () => {
    expect(allBookingsQuerySchema.safeParse({ deskId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts all four filters combined with page (US-014/AC-04)', () => {
    const result = allBookingsQuerySchema.safeParse({
      page: '2',
      from: '2026-09-01',
      to: '2026-09-30',
      status: 'confirmed',
      deskId: VALID_DESK_ID,
    });
    expect(result.success).toBe(true);
  });
});

describe('allBookingsListItemSchema (US-013/AC-03, AC-06)', () => {
  const VALID = {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    date: '2026-09-16',
    deskNumber: 'A-02',
    employeeName: 'Priya Raman',
    status: 'completed' as const,
  };

  it('parses a well-formed item, including a completed status', () => {
    expect(allBookingsListItemSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects an empty employeeName', () => {
    expect(allBookingsListItemSchema.safeParse({ ...VALID, employeeName: '' }).success).toBe(false);
  });

  it('rejects an empty deskNumber', () => {
    expect(allBookingsListItemSchema.safeParse({ ...VALID, deskNumber: '' }).success).toBe(false);
  });
});

describe('allBookingsResponseSchema (US-013/AC-04, AC-07)', () => {
  it('parses a full envelope', () => {
    const result = allBookingsResponseSchema.safeParse({
      today: '2026-09-16',
      total: 137,
      items: [],
      nextPage: 2,
    });
    expect(result.success).toBe(true);
  });

  it('defaults nextPage to null when the key is missing (additive-safe, ADR-002)', () => {
    const result = allBookingsResponseSchema.safeParse({ today: '2026-09-16', total: 0, items: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nextPage).toBeNull();
  });

  it('tolerates an unexpected additive field (not .strict(), matching every other response)', () => {
    const result = allBookingsResponseSchema.safeParse({
      today: '2026-09-16',
      total: 0,
      items: [],
      nextPage: null,
      futureField: 'ignored',
    });
    expect(result.success).toBe(true);
  });

  it('carries exactly four keys — US-014 adds no envelope field (design-note §5, FR-03)', () => {
    const result = allBookingsResponseSchema.safeParse({
      today: '2026-09-16',
      total: 137,
      items: [],
      nextPage: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data).sort()).toEqual(['items', 'nextPage', 'today', 'total']);
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

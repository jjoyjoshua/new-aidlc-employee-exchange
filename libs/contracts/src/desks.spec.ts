import { describe, expect, it } from 'vitest';
import { adminDeskSchema, adminDesksResponseSchema } from './desks.js';

const VALID_DESK = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  deskNumber: 'A-01',
  isActive: true,
  bookedAhead: 0,
};

describe('adminDeskSchema (US-014/AC-03, edge case — inactive desks stay findable)', () => {
  it('parses a well-formed active desk', () => {
    expect(adminDeskSchema.safeParse(VALID_DESK).success).toBe(true);
  });

  it('parses a well-formed inactive desk', () => {
    expect(adminDeskSchema.safeParse({ ...VALID_DESK, isActive: false }).success).toBe(true);
  });

  it('rejects an empty deskNumber', () => {
    expect(adminDeskSchema.safeParse({ ...VALID_DESK, deskNumber: '' }).success).toBe(false);
  });

  it('rejects a missing isActive', () => {
    const { isActive: _isActive, ...withoutActive } = VALID_DESK;
    expect(adminDeskSchema.safeParse(withoutActive).success).toBe(false);
  });
});

describe('adminDeskSchema.bookedAhead (US-016/AC-04, AC-05 — required, zero is not absence)', () => {
  it('parses a positive count', () => {
    expect(adminDeskSchema.safeParse({ ...VALID_DESK, bookedAhead: 3 }).success).toBe(true);
  });

  it('parses zero — the "none" case, not blank', () => {
    expect(adminDeskSchema.safeParse({ ...VALID_DESK, bookedAhead: 0 }).success).toBe(true);
  });

  it('rejects a missing bookedAhead — AC-05 requires the field, never its absence', () => {
    const { bookedAhead: _bookedAhead, ...withoutCount } = VALID_DESK;
    expect(adminDeskSchema.safeParse(withoutCount).success).toBe(false);
  });

  it('rejects a negative count', () => {
    expect(adminDeskSchema.safeParse({ ...VALID_DESK, bookedAhead: -1 }).success).toBe(false);
  });

  it('rejects a non-integer count', () => {
    expect(adminDeskSchema.safeParse({ ...VALID_DESK, bookedAhead: 1.5 }).success).toBe(false);
  });
});

describe('adminDesksResponseSchema (US-014/AC-03, §3.3 — GET /api/admin/desks)', () => {
  it('parses an object wrapping a mixed active/inactive list', () => {
    const result = adminDesksResponseSchema.safeParse({
      desks: [VALID_DESK, { ...VALID_DESK, id: '4f2504e0-4f89-41d3-9a0c-0305e82c3302', isActive: false }],
    });
    expect(result.success).toBe(true);
  });

  it('parses an empty list', () => {
    expect(adminDesksResponseSchema.safeParse({ desks: [] }).success).toBe(true);
  });

  it('tolerates an unexpected additive field (not .strict(), matching every other response)', () => {
    const result = adminDesksResponseSchema.safeParse({ desks: [], futureField: 'ignored' });
    expect(result.success).toBe(true);
  });
});

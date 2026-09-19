import { describe, expect, it } from 'vitest';
import { adminDeskSchema, adminDesksResponseSchema } from './desks.js';

const VALID_DESK = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  deskNumber: 'A-01',
  isActive: true,
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

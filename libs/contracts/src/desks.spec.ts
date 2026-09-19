import { describe, expect, it } from 'vitest';
import {
  DESK_NUMBER_PATTERN,
  adminDeskSchema,
  adminDesksResponseSchema,
  deskCreateSchema,
  deskIdParamsSchema,
  deskUpdateResponseSchema,
  deskUpdateSchema,
  normalizeDeskNumber,
} from './desks.js';

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

describe('normalizeDeskNumber (US-017/AC-03, AC-05 — trim then upper, once)', () => {
  it('uppercases a lower-case entry (US-017/AC-03)', () => {
    expect(normalizeDeskNumber('a-07')).toBe('A-07');
  });

  it('trims leading and trailing whitespace (US-017/AC-05)', () => {
    expect(normalizeDeskNumber(' A-01 ')).toBe('A-01');
  });

  it('trims before uppercasing, and the result equals the direct order (US-017/AC-03, AC-05)', () => {
    expect(normalizeDeskNumber(' a-01 ')).toBe('A-01');
  });

  it('leaves an already-normalised value unchanged', () => {
    expect(normalizeDeskNumber('A-01')).toBe('A-01');
  });

  it('is idempotent — normalizing twice equals normalizing once (US-017/AC-03, AC-05)', () => {
    for (const raw of ['a-01', ' A-01 ', 'z-99', '  b-12  ']) {
      const once = normalizeDeskNumber(raw);
      expect(normalizeDeskNumber(once)).toBe(once);
    }
  });
});

describe('DESK_NUMBER_PATTERN (US-017/AC-02, BR-001.4, V-16)', () => {
  it('matches the well-formed shape', () => {
    expect(DESK_NUMBER_PATTERN.test('A-01')).toBe(true);
    expect(DESK_NUMBER_PATTERN.test('Z-99')).toBe(true);
  });

  it('rejects anything not already upper-case, unpadded, and exactly four characters', () => {
    for (const bad of ['a-01', 'A-1', 'AA-01', 'A-001', 'Window seat 3', '1-01', 'A-0', '', '   ']) {
      expect(DESK_NUMBER_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe('deskCreateSchema (US-017/AC-02, AC-03, AC-05 — POST /api/admin/desks)', () => {
  it('parses a well-formed upper-case number unchanged', () => {
    const result = deskCreateSchema.safeParse({ deskNumber: 'A-01' });
    expect(result.success).toBe(true);
    expect(result.data?.deskNumber).toBe('A-01');
  });

  it('normalises a lower-case entry to upper case on the parsed OUTPUT (US-017/AC-03)', () => {
    const result = deskCreateSchema.safeParse({ deskNumber: 'a-07' });
    expect(result.success).toBe(true);
    expect(result.data?.deskNumber).toBe('A-07');
  });

  it('normalises whitespace before validating the shape (US-017/AC-05)', () => {
    const result = deskCreateSchema.safeParse({ deskNumber: '  b-12  ' });
    expect(result.success).toBe(true);
    expect(result.data?.deskNumber).toBe('B-12');
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a single letter and one digit', 'A-1'],
    ['two letters', 'AA-01'],
    ['three digits', 'A-001'],
    ['free text', 'Window seat 3'],
    ['a digit where the letter goes', '1-01'],
    ['one digit only', 'A-0'],
    ['a lower-case entry with the wrong shape', 'a-1'],
  ])('rejects %s — the format is exactly one letter, a hyphen, two digits (US-017/AC-02)', (_label, bad) => {
    expect(deskCreateSchema.safeParse({ deskNumber: bad }).success).toBe(false);
  });

  it('rejects an unknown field (.strict(), matching every other request schema)', () => {
    const result = deskCreateSchema.safeParse({ deskNumber: 'A-01', isActive: false });
    expect(result.success).toBe(false);
  });

  it('rejects a missing deskNumber', () => {
    expect(deskCreateSchema.safeParse({}).success).toBe(false);
  });

  it('treats a-01, "A-01 " and "A-01" as the same normalised value (US-017/AC-04, AC-05)', () => {
    const values = ['a-01', 'A-01 ', ' A-01', 'A-01'].map(
      (raw) => deskCreateSchema.safeParse({ deskNumber: raw }).success && deskCreateSchema.parse({ deskNumber: raw }).deskNumber,
    );
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe('A-01');
  });
});

describe('deskIdParamsSchema (US-018/AC-01 — PATCH /api/admin/desks/:id)', () => {
  it('parses a well-formed uuid', () => {
    expect(deskIdParamsSchema.safeParse({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(deskIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    expect(deskIdParamsSchema.safeParse({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', extra: 'x' }).success).toBe(false);
  });
});

describe('deskUpdateSchema (US-018/AC-02 — PATCH /api/admin/desks/:id)', () => {
  it('is a distinct object from deskCreateSchema, not an alias', () => {
    expect(deskUpdateSchema).not.toBe(deskCreateSchema);
  });

  it('parses a well-formed upper-case number unchanged', () => {
    const result = deskUpdateSchema.safeParse({ deskNumber: 'A-01' });
    expect(result.success).toBe(true);
    expect(result.data?.deskNumber).toBe('A-01');
  });

  it('normalises a lower-case entry to upper case on the parsed OUTPUT (US-018/AC-02)', () => {
    const result = deskUpdateSchema.safeParse({ deskNumber: 'a-07' });
    expect(result.success).toBe(true);
    expect(result.data?.deskNumber).toBe('A-07');
  });

  it('normalises whitespace before validating the shape (US-018/AC-02)', () => {
    const result = deskUpdateSchema.safeParse({ deskNumber: '  b-12  ' });
    expect(result.success).toBe(true);
    expect(result.data?.deskNumber).toBe('B-12');
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a single letter and one digit', 'A-1'],
    ['two letters', 'AA-01'],
    ['three digits', 'A-001'],
    ['free text', 'Window seat 3'],
  ])('rejects %s — the same format deskCreateSchema enforces (US-018/AC-02)', (_label, bad) => {
    expect(deskUpdateSchema.safeParse({ deskNumber: bad }).success).toBe(false);
    expect(deskCreateSchema.safeParse({ deskNumber: bad }).success).toBe(false);
  });

  it('rejects an unknown field, including isActive (.strict())', () => {
    expect(deskUpdateSchema.safeParse({ deskNumber: 'A-01', isActive: false }).success).toBe(false);
  });

  it('rejects an id in the body — it is the path parameter, not the body', () => {
    expect(deskUpdateSchema.safeParse({ deskNumber: 'A-01', id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).success).toBe(false);
  });

  it('rejects a missing deskNumber', () => {
    expect(deskUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe('deskUpdateResponseSchema (US-018/AC-01 — PATCH /api/admin/desks/:id 200 body)', () => {
  it('parses the desk without bookedAhead', () => {
    const { bookedAhead: _bookedAhead, ...withoutCount } = VALID_DESK;
    expect(deskUpdateResponseSchema.safeParse(withoutCount).success).toBe(true);
  });

  it('tolerates bookedAhead present (an .omit()-derived schema strips extras, it does not refuse them)', () => {
    expect(deskUpdateResponseSchema.safeParse(VALID_DESK).success).toBe(true);
  });

  it('rejects a missing deskNumber', () => {
    const { deskNumber: _deskNumber, bookedAhead: _bookedAhead, ...rest } = VALID_DESK;
    expect(deskUpdateResponseSchema.safeParse(rest).success).toBe(false);
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

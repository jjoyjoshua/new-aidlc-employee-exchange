import { describe, expect, it } from 'vitest';
import {
  adminSummarySchema,
  adminUserSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
} from './users.js';

const VALID_USER = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee',
  isActive: true,
};

const VALID_SUMMARY = { total: 38, employees: 36, admins: 2, deactivated: 1 };

describe('adminUserSchema (US-020/AC-01)', () => {
  it('parses a well-formed active employee account', () => {
    expect(adminUserSchema.safeParse(VALID_USER).success).toBe(true);
  });

  it('parses a well-formed admin account', () => {
    expect(adminUserSchema.safeParse({ ...VALID_USER, role: 'admin' }).success).toBe(true);
  });

  it('parses a deactivated account', () => {
    expect(adminUserSchema.safeParse({ ...VALID_USER, isActive: false }).success).toBe(true);
  });

  it('rejects a missing fullName', () => {
    const { fullName: _fullName, ...rest } = VALID_USER;
    expect(adminUserSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing isActive', () => {
    const { isActive: _isActive, ...rest } = VALID_USER;
    expect(adminUserSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown role', () => {
    expect(adminUserSchema.safeParse({ ...VALID_USER, role: 'superadmin' }).success).toBe(false);
  });

  it('has no isYou field — that marker comes from useAuth(), never the wire (US-020/AC-03, design note §7.3)', () => {
    const result = adminUserSchema.safeParse({ ...VALID_USER, isYou: true });
    expect(result.success).toBe(true);
    // Not .strict() — Zod strips the extra rather than refusing it — but the TYPE has no such field.
    expect(result.success && 'isYou' in result.data).toBe(false);
  });
});

describe('adminUsersQuerySchema (US-020/AC-04)', () => {
  it('parses an absent q', () => {
    expect(adminUsersQuerySchema.safeParse({}).success).toBe(true);
  });

  it('parses a well-formed q', () => {
    const result = adminUsersQuerySchema.safeParse({ q: 'dana' });
    expect(result.success).toBe(true);
    expect(result.data?.q).toBe('dana');
  });

  it('trims a q with surrounding whitespace', () => {
    const result = adminUsersQuerySchema.safeParse({ q: '  dana  ' });
    expect(result.success).toBe(true);
    expect(result.data?.q).toBe('dana');
  });

  it('rejects an empty q', () => {
    expect(adminUsersQuerySchema.safeParse({ q: '' }).success).toBe(false);
  });

  it('rejects a q over 100 characters (design note A15/§2.3 — bounds the .or() filter string)', () => {
    expect(adminUsersQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });

  it('accepts a q of exactly 100 characters', () => {
    expect(adminUsersQuerySchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true);
  });

  it('rejects an unknown query field (.strict())', () => {
    expect(adminUsersQuerySchema.safeParse({ q: 'dana', page: 2 }).success).toBe(false);
  });
});

describe('adminSummarySchema (US-020/AC-02, AC-06)', () => {
  it('parses well-formed counts', () => {
    expect(adminSummarySchema.safeParse(VALID_SUMMARY).success).toBe(true);
  });

  it('parses all-zero counts (an empty system)', () => {
    expect(adminSummarySchema.safeParse({ total: 0, employees: 0, admins: 0, deactivated: 0 }).success).toBe(true);
  });

  it('rejects a negative count', () => {
    expect(adminSummarySchema.safeParse({ ...VALID_SUMMARY, deactivated: -1 }).success).toBe(false);
  });

  it('rejects a non-integer count', () => {
    expect(adminSummarySchema.safeParse({ ...VALID_SUMMARY, total: 38.5 }).success).toBe(false);
  });

  it('rejects a missing field', () => {
    const { admins: _admins, ...rest } = VALID_SUMMARY;
    expect(adminSummarySchema.safeParse(rest).success).toBe(false);
  });
});

describe('adminUsersResponseSchema (US-020/AC-01, AC-02 — GET /api/admin/users 200 body, design note §3.2)', () => {
  it('parses users plus summary', () => {
    const result = adminUsersResponseSchema.safeParse({ users: [VALID_USER], summary: VALID_SUMMARY });
    expect(result.success).toBe(true);
  });

  it('parses an empty users list with a summary present', () => {
    expect(adminUsersResponseSchema.safeParse({ users: [], summary: VALID_SUMMARY }).success).toBe(true);
  });

  it('rejects a response missing summary', () => {
    expect(adminUsersResponseSchema.safeParse({ users: [VALID_USER] }).success).toBe(false);
  });

  it('rejects a response missing users', () => {
    expect(adminUsersResponseSchema.safeParse({ summary: VALID_SUMMARY }).success).toBe(false);
  });

  it('tolerates an unexpected additive field (not .strict(), matching every other response)', () => {
    const result = adminUsersResponseSchema.safeParse({ users: [], summary: VALID_SUMMARY, futureField: 'ignored' });
    expect(result.success).toBe(true);
  });

  it('has no top-level total — summary.total is the only total (design note §3.2/A5)', () => {
    const result = adminUsersResponseSchema.safeParse({ users: [], summary: VALID_SUMMARY, total: 999 });
    expect(result.success).toBe(true);
    // Not .strict(), so the extra parses — but the TYPE carries no top-level total to read.
    expect(result.success && 'total' in result.data).toBe(false);
  });
});

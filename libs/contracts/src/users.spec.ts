import { describe, expect, it } from 'vitest';
import {
  adminSummarySchema,
  adminUserSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  createAccountRequestSchema,
  emailTakenDetailsSchema,
  roleChangeRequestSchema,
  userIdParamsSchema,
  userUpdateSchema,
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

const VALID_CREATE_ACCOUNT = {
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee',
  password: 'Correct-Horse7',
};

describe('createAccountRequestSchema (US-021/AC-01, AC-02, AC-03)', () => {
  it('parses a well-formed body', () => {
    const result = createAccountRequestSchema.safeParse(VALID_CREATE_ACCOUNT);
    expect(result.success).toBe(true);
  });

  it('lower-cases and trims the email, so the parsed value is what gets checked and stored (US-021/D-01)', () => {
    const result = createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, email: '  Dana@Company.com  ' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('dana@company.com');
  });

  it('trims fullName', () => {
    const result = createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, fullName: '  Dana Silva  ' });
    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe('Dana Silva');
  });

  it('rejects an empty fullName', () => {
    expect(createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, fullName: '' }).success).toBe(false);
  });

  it('rejects an implausible email', () => {
    expect(createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a role outside employee/admin', () => {
    expect(createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, role: 'superadmin' }).success).toBe(false);
  });

  it.each([
    ['too short', 'Aa1!aaa'],
    ['no upper-case letter', 'correct-horse7'],
    ['no lower-case letter', 'CORRECT-HORSE7'],
    ['no digit', 'Correct-Horse'],
    ['no special character', 'CorrectHorse7'],
  ])('rejects a password failing V-12 (%s) — the same evaluator the checklist runs (US-021/AC-03)', (_label, password) => {
    expect(createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, password }).success).toBe(false);
  });

  it('accepts a password meeting all five V-12 rules at exactly 8 characters', () => {
    expect(createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, password: 'Aa1!aaaa' }).success).toBe(true);
  });

  it('rejects an unknown field (.strict())', () => {
    expect(createAccountRequestSchema.safeParse({ ...VALID_CREATE_ACCOUNT, isActive: true }).success).toBe(false);
  });

  it('rejects a missing password', () => {
    const { password: _password, ...rest } = VALID_CREATE_ACCOUNT;
    expect(createAccountRequestSchema.safeParse(rest).success).toBe(false);
  });
});

describe('userIdParamsSchema (US-023)', () => {
  it('parses a well-formed uuid', () => {
    expect(userIdParamsSchema.safeParse({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(userIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    expect(
      userIdParamsSchema.safeParse({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', extra: 1 }).success,
    ).toBe(false);
  });
});

describe('roleChangeRequestSchema (US-024/AC-01 — POST /api/admin/users/:id/role)', () => {
  it('parses a well-formed body naming employee', () => {
    expect(roleChangeRequestSchema.safeParse({ role: 'employee' }).success).toBe(true);
  });

  it('parses a well-formed body naming admin', () => {
    expect(roleChangeRequestSchema.safeParse({ role: 'admin' }).success).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(roleChangeRequestSchema.safeParse({ role: 'superadmin' }).success).toBe(false);
  });

  it('rejects a missing role', () => {
    expect(roleChangeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown field (.strict()) — this contract carries role only, matching every other request schema in this package', () => {
    expect(roleChangeRequestSchema.safeParse({ role: 'admin', fullName: 'Dana Silva' }).success).toBe(false);
  });
});

const VALID_USER_UPDATE = { fullName: 'Dana Silva', email: 'dana@company.com' };

describe('userUpdateSchema (US-023/AC-01, AC-02, AC-03, AC-04)', () => {
  it('parses a well-formed body', () => {
    expect(userUpdateSchema.safeParse(VALID_USER_UPDATE).success).toBe(true);
  });

  it('lower-cases and trims the email, the same as createAccountRequestSchema (US-021/D-01)', () => {
    const result = userUpdateSchema.safeParse({ ...VALID_USER_UPDATE, email: '  Dana@Company.com  ' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('dana@company.com');
  });

  it('trims fullName', () => {
    const result = userUpdateSchema.safeParse({ ...VALID_USER_UPDATE, fullName: '  Dana Silva  ' });
    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe('Dana Silva');
  });

  it('rejects an empty fullName (US-023/AC-04)', () => {
    expect(userUpdateSchema.safeParse({ ...VALID_USER_UPDATE, fullName: '' }).success).toBe(false);
  });

  it('rejects an empty email (US-023/AC-04)', () => {
    expect(userUpdateSchema.safeParse({ ...VALID_USER_UPDATE, email: '' }).success).toBe(false);
  });

  it('rejects an implausible email (US-023/AC-04)', () => {
    expect(userUpdateSchema.safeParse({ ...VALID_USER_UPDATE, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a role field — this contract carries no role, a role change is a separate story (US-023/AC-07)', () => {
    expect(userUpdateSchema.safeParse({ ...VALID_USER_UPDATE, role: 'admin' }).success).toBe(false);
  });

  it('rejects a password field — this contract carries no password (US-023/AC-07)', () => {
    expect(userUpdateSchema.safeParse({ ...VALID_USER_UPDATE, password: 'Correct-Horse7' }).success).toBe(false);
  });

  it('rejects a missing email', () => {
    const { email: _email, ...rest } = VALID_USER_UPDATE;
    expect(userUpdateSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing fullName', () => {
    const { fullName: _fullName, ...rest } = VALID_USER_UPDATE;
    expect(userUpdateSchema.safeParse(rest).success).toBe(false);
  });
});

describe('emailTakenDetailsSchema (US-021/AC-06, ADR-009 §2 second application)', () => {
  it('parses an active holder', () => {
    expect(emailTakenDetailsSchema.safeParse({ fullName: 'Dana Silva', isActive: true }).success).toBe(true);
  });

  it('parses a deactivated holder', () => {
    expect(emailTakenDetailsSchema.safeParse({ fullName: 'Dana Silva', isActive: false }).success).toBe(true);
  });

  it('rejects a missing isActive', () => {
    expect(emailTakenDetailsSchema.safeParse({ fullName: 'Dana Silva' }).success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    expect(emailTakenDetailsSchema.safeParse({ fullName: 'Dana Silva', isActive: true, id: 'x' }).success).toBe(false);
  });
});

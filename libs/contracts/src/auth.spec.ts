import { describe, expect, it } from 'vitest';
import { signInRequestSchema, signInResponseSchema } from './auth.js';

describe('signInRequestSchema', () => {
  it('trims the email before validating it (US-001/AC-05)', () => {
    const parsed = signInRequestSchema.parse({
      email: '  priya@company.com  ',
      password: 'correct horse',
    });

    expect(parsed.email).toBe('priya@company.com');
  });

  it('never trims, normalises or case-folds the password (US-001/AC-05)', () => {
    const password = '  Mixed Case Pass  ';
    const parsed = signInRequestSchema.parse({ email: 'priya@company.com', password });

    expect(parsed.password).toBe(password);
  });

  it('rejects an empty email with the message the field shows (US-001/AC-05)', () => {
    const result = signInRequestSchema.safeParse({ email: '   ', password: 'x' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter your email address');
    expect(result.error?.issues[0]?.path).toEqual(['email']);
  });

  it('rejects an implausible email address (US-001/AC-05)', () => {
    const result = signInRequestSchema.safeParse({ email: 'priya-at-company', password: 'x' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter a valid email address');
  });

  it('rejects an empty password (US-001/AC-05)', () => {
    const result = signInRequestSchema.safeParse({ email: 'priya@company.com', password: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['password']);
  });

  it('does not apply V-12 — a short password is a credential attempt, not a bad request (US-001/AC-04)', () => {
    // A 5-character password must reach the server and come back as an indistinguishable 401,
    // not as a 400. Rejecting it here would tell an attacker the password policy and would
    // lock out any account whose stored credential predates a policy change.
    const result = signInRequestSchema.safeParse({ email: 'priya@company.com', password: 'short' });

    expect(result.success).toBe(true);
  });

  it('rejects unknown fields rather than stripping them (US-001/AC-05)', () => {
    const result = signInRequestSchema.safeParse({
      email: 'priya@company.com',
      password: 'x',
      role: 'admin',
    });

    expect(result.success).toBe(false);
  });
});

describe('signInResponseSchema', () => {
  const valid = {
    session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1789200000 },
    user: {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      email: 'priya@company.com',
      fullName: 'Priya Sharma',
      role: 'employee',
      mustChangePassword: false,
    },
  };

  it('accepts a response that gained a field, so an old tab survives a deploy (US-001/AC-07)', () => {
    const result = signInResponseSchema.safeParse({ ...valid, issuedBy: 'a-newer-server' });

    expect(result.success).toBe(true);
  });

  it('rejects a response whose field changed type (US-001/AC-07)', () => {
    const result = signInResponseSchema.safeParse({
      ...valid,
      session: { ...valid.session, expiresAt: '1789200000' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a response that lost a field (US-001/AC-07)', () => {
    const { role: _role, ...userWithoutRole } = valid.user;
    const result = signInResponseSchema.safeParse({ ...valid, user: userWithoutRole });

    expect(result.success).toBe(false);
  });
});

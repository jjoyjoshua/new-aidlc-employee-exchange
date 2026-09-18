import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorBodySchema, errorCodeSchema } from './error.js';

describe('errorBodySchema', () => {
  it('parses a code it has never seen, so an old tab survives a new server (US-001/AC-07)', () => {
    // This is the whole reason `code` is z.string() and not errorCodeSchema. A tab loaded
    // before a deploy must still be able to READ an error from the server that came after it —
    // otherwise ADR-002's version-skew failure reappears pointed the other way, and a handled
    // error becomes a crash.
    const result = errorBodySchema.safeParse({
      statusCode: 429,
      code: 'rate_limited',
      message: 'Too many attempts.',
    });

    expect(result.success).toBe(true);
    expect(result.data?.code).toBe('rate_limited');
  });

  it('rejects a body with no code at all (US-001/AC-07)', () => {
    const result = errorBodySchema.safeParse({ statusCode: 500, code: '', message: 'x' });

    expect(result.success).toBe(false);
  });

  it('rejects a body whose statusCode is not an integer (US-001/AC-07)', () => {
    const result = errorBodySchema.safeParse({ statusCode: '401', code: 'no_session', message: '' });

    expect(result.success).toBe(false);
  });
});

describe('ERROR_CODES', () => {
  it('carries every code the wire uses, so a switch can be exhaustive (US-001/AC-04)', () => {
    expect(ERROR_CODES.invalid_credentials).toBe('invalid_credentials');
    expect(ERROR_CODES.service_unavailable).toBe('service_unavailable');
    expect(ERROR_CODES.admin_only).toBe('admin_only');
    expect(ERROR_CODES.password_change_required).toBe('password_change_required');
  });

  it('carries session_expired, distinct from session_invalid (US-003/AC-03)', () => {
    expect(ERROR_CODES.session_expired).toBe('session_expired');
    expect(errorCodeSchema.parse('session_expired')).toBe('session_expired');
  });

  it('carries password_same_as_current, distinct from password_change_required (US-004/AC-05)', () => {
    expect(ERROR_CODES.password_same_as_current).toBe('password_same_as_current');
    expect(errorCodeSchema.parse('password_same_as_current')).toBe('password_same_as_current');
  });

  it('carries password_change_not_required, the mirror of password_change_required (US-004/AC-03)', () => {
    expect(ERROR_CODES.password_change_not_required).toBe('password_change_not_required');
    expect(ERROR_CODES.password_change_not_required).not.toBe(ERROR_CODES.password_change_required);
  });

  it('carries date_not_bookable, for a well-formed date the window rules refuse (US-006)', () => {
    expect(ERROR_CODES.date_not_bookable).toBe('date_not_bookable');
    expect(errorCodeSchema.parse('date_not_bookable')).toBe('date_not_bookable');
  });

  it('is the same set the enum validates (US-001/AC-04)', () => {
    expect(errorCodeSchema.options).toEqual(Object.values(ERROR_CODES));
  });
});

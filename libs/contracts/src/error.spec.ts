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

  it('carries the five codes US-007 adds for booking creation and cancellation (US-007/AC-05, AC-08, AC-11, AC-12)', () => {
    expect(ERROR_CODES.desk_already_booked).toBe('desk_already_booked');
    expect(ERROR_CODES.already_booked_that_date).toBe('already_booked_that_date');
    expect(ERROR_CODES.desk_not_found).toBe('desk_not_found');
    expect(ERROR_CODES.desk_inactive).toBe('desk_inactive');
    expect(ERROR_CODES.booking_not_found).toBe('booking_not_found');
    for (const code of [
      'desk_already_booked',
      'already_booked_that_date',
      'desk_not_found',
      'desk_inactive',
      'booking_not_found',
    ]) {
      expect(errorCodeSchema.parse(code)).toBe(code);
    }
  });

  it('carries booking_already_cancelled, distinct from booking_not_found (US-011/AC-09)', () => {
    expect(ERROR_CODES.booking_already_cancelled).toBe('booking_already_cancelled');
    expect(ERROR_CODES.booking_already_cancelled).not.toBe(ERROR_CODES.booking_not_found);
    expect(errorCodeSchema.parse('booking_already_cancelled')).toBe('booking_already_cancelled');
  });

  it('carries desk_number_taken, distinct from desk_already_booked (US-017/AC-04)', () => {
    expect(ERROR_CODES.desk_number_taken).toBe('desk_number_taken');
    expect(ERROR_CODES.desk_number_taken).not.toBe(ERROR_CODES.desk_already_booked);
    expect(errorCodeSchema.parse('desk_number_taken')).toBe('desk_number_taken');
  });

  it('is the same set the enum validates (US-001/AC-04)', () => {
    expect(errorCodeSchema.options).toEqual(Object.values(ERROR_CODES));
  });
});

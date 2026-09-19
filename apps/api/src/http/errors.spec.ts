import { describe, expect, it } from 'vitest';
import { badRequest, conflict, forbidden, notFound, unauthorized, unprocessable, HttpError } from './errors.js';

describe('HttpError.toBody — every existing helper stays byte-identical (US-019/AC-04, ADR-009)', () => {
  it('badRequest carries no details key at all', () => {
    const body = badRequest('invalid_request', 'That request was not valid.').toBody();
    expect(body).toEqual({ statusCode: 400, code: 'invalid_request', message: 'That request was not valid.' });
    expect('details' in body).toBe(false);
  });

  it('unauthorized carries no details key at all', () => {
    const body = unauthorized('no_session', 'Sign in to continue.').toBody();
    expect('details' in body).toBe(false);
  });

  it('forbidden carries no details key at all', () => {
    const body = forbidden('admin_only', 'Admins only.').toBody();
    expect('details' in body).toBe(false);
  });

  it('notFound carries no details key at all', () => {
    const body = notFound('desk_not_found', 'That desk could not be found.').toBody();
    expect('details' in body).toBe(false);
  });

  it('conflict carries no details key at all', () => {
    const body = conflict('desk_number_taken', 'That desk number is already in use.').toBody();
    expect('details' in body).toBe(false);
  });

  it('unprocessable called with no details carries no details key — the old shape, unchanged (US-019/AC-04)', () => {
    const body = unprocessable('desk_inactive', 'That desk is no longer active.').toBody();
    expect(body).toEqual({ statusCode: 422, code: 'desk_inactive', message: 'That desk is no longer active.' });
    expect('details' in body).toBe(false);
  });
});

describe('HttpError.toBody — details, present only when a caller supplies one (US-019/AC-04, ADR-009)', () => {
  it('unprocessable with a details object includes it verbatim', () => {
    const body = unprocessable(
      'desk_has_upcoming_bookings',
      'That desk has upcoming bookings, so it cannot be deactivated.',
      { upcomingBookings: 3 },
    ).toBody();

    expect(body).toEqual({
      statusCode: 422,
      code: 'desk_has_upcoming_bookings',
      message: 'That desk has upcoming bookings, so it cannot be deactivated.',
      details: { upcomingBookings: 3 },
    });
  });

  it('HttpError constructed directly with details includes it; without, it does not', () => {
    const withDetails = new HttpError(422, 'desk_has_upcoming_bookings', 'x', { upcomingBookings: 1 });
    expect(withDetails.toBody().details).toEqual({ upcomingBookings: 1 });

    const withoutDetails = new HttpError(422, 'desk_has_upcoming_bookings', 'x');
    expect('details' in withoutDetails.toBody()).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import { createAdminCancelBooking, createCancelBooking } from './cancel-booking.js';

function apiReturning(result: Awaited<ReturnType<ApiClient['requestNoContent']>>): ApiClient {
  return {
    request: (async () => {
      throw new Error('not used by cancelBooking');
    }) as ApiClient['request'],
    requestNoContent: (async () => result) as ApiClient['requestNoContent'],
  };
}

describe('createCancelBooking — US-007/AC-07, widened by US-011/AC-09 (design note §5.2)', () => {
  it('calls POST /api/bookings/:id/cancel and maps a 200 to ok', async () => {
    let calledPath: string | undefined;
    let calledInit: unknown;
    const api: ApiClient = {
      request: (async () => {
        throw new Error('not used');
      }) as ApiClient['request'],
      requestNoContent: (async (path: string, init: unknown) => {
        calledPath = path;
        calledInit = init;
        return { kind: 'ok', data: undefined };
      }) as ApiClient['requestNoContent'],
    };

    const outcome = await createCancelBooking(api)('booking-1');

    expect(calledPath).toBe('/api/bookings/booking-1/cancel');
    expect(calledInit).toMatchObject({ method: 'POST' });
    expect(outcome).toEqual({ kind: 'ok' });
  });

  it('maps 409 booking_already_cancelled to already_cancelled — distinct from a generic failure (US-011/AC-09)', async () => {
    const api = apiReturning({ kind: 'error', status: 409, code: ERROR_CODES.booking_already_cancelled, message: 'x' });

    const outcome = await createCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'already_cancelled' });
  });

  it('maps 404 booking_not_found to refused — a server-answered refusal, distinct from a transport failure (US-011 design note §2.3, §5.2)', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: ERROR_CODES.booking_not_found, message: 'x' });

    const outcome = await createCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'refused' });
  });

  it('maps every other server-answered error to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });

    const outcome = await createCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps a transport failure to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });

    const outcome = await createCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

describe('createAdminCancelBooking — US-015, the admin half sharing the same outcome mapping', () => {
  it('calls POST /api/admin/bookings/:id/cancel and maps a 200 to ok', async () => {
    let calledPath: string | undefined;
    let calledInit: unknown;
    const api: ApiClient = {
      request: (async () => {
        throw new Error('not used');
      }) as ApiClient['request'],
      requestNoContent: (async (path: string, init: unknown) => {
        calledPath = path;
        calledInit = init;
        return { kind: 'ok', data: undefined };
      }) as ApiClient['requestNoContent'],
    };

    const outcome = await createAdminCancelBooking(api)('booking-1');

    expect(calledPath).toBe('/api/admin/bookings/booking-1/cancel');
    expect(calledInit).toMatchObject({ method: 'POST' });
    expect(outcome).toEqual({ kind: 'ok' });
  });

  it('maps 409 booking_already_cancelled to already_cancelled (US-015/AC-09)', async () => {
    const api = apiReturning({ kind: 'error', status: 409, code: ERROR_CODES.booking_already_cancelled, message: 'x' });

    const outcome = await createAdminCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'already_cancelled' });
  });

  it('maps 404 booking_not_found to refused (US-015/AC-02)', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: ERROR_CODES.booking_not_found, message: 'x' });

    const outcome = await createAdminCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'refused' });
  });

  it('maps a transport failure to failed (US-015/AC-08)', async () => {
    const api = apiReturning({ kind: 'unavailable' });

    const outcome = await createAdminCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

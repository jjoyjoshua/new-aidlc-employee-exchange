import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import { createCancelBooking } from './cancel-booking.js';

function apiReturning(result: Awaited<ReturnType<ApiClient['requestNoContent']>>): ApiClient {
  return {
    request: (async () => {
      throw new Error('not used by cancelBooking');
    }) as ApiClient['request'],
    requestNoContent: (async () => result) as ApiClient['requestNoContent'],
  };
}

describe('createCancelBooking — US-007/AC-07', () => {
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

  it('maps a 404 booking_not_found to ok too — already gone is the state that was asked for (design note §3.4, F-6)', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: ERROR_CODES.booking_not_found, message: 'x' });

    const outcome = await createCancelBooking(api)('booking-1');

    expect(outcome).toEqual({ kind: 'ok' });
  });

  it('maps every other error to failed', async () => {
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

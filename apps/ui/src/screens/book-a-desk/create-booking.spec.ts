import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from '../../lib/api-client.js';
import { createCreateBooking } from './create-booking.js';

const BOOKING = {
  id: 'b1',
  deskId: 'd1',
  deskNumber: 'A-02',
  date: '2026-09-16',
  status: 'confirmed' as const,
  confirmationEmail: 'priya@company.com',
};

function apiReturning(result: unknown): ApiClient {
  return {
    request: (async () => result) as ApiClient['request'],
    requestNoContent: (async () => {
      throw new Error('not used by createBooking');
    }) as ApiClient['requestNoContent'],
  };
}

describe('createCreateBooking — US-007/AC-03', () => {
  it('POSTs /api/bookings with the date and deskId, and maps a 201 to ok with the booking', async () => {
    let calledPath: string | undefined;
    let calledInit: { method?: string; body?: unknown } | undefined;
    const api: ApiClient = {
      request: (async (path: string, _schema: unknown, init: { method?: string; body?: unknown }) => {
        calledPath = path;
        calledInit = init;
        return { kind: 'ok', data: BOOKING };
      }) as ApiClient['request'],
      requestNoContent: (async () => {
        throw new Error('not used');
      }) as ApiClient['requestNoContent'],
    };

    const outcome = await createCreateBooking(api)({ date: '2026-09-16', deskId: 'd1' }, new AbortController().signal);

    expect(calledPath).toBe('/api/bookings');
    expect(calledInit?.method).toBe('POST');
    expect(calledInit?.body).toEqual({ date: '2026-09-16', deskId: 'd1' });
    expect(outcome).toEqual({ kind: 'ok', booking: BOOKING });
  });

  it('maps 409 desk_already_booked to desk_conflict (US-007/AC-08)', async () => {
    const api = apiReturning({ kind: 'error', status: 409, code: ERROR_CODES.desk_already_booked, message: 'x' });

    const outcome = await createCreateBooking(api)({ date: '2026-09-16', deskId: 'd1' }, new AbortController().signal);

    expect(outcome).toEqual({ kind: 'desk_conflict' });
  });

  it('maps 409 already_booked_that_date to user_conflict (US-007/AC-05)', async () => {
    const api = apiReturning({ kind: 'error', status: 409, code: ERROR_CODES.already_booked_that_date, message: 'x' });

    const outcome = await createCreateBooking(api)({ date: '2026-09-16', deskId: 'd1' }, new AbortController().signal);

    expect(outcome).toEqual({ kind: 'user_conflict' });
  });

  it('maps every other error (unreachable date/desk refusals, a genuine 5xx) to failed (US-007/AC-10)', async () => {
    const api = apiReturning({ kind: 'error', status: 422, code: ERROR_CODES.date_not_bookable, message: 'x' });

    const outcome = await createCreateBooking(api)({ date: '2026-09-16', deskId: 'd1' }, new AbortController().signal);

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps a transport failure (timeout, lost connection) to failed (US-007/AC-10)', async () => {
    const api = apiReturning({ kind: 'unavailable' });

    const outcome = await createCreateBooking(api)({ date: '2026-09-16', deskId: 'd1' }, new AbortController().signal);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

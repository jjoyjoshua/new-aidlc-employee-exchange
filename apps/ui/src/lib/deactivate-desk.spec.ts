import { describe, expect, it, vi } from 'vitest';
import { deskStateResponseSchema } from '@desk-booking/contracts';
import type { ApiClient, ApiResult } from './api-client.js';
import { createDeactivateDesk } from './deactivate-desk.js';

const DESK_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const RESPONSE_DESK = { id: DESK_ID, deskNumber: 'A-02', isActive: false };

function apiReturning(result: ApiResult<unknown>): ApiClient {
  return {
    request: vi.fn(async () => result) as unknown as ApiClient['request'],
    requestNoContent: vi.fn() as unknown as ApiClient['requestNoContent'],
  };
}

describe('createDeactivateDesk — success (US-019/AC-01)', () => {
  it('maps a 200 to { kind: "ok" } carrying the desk', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_DESK });
    const deactivate = createDeactivateDesk(api);

    const result = await deactivate(DESK_ID);

    expect(result).toEqual({ kind: 'ok', desk: RESPONSE_DESK });
  });

  it('calls POST /api/admin/desks/:id/deactivate', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_DESK });
    const deactivate = createDeactivateDesk(api);

    await deactivate(DESK_ID);

    expect(api.request).toHaveBeenCalledWith(
      `/api/admin/desks/${DESK_ID}/deactivate`,
      deskStateResponseSchema,
      { method: 'POST' },
    );
  });
});

describe('createDeactivateDesk — blocked (US-019/AC-04)', () => {
  it('maps a 422 desk_has_upcoming_bookings with a valid count to { kind: "blocked", upcomingBookings }', async () => {
    const api = apiReturning({
      kind: 'error',
      status: 422,
      code: 'desk_has_upcoming_bookings',
      message: 'x',
      details: { upcomingBookings: 3 },
    });
    const deactivate = createDeactivateDesk(api);

    const result = await deactivate(DESK_ID);

    expect(result).toEqual({ kind: 'blocked', upcomingBookings: 3 });
  });

  it('the SAME code with a MISSING count maps to failed, never a wrong number (US-019/AC-04, design note §7.3)', async () => {
    const api = apiReturning({ kind: 'error', status: 422, code: 'desk_has_upcoming_bookings', message: 'x' });
    const deactivate = createDeactivateDesk(api);

    const result = await deactivate(DESK_ID);

    expect(result).toEqual({ kind: 'failed' });
  });

  it('the same code with a ZERO count maps to failed — a zero blocked-count is self-contradicting (US-019/AC-04)', async () => {
    const api = apiReturning({
      kind: 'error',
      status: 422,
      code: 'desk_has_upcoming_bookings',
      message: 'x',
      details: { upcomingBookings: 0 },
    });
    const deactivate = createDeactivateDesk(api);

    const result = await deactivate(DESK_ID);

    expect(result).toEqual({ kind: 'failed' });
  });

  it('the same code with a non-numeric count maps to failed', async () => {
    const api = apiReturning({
      kind: 'error',
      status: 422,
      code: 'desk_has_upcoming_bookings',
      message: 'x',
      details: { upcomingBookings: 'three' },
    });
    const deactivate = createDeactivateDesk(api);

    const result = await deactivate(DESK_ID);

    expect(result).toEqual({ kind: 'failed' });
  });
});

describe('createDeactivateDesk — failed (US-019/AC-11)', () => {
  it('a 500 maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });
    const deactivate = createDeactivateDesk(api);
    expect(await deactivate(DESK_ID)).toEqual({ kind: 'failed' });
  });

  it('unavailable (transport failure, timeout, unparseable body) maps to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });
    const deactivate = createDeactivateDesk(api);
    expect(await deactivate(DESK_ID)).toEqual({ kind: 'failed' });
  });

  it('a 404 desk_not_found maps to failed — no approved copy exists for "that desk is gone" (US-019/AC-11)', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: 'desk_not_found', message: 'x' });
    const deactivate = createDeactivateDesk(api);
    expect(await deactivate(DESK_ID)).toEqual({ kind: 'failed' });
  });
});

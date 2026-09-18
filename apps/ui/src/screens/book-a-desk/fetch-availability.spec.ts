import { describe, expect, it, vi } from 'vitest';
import { createFetchAvailability } from './fetch-availability.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AvailabilityResponse } from '@desk-booking/contracts';

const RESPONSE: AvailabilityResponse = { date: '2026-09-16', desks: [] };

describe('createFetchAvailability', () => {
  it('maps an ok ApiResult to an ok outcome, requesting the date as a query param', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'ok', data: RESPONSE });
    const api = { request, requestNoContent: vi.fn() } as unknown as ApiClient;
    const signal = new AbortController().signal;

    const outcome = await createFetchAvailability(api)('2026-09-16', signal);

    expect(outcome).toEqual({ kind: 'ok', data: RESPONSE });
    expect(request).toHaveBeenCalledWith(
      '/api/bookings/availability?date=2026-09-16',
      expect.anything(),
      { signal },
    );
  });

  it.each([
    { kind: 'error', status: 422, code: 'date_not_bookable', message: 'x' },
    { kind: 'unavailable' },
  ])('maps a %s ApiResult to failed (US-006/AC-08)', async (apiResult) => {
    const request = vi.fn().mockResolvedValue(apiResult);
    const api = { request, requestNoContent: vi.fn() } as unknown as ApiClient;

    const outcome = await createFetchAvailability(api)('2026-09-16', new AbortController().signal);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

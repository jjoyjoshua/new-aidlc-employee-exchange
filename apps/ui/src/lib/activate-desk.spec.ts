import { describe, expect, it, vi } from 'vitest';
import { deskStateResponseSchema } from '@desk-booking/contracts';
import type { ApiClient, ApiResult } from './api-client.js';
import { createActivateDesk } from './activate-desk.js';

const DESK_ID = '4f2504e0-4f89-41d3-9a0c-0305e82c3302';
const RESPONSE_DESK = { id: DESK_ID, deskNumber: 'C-05', isActive: true };

function apiReturning(result: ApiResult<unknown>): ApiClient {
  return {
    request: vi.fn(async () => result) as unknown as ApiClient['request'],
    requestNoContent: vi.fn() as unknown as ApiClient['requestNoContent'],
  };
}

describe('createActivateDesk — success (US-019/AC-01, AC-09)', () => {
  it('maps a 200 to { kind: "ok" } carrying the desk', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_DESK });
    const activate = createActivateDesk(api);

    const result = await activate(DESK_ID);

    expect(result).toEqual({ kind: 'ok', desk: RESPONSE_DESK });
  });

  it('calls POST /api/admin/desks/:id/activate', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_DESK });
    const activate = createActivateDesk(api);

    await activate(DESK_ID);

    expect(api.request).toHaveBeenCalledWith(`/api/admin/desks/${DESK_ID}/activate`, deskStateResponseSchema, {
      method: 'POST',
    });
  });
});

describe('createActivateDesk — failed, everything else groups into one outcome (US-019/AC-09)', () => {
  it('a 500 maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });
    expect(await createActivateDesk(api)(DESK_ID)).toEqual({ kind: 'failed' });
  });

  it('unavailable maps to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });
    expect(await createActivateDesk(api)(DESK_ID)).toEqual({ kind: 'failed' });
  });

  it('a 404 desk_not_found maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: 'desk_not_found', message: 'x' });
    expect(await createActivateDesk(api)(DESK_ID)).toEqual({ kind: 'failed' });
  });
});

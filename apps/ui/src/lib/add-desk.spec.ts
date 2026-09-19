import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import { createAddDesk } from './add-desk.js';

function apiReturning(result: Awaited<ReturnType<ApiClient['request']>>): ApiClient {
  return {
    request: (async () => result) as ApiClient['request'],
    requestNoContent: (async () => {
      throw new Error('not used by addDesk');
    }) as ApiClient['requestNoContent'],
  };
}

const CREATED_DESK = { id: 'new-id', deskNumber: 'A-07', isActive: true, bookedAhead: 0 };

describe('createAddDesk (US-017/AC-01, AC-04, AC-07)', () => {
  it('calls POST /api/admin/desks with the given desk number, and maps 201 to ok', async () => {
    let calledPath: string | undefined;
    let calledInit: unknown;
    const api: ApiClient = {
      request: (async (path: string, _schema: unknown, init: unknown) => {
        calledPath = path;
        calledInit = init;
        return { kind: 'ok', data: CREATED_DESK };
      }) as ApiClient['request'],
      requestNoContent: (async () => {
        throw new Error('not used');
      }) as ApiClient['requestNoContent'],
    };

    const outcome = await createAddDesk(api)('A-07');

    expect(calledPath).toBe('/api/admin/desks');
    expect(calledInit).toMatchObject({ method: 'POST', body: { deskNumber: 'A-07' } });
    expect(outcome).toEqual({ kind: 'ok', desk: CREATED_DESK });
  });

  it('maps 409 desk_number_taken to duplicate — the one refusal with its own copy (US-017/AC-04)', async () => {
    const api = apiReturning({ kind: 'error', status: 409, code: ERROR_CODES.desk_number_taken, message: 'x' });

    const outcome = await createAddDesk(api)('A-01');

    expect(outcome).toEqual({ kind: 'duplicate' });
  });

  it('maps every other error code to failed (US-017/AC-07)', async () => {
    const api = apiReturning({ kind: 'error', status: 400, code: ERROR_CODES.invalid_request, message: 'x' });

    const outcome = await createAddDesk(api)('A-01');

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps a transport failure (unavailable) to failed (US-017/AC-07)', async () => {
    const api = apiReturning({ kind: 'unavailable' });

    const outcome = await createAddDesk(api)('A-01');

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

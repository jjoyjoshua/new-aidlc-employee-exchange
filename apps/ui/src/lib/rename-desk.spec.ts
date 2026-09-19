import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import { createRenameDesk } from './rename-desk.js';

function apiReturning(result: Awaited<ReturnType<ApiClient['request']>>): ApiClient {
  return {
    request: (async () => result) as ApiClient['request'],
    requestNoContent: (async () => {
      throw new Error('not used by renameDesk');
    }) as ApiClient['requestNoContent'],
  };
}

const RENAMED_DESK = { id: 'a', deskNumber: 'B-05', isActive: true };

describe('createRenameDesk (US-018/AC-01, AC-02, AC-08)', () => {
  it('calls PATCH /api/admin/desks/:id with the given desk number, and maps 200 to ok', async () => {
    let calledPath: string | undefined;
    let calledInit: unknown;
    const api: ApiClient = {
      request: (async (path: string, _schema: unknown, init: unknown) => {
        calledPath = path;
        calledInit = init;
        return { kind: 'ok', data: RENAMED_DESK };
      }) as ApiClient['request'],
      requestNoContent: (async () => {
        throw new Error('not used');
      }) as ApiClient['requestNoContent'],
    };

    const outcome = await createRenameDesk(api)('a', 'B-05');

    expect(calledPath).toBe('/api/admin/desks/a');
    expect(calledInit).toMatchObject({ method: 'PATCH', body: { deskNumber: 'B-05' } });
    expect(outcome).toEqual({ kind: 'ok', desk: RENAMED_DESK });
  });

  it('maps 409 desk_number_taken to duplicate — the one refusal with its own copy (US-018/AC-02)', async () => {
    const api = apiReturning({ kind: 'error', status: 409, code: ERROR_CODES.desk_number_taken, message: 'x' });

    const outcome = await createRenameDesk(api)('a', 'A-01');

    expect(outcome).toEqual({ kind: 'duplicate' });
  });

  it('maps 404 desk_not_found to failed — no approved copy exists for "that desk is gone" (US-018 design note §3.5)', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: ERROR_CODES.desk_not_found, message: 'x' });

    const outcome = await createRenameDesk(api)('a', 'A-01');

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps every other error code to failed (US-018/AC-08)', async () => {
    const api = apiReturning({ kind: 'error', status: 400, code: ERROR_CODES.invalid_request, message: 'x' });

    const outcome = await createRenameDesk(api)('a', 'A-01');

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps a transport failure (unavailable) to failed (US-018/AC-08)', async () => {
    const api = apiReturning({ kind: 'unavailable' });

    const outcome = await createRenameDesk(api)('a', 'A-01');

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

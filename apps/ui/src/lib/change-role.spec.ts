import { describe, expect, it, vi } from 'vitest';
import { adminUserSchema } from '@desk-booking/contracts';
import type { ApiClient, ApiResult } from './api-client.js';
import { createChangeRole } from './change-role.js';

const ACCOUNT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const RESPONSE_ACCOUNT = { id: ACCOUNT_ID, fullName: 'Priya Raman', email: 'priya@company.com', role: 'admin', isActive: true };

function apiReturning(result: ApiResult<unknown>): ApiClient {
  return {
    request: vi.fn(async () => result) as unknown as ApiClient['request'],
    requestNoContent: vi.fn() as unknown as ApiClient['requestNoContent'],
  };
}

describe('createChangeRole — success (US-024/AC-01)', () => {
  it('maps a 200 to { kind: "ok" } carrying the account', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_ACCOUNT });
    const changeRole = createChangeRole(api);

    const result = await changeRole(ACCOUNT_ID, 'admin');

    expect(result).toEqual({ kind: 'ok', account: RESPONSE_ACCOUNT });
  });

  it('calls POST /api/admin/users/:id/role with { role } as the body', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_ACCOUNT });
    const changeRole = createChangeRole(api);

    await changeRole(ACCOUNT_ID, 'admin');

    expect(api.request).toHaveBeenCalledWith(`/api/admin/users/${ACCOUNT_ID}/role`, adminUserSchema, {
      method: 'POST',
      body: { role: 'admin' },
    });
  });
});

describe('createChangeRole — blocked (US-024/AC-04, D-03)', () => {
  it('maps a 422 last_active_admin to { kind: "blocked" } — no details payload to parse (D-03)', async () => {
    const api = apiReturning({ kind: 'error', status: 422, code: 'last_active_admin', message: 'x' });
    const changeRole = createChangeRole(api);

    const result = await changeRole(ACCOUNT_ID, 'employee');

    expect(result).toEqual({ kind: 'blocked' });
  });
});

describe('createChangeRole — failed (US-024/AC-10)', () => {
  it('a 500 maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });
    const changeRole = createChangeRole(api);
    expect(await changeRole(ACCOUNT_ID, 'employee')).toEqual({ kind: 'failed' });
  });

  it('unavailable (transport failure, timeout, unparseable body) maps to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });
    const changeRole = createChangeRole(api);
    expect(await changeRole(ACCOUNT_ID, 'employee')).toEqual({ kind: 'failed' });
  });

  it('a 404 user_not_found maps to failed — no approved copy exists for "that person is gone" (update-account.ts\'s own reasoning)', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: 'user_not_found', message: 'x' });
    const changeRole = createChangeRole(api);
    expect(await changeRole(ACCOUNT_ID, 'employee')).toEqual({ kind: 'failed' });
  });
});

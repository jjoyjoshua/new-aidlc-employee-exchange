import { describe, expect, it, vi } from 'vitest';
import { adminUserSchema } from '@desk-booking/contracts';
import type { ApiClient, ApiResult } from './api-client.js';
import { createActivateAccount } from './activate-account.js';

const ACCOUNT_ID = '4f2504e0-4f89-41d3-9a0c-0305e82c3302';
const RESPONSE_ACCOUNT = { id: ACCOUNT_ID, fullName: 'Marcus Webb', email: 'marcus@company.com', role: 'employee' as const, isActive: true };

function apiReturning(result: ApiResult<unknown>): ApiClient {
  return {
    request: vi.fn(async () => result) as unknown as ApiClient['request'],
    requestNoContent: vi.fn() as unknown as ApiClient['requestNoContent'],
  };
}

describe('createActivateAccount — success (US-026/AC-01, AC-06)', () => {
  it('maps a 200 to { kind: "ok" } carrying the account', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_ACCOUNT });
    const activate = createActivateAccount(api);

    const result = await activate(ACCOUNT_ID);

    expect(result).toEqual({ kind: 'ok', account: RESPONSE_ACCOUNT });
  });

  it('calls POST /api/admin/users/:id/activate', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_ACCOUNT });
    const activate = createActivateAccount(api);

    await activate(ACCOUNT_ID);

    expect(api.request).toHaveBeenCalledWith(`/api/admin/users/${ACCOUNT_ID}/activate`, adminUserSchema, {
      method: 'POST',
    });
  });
});

describe('createActivateAccount — failed, everything else groups into one outcome (US-026/AC-07)', () => {
  it('a 500 maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });
    expect(await createActivateAccount(api)(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });

  it('unavailable maps to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });
    expect(await createActivateAccount(api)(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });

  it('a 404 user_not_found maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: 'user_not_found', message: 'x' });
    expect(await createActivateAccount(api)(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });
});

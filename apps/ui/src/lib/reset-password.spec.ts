import { describe, expect, it, vi } from 'vitest';
import { resetPasswordResponseSchema } from '@desk-booking/contracts';
import type { ApiClient, ApiResult } from './api-client.js';
import { createResetPassword } from './reset-password.js';

const ACCOUNT_ID = '4f2504e0-4f89-41d3-9a0c-0305e82c3302';
const RESPONSE_ACCOUNT = { id: ACCOUNT_ID, fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee' as const, isActive: true };
const GENERATED_PASSWORD = 'q4Lm1I0oTz8v';

function apiReturning(result: ApiResult<unknown>): ApiClient {
  return {
    request: vi.fn(async () => result) as unknown as ApiClient['request'],
    requestNoContent: vi.fn() as unknown as ApiClient['requestNoContent'],
  };
}

describe('createResetPassword — success (US-027/AC-01, AC-03)', () => {
  it('maps a 200 to { kind: "ok" } carrying the account AND the password', async () => {
    const api = apiReturning({ kind: 'ok', data: { account: RESPONSE_ACCOUNT, password: GENERATED_PASSWORD } });
    const resetPassword = createResetPassword(api);

    const result = await resetPassword(ACCOUNT_ID);

    expect(result).toEqual({ kind: 'ok', account: RESPONSE_ACCOUNT, password: GENERATED_PASSWORD });
  });

  it('calls POST /api/admin/users/:id/reset-password with no body', async () => {
    const api = apiReturning({ kind: 'ok', data: { account: RESPONSE_ACCOUNT, password: GENERATED_PASSWORD } });
    const resetPassword = createResetPassword(api);

    await resetPassword(ACCOUNT_ID);

    expect(api.request).toHaveBeenCalledWith(`/api/admin/users/${ACCOUNT_ID}/reset-password`, resetPasswordResponseSchema, {
      method: 'POST',
    });
  });
});

describe('createResetPassword — failed, everything else groups into one outcome (US-027/AC-09)', () => {
  it('a 500 maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });
    expect(await createResetPassword(api)(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });

  it('a 503 service_unavailable maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 503, code: 'service_unavailable', message: 'x' });
    expect(await createResetPassword(api)(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });

  it('unavailable (transport failure, timeout, unparseable body) maps to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });
    expect(await createResetPassword(api)(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });

  it('a 404 user_not_found maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: 'user_not_found', message: 'x' });
    expect(await createResetPassword(api)(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });
});

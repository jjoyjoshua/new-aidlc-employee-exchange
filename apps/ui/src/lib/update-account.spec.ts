import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import { createUpdateAccount } from './update-account.js';

function apiReturning(result: Awaited<ReturnType<ApiClient['request']>>): ApiClient {
  return {
    request: (async () => result) as ApiClient['request'],
    requestNoContent: (async () => {
      throw new Error('not used by updateAccount');
    }) as ApiClient['requestNoContent'],
  };
}

const ACCOUNT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const INPUT = { fullName: 'Dana Okafor', email: 'dana.okafor@company.com' };

const UPDATED_ACCOUNT = {
  id: ACCOUNT_ID,
  fullName: 'Dana Okafor',
  email: 'dana.okafor@company.com',
  role: 'employee' as const,
  isActive: true,
};

describe('createUpdateAccount (US-023/AC-01, AC-02, AC-08)', () => {
  it('calls PATCH /api/admin/users/:id with the given input, and maps 200 to ok', async () => {
    let calledPath: string | undefined;
    let calledInit: unknown;
    const api: ApiClient = {
      request: (async (path: string, _schema: unknown, init: unknown) => {
        calledPath = path;
        calledInit = init;
        return { kind: 'ok', data: UPDATED_ACCOUNT };
      }) as ApiClient['request'],
      requestNoContent: (async () => {
        throw new Error('not used');
      }) as ApiClient['requestNoContent'],
    };

    const outcome = await createUpdateAccount(api)(ACCOUNT_ID, INPUT);

    expect(calledPath).toBe(`/api/admin/users/${ACCOUNT_ID}`);
    expect(calledInit).toMatchObject({ method: 'PATCH', body: INPUT });
    expect(outcome).toEqual({ kind: 'ok', account: UPDATED_ACCOUNT });
  });

  it("maps 409 email_taken to duplicate, parsing the server's structured details (US-023/AC-02, ADR-009)", async () => {
    const api = apiReturning({
      kind: 'error',
      status: 409,
      code: ERROR_CODES.email_taken,
      message: 'That email address is already in use.',
      details: { fullName: 'Existing Holder', isActive: true },
    });

    const outcome = await createUpdateAccount(api)(ACCOUNT_ID, INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Existing Holder', isActive: true });
  });

  it('folds a malformed or missing details payload on email_taken to failed, never crashing (ADR-009)', async () => {
    const api = apiReturning({
      kind: 'error',
      status: 409,
      code: ERROR_CODES.email_taken,
      message: 'That email address is already in use.',
    });

    const outcome = await createUpdateAccount(api)(ACCOUNT_ID, INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it("folds 404 user_not_found to failed — no approved copy exists for \"that person is gone\" (US-023, rename-desk.ts's own reasoning)", async () => {
    const api = apiReturning({
      kind: 'error',
      status: 404,
      code: ERROR_CODES.user_not_found,
      message: 'That account could not be found.',
    });

    const outcome = await createUpdateAccount(api)(ACCOUNT_ID, INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps every other error code to failed (US-023/AC-08)', async () => {
    const api = apiReturning({ kind: 'error', status: 400, code: ERROR_CODES.invalid_request, message: 'x' });

    const outcome = await createUpdateAccount(api)(ACCOUNT_ID, INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps a transport failure (unavailable) to failed (US-023/AC-08)', async () => {
    const api = apiReturning({ kind: 'unavailable' });

    const outcome = await createUpdateAccount(api)(ACCOUNT_ID, INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

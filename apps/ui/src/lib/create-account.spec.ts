import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import { createCreateAccount } from './create-account.js';

function apiReturning(result: Awaited<ReturnType<ApiClient['request']>>): ApiClient {
  return {
    request: (async () => result) as ApiClient['request'],
    requestNoContent: (async () => {
      throw new Error('not used by createAccount');
    }) as ApiClient['requestNoContent'],
  };
}

const INPUT = {
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee' as const,
  password: 'Correct-Horse7',
};

const CREATED_ACCOUNT = {
  id: 'new-id',
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee' as const,
  isActive: true,
};

describe('createCreateAccount (US-021/AC-01, AC-06, AC-11)', () => {
  it('calls POST /api/admin/users with the given input, and maps 201 to ok', async () => {
    let calledPath: string | undefined;
    let calledInit: unknown;
    const api: ApiClient = {
      request: (async (path: string, _schema: unknown, init: unknown) => {
        calledPath = path;
        calledInit = init;
        return { kind: 'ok', data: CREATED_ACCOUNT };
      }) as ApiClient['request'],
      requestNoContent: (async () => {
        throw new Error('not used');
      }) as ApiClient['requestNoContent'],
    };

    const outcome = await createCreateAccount(api)(INPUT);

    expect(calledPath).toBe('/api/admin/users');
    expect(calledInit).toMatchObject({ method: 'POST', body: INPUT });
    expect(outcome).toEqual({ kind: 'ok', account: CREATED_ACCOUNT });
  });

  it('maps 409 email_taken to duplicate, parsing the server\'s structured details (US-021/AC-06, ADR-009)', async () => {
    const api = apiReturning({
      kind: 'error',
      status: 409,
      code: ERROR_CODES.email_taken,
      message: 'That email address is already in use.',
      details: { fullName: 'Dana Silva', isActive: true },
    });

    const outcome = await createCreateAccount(api)(INPUT);

    expect(outcome).toEqual({ kind: 'duplicate', fullName: 'Dana Silva', isActive: true });
  });

  it('folds a malformed or missing details payload on email_taken to failed, never crashing (ADR-009)', async () => {
    const api = apiReturning({
      kind: 'error',
      status: 409,
      code: ERROR_CODES.email_taken,
      message: 'That email address is already in use.',
    });

    const outcome = await createCreateAccount(api)(INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps every other error code to failed (US-021/AC-11)', async () => {
    const api = apiReturning({ kind: 'error', status: 400, code: ERROR_CODES.invalid_request, message: 'x' });

    const outcome = await createCreateAccount(api)(INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });

  it('maps a transport failure (unavailable) to failed (US-021/AC-11)', async () => {
    const api = apiReturning({ kind: 'unavailable' });

    const outcome = await createCreateAccount(api)(INPUT);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

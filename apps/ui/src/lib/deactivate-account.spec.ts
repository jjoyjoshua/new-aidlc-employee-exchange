import { describe, expect, it, vi } from 'vitest';
import { adminUserSchema, deactivationPreviewSchema } from '@desk-booking/contracts';
import type { ApiClient, ApiResult } from './api-client.js';
import { createDeactivateAccount, createPreviewDeactivation } from './deactivate-account.js';

const ACCOUNT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const RESPONSE_ACCOUNT = { id: ACCOUNT_ID, fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: false };

function apiReturning(result: ApiResult<unknown>): ApiClient {
  return {
    request: vi.fn(async () => result) as unknown as ApiClient['request'],
    requestNoContent: vi.fn() as unknown as ApiClient['requestNoContent'],
  };
}

describe('createPreviewDeactivation (US-025/AC-05)', () => {
  it('maps a 200 to { kind: "ok" } carrying the bookings verbatim', async () => {
    const bookings = [
      { id: 'b-1', deskNumber: 'A-01', date: '2026-09-17' },
      { id: 'b-2', deskNumber: 'B-02', date: '2026-09-19' },
    ];
    const api = apiReturning({ kind: 'ok', data: { bookings } });
    const preview = createPreviewDeactivation(api);

    const result = await preview(ACCOUNT_ID, new AbortController().signal);

    expect(result).toEqual({ kind: 'ok', bookings });
  });

  it('maps an empty bookings list to { kind: "ok", bookings: [] } — US-025/AC-07\'s population', async () => {
    const api = apiReturning({ kind: 'ok', data: { bookings: [] } });
    const preview = createPreviewDeactivation(api);

    expect(await preview(ACCOUNT_ID, new AbortController().signal)).toEqual({ kind: 'ok', bookings: [] });
  });

  it('calls GET /api/admin/users/:id/deactivation-preview with the given signal', async () => {
    const api = apiReturning({ kind: 'ok', data: { bookings: [] } });
    const preview = createPreviewDeactivation(api);
    const signal = new AbortController().signal;

    await preview(ACCOUNT_ID, signal);

    expect(api.request).toHaveBeenCalledWith(
      `/api/admin/users/${ACCOUNT_ID}/deactivation-preview`,
      deactivationPreviewSchema,
      { signal },
    );
  });

  it('a 500 maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });
    const preview = createPreviewDeactivation(api);
    expect(await preview(ACCOUNT_ID, new AbortController().signal)).toEqual({ kind: 'failed' });
  });

  it('unavailable (transport failure, timeout, unparseable body) maps to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });
    const preview = createPreviewDeactivation(api);
    expect(await preview(ACCOUNT_ID, new AbortController().signal)).toEqual({ kind: 'failed' });
  });
});

describe('createDeactivateAccount — success (US-025/AC-01, AC-02, AC-13)', () => {
  it('maps a 200 to { kind: "ok" } carrying the account', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_ACCOUNT });
    const deactivateAccount = createDeactivateAccount(api);

    const result = await deactivateAccount(ACCOUNT_ID);

    expect(result).toEqual({ kind: 'ok', account: RESPONSE_ACCOUNT });
  });

  it('calls POST /api/admin/users/:id/deactivate with no body', async () => {
    const api = apiReturning({ kind: 'ok', data: RESPONSE_ACCOUNT });
    const deactivateAccount = createDeactivateAccount(api);

    await deactivateAccount(ACCOUNT_ID);

    expect(api.request).toHaveBeenCalledWith(`/api/admin/users/${ACCOUNT_ID}/deactivate`, adminUserSchema, {
      method: 'POST',
    });
  });
});

describe('createDeactivateAccount — blocked (US-025/AC-10, D-03)', () => {
  it('maps a 422 last_active_admin to { kind: "blocked" } — no details payload to parse (D-03)', async () => {
    const api = apiReturning({ kind: 'error', status: 422, code: 'last_active_admin', message: 'x' });
    const deactivateAccount = createDeactivateAccount(api);

    const result = await deactivateAccount(ACCOUNT_ID);

    expect(result).toEqual({ kind: 'blocked' });
  });
});

describe('createDeactivateAccount — failed (US-025/AC-11)', () => {
  it('a 500 maps to failed', async () => {
    const api = apiReturning({ kind: 'error', status: 500, code: 'internal_error', message: 'x' });
    const deactivateAccount = createDeactivateAccount(api);
    expect(await deactivateAccount(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });

  it('unavailable (transport failure, timeout, unparseable body) maps to failed', async () => {
    const api = apiReturning({ kind: 'unavailable' });
    const deactivateAccount = createDeactivateAccount(api);
    expect(await deactivateAccount(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });

  it('a 404 user_not_found maps to failed — no approved copy exists for "that person is gone"', async () => {
    const api = apiReturning({ kind: 'error', status: 404, code: 'user_not_found', message: 'x' });
    const deactivateAccount = createDeactivateAccount(api);
    expect(await deactivateAccount(ACCOUNT_ID)).toEqual({ kind: 'failed' });
  });
});

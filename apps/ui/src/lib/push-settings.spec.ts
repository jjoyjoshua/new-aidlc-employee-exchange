import { describe, expect, it } from 'vitest';
import type { ApiClient } from './api-client.js';
import { createFetchPushSettings, createOptIntoPush, createOptOutOfPush } from './push-settings.js';

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dh: 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k',
  auth: '6_vGXk9KyNjRxqt5n23www',
};

function apiWith(request: ApiClient['request']): ApiClient {
  return {
    request,
    requestNoContent: (async () => {
      throw new Error('not used by push-settings');
    }) as ApiClient['requestNoContent'],
  };
}

describe('createFetchPushSettings (US-031/FR-01)', () => {
  it('calls GET /api/notifications/push and returns the parsed data on ok', async () => {
    let calledPath: string | undefined;
    const api = apiWith((async (path: string) => {
      calledPath = path;
      return { kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'key' } };
    }) as ApiClient['request']);

    const outcome = await createFetchPushSettings(api)();

    expect(calledPath).toBe('/api/notifications/push');
    expect(outcome).toEqual({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'key' } });
  });

  it('collapses every non-ok ApiResult to failed (US-031/AC-08)', async () => {
    const api = apiWith((async () => ({ kind: 'unavailable' })) as ApiClient['request']);

    const outcome = await createFetchPushSettings(api)();

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

describe('createOptIntoPush (US-031/FR-03)', () => {
  it('posts the subscription to /opt-in and returns the confirmed flag', async () => {
    let calledPath: string | undefined;
    let calledInit: { method?: string; body?: unknown } | undefined;
    const api = apiWith((async (path: string, _schema: unknown, init: { method?: string; body?: unknown }) => {
      calledPath = path;
      calledInit = init;
      return { kind: 'ok', data: { pushOptIn: true } };
    }) as ApiClient['request']);

    const outcome = await createOptIntoPush(api)(SUBSCRIPTION);

    expect(calledPath).toBe('/api/notifications/push/opt-in');
    expect(calledInit).toEqual({ method: 'POST', body: SUBSCRIPTION });
    expect(outcome).toEqual({ kind: 'ok', data: { pushOptIn: true } });
  });

  it('collapses a failed write to failed, never throwing', async () => {
    const api = apiWith((async () => ({ kind: 'error', status: 500, code: 'internal_error', message: 'x' })) as ApiClient['request']);

    const outcome = await createOptIntoPush(api)(SUBSCRIPTION);

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

describe('createOptOutOfPush (US-031/FR-04)', () => {
  it('posts to /opt-out with no body', async () => {
    let calledPath: string | undefined;
    let calledInit: { method?: string; body?: unknown } | undefined;
    const api = apiWith((async (path: string, _schema: unknown, init: { method?: string; body?: unknown }) => {
      calledPath = path;
      calledInit = init;
      return { kind: 'ok', data: { pushOptIn: false } };
    }) as ApiClient['request']);

    const outcome = await createOptOutOfPush(api)();

    expect(calledPath).toBe('/api/notifications/push/opt-out');
    expect(calledInit).toEqual({ method: 'POST' });
    expect(outcome).toEqual({ kind: 'ok', data: { pushOptIn: false } });
  });

  it('collapses a failed write to failed, never throwing', async () => {
    const api = apiWith((async () => ({ kind: 'unavailable' })) as ApiClient['request']);

    const outcome = await createOptOutOfPush(api)();

    expect(outcome).toEqual({ kind: 'failed' });
  });
});

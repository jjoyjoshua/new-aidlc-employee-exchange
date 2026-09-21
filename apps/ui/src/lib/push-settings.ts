/**
 * The three `/api/notifications/push*` fetchers (US-031/FR-01, FR-03, FR-04). Mirrors
 * `fetch-my-bookings.ts`'s shape: every `ApiResult` branch but `ok` collapses to `failed` — a
 * transport failure, a timeout, a 5xx, a 4xx and an unparseable body are all one thing to the
 * caller, which is what makes ST-07/ST-08 (US-031's own failure states) simple to drive.
 */
import { pushOptInRequestSchema, pushReadResponseSchema, pushSettingsResponseSchema, type PushOptInRequest, type PushReadResponse, type PushSettingsResponse } from '@desk-booking/contracts';
import type { ApiClient } from './api-client.js';
import type { SubscribedPush } from './push-subscription.js';

export type PushReadOutcome = { kind: 'ok'; data: PushReadResponse } | { kind: 'failed' };
export type PushWriteOutcome = { kind: 'ok'; data: PushSettingsResponse } | { kind: 'failed' };

export type FetchPushSettings = () => Promise<PushReadOutcome>;
export type OptIntoPush = (subscription: SubscribedPush) => Promise<PushWriteOutcome>;
export type OptOutOfPush = () => Promise<PushWriteOutcome>;

export function createFetchPushSettings(api: ApiClient): FetchPushSettings {
  return async (): Promise<PushReadOutcome> => {
    const result = await api.request('/api/notifications/push', pushReadResponseSchema);
    return result.kind === 'ok' ? { kind: 'ok', data: result.data } : { kind: 'failed' };
  };
}

/**
 * The request body is validated client-side against the SAME schema the server uses
 * (`pushOptInRequestSchema`, `@desk-booking/contracts`) before it is sent — not because the
 * server's own validation is skipped, but so a malformed subscription never leaves the browser
 * only to come back as an opaque `failed` (ADR-002's payoff, the same shape `signInRequestSchema`
 * gives US-001).
 */
export function createOptIntoPush(api: ApiClient): OptIntoPush {
  return async (subscription: SubscribedPush): Promise<PushWriteOutcome> => {
    const body: PushOptInRequest = pushOptInRequestSchema.parse(subscription);
    const result = await api.request('/api/notifications/push/opt-in', pushSettingsResponseSchema, {
      method: 'POST',
      body,
    });
    return result.kind === 'ok' ? { kind: 'ok', data: result.data } : { kind: 'failed' };
  };
}

export function createOptOutOfPush(api: ApiClient): OptOutOfPush {
  return async (): Promise<PushWriteOutcome> => {
    const result = await api.request('/api/notifications/push/opt-out', pushSettingsResponseSchema, { method: 'POST' });
    return result.kind === 'ok' ? { kind: 'ok', data: result.data } : { kind: 'failed' };
  };
}

import { describe, expect, it, vi } from 'vitest';
import { setConfigForTesting, type Config } from '../../config/index.js';

const BASE_CONFIG: Config = {
  NODE_ENV: 'development',
  PORT: 3000,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  OFFICE_TIMEZONE: 'Asia/Kolkata',
  MAIL_PROVIDER: 'console',
  MAIL_API_KEY: 'mail-key',
  MAIL_FROM_ADDRESS: 'desks@example.com',
  VAPID_PUBLIC_KEY: 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k',
  VAPID_PRIVATE_KEY: '8C5_EzOg2Bo50ZwbHWqgjgGyRtjrDMBLz1qqQ9Qssvw',
  VAPID_SUBJECT: 'mailto:desks@example.com',
  REMINDER_RUN_SECRET: 'reminder-secret',
  CORS_ORIGINS: ['http://localhost:5173'],
  SESSION_LIFETIME_DAYS: 30,
  SESSION_LAST_SEEN_THROTTLE_MINUTES: 60,
};

const RECIPIENT = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p256dh-key', auth: 'auth-key' };

// A REAL import from the installed `web-push` package (US-032/D-07, design note open item 6) —
// this is what proves the named ESM import of a CJS module resolves at runtime, not just under
// `tsc`. Only `sendNotification` is mocked per test; `WebPushError` is the library's real class,
// so `error instanceof WebPushError` in `index.ts`'s mapper is exercised for real.
import { WebPushError, sendNotification } from 'web-push';
import { sendPush } from './index.js';

vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-push')>();
  return { ...actual, sendNotification: vi.fn() };
});

describe('sendPush (US-032/AC-08)', () => {
  it('resolves { ok: true } on a successful send, and passes vapidDetails per call rather than global setVapidDetails (US-032/D-07, design note C13)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    try {
      const result = await sendPush(RECIPIENT, JSON.stringify({ title: 'Desk booking cancelled', body: 'Your desk A-12 for Tue 9 Sep was cancelled by your office admin.' }));
      expect(result).toEqual({ ok: true });

      expect(sendNotification).toHaveBeenCalledTimes(1);
      const [subscriptionArg, , optionsArg] = vi.mocked(sendNotification).mock.calls[0]!;
      expect(subscriptionArg).toEqual({
        endpoint: RECIPIENT.endpoint,
        keys: { p256dh: RECIPIENT.p256dh, auth: RECIPIENT.auth },
      });
      expect(optionsArg?.vapidDetails).toEqual({
        subject: BASE_CONFIG.VAPID_SUBJECT,
        publicKey: BASE_CONFIG.VAPID_PUBLIC_KEY,
        privateKey: BASE_CONFIG.VAPID_PRIVATE_KEY,
      });
      // No contentEncoding is passed — the library's own runtime default is aes128gcm; setting
      // 'aesgcm' on the stale @types doc comment would break Chrome (design note C14).
      expect(optionsArg?.contentEncoding).toBeUndefined();
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('passes an explicit TTL (24h) and timeout (10s), never the library defaults (US-032/D-01, D-02, design note C15)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    try {
      await sendPush(RECIPIENT, JSON.stringify({ title: 't', body: 'b' }));
      const [, , optionsArg] = vi.mocked(sendNotification).mock.calls[0]!;
      expect(optionsArg?.TTL).toBe(86400);
      expect(optionsArg?.timeout).toBe(10000);
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('maps a 404 to subscription_gone (US-032/AC-08, design note §6.3)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockRejectedValueOnce(
      new WebPushError('Gone', 404, {}, 'raw response body from the push service', RECIPIENT.endpoint),
    );
    try {
      const result = await sendPush(RECIPIENT, JSON.stringify({ title: 't', body: 'b' }));
      expect(result).toEqual({ ok: false, error: 'subscription_gone' });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('maps a 410 to subscription_gone (US-032/AC-08, db-design.md §1.4 hard-delete rule)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockRejectedValueOnce(
      new WebPushError('Gone', 410, {}, '', RECIPIENT.endpoint),
    );
    try {
      const result = await sendPush(RECIPIENT, JSON.stringify({ title: 't', body: 'b' }));
      expect(result).toEqual({ ok: false, error: 'subscription_gone' });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('maps any other 4xx to push_rejected, never subscription_gone (US-032/AC-08)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockRejectedValueOnce(
      new WebPushError('Bad Request', 400, {}, 'raw body', RECIPIENT.endpoint),
    );
    try {
      const result = await sendPush(RECIPIENT, JSON.stringify({ title: 't', body: 'b' }));
      expect(result).toEqual({ ok: false, error: 'push_rejected' });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('maps a 5xx WebPushError to push_unreachable (US-032/AC-08)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockRejectedValueOnce(
      new WebPushError('Bad Gateway', 502, {}, 'raw body', RECIPIENT.endpoint),
    );
    try {
      const result = await sendPush(RECIPIENT, JSON.stringify({ title: 't', body: 'b' }));
      expect(result).toEqual({ ok: false, error: 'push_unreachable' });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('maps a plain network/timeout Error (not a WebPushError) to push_unreachable, and never throws out (US-032/AC-08, design note §6.2)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockRejectedValueOnce(new Error('socket hang up'));
    try {
      const result = await sendPush(RECIPIENT, JSON.stringify({ title: 't', body: 'b' }));
      expect(result).toEqual({ ok: false, error: 'push_unreachable' });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('never lets a raw WebPushError body, headers or endpoint reach the returned result (US-032, design note C6, security-standards.md)', async () => {
    setConfigForTesting(BASE_CONFIG);
    vi.mocked(sendNotification).mockRejectedValueOnce(
      new WebPushError('Bad Request', 400, { 'x-secret': 'leak-me' }, 'SENSITIVE-RESPONSE-BODY', RECIPIENT.endpoint),
    );
    try {
      const result = await sendPush(RECIPIENT, JSON.stringify({ title: 't', body: 'b' }));
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('SENSITIVE-RESPONSE-BODY');
      expect(serialized).not.toContain('leak-me');
      expect(serialized).not.toContain(RECIPIENT.endpoint);
    } finally {
      setConfigForTesting(undefined);
    }
  });
});

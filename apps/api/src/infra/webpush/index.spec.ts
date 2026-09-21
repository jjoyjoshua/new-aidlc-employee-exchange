import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// `index.ts` reads `sendNotification`/`WebPushError` off the DEFAULT export (issue #69 — Node's
// real ESM loader never reliably synthesizes named exports for this CJS-only package, so the
// default export, which is always synthesized, is the only reliable path). Vitest's own
// transform *does* synthesize named exports correctly (that's what makes `import {
// sendNotification }` above work at all here), so the mock has to override BOTH the top-level
// named binding this file asserts against AND `default.sendNotification`, which is what
// `index.ts` actually calls — otherwise index.ts silently calls the real, unmocked function.
vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-push')>();
  const mockedSendNotification = vi.fn();
  // `@types/web-push` declares only named exports — no `default` — because the real package has
  // none either; Node's CJS interop synthesizes one anyway at runtime, which is the exact gap
  // issue #69 is about. `actual` genuinely carries a `default` property at runtime (Vitest's own
  // synthesized one), the type just doesn't know it.
  const actualDefault = (actual as unknown as { default: typeof actual }).default;
  return {
    ...actual,
    sendNotification: mockedSendNotification,
    default: { ...actualDefault, sendNotification: mockedSendNotification },
  };
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

describe('module import resolves under the real Node ESM loader, not just Vitest (#69)', () => {
  it('boots this module via tsx (the same loader `npm run dev` uses) without throwing (#69)', () => {
    // Regression for issue #69: `vi.mock('web-push', ...)` above goes through Vitest's own
    // module transform, which correctly synthesizes `web-push`'s named exports even when it is
    // plain CommonJS with no `exports` map. Node's native ESM loader (what `tsx watch` — and
    // this repo's `npm run dev -w apps/api` — actually uses) relies on a static scan
    // (cjs-module-lexer) instead, which failed to find `sendNotification`/`WebPushError` and
    // crashed the whole process on boot. Only a real, unmocked boot catches that gap.
    const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const REPO_ROOT = join(API_ROOT, '..', '..');
    const tsxBin = join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

    const moduleUrl = pathToFileURL(join(API_ROOT, 'src', 'infra', 'webpush', 'index.ts')).href;
    const checkDir = mkdtempSync(join(tmpdir(), 'webpush-esm-boot-'));
    const checkFile = join(checkDir, 'check.mts');
    writeFileSync(
      checkFile,
      [
        `import { getVapidPublicKey, sendPush } from '${moduleUrl}';`,
        "if (typeof getVapidPublicKey !== 'function' || typeof sendPush !== 'function') {",
        "  console.error('missing expected exports');",
        '  process.exit(1);',
        '}',
      ].join('\n'),
    );

    try {
      const result = spawnSync(tsxBin, [checkFile], {
        cwd: API_ROOT,
        encoding: 'utf8',
        shell: true,
        timeout: 20_000,
      });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(checkDir, { recursive: true, force: true });
    }
  }, 25_000);
});

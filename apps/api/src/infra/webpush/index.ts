/**
 * Web Push infra (REQ-026, REQ-027, ADR-015).
 *
 * US-031 uses only `getVapidPublicKey()`. `sendPush` is US-032's — the only function in this
 * module that talks to a push service — and it never calls the library's `setVapidDetails`
 * (US-032 design note §6.2): VAPID is passed **per call** via `options.vapidDetails`, which
 * avoids a global-mutable-state / init-order bug and keeps every send self-describing. This is a
 * deliberate departure from ADR-015's follow-up wording, which predates a close reading of the
 * installed library — the decision ADR-015 records is *which library*, not *which call form*.
 *
 * **Importable only from `modules/notifications`** (`eslint.config.mjs`'s `WEBPUSH_BAN`,
 * mirroring the mailer boundary) — one send path, or there will eventually be two.
 *
 * A subscription's `endpoint`, `p256dh` and `auth` never reach a log line — `infra/logger`
 * redacts all three by field name (US-031). `sendPush`'s own contract extends that discipline:
 * its result type is closed (`PushFailureReason`), exactly as `infra/mailer`'s `SendMailResult`
 * is, so a raw `WebPushError.body`/`.headers`/`.endpoint` or a raw network error can never reach
 * a caller, a log line, or `notification_deliveries.error_detail` (US-032 design note §6.3).
 */
// `web-push` is CommonJS with no `exports` map (`node_modules/web-push/package.json`). Node's
// ESM loader falls back to a static scan (cjs-module-lexer) to synthesize named exports for the
// interop, and it does not find `sendNotification`/`WebPushError` there — a named import
// resolves to `undefined` and throws `SyntaxError` at boot (issue #69). The default export is
// always synthesized for a CJS module, so destructuring off it is the reliable path.
import webPush from 'web-push';
const { sendNotification, WebPushError } = webPush;
import { config } from '../../config/index.js';

/** The public half of the VAPID key pair — safe to send to the browser as-is; it signs nothing
 *  on its own (US-031 design note §3). */
export function getVapidPublicKey(): string {
  return config().VAPID_PUBLIC_KEY;
}

/** A push service's endpoint, keyed and auth-secreted per browser subscription — the shape
 *  `web-push`'s `sendNotification` expects, built from `push_subscriptions` columns. */
export interface PushRecipient {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * A closed set, not free text (US-032 design note §6.3, mirroring `infra/mailer`'s
 * `MailFailureReason`). `subscription_gone` is the ONLY reason the caller hard-deletes a
 * `push_subscriptions` row on — it means the push service returned 404 or 410, i.e. this
 * subscription no longer exists anywhere (`db-design.md` §1.4). Every other 4xx is
 * `push_rejected`; a 5xx, a DNS/TLS failure or a socket timeout is `push_unreachable`; anything
 * the mapper does not recognise is `push_unknown` — never left to guess at the call site.
 */
export type PushFailureReason = 'subscription_gone' | 'push_rejected' | 'push_unreachable' | 'push_unknown';

export type SendPushResult = { ok: true } | { ok: false; error: PushFailureReason };

/** 24h, not the library's four-week default (US-032/D-01) — a cancellation or confirmation
 *  alert arriving weeks after the booking's date is a defect shape, not a feature. */
const PUSH_TTL_SECONDS = 86400;

/** 10s socket timeout (US-032/D-02) — unbounded is what turns one unreachable push service into
 *  a slow booking or cancellation request (NFR-01). */
const PUSH_TIMEOUT_MS = 10000;

/** `WebPushError` means the push service answered with a non-2xx — including a 5xx, which is
 *  the push service's own failure, not ours, and is grouped with network/timeout errors as
 *  `push_unreachable` rather than `push_rejected` (US-032 design note §6.3). */
function mapFailure(error: unknown): PushFailureReason {
  if (error instanceof WebPushError) {
    if (error.statusCode === 404 || error.statusCode === 410) return 'subscription_gone';
    if (error.statusCode >= 500) return 'push_unreachable';
    return 'push_rejected';
  }
  return 'push_unreachable';
}

/**
 * Never throws (US-032/AC-08, mirroring `infra/mailer.sendMail`'s contract). Sends `payload` —
 * already a JSON string, composed by `modules/notifications` — to one subscription.
 *
 * **No `contentEncoding` is passed.** The installed library's runtime default is `aes128gcm`
 * (verified against `node_modules/web-push/src/web-push-lib.js`); `@types/web-push`'s doc
 * comment claiming `'aesgcm'` by default is stale, and acting on it would break Chrome (US-032
 * design note §6.2, C14).
 */
export async function sendPush(subscription: PushRecipient, payload: string): Promise<SendPushResult> {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = config();

  try {
    await sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      {
        vapidDetails: {
          subject: VAPID_SUBJECT,
          publicKey: VAPID_PUBLIC_KEY,
          privateKey: VAPID_PRIVATE_KEY,
        },
        TTL: PUSH_TTL_SECONDS,
        timeout: PUSH_TIMEOUT_MS,
      },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: mapFailure(error) };
  }
}

/**
 * US-031's slice of the wire contract — the Settings screen's push opt-in. US-032 has no
 * endpoint of its own and adds nothing here (`inception/specs/US-031-turn-push-alerts-on-or-off/design-note.md`).
 */
import { z } from 'zod';

/**
 * A short allowlist of hostname SHAPES that are never a real push service, checked against the
 * parsed URL's hostname. Not a provider allowlist (design note §4.4 rejects that — it breaks the
 * day a browser moves a host) — this only rules out loopback, link-local, private and `.local`/
 * `.internal` names, which a legitimate push endpoint never is.
 */
function isNonPublicHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) return true;

  // IPv4 literal, any of it — a push endpoint is always a DNS name.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return true;
  // IPv6 literal (bracket-stripped by URL.hostname already).
  if (lower.includes(':')) return true;

  return false;
}

/**
 * `endpoint` is a URL the client supplies and the server will later POST to, from inside
 * whatever network it runs in (US-032). That makes it an authenticated SSRF primitive, not an
 * ordinary string field (design note §4.4, **blocker**) — validated here so both the route edge
 * and any future caller share one definition.
 *
 * `https:` only, no credentials embedded in the URL, no private/loopback/`.local` host, capped
 * at 2048 characters. Rejecting at the edge matters: a bad row otherwise becomes a per-send
 * failure in `notification_deliveries` forever.
 */
export const pushEndpointSchema = z
  .string()
  .trim()
  .min(1, 'A push endpoint is required')
  .max(2048, 'That push endpoint is too long')
  .url('Not a usable push endpoint')
  .refine(
    (value) => {
      // zod v3 still runs a `.refine` against an input that already failed an earlier check
      // (e.g. `.url()` on an empty string) rather than short-circuiting — `new URL` throws on
      // that input, so this must not assume `value` already parsed as a URL.
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      return url.protocol === 'https:' && url.username === '' && url.password === '' && !isNonPublicHost(url.hostname);
    },
    { message: 'Not a usable push endpoint' },
  );

/**
 * `p256dh` (uncompressed P-256 point, 65 bytes → 87 base64url characters) and `auth` (16 bytes →
 * 22 characters) — both unpadded base64url, per `PushSubscription.toJSON()`'s spec (design note
 * §4.4). These lengths are derived, not observed; DEV verifies them against a real Chrome and
 * Firefox subscription before merge (open item 9).
 */
export const pushP256dhSchema = z.string().regex(/^[A-Za-z0-9_-]{87}$/, 'Not a usable push key');
export const pushAuthSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'Not a usable push key');

/**
 * `POST /api/notifications/push/opt-in`'s body. Built explicitly by the client from
 * `PushSubscription`'s three fields — never `subscription.toJSON()`, which also carries
 * `expirationTime` and would be rejected by `.strict()` (design note §4.4).
 */
export const pushOptInRequestSchema = z
  .object({
    endpoint: pushEndpointSchema,
    p256dh: pushP256dhSchema,
    auth: pushAuthSchema,
  })
  .strict();
export type PushOptInRequest = z.infer<typeof pushOptInRequestSchema>;

/**
 * The shape both write routes return, and the shape `GET` returns alongside `vapidPublicKey`.
 * Always the account's real state — never a bare `204` (design note §4.1): AC-07's entire
 * content is that the client must not assume the outcome it asked for.
 */
export const pushSettingsResponseSchema = z.object({
  pushOptIn: z.boolean(),
});
export type PushSettingsResponse = z.infer<typeof pushSettingsResponseSchema>;

/**
 * `GET /api/notifications/push`'s response. `vapidPublicKey` rides here rather than the UI's
 * build-time env so one key pair has one source (design note §3) — public by definition, safe
 * to send. Deliberately carries nothing about whether *this* browser holds a subscription; only
 * the browser itself can answer that (design note §3).
 */
export const pushReadResponseSchema = pushSettingsResponseSchema.extend({
  vapidPublicKey: z.string().min(1),
});
export type PushReadResponse = z.infer<typeof pushReadResponseSchema>;

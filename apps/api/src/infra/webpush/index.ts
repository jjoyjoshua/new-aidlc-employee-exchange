/**
 * Web Push infra (REQ-026, ADR-015).
 *
 * US-031 sends nothing through this module — it only serves the VAPID **public** key to the
 * browser (`GET /api/notifications/push`, US-031 design note §3). `web-push`'s
 * `setVapidDetails`/`sendNotification` are US-032's; wiring them now, before anything calls
 * them, would mean calling `setVapidDetails` against key material no test here can prove is a
 * real EC point — this module grows with the story that actually sends.
 *
 * **Importable only from `modules/notifications`** (`eslint.config.mjs`'s `WEBPUSH_BAN`,
 * mirroring the mailer boundary) — one send path, or there will eventually be two.
 */
import { config } from '../../config/index.js';

/** The public half of the VAPID key pair — safe to send to the browser as-is; it signs nothing
 *  on its own (US-031 design note §3). */
export function getVapidPublicKey(): string {
  return config().VAPID_PUBLIC_KEY;
}

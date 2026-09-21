# webpush

Web Push dispatch (REQ-026, ADR-015). Opt-in only (BR-001.15), and **never for reminders**
(BR-001.16).

`web-push` is the only implementation — ADR-015 rejected hand-rolling RFC 8291/8292 on Node's
webcrypto. The VAPID key pair comes from configuration (`config()`); the private key is
server-only and never reaches the browser. `getVapidPublicKey()` is US-031's whole surface here —
sending is US-032's, which adds `setVapidDetails`/`sendNotification` to this module.

**Importable only from `modules/notifications`** (`eslint.config.mjs`'s `WEBPUSH_BAN`, mirroring
the mailer boundary, US-031 design note §2.1) — every push goes through
`notifications.service.ts`, so there is exactly one send path.

A subscription's `endpoint`, `p256dh` and `auth` never reach a log line — `infra/logger`
redacts all three by field name, and that is a constraint rather than a habit
(`security-standards.md`, US-031 design note §4.5). The `endpoint` is a capability URL: anyone
holding it can push a notification to that browser, which is why it is redacted alongside the
subscription's keys rather than treated as an ordinary address.

**The endpoint-validation residual.** The route edge (`libs/contracts/src/notifications.ts`'s
`pushEndpointSchema`) rejects `http:`, credentialed URLs, and private/loopback/`.local` hosts —
but a hostname allowlist of real push services was deliberately not added (US-031 design note
§4.4): it breaks the day a browser moves a host or a new browser ships. The residual is a
*blind* SSRF — a small encrypted body sent to an attacker-chosen public host, with no response
ever surfaced to a user. Accepted, not unnoticed.

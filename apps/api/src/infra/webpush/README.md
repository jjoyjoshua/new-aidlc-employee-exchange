# webpush

Web Push dispatch (REQ-026, ADR-015). Opt-in only (BR-001.15), and **never for reminders**
(BR-001.16).

`web-push` is the only implementation — ADR-015 rejected hand-rolling RFC 8291/8292 on Node's
webcrypto. The VAPID key pair comes from configuration (`config()`); the private key is
server-only and never reaches the browser. `getVapidPublicKey()` is US-031's surface here.

**`sendPush(subscription, payload)` is US-032's — the only function in this module that talks to
a push service, and it never calls `setVapidDetails`.** VAPID details are passed **per call** via
`options.vapidDetails` instead (US-032 design note §6.2): this avoids the library's one export
that is not `.bind()`-ed, avoids a config-init-order bug, and makes every send self-describing.
The ADR-015 follow-up wording implying `setVapidDetails`/`sendNotification` predates a close
reading of the installed library — the decision ADR-015 records is *which library*, not *which
call form*, and this file is the corrected record of the latter.

`sendPush` never throws — it returns a closed `PushFailureReason` (`subscription_gone` |
`push_rejected` | `push_unreachable` | `push_unknown`), the same never-throwing shape
`infra/mailer.sendMail` uses. `subscription_gone` (a 404/410 from the push service) is the ONLY
reason `modules/notifications` hard-deletes a `push_subscriptions` row — every other outcome is a
logged failure that leaves the row alone (`db-design.md` §1.4). A raw `WebPushError.body`,
`.headers` or `.endpoint`, and any raw network error, never leaves this function — none of the
three may reach a log line or `notification_deliveries.error_detail`.

No `contentEncoding` is passed to `sendNotification`. The installed library's own runtime default
is `aes128gcm` — `@types/web-push`'s doc comment claiming `'aesgcm'` by default is stale, and
acting on it breaks Chrome. TTL is a fixed 24 hours and the socket timeout is 10 seconds, neither
the library's defaults (a four-week TTL, no timeout) — an alert arriving weeks late is a defect,
and an unbounded send would turn one slow push service into a slow booking or cancellation
request.

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

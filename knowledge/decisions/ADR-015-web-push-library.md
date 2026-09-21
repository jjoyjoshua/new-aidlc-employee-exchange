# ADR-015 — Web Push is sent through the `web-push` library, not hand-rolled on Node's webcrypto

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | accepted                                                                 |
| **Date**    | 2026-09-21                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona, approved in chat 2026-09-21)   |
| **Serves**  | US-031, US-032; REQ-026, REQ-027, NFR-006, BR-001.15, BR-001.16, RISK-007 |

## Context

`app-architecture.md` §5.4 has listed a *"Web Push VAPID key pair"* as required configuration
since Gate 1, and `apps/api/src/infra/webpush/` has held a README and no code since 2026-09-17.
US-031 is the story that makes it real: it registers browser subscriptions, and US-032 sends to
them.

Sending a Web Push message is not an HTTP POST. It is four specifications stacked:

- **RFC 8291** — the payload is encrypted to the subscription's own P-256 public key (`p256dh`)
  and auth secret (`auth`), via ECDH, HKDF and AES-128-GCM, in the `aes128gcm` content encoding
  of **RFC 8188**.
- **RFC 8292 (VAPID)** — each request carries an ES256 JWT signed with our private key,
  identifying us to the push service.
- **RFC 8030** — the delivery protocol, its TTL and urgency headers, and the `404`/`410` responses
  that mean a subscription is gone.

Node 20's `crypto.webcrypto` provides every primitive. What it does not provide is the
`aes128gcm` framing, the key-derivation info strings, or any way to prove the result is
byte-compatible with Chrome's, Firefox's, Safari's and Edge's live push services.

This project has added no third-party runtime dependency to `apps/api` since inception —
`@desk-booking/contracts`, `@supabase/supabase-js`, `express`, `ws` and `zod` are all
infrastructural from day one. `security-standards.md` requires Architect justification and human
approval for an addition, so the choice deserves a record rather than a line in a `package.json`.

## Decision

**Add `web-push` (3.6.7, MPL-2.0) to `apps/api` as a runtime dependency, and `@types/web-push`
(3.6.4, MIT) as a devDependency. Wrap it in `apps/api/src/infra/webpush/`, which is the only
module permitted to import it — enforced by `eslint.config.mjs`, exactly as `infra/mailer` is.**

- The VAPID key pair and subject come from `config()`, validated at startup so a malformed key
  refuses the boot rather than failing at the first send (`app-architecture.md` §5.4,
  US-034/AC-04's precedent).
- `infra/webpush` exposes a narrow, never-throwing result type in the shape
  `infra/mailer`'s `sendMail` already uses, so `notifications.service.ts` treats a push failure
  and a mail failure identically.
- **No client-side Web Push library.** The browser half is the platform Push API plus a service
  worker with no `fetch` handler; a PWA plugin would ship a caching strategy that contradicts
  `app-architecture.md:337`.
- **`web-push`'s CLI generates the key pair** (`npx web-push generate-vapid-keys`). It is an
  operational step, not application code.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **`web-push` behind `infra/webpush`** (chosen) | The reference implementation of all four RFCs, maintained by the `web-push-libs` organisation and used by essentially every Node sender; handles `aes128gcm`, VAPID, TTL/urgency and surfaces `404`/`410` as a typed `WebPushError`, which is exactly what `db-design.md:188`'s hard-delete rule needs | Five transitive dependencies (`jws`, `asn1.js`, `http_ece`, `minimist`, `https-proxy-agent`) in the audit surface; no bundled types; MPL-2.0, a licence family new to this repository | — |
| **Hand-roll RFC 8291/8292 on `crypto.webcrypto`** | No dependency, no licence question, no transitive audit surface; Node 20 has every primitive | ~200 lines of cryptography whose failure mode is silent non-delivery or a mis-derived key. No test we would write proves interoperability with four browsers' live push services; the only real proof is production. Every future browser change becomes ours to chase | The cost of being wrong is invisible, and NFR-006/RISK-007 already treat push as the channel most likely to fail quietly. This is the definition of a problem not worth owning |
| **An edge-runtime library (e.g. a `webcrypto`-only sender)** | Smaller dependency tree, often zero deps | Built for Workers/Deno, where Node APIs are absent — we are on Node and gain nothing; far smaller user base, so the interoperability argument above applies again, with less evidence behind it | Trades a well-tested dependency for a lightly-tested one to save transitive packages we can audit |
| **A hosted push provider (OneSignal, Pusher Beams)** | Delivery dashboards, retries, analytics | A second vendor, a second credential, subscriptions leaving our database, and a monthly cost, for two notification types at one office. `app-architecture.md` §6 already rejects a queue and an event bus at this size for the same reason | Disproportionate, and it would move REQ-026's opt-in state outside the system that owns it |
| **No payload — a "content-less" push the worker then fetches** | Avoids the encryption entirely; VAPID alone is enough | The worker must call our API with credentials it does not have while no page is open, and Chrome's `userVisibleOnly: true` requires a notification regardless. Trades a solved problem for an unsolved one | Strictly harder |

## Consequences

**Easier**

- US-032 composes its wording in `modules/notifications` and calls one narrow port; the
  cryptography is not in the diff, not in review, and not in anybody's head.
- `404`/`410` arrive as a typed error, so `db-design.md:188`'s hard-delete-on-gone rule is a
  `switch` rather than a status-code string comparison.
- The key pair is generated by a command the library ships, so the operational step has a
  documented, non-invented form.

**Harder**

- **A new licence family.** MPL-2.0 is file-level copyleft; consuming the library unmodified
  imposes nothing on this repository, but if anyone ever vendors or patches it, the modified
  files carry the licence. Do not vendor it.
- Five transitive dependencies are now in the `npm audit` surface, and CI must be clean of
  high/critical or the risk is human-accepted and logged (`security-standards.md`).
- The `infra/webpush` boundary is only as good as its lint rule. A second importer is a blocker
  finding, the same standing the `infra/mailer` ban has.

**Follow-up work created**

1. `eslint.config.mjs` gains a `WEBPUSH_BAN` mirroring `MAILER_BAN`, **by amending the blocks that
   already own `no-restricted-imports`** — never as a new broad block (the US-034 design note's
   F-1, whose reasoning is recorded in that file's own comments).
2. `apps/api/src/infra/webpush/README.md` records the port's shape, the redaction rule for
   `endpoint`/`p256dh`/`auth`, and the blind-SSRF residual the endpoint validation leaves
   (US-031 design note §4.4, §4.5).
3. `config/index.ts` validates the VAPID key and subject **structurally**, not merely as
   non-empty, so a bad pair refuses the boot (US-031 design note §7).
4. The production VAPID pair is generated and stored as a deployment secret before go-live;
   `VAPID_PRIVATE_KEY` is already in `config/index.ts`'s `SECRET_KEYS`.

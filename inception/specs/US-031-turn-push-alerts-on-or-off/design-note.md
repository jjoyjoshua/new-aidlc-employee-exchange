# US-031 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-031 — Turn browser push alerts on or off](../../stories/user-stories/US-031-turn-push-alerts-on-or-off.md) |
| **Screen**   | SCR-004 **ST-01 – ST-08** (all eight). **Not frame-verified** — see open item 8 |
| **Tier**     | Complex — **persistence** (a new migration), **contract** (`libs/contracts`, three new routes, a new module mounted), **trust** (a new authenticated write surface taking a client-supplied URL the server will later POST to), **config** (`config/**` tightened), **browser** (the service worker, Complex by name), **dependency** (`web-push`). Any one carries it |
| **Author**   | Architect persona (AI draft), 2026-09-21 |
| **Rests on** | ADR-001, ADR-002, ADR-004, and the US-034 design note — **plus one new ADR: [ADR-015](../../../knowledge/decisions/ADR-015-web-push-library.md)** (§9) |
| **Designs for** | US-031 **and** US-032, which reuses everything here. §8 is US-032's seam, written now and built later |

**Advisory.** The human's GitHub review at D2 is the authority. `spec.md`, `impact-analysis.md`,
`implementation-plan.md`, `decisions.md`, `traceability.md` and `change-log.md` stay DEV's.

**The verdict, in one line each:**

- **`web-push` 3.6.7 server-side; no client library at all.** The client surface is four browser
  calls and a 30-line service worker. A PWA plugin would contradict `app-architecture.md:337` in
  its first line of config. §2, ADR-015.
- **Two of the four things this story needs already exist.** `push_opt_in` is in
  `0001_user_profiles.sql:36`; the three VAPID keys are in `config/index.ts:58-60` and
  `.env.example`. One new table, no new env key names. §5, §7.
- **The read endpoint returns the flag and the VAPID public key, and nothing about
  subscriptions.** SCR-004 ST-01 already decided the first half — *Your details renders in full,
  it comes from the session* — which is only true if the flag does **not**. And "does this
  browser have a subscription" is a question only this browser can answer correctly; the
  server's copy is a stale echo. §3.
- **The flag moves toward "push on" last, and toward "push off" first.** Opt-in writes the
  subscription then the flag; opt-out writes the flag then deletes the subscriptions. One rule,
  and it is what makes every partial failure fail *closed*. The reverse order on opt-in is the
  PRIN-5 failure this whole screen exists to prevent: a flag reading **on** with nothing behind
  it. §4.2. **This is not an ADR** — it is one sentence inside an executable contract.
- **The toggle is only ever set from a server response, never from the user's intent.** That one
  rule is the whole of AC-07. §6.
- **ST-05 outranks the flag.** When permission is `denied`, the toggle renders off **and
  disabled** even if `pushOptIn` is true — SCR-004 ST-05 says so, AC-05 says "does not falsely
  show as on", and a naive binding to `pushOptIn` shows **on**-and-disabled instead. And we do
  **not** write the flag false to make the screen consistent: that is an unrequested write, and
  it would break AC-04 on the person's other device. §6.4.
- **The subscription `endpoint` is an authenticated SSRF primitive** — a client-supplied URL the
  server will POST to from inside the network at US-032. Validate the scheme, reject credentials
  in the URL, reject private and literal-IP hosts, cap the length. **blocker**, §4.4.
- **`notifications` writing `user_profiles.push_opt_in` is an exception to ADR-004, and it is
  already granted in writing.** `app-architecture.md:89` names *opt-in* in the `notifications`
  row's Owns column. The alternative — a port from `users` — is banned by
  `eslint.config.mjs`'s own `MAY_IMPORT.notifications = []`. **No ADR**; two README lines, the
  way US-025 handled the mirror case. §4.6.
- **SCR-004 ST-07's copy does not cover a failed opt-out.** AC-07 covers both directions and
  demands "the current reality rather than the intent"; ST-07's approved sentence is *"Your
  alerts are still off."* Open item 3, and no code should invent the opposite sentence.
- **One new ADR, and it is the dependency, not the endpoint shape.** §9.

---

## 0. The tiering — confirmed, on six surfaces

| Surface | What it is here |
| --- | --- |
| **Persistence** | `supabase/migrations/**` is protected and every migration is Complex by convention. `0007_push_subscriptions.sql`, the fifth and last table in `db-design.md` |
| **Contract** | `libs/contracts/**` is protected — a new `notifications.ts`. Three new routes. A **new module mounted** in `http/app.ts`, which `task-surfaces.md` names Complex outright |
| **Trust** | A new authenticated write surface, and the first one that accepts a **URL the server will later make a request to** (§4.4). Also the first route that serves a configuration value to the browser |
| **Config** | `apps/api/src/config/**` is protected. The VAPID keys are validated as non-empty strings today; §7 makes them structurally valid at boot, the US-034/F-3 shape reapplied |
| **Browser** | *"anything touching ... the service worker"* — Complex by name in `task-surfaces.md` |
| **Dependency** | `web-push`. `task-surfaces.md`'s **Escalate, don't decide** list: *"adding a dependency"* |

**Two surfaces DEV's tiering note expected that are already closed.** `push_opt_in` exists
(`0001_user_profiles.sql:36`) — the column is not new, only the table is. And all three VAPID
keys are already required config (`config/index.ts:58-60`, `.env.example`), so the
*"any change to `.env` key names"* escalation does **not** fire. §7 only tightens the value
validation of keys that are already there.

**Not a new guard.** `requireSession` mounts on the mount point, the way `/api/bookings` does
(`http/app.ts:87`). AC-10's production diff is empty and its test is not.

---

## 1. What this story actually is

| AC | Where it is answered |
| --- | --- |
| **AC-01** off until asked for | `user_profiles.push_opt_in` default `false` (`0001:36`) + `GET` returning it verbatim. Nothing in this story writes a default |
| **AC-02** ask, then register | §6.2's ordered flow, ending in `POST /opt-in` (§4.2) |
| **AC-03** off stops push, email untouched | `POST /opt-out` (§4.3). Email is structurally unreachable from this path — `recordAndSend`'s mail branch has no opt-in parameter (`notifications.service.ts:104-145`), which is US-028/AC-04 already proven |
| **AC-04** survives the session | The flag is a column, not a browser fact. Proven by a `GET` after a second sign-in |
| **AC-05** denied says what to do | §6.4 — permission outranks the flag, toggle off + disabled |
| **AC-06** unsupported says so differently | §6.1 — a capability probe, **and no fetch is made at all** |
| **AC-07** a failed save does not lie | §6 — the toggle is set only from a server response; both write routes return the resulting flag |
| **AC-08** a failed read has its own state | §3 — a **separate** `GET` is what makes ST-08 reachable. On the session response it would be unreachable |
| **AC-09** loading is a state | §3 — same reason. A flag on the session resolves before the shell renders, so ST-01 could never be observed |
| **AC-10** the setting is the employee's own | Structural: **no account id in any path or body**. The account is the bearer token's, `POST /api/auth/set-password`'s own shape |
| **AC-11** three widths | SCR-004 layout, no server involvement |

---

## 2. The libraries

### 2.1 Server: `web-push`, and it earns an ADR

`web-push@3.6.7`, MPL-2.0, `engines.node >= 16`, five runtime dependencies
(`jws`, `asn1.js`, `http_ece`, `minimist`, `https-proxy-agent`). No bundled types, so
`@types/web-push@3.6.4` (MIT, DefinitelyTyped) as a **devDependency**. Verified against the npm
registry on 2026-09-21; the version is what is current, not what I remember.

The alternative genuinely weighed is implementing RFC 8291 / RFC 8292 on Node 20's
`crypto.webcrypto` — ECDH P-256, HKDF, AES-128-GCM and the `aes128gcm` content encoding, plus an
ES256 VAPID JWT. Node has every primitive. It is roughly 200 lines of cryptography whose failure
mode is either silent non-delivery or a leaked key, and no test we would write proves
interoperability with Chrome's and Firefox's actual push services. Rejected.

**Three things the human needs and I will not decide** (`security-standards.md`: *"Dependencies:
additions need Architect + human approval"*):

- **MPL-2.0 is a licence family this project has not used.** It is file-level copyleft: consuming
  the library as an unmodified dependency imposes nothing on our source. It is still not my call.
- **`minimist` is pulled for the package's CLI**, not by anything we call. It is in the audit
  surface regardless.
- It is the **first third-party runtime dependency added since inception** — `apps/api` currently
  declares only `contracts`, `supabase-js`, `express`, `ws`, `zod`.

Placement: `apps/api/package.json` dependencies; the code in
**`apps/api/src/infra/webpush/index.ts`**, beside the README that has been waiting for it since
2026-09-17. The human generates the pair with `npx web-push generate-vapid-keys`.

**Add a `WEBPUSH_BAN` to `eslint.config.mjs`, mirroring `MAILER_BAN` exactly.** Only
`modules/notifications` may import `infra/webpush`, for the reason US-034/AC-08 gives about mail:
one send path, or there will eventually be two. The hoisted-constant shape the US-034 note's F-1
forced is already there (`eslint.config.mjs:50-56, 72`) — this is one more entry and one more
`if (self !== 'notifications') patterns.push(...)`, and it must **not** be a new broad block. That
mistake is already documented in that file's own comments.

### 2.2 Client: no library, deliberately

The entire client surface is:

`navigator.serviceWorker.register` · `navigator.serviceWorker.ready` ·
`registration.pushManager.getSubscription()` / `.subscribe()` · `Notification.permission` /
`.requestPermission()` — and, in the worker, `self.addEventListener('push' | 'notificationclick')`.

`vite-plugin-pwa` / Workbox is the obvious candidate and it is wrong here in its first line of
config: it ships a precache manifest and a caching strategy, which is exactly what
`app-architecture.md:337` forbids — *"The service worker exists only for Web Push (REQ-026). The
app is not offline-capable and nothing should imply it is."* It would also add a web app manifest
and an install prompt nobody asked for. A library here is more to understand, not less.

**No dependency approval is needed for the browser half, and I would object if one were sought.**

---

## 3. The read: `GET /api/notifications/push`

```
GET /api/notifications/push          (requireSession; no id anywhere — AC-10)
200 { "pushOptIn": false, "vapidPublicKey": "BN…" }
     Cache-Control: private, no-store
```

**Why a separate endpoint and not a field on `authenticatedUserSchema`.** US-001/D-08 put
`mustChangePassword` on the session response precisely so a later story would not have to widen
it, and that precedent argues for doing the same here. It is wrong for this story, for two
reasons that are both acceptance criteria:

- **AC-08 would be unreachable.** If the flag rides on the session, "the flag could not be read"
  *is* "the session could not be read", which `RequireSession` answers by routing to sign-in.
  ST-08 would have no way to occur, and its test could only pass by faking a condition the
  production code cannot produce.
- **AC-09 would be unreachable too.** The session resolves before the shell renders, so the
  toggle row would never be a skeleton and ST-01 would never be observed.

SCR-004 ST-01 has in fact already decided this, in its own sentence: *"**Your details renders in
full** — it comes from the session, so there is nothing to wait for."* That is only true if the
flag does not come from the session.

**Why the VAPID public key rides on the same response.** The browser needs it as
`applicationServerKey`. The alternative is a `VITE_VAPID_PUBLIC_KEY` in the UI's build-time env
(`apps/ui/.env` already carries three `VITE_*` values). That puts the public half in one
configuration system and the private half in another, and the drift presents as *every push
silently rejected by the push service* — unobservable from this screen. Serving it from the
server makes drift impossible: one key pair, one source. It is public by definition, so nothing
is exposed. And the fetch that could fail is already ST-08's, which is the honest state for
"we cannot set this up right now".

**Why `subscriptionExists` is not on the wire, although the task asked for it.** Three reasons,
any one sufficient:

1. **No SCR-004 state is driven by it.** ST-02/ST-04 are the flag; ST-05/ST-06 are the browser;
   ST-07/ST-08 are failures. There is no eighth input.
2. **The field would be ambiguous and the useful reading is unanswerable.** "Any subscription on
   the account" tells this laptop nothing about itself. "This browser's subscription" needs the
   endpoint in the request — which turns a `GET` into a `POST`, or puts a capability URL into a
   query string and therefore into every access log.
3. **The browser already knows, authoritatively.** `registration.pushManager.getSubscription()`
   is local, synchronous-ish, and cannot be stale. The server's copy can be.

`db-design.md:181-185` is the same argument from the other end: *"Treating 'has a subscription
row' as the opt-in would conflate a revoked browser permission with a deliberate opt-out."*
Putting it on the wire beside the flag invites exactly that conflation in the component.

A read failure is a `5xx`, which `api-client.ts:78` already maps to `kind: 'unavailable'` — the
screen needs no new error code to reach ST-08.

---

## 4. The writes

### 4.1 Shape and placement

```
POST /api/notifications/push/opt-in    body { endpoint, p256dh, auth }   200 { pushOptIn: true }
POST /api/notifications/push/opt-out   no body                           200 { pushOptIn: false }
```

- **Mounted at `/api/notifications`, behind `requireSession` at the mount point** —
  `http/app.ts:87`'s shape, and `http/app.ts:11` already names `notifications` as a module that
  will mount a router. Mount-level, never per route: *"a per-route guard is forgettable and the
  first one forgotten is a data leak nobody notices."*
- **`notifications` having a router does not break "called, never consulted."** That rule
  (`app-architecture.md:96-99`, `modules/README.md`) is about *module-to-module imports*.
  §2 of the same document grants every module *"its routes, its request/response shapes, and the
  service that does the work."* A reviewer will raise this; the answer is one sentence in
  `modules/notifications/README.md`.
- **Verb sub-resources, not `PATCH`.** `api-standards.md` reserves `PATCH` for modifying an
  attribute. Opting in is not an attribute edit — it carries a subscription and performs two
  writes. Two verbs read correctly and keep the two bodies from being one optional-field schema
  that means different things depending on which field is present.
- **`200` with the flag, never `204`.** AC-07's entire content is that the client must not assume
  the outcome it asked for. A `204` would force the client to infer `pushOptIn` from its own
  intent, which is the bug. The response body **is** the account's real state (§6).
- **No account id in the path or the body, on either route.** `requireSession` supplies
  `req.user.id`. That is AC-10, structurally: there is no parameter a caller could use to change
  somebody else's setting. Same shape as `POST /api/auth/set-password`.
- **`.strict()` on the request, not on the response** — `auth.ts:78-84`'s house rule.
- **No new error code.** A malformed body is `400 invalid_request`; `401` is inherited. Nothing
  in this story has a refusal of its own.

### 4.2 Opt-in: subscription first, flag second

```
1. upsert push_subscriptions on conflict (endpoint)  -- user_id, p256dh, auth, user_agent
2. update user_profiles set push_opt_in = true where id = $caller
3. return { pushOptIn: <the value the UPDATE returned> }
```

**The order is the decision.** There is no transaction across these two statements — PostgREST
gives each its own — so one of them can land without the other. Both orders leave a mismatch;
only one of them is safe:

| Order | Failure leaves | Consequence |
| --- | --- | --- |
| **subscription → flag** (chosen) | a subscription row, flag off | Nothing is sent (US-032/AC-05 checks the flag first). The toggle shows **off**, which is true. Retry re-POSTs the same subscription and the upsert absorbs it. An orphan row is noise, and the next opt-out deletes it |
| flag → subscription | flag **on**, no subscription | The toggle shows **on**, AC-04 says it is right to, and nothing will ever arrive. *A user who believes she will be alerted and is not* — SCR-004's own words for what ST-07 exists to prevent |

**One rule, stated once, that covers both routes: the flag moves toward "push enabled" last, and
toward "push disabled" first.** Put that sentence in the service, because the next person to
reorder these statements will not re-derive it.

**A Postgres function for atomicity was considered and rejected.** `0005` set the precedent and it
is available. It buys one thing — no orphan subscription row — which is harmless, and it costs
a second `/rpc/` surface with the full `revoke execute … from public, anon, authenticated` /
`grant … to service_role` ceremony that the US-025 note rated a blocker to get right. Ordered,
fail-closed writes are the cheaper honest answer. Say so in the repository, so the absence reads
as a decision.

**Retry does not re-subscribe.** `Try again` after a failed `POST /opt-in` re-posts the **same**
subscription object the browser already holds. Unsubscribing and re-subscribing on retry would
churn the endpoint, orphan the previous row, and can itself fail.

### 4.3 Opt-out: flag first, subscriptions second

```
1. update user_profiles set push_opt_in = false where id = $caller
2. delete from push_subscriptions where user_id = $caller     -- ALL of them
3. return { pushOptIn: false }
```

- **No permission round-trip, and no browser involvement is required for success.** BR-001.15,
  and SCR-004 ST-04 in its own words.
- **All the account's rows, not just this browser's.** AC-03 is *"no further push notifications
  are sent"* — unqualified. Deleting only this browser's row would leave the phone's row as dead
  data that a later opt-in from the laptop silently resurrects. This is the one hard-deleted
  table in the schema precisely because *"keeping it is noise"* (`db-design.md:187`).
  **Consequence to state in the README:** opting out on the laptop also drops the phone, so
  re-opting-in on the laptop does not restore the phone. That is consistent with a single
  account-level flag and it will otherwise read as a bug.
- **A best-effort `subscription.unsubscribe()` in the browser, *after* the server said yes, and
  its failure is ignored.** This looks like the alternative SCR-004 explicitly rejected —
  *"revoking the browser subscription as part of opting out … it can fail in ways that leave the
  switch stuck"* — and it is not, because it is not part of the opt-out: the toggle has already
  moved to ST-02 before it runs, and nothing observes its result. Write that distinction in a
  comment or it will be removed in review.

### 4.4 Validating the subscription — the trust surface. **blocker**

`endpoint` is a URL supplied by the client that **the server will later make an outbound POST to**
(US-032, inside whatever network the server runs in). That is an authenticated SSRF primitive, and
it is the reason this story's trust surface is real rather than nominal.

```ts
// libs/contracts/src/notifications.ts
const pushEndpointSchema = z.string().trim().min(1).max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:'          // a push service is always TLS
    && url.username === '' && url.password === ''   // no credentials smuggled into the URL
    && !isNonPublicHost(url.hostname);      // localhost, *.local, *.internal, IPv4/IPv6 literals
}, { message: 'not a usable push endpoint' });
```

`isNonPublicHost` is a named pure function beside the schema — wire-facing validation with no
service-side caller, which `api-standards.md` places in `libs/contracts` (the `deskNumberSchema`
precedent, stated there by name).

**A hostname allowlist (FCM, Mozilla, WNS, Apple) was considered and rejected.** It is a stronger
control and it breaks the day a browser moves a host or a new browser ships — presenting as ST-07
with no explanation, for a user who did nothing wrong. Scheme + non-public-host is the proportionate
control; the residual is a *blind* SSRF (a small encrypted body, a response no user ever sees),
and it should be named in `infra/webpush/README.md` rather than left implicit.

**The keys.** `p256dh` is an uncompressed P-256 point: 65 bytes → 87 base64url characters,
unpadded. `auth` is 16 bytes → 22 characters. Both `^[A-Za-z0-9_-]+$`.

> **These two lengths are derived, not observed** (65 = 21·3+2 → 21·4+3 = 87; 16 = 5·3+1 →
> 5·4+2 = 22). `PushSubscription.toJSON()` is specified to emit unpadded base64url, but **DEV
> must verify both against a real Chrome and a real Firefox subscription and paste the evidence
> in the PR.** If a browser pads, relax to allow a trailing `=`. A wrong length here is an
> opt-in that is impossible on a real browser and passes every unit test. Open item 9.

Rejecting at the edge rather than letting `web-push` throw at send time matters: a bad row
otherwise becomes a per-send failure in `notification_deliveries` forever.

**`expirationTime` is a footgun.** `PushSubscription.toJSON()` returns
`{ endpoint, expirationTime, keys: { p256dh, auth } }`. With `.strict()` that body is a `400`.
The client must build the payload explicitly — `{ endpoint, p256dh, auth }` — rather than posting
`subscription.toJSON()`. There is no column for `expirationTime` and `db-design.md` does not ask
for one. One comment at the call site saves an afternoon.

**`user_agent` comes from the request header, truncated to 300 characters — never from the body.**
It is *"operator diagnosis only"* (`db-design.md:177`), so a client-controlled unbounded string has
no business in it.

### 4.5 What must never reach a log line

`app-architecture.md:325` already bans a subscription's keys from logs, and
`security-standards.md` repeats it as a constraint on the logger. **Extend it to the endpoint:**
it is a capability URL — anyone holding it can push to that browser. Log a truncated or hashed
form, never the whole thing. Add `p256dh`, `auth` and `endpoint` to `infra/logger`'s `REDACT`
list, and say in `infra/webpush/README.md` that this is a constraint, not a habit.

Storing the full endpoint in `notification_deliveries.recipient` (US-032) is different and is
fine: that table is RLS deny-all and server-only, and `db-design.md:203` specifies *"the
address/endpoint used"*.

### 4.6 `notifications` writing `user_profiles` — an exception that is already granted

ADR-004's decision sentence is *"Only the table's owning module may `INSERT`, `UPDATE` or
`DELETE` it"*, and `users/README.md` declares `user_profiles` **owned** by `users`. This story has
`notifications` updating `push_opt_in` on that table.

The alternative is a port: `users` exposes `setPushOptIn`, `notifications` calls it. **That is
banned by the project's own lint config** — `eslint.config.mjs:16-22` sets
`MAY_IMPORT.notifications = []`, so `modules/notifications` may not import `modules/users` at all.
Moving the route into `users` instead would contradict `app-architecture.md:89`, which names
*opt-in* in the `notifications` row's Owns column, and would still leave US-032's send-time flag
read inside `notifications`.

**So the exception is forced, and it was granted in writing at Gate 1** — the same shape as
US-025's cascade writing `bookings` from a `users`-owned path, which `app-architecture.md` §2
had granted before any code existed. **No ADR amendment.** What it needs is two README lines, so
that a reviewer hunting a stray write finds the note instead of a violation:

- `modules/notifications/README.md`: owns `push_subscriptions`; **writes exactly one column of
  `user_profiles` — `push_opt_in` — under `app-architecture.md:89`**; reads nothing else.
- `modules/users/README.md`: `push_opt_in` is the one column of `user_profiles` this module does
  **not** write. `users.repository.ts:80` already reserves it by name in a docblock; make that
  reservation explicit in both directions.

The **read** of `push_opt_in` from `notifications` at send time (US-032) needs no exception at
all — ADR-004 permits cross-module `SELECT` with an explicit column list.

---

## 5. The migration — `0007_push_subscriptions.sql`

Conventions taken from `0006_notification_deliveries.sql` and `0001_user_profiles.sql`: a header
naming the story and the reason, a `Spec:` line pointing at `db-design.md`, a comment on every
non-obvious line, and RLS `enable` + `force` with no policies.

```sql
-- 0007 — push_subscriptions
--
-- US-031 (turn browser push alerts on or off). One row per browser the employee opted in from;
-- a person with a laptop and a phone has two. The fifth and last table in db-design.md.
--
-- `user_profiles.push_opt_in` is NOT created here — it has existed since
-- `0001_user_profiles.sql:36`, defaulting false (REQ-026, BR-001.15, US-031/AC-01). This
-- migration adds only the table that flag gates.
--
-- Spec: inception/architecture/db-design.md §1.4, §2, §3, §4.

create table push_subscriptions (
  id              uuid        primary key default gen_random_uuid(),
  -- The ONE `on delete cascade` in this schema (db-design.md:295). Everything else is
  -- `restrict`, because nothing else may be orphaned. A subscription without an account is
  -- unreachable noise, and this is the only table the application ever hard-deletes anyway
  -- (db-design.md:187, §4).
  user_id         uuid        not null references user_profiles (id) on delete cascade,
  -- The Web Push URL. Validated at the route edge before it ever reaches here: https only, no
  -- credentials in the URL, no private or literal-IP host (design note §4.4) — the server POSTs
  -- to this value at US-032, so an unvalidated one is an SSRF primitive.
  endpoint        text        not null,
  p256dh          text        not null,
  auth            text        not null,
  -- Operator diagnosis only (db-design.md:177). Taken from the request's User-Agent header and
  -- truncated, never from the request body.
  user_agent      text,
  created_at      timestamptz not null default now(),
  -- US-032 stamps this after a successful send. Nothing reads it in US-031.
  last_success_at timestamptz
);

-- db-design.md:263 — one row per browser; re-subscribing updates rather than duplicates.
--
-- Deliberately unique on `endpoint` ALONE, not on `(user_id, endpoint)`, and that is the safer
-- of the two: an endpoint identifies one browser, and on a shared workstation `(user_id,
-- endpoint)` would let two accounts hold the same browser and deliver one person's desk
-- bookings to the other's screen. Global uniqueness means the row is REASSIGNED to whoever
-- opted in most recently (the route upserts on this index). The residual — the earlier
-- account's flag stays true with no subscription, so they silently stop receiving push — is
-- named in the US-031 design note, open item 6.
create unique index push_subscriptions_endpoint_key on push_subscriptions (endpoint);

-- No index on `user_id`, and that is a decision rather than an oversight. US-032 reads
-- `where user_id = $1`; db-design.md §5 lists the four indexes this schema has beyond its
-- constraints and this is not among them. Hundreds of accounts with a row or two each is a
-- sequential scan of a small table — the same reasoning §5 records for REQ-032's search.

-- Deny-all, as every table here is. The server's service-role key is the only thing that gets
-- past it (ADR-001). Do not add a permissive policy to make something work.
alter table push_subscriptions enable row level security;
alter table push_subscriptions force row level security;
```

Update `supabase/migrations/README.md`'s file table with the `0007` row — `0006` did not, and the
table currently stops at `0003`. Worth correcting both in the same commit.

The repository's upsert is `.upsert({…}, { onConflict: 'endpoint' })` and must set `user_id`,
`p256dh`, `auth` and `user_agent` on conflict — a `23505` reaching the route means the upsert was
written as an insert.

---

## 6. How the eight states are wired, and how each one stays honest

**The one rule that makes AC-07 true: the toggle's rendered position is set only from a server
response, never from the user's intent.** A click sets `busy`; the response sets `on` or `off`;
a failure leaves the last server-confirmed value in place and raises ST-07. There is no optimistic
update anywhere on this screen. Every other paragraph in this section is a consequence of that
one sentence.

### 6.1 Load

```
supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  false → ST-06, and NO fetch is issued at all.
```

**ST-06 makes no network request**, which is worth stating because the obvious implementation
fetches first and branches later. There is nothing to configure, `Your details` comes from the
session, and a fetch that failed here would force a false choice between ST-06 and ST-08. AC-06
and AC-08 stay cleanly separate only if this branch returns before the fetch.

```
supported → ST-01 (toggle row skeleton; Your details renders in FULL — SCR-004 ST-01's own
            2026-09-10 correction) while GET /api/notifications/push is in flight   [AC-09]
  'unavailable' / error → ST-08; Try again re-runs this fetch and nothing else     [AC-08]
  ok { pushOptIn, vapidPublicKey } → §6.4
```

### 6.2 Turning it on — ST-02 → ST-03 → ST-04 / ST-05 / ST-07

```
1. toggle → busy, disabled. NOT snapped to on (SCR-004 ST-03: "the browser has not agreed yet")
2. reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready
3. permission = await Notification.requestPermission()     ← inside the click handler's task
4. sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
5. POST /api/notifications/push/opt-in { endpoint, p256dh, auth }
6. toggle ← response.pushOptIn    → ST-04
```

Step 3 must run in the gesture's own task — an `await` of our own before it can cost the user
gesture in some browsers, which presents as a permission prompt that never appears. Registering
the worker first (step 2) is a real `await`; if that turns out to break the prompt on any target
browser, swap steps 2 and 3 — the registration is only needed by step 4.

`userVisibleOnly: true` is required by Chrome and is also honest: US-032 always shows a
notification.

**Every branch, including the three SCR-004 has no state for:**

| Outcome | State | Why |
| --- | --- | --- |
| step 3 → `'granted'`, step 5 ok | **ST-04** | AC-02 |
| step 3 → `'denied'` | **ST-05** | AC-05 |
| step 3 → `'default'` (prompt dismissed) | **ST-02** | Nothing changed and nothing failed. ST-07's *"We couldn't save that change"* would be false. SCR-004 has no state for a dismissal and does not need one — returning to ST-02 is the truth |
| step 2 throws (worker blocked, insecure context) | **ST-07** | Not ST-06: the API existed, so *"this browser doesn't support alerts"* would be wrong. ST-07's sentence — *"We couldn't save that change. Your alerts are still off."* — is true here. A stretch of the state's intent, named rather than hidden |
| step 4 throws (bad key, service unreachable) | **ST-07** | Same |
| step 5 fails | **ST-07**, toggle stays **off** | **AC-07's exact case.** Permission granted, browser subscribed, our save failed. The browser subscription is left in place — it is inert, because US-032/AC-05 and V-14 check the flag first — and `Try again` re-posts the same subscription (§4.2) |

### 6.3 Turning it off — ST-04 → ST-02 / ST-07

```
1. toggle → busy, disabled
2. POST /api/notifications/push/opt-out      (no browser call, no permission — BR-001.15)
3. ok → toggle ← response.pushOptIn (false) → ST-02
   then, fire-and-forget and unobserved: (await reg.pushManager.getSubscription())?.unsubscribe()
4. failure → ST-07, toggle stays ON
```

**Step 4 is where SCR-004's copy runs out.** ST-07's approved sentence is *"We couldn't save that
change. **Your alerts are still off.**"* — written for a failed opt-in. Here the true sentence is
*"…still **on**."* AC-07 covers both directions and requires *"naming the current reality rather
than the intent"*, so the copy must vary by direction. **Do not invent the second sentence in
code** — open item 3 routes it to UX, and the story should not merge with a made-up string in it.

### 6.4 The precedence rule at load, and the two mismatches it leaves

**Permission outranks the flag.** With `pushOptIn === true` and `Notification.permission ===
'denied'`, the screen is **ST-05**: toggle off and disabled. SCR-004 ST-05 says so in its own
words, and AC-05 requires that *"the toggle does not falsely show as on"*. The naive
implementation binds the toggle to `pushOptIn` and renders **on**-and-disabled, which is the
falsehood AC-05 names.

Full precedence, in order: **unsupported → denied → the flag.**

**We do not write the flag false to make the screen consistent.** It is a write the user did not
ask for, it would break AC-04 on their other browser, and the story's own edge cases say
reconciliation of a revoked permission is *"not invented here"*. Open item 5 asks the human to
confirm the residual rather than my deciding it silently.

**One reconciliation we *do* perform, because it is free and invisible.** When the flag is on,
permission is already `granted`, and `getSubscription()` returns nothing — the common case is a
push service rotating an endpoint — the client silently subscribes and `POST`s `/opt-in` again.
No prompt is shown (permission is already granted), nothing in the UI changes, and it is the
difference between push that quietly dies after a few weeks and push that keeps working. **If it
fails, the screen still shows ST-04, not ST-07** — the account *is* opted in, and the user
performed no action to have failed.

**The one mismatch nothing here closes:** flag on, permission `'default'` on this device (a second
browser, or a reset permission). The toggle reads **on**, ST-04 promises alerts, and none will
arrive on this device. AC-04 forces the toggle's position; PRIN-5 is uncomfortable with the
promise. Prompting on page load is hostile and increasingly blocked, and a ninth state is copy
nobody approved. **Open item 4.**

---

## 7. Configuration — tighten the VAPID keys at boot

The three keys already exist (`config/index.ts:58-60`) as `nonEmpty(...)`. That is enough to boot
and not enough to work: `web-push.setVapidDetails()` throws on a wrong-length key or a subject
that is neither `mailto:` nor `https:`. `app-architecture.md` §5.4 and the US-034/F-3 precedent
both say that class of failure belongs at **boot**, not at first send — and in this story the
public key is additionally **served to the browser** (§3), where a malformed one produces an
opaque `subscribe()` failure and ST-07 for a configuration mistake.

```ts
/** A VAPID subject is a contact URL for the push service, and web-push accepts only these two
 *  schemes. A wrong one is a 403 from every push service (design note §7). */
VAPID_SUBJECT: nonEmpty('VAPID_SUBJECT').refine(
  (v) => v.startsWith('mailto:') || v.startsWith('https://'),
  { message: 'must be a mailto: or https: URL' },
),
/** Uncompressed P-256 point, 65 bytes → 87 base64url characters (design note §4.4). */
VAPID_PUBLIC_KEY: nonEmpty('VAPID_PUBLIC_KEY').regex(/^[A-Za-z0-9_-]{87}$/, '…'),
/** P-256 private scalar, 32 bytes → 43 base64url characters. */
VAPID_PRIVATE_KEY: nonEmpty('VAPID_PRIVATE_KEY').regex(/^[A-Za-z0-9_-]{43}$/, '…'),
```

Three consequences DEV must own rather than discover:

- **`config/**` is a protected path.** The story is already Complex and already has this note, so
  the tier does not move — but it must be in the plan's file list and in `impact-analysis.md`.
- **Two existing spec fixtures break, and that is the change working.**
  `config/index.spec.ts:29-31` and `infra/mailer/index.spec.ts:15-17` both use
  `'vapid-public'` / `'vapid-private'`, which the regexes reject. Replace with real generated
  keys (public values, safe to commit) and add a negative case. Those two files are the entire
  blast radius — no other spec builds a full `Config`.
- **`VAPID_PRIVATE_KEY` is already in `SECRET_KEYS`** (`config/index.ts:126`), so a rejected value
  is reported as *"(value withheld)"*. Verify that holds after the change; it is the one config
  error message most likely to be pasted into a chat window.

`.env.example` needs no new key, only a line naming `npx web-push generate-vapid-keys` as how the
pair is produced.

---

## 8. The service worker, and the seam US-032 inherits

### 8.1 Where the file goes

**`apps/ui/public/sw.js`**, served at `/sw.js` with scope `/`, in dev and in the build alike —
Vite serves `public/` at the root in both, so this needs **zero build configuration**.

| Option | Verdict |
| --- | --- |
| **`public/sw.js`** (chosen) | Works in `vite dev` and `vite build` untouched. Not type-checked and not bundled — so it must stay small, and must import nothing |
| `src/sw.ts` + a second Rollup input | Typed and lintable, and needs `build.rollupOptions.input` plus an `entryFileNames` special case to keep the filename unhashed (a hashed worker filename breaks every already-registered client), and `vite dev` does not serve it without a plugin. Real cost for a 30-line file |
| `vite-plugin-pwa` | Rejected — §2.2 |

Two consequences of not being type-checked: give the file `// @ts-check` plus a
`/// <reference lib="webworker" />` if the editor will honour it, and add an `eslint.config.mjs`
override for `apps/ui/public/sw.js` giving it the service-worker globals — otherwise `self` and
`clients` are lint errors and the file gets excluded instead, which is how it stops being
reviewed.

### 8.2 Registration: lazily, from the Settings screen only

**Not in `main.tsx`.** Registering at app boot installs a worker at scope `/` for every user on
every page — including the great majority who will never opt in — and makes the app look like a
PWA in browser UI, which `app-architecture.md:337` is explicit about not implying. The Settings
screen is the only place that subscribes, and `pushManager.subscribe()` needs the registration,
so registering on that screen is sufficient.

**And it stays sufficient forever, including for US-032.** Once installed the worker persists;
the browser wakes it for a `push` event whether or not any page of ours is open. `main.tsx` is
never touched by this feature.

### 8.3 The worker itself

For US-031 the worker needs only to exist and install — the story sends no push. Ship it with the
`push` and `notificationclick` handlers **stubbed and commented as US-032's**, rather than empty:
an empty worker invites a second file later, and a worker without a `push` handler shows Chrome's
generic "This site has been updated in the background" notification if anything ever does send.

```js
// apps/ui/public/sw.js — Web Push ONLY (REQ-026, app-architecture.md:337).
// This app is NOT offline-capable. There is deliberately no `fetch` handler, no precache and no
// caching strategy here, and adding one would make a promise the release cannot keep.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// US-032 fills these. `userVisibleOnly: true` was promised at subscribe time, so a `push`
// handler that shows nothing is a broken promise the browser may penalise.
self.addEventListener('push', (event) => { /* US-032 */ });
self.addEventListener('notificationclick', (event) => { /* US-032 */ });
```

`applicationServerKey` conversion: `pushManager.subscribe()` accepts a base64url string in current
browsers, but pass a `Uint8Array` from a small pure `urlBase64ToUint8Array` in
`apps/ui/src/lib/` — eight lines, unit-testable, and it removes a browser-support question from
the one call that cannot be retried cheaply.

### 8.4 What US-032 inherits, written now so it is not rediscovered

- **`recordAndSend` is widened, not forked.** `notifications.service.ts:104-145` hardcodes
  `channel: 'email'` and imports `infra/mailer`. US-032 adds `sendBookingPush`, composing its
  wording **inside this module** (the README's own rule, and BR-001.20's actor clause already
  lives in `domain/cancellation-copy.ts`), and reuses `recordAndSend`'s never-throws / never-silent
  contract with `channel: 'push'`. **A second send path breaks US-034/AC-08** — the same
  instruction the module README already gives US-030.
- **One `notification_deliveries` row per subscription per event** — US-032/AC-09's *"exactly one
  push per subscription"*. `recipient` is the endpoint (`db-design.md:203`).
- **Flag first, then subscriptions**, in one repository method
  (`findPushRecipients(userId)`): read `push_opt_in` with an explicit column list; only if true,
  read the rows. `db-design.md:185` — *"Both are checked before sending: flag first, then
  subscriptions."* US-032/AC-05 is the security-shaped one and this ordering is what proves it.
- **`404`/`410` from the push service hard-deletes the row** (`db-design.md:188`, §4). `web-push`
  raises `WebPushError` carrying `statusCode`. Every other status is a logged failure, not a
  delete.
- **The reminder index is unaffected.** `0006`'s comment warns that a push reminder would
  invalidate `notification_deliveries_one_sent_reminder_per_booking`, which excludes `channel`.
  US-032 adds push for `confirmation` and `cancellation` only (BR-001.16, US-032/AC-06), so the
  index's guarantee still holds. One line in US-032's PR, so the next reader does not re-derive it.
- **BR-001.16 stays structural.** `sendReminderEmail` is the only reminder composer and it never
  reaches the push path. No flag, no parameter, nothing to forget.

---

## 9. One new ADR — ADR-015, and only one

`ai/roles/architect.md`'s bar is *"a real trade-off with a rejected alternative"*, and executable
contracts carry ordinary decisions without ceremony. Applying that honestly to the four candidates:

- **The `web-push` dependency — yes, ADR-015.** A genuinely viable rejected alternative (RFC
  8291/8292 on Node 20's webcrypto), a licence family new to this project, a security-critical
  dependency, and a decision the project lives with on every push forever.
  `security-standards.md` requires Architect + human approval; this is the artefact that records
  it. **Status `proposed`** — the decision is the human's, not mine.
- **Subscription-registration synchronous with the opt-in save — no ADR.** The alternatives
  (two calls; a Postgres function) are ruled out by things already decided, and what remains is
  a write-ordering rule inside an executable contract. §4.2 is its home, plus a comment in the
  service.
- **`notifications` writing `push_opt_in` — no ADR.** The exception was granted in writing by
  `app-architecture.md:89` before any code existed, exactly as US-025's cascade exception was.
  Two README lines (§4.6). ADR-004 is not contradicted and must not be silently amended.
- **The read endpoint's shape, the two verbs, the validation, the migration — no ADR.** The
  contract and the migration *are* the design, carrying ordinary decisions.

---

## 10. Constraints the implementation must satisfy

| # | Constraint | Severity |
| --- | --- | --- |
| C1 | `endpoint` is validated at the route edge: `https:` only, no URL credentials, no private/`.local`/literal-IP host, ≤ 2048 chars (§4.4) | **blocker** |
| C2 | Neither route accepts an account id in any path or body; the account is `req.user.id` (§4.1, AC-10) | **blocker** |
| C3 | Opt-in writes the **subscription first, then the flag**; opt-out writes the **flag first, then deletes**. The rule and its reason are in a comment (§4.2, §4.3) | **blocker** |
| C4 | The toggle is set **only** from a server response; no optimistic update anywhere on this screen (§6) | **blocker** |
| C5 | `endpoint`, `p256dh` and `auth` are added to `infra/logger`'s redaction list and never reach a log line (§4.5) | **blocker** |
| C6 | `eslint.config.mjs` gains `WEBPUSH_BAN` **by amending the existing blocks**, never as a new broad block — the mistake that file's own comments already document (§2.1) | **blocker** |
| C7 | `0007` creates the table whole, `on delete cascade` on `user_id`, unique on `endpoint` **alone**, RLS `enable` + `force`, no policies (§5) | **blocker** |
| C8 | ST-05 renders the toggle **off and disabled** when permission is `denied`, whatever `pushOptIn` says; the flag is **not** written false (§6.4, AC-05) | **major** |
| C9 | ST-06 issues **no fetch** (§6.1, AC-06) | **major** |
| C10 | `GET` and both writes return `pushOptIn`; the read also returns `vapidPublicKey`; requests `.strict()`, responses not (§3, §4.1) | **major** |
| C11 | The repository **upserts** on `endpoint`, updating `user_id`, `p256dh`, `auth`, `user_agent`; a `23505` reaching the route is a bug (§5) | **major** |
| C12 | `user_agent` comes from the request header, truncated to 300 chars, never from the body (§4.4) | **major** |
| C13 | The `/opt-out` route succeeds without any browser call; `unsubscribe()` runs after, unobserved, and its failure never produces ST-07 (§4.3, §6.3) | **major** |
| C14 | `config/**` tightened per §7; `config/index.spec.ts` and `infra/mailer/index.spec.ts` fixtures updated, with a negative case | **major** |
| C15 | `sw.js` has **no `fetch` handler and no caching**, and says why in a comment (§8.3) | **major** |
| C16 | The worker is registered from the Settings screen, not `main.tsx` (§8.2) | **major** |
| C17 | Both module READMEs record the `push_opt_in` write exception and cite `app-architecture.md:89` (§4.6) | **major** |
| C18 | The silent reconcile (flag on + granted + no local subscription) shows **ST-04** on failure, never ST-07 (§6.4) | **minor** |
| C19 | The client posts `{ endpoint, p256dh, auth }` explicitly, never `subscription.toJSON()` (§4.4) | **minor** |
| C20 | `supabase/migrations/README.md`'s file table gains rows for `0004`–`0007` (§5) | **nit** |

---

## 11. Open items for the human

| # | Item | Owner | Resolution |
| --- | --- | --- | --- |
| 1 | **Dependency approval: `web-push@3.6.7`, MPL-2.0, 5 runtime deps** (+ `@types/web-push` as a devDependency). `security-standards.md` makes this Architect + human. §2.1 states the licence position; the call is not mine | Joy Joshua | **Approved in chat, 2026-09-21.** |
| 2 | **ADR-015 status.** Drafted `proposed`. Accept, amend the trade-off table, or reject | Joy Joshua | **Accepted as drafted, 2026-09-21** — status updated in the ADR file. |
| 3 | **SCR-004 ST-07 has no copy for a failed opt-out.** Its sentence is *"Your alerts are still off."*; AC-07 also covers an opt-out failing, where the true sentence is the opposite. Needs approved copy — the build must not invent it (§6.3) | UX / BA | Human deferred the call to DEV, 2026-09-21. **DEV's call:** use *"We couldn't save that change. Your alerts are still on."* — the direct mirror of the approved opt-in sentence — and flag it in the PR description as copy needing a UX sign-off rather than a merge blocker, since it follows SCR-004's own established pattern exactly. |
| 4 | **Flag on, permission `'default'` on this device.** The toggle reads on (AC-04 requires it) and nothing will arrive here. Confirm as an accepted residual, or send to UX for a ninth state (§6.4) | Joy Joshua / UX | **Accepted residual** — matches the story's own edge cases ("not invented here"). No ninth state built. |
| 5 | **Flag on, permission `'denied'`.** The screen shows off-and-disabled (ST-05) while the account is opted in. Confirm we do **not** write the flag false to reconcile (§6.4) | Joy Joshua | **Confirmed — no reconciling write.** Matches the story's own edge cases. |
| 6 | **Shared browser.** The global unique on `endpoint` reassigns the row to whoever opted in most recently; the earlier account's flag stays on with no subscription and they silently stop receiving push. The alternative delivers one person's bookings to another's screen. Confirm the residual is accepted (§5) | Joy Joshua | **Accepted residual** — the rejected alternative (per-account subscriptions) is worse: it risks cross-account delivery. |
| 7 | **Should an Admin be refused these routes?** REQ-026 grants push to Employees, and SCR-004 open question 2 already settled that admins get no Settings screen — so it is unreachable in the UI. No AC asks for a `403`, and adding one invents a rule. Recommend no role check; confirm | Joy Joshua / BA | **Confirmed — no role check.** Matches SCR-004's own settled open question 2. |
| 8 | **The Figma frames were not read (by the Architect).** The `figma` MCP server failed to connect in the Architect's session and the design connectors were unauthorized there. Every ST-05–ST-08 detail above is from the SCR-004 **spec text**, as read by the Architect. **DEV has since confirmed connectivity and spot-checked ST-01 and ST-08 against the real frames** (`HF / SCR-004 · Settings / ST-## <state> · <width>`, file `xjFVgBbMrJUl7Ys3EX3Cbn`) — both matched the spec exactly. DEV will pull exact copy/layout via `get_design_context` for each component as it is built | DEV | Confirmed for ST-01, ST-04, ST-08; remaining states verified during build. |
| 9 | **The 87 / 22 base64url key lengths are derived, not observed** (§4.4). Verify against a real Chrome and a real Firefox subscription and paste the evidence in the PR. A wrong length makes opt-in impossible on a real browser while every unit test passes | DEV | Open — will verify and paste evidence during implementation. |

---

## 12. What this story must NOT build

- **No offline capability, no precache, no `fetch` handler, no web app manifest** (§8.3,
  `app-architecture.md:337`).
- **No push sending.** No `push`/`notificationclick` body, no `infra/webpush` send function, no
  `channel: 'push'` delivery row. All US-032's (§8.4).
- **No second mail or push path.** `recordAndSend` is widened later, never forked (§8.4).
- **No Postgres function and no `/rpc/` surface** (§4.2).
- **No new error code, and no `details` payload.** Nothing here has a refusal of its own (§4.1).
- **No role check on the routes** — that would invent a rule (open item 7).
- **No write of `push_opt_in` from anywhere but `modules/notifications`**, and no write of any
  other `user_profiles` column from there (§4.6).
- **No index on `push_subscriptions.user_id`** (§5).
- **No change to `main.tsx`, `require-session.ts`, `authenticatedUserSchema`, or
  `auth.repository.ts`'s `COLUMNS`** — a diff in any of them means the flag was put on the session
  and AC-08 and AC-09 became unreachable (§3).
- **No reconciliation of a revoked permission** — the story's own edge cases exclude it.
- **No `data-refresh.ts` change** — this screen is not on it.

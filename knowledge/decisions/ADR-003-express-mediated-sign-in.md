# ADR-003 — Sign-in is mediated by Express; the browser never calls Supabase Auth to authenticate

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Status**  | proposed                                                           |
| **Date**    | 2026-09-17                                                         |
| **Decider** | Joy Joshua (drafted by Architect persona)                          |
| **Serves**  | US-001/AC-04, US-001/AC-08, REQ-002, REQ-005, V-01; narrows [ADR-001](ADR-001-server-mediated-supabase-access.md) |

## Context

[ADR-001](ADR-001-server-mediated-supabase-access.md) routes all **data** access through
Express and leaves the browser's Supabase client two jobs: "signing in, and refreshing the
access token". That sentence is repeated in `app-architecture.md` §1, in
`ai/standards/coding-standards.md`, and in the docblock of the scaffolded
`apps/ui/src/lib/supabase-client.ts`. It was written before any story was implemented.

US-001/AC-04 is what tests it:

> When the submitted email is unknown, **or** the password is wrong, **or** the account is
> marked deactivated (REQ-005) — all three produce the identical message **and the identical
> response time band**.

Three facts make the browser-signs-in shape unable to satisfy that criterion:

- **Supabase Auth does not know what `is_active` means.** `is_active` lives in our
  `user_profiles` table (`db-design.md` §1.1), which exists precisely because Supabase Auth
  has no concept of it. A deactivated account submitting its correct password **succeeds** at
  GoTrue and is issued a real access token and a real refresh token.
- **That makes the deactivated case structurally distinguishable.** It takes a different
  number of network round-trips (sign in, then a call to our API that refuses), it produces a
  different HTTP status from a different origin, and it leaves a usable refresh token behind.
  No amount of front-end care collapses those three shapes into one band.
- **GoTrue's own timing for "unknown email" versus "wrong password" is not ours to control.**
  It is an upstream implementation detail that can change under us, and we cannot write a
  regression test against it. An acceptance criterion whose proof lives in somebody else's
  release notes is not proven.

There is a second, smaller reason. US-001/AC-08 requires that "a plain-HTTP request to **the
sign-in endpoint** is refused or redirected rather than served". If the sign-in endpoint is
Supabase's, that criterion is about a host we do not operate.

## Decision

**Credential submission goes to Express. The browser never calls Supabase Auth to
authenticate.**

- `POST /api/auth/sign-in` takes `{ email, password }`. Express verifies the password by
  calling Supabase Auth **server-side**, then loads `user_profiles` and applies REQ-005.
- All three AC-04 causes converge on **one** code path before any response is shaped, and that
  path returns one body and is held to one minimum duration.
- On success, Express returns the Supabase session — access token, refresh token, expiry — in
  the response body. The browser hands it to `supabaseBrowserClient.auth.setSession(...)`.
- **The browser's Supabase client keeps exactly one job: refreshing the access token.** That
  half of ADR-001 is unchanged, and this decision does not reopen it.
- Password verification is performed by a Supabase client built with the **anon key**, not the
  service-role key, constructed in `infra/supabase` like every other client. A failed password
  attempt must never execute on a key that bypasses RLS.
- A session issued to an account that turns out to be inactive is **revoked server-side**
  before the refusal is returned. GoTrue has already minted it; leaving it alive would hand a
  deactivated user a working refresh token that only our middleware stands between.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **Browser calls `supabase.auth.signInWithPassword()`, then calls `/api/auth/session`** (what ADR-001 currently says) | No password ever reaches our server. GoTrue owns hashing, timing and lockout. Refresh is wired for free. Least code. | Cannot satisfy AC-04: the deactivated account succeeds at GoTrue and fails one round-trip later, at a different time, with a different status, from a different origin. A real refresh token exists for a deactivated account. AC-08's "the sign-in endpoint" becomes a host we do not run. The unknown-email/wrong-password timing is upstream's to change. | The story's one security-relevant criterion is unreachable. Everything else about it is attractive, which is exactly why it is written down here rather than quietly dropped. |
| **Express mediates sign-in; the session is returned in the JSON body (chosen)** | All three AC-04 causes converge on one server path we own and can test. `is_active` is applied before any token reaches the browser. One origin, so AC-08 is about our server. No cookies, so no CSRF surface. Token refresh stays with the Supabase client, so ADR-001's second permitted use is untouched. | The plaintext password now transits our server and appears in a request body — a redaction constraint on the logger rather than a non-issue. The access and refresh tokens live in browser storage (supabase-js default), so XSS reaches them. Every sign-in attempt in the company reaches Supabase from one server IP, so a provider-side per-IP limit would throttle everyone at once. | — |
| **Express mediates sign-in and keeps the session server-side, in an httpOnly cookie** | Tokens unreachable from JavaScript, so XSS cannot steal them. The strongest option on paper. | Needs a session store or cookie-wrapped tokens, CSRF protection on every mutation, and a cross-site cookie between the UI origin and the API origin (`SameSite=None; Secure`) — and **hosting is not chosen yet** (`app-architecture.md` §7 item 3), so those origins are unknown. It replaces the bearer-token model in §5.1 and takes refresh away from the Supabase client, which is the one thing it does well. | Real security value, bought with machinery that cannot be specified before hosting is decided, on a low-sensitivity internal tool whose PO has already accepted a 30-day session on a possibly-lost phone (RISK-010). Revisit if the sensitivity of the data ever changes. |

## Consequences

**Easier**

- AC-04 becomes provable in CI rather than asserted about a third party. One path, one body,
  one floor, three tests.
- REQ-005 is applied **before** a credential is exchanged for anything usable, which is what
  "a deactivated user cannot sign in" was always supposed to mean.
- One origin for the whole product. AC-08 is a property of our deployment, not of Supabase's.
- Sign-in becomes an ordinary route with an ordinary Zod schema and an ordinary error shape,
  like the other forty endpoints, instead of the one flow shaped differently from all of them.

**Harder**

- **The password transits our server.** `infra/logger` already redacts a `password` field
  (`apps/api/src/infra/logger/index.ts`), and `console.log` is banned in server code by the
  lint config. Both now carry weight they did not carry before. A route that logs its request
  body is a blocker finding on this endpoint specifically.
- **Tokens sit in browser storage.** Recorded here as the residual risk of rejecting the
  cookie option, not hidden in it.
- **Supabase sees one IP for all sign-ins.** A provider-side per-IP auth limit becomes a
  whole-company outage rather than one user's inconvenience. This belongs to
  `app-architecture.md` §7 item 5 (Supabase project tiers and settings) and must be checked
  before Gate 3.
- **No rate limit exists anywhere**, and BRD-001 specifies none. The minimum-duration floor in
  US-001 is a timing-oracle defence, **not** a rate limiter: it delays each response and
  bounds nothing about concurrency. Saying so here so that nobody argues otherwise in a
  review. Owner of the gap: PO.

**Follow-up work created**

1. **Four consequential edits, in the US-001 story PR**, so the repository stops saying the
   opposite of this decision:
   - `ADR-001` §Decision — the browser's client is used for **token refresh**, one thing.
   - `app-architecture.md` §1, the paragraph under the diagram — same correction.
   - `ai/standards/coding-standards.md` §Browser (`apps/ui`) — same correction.
   - `apps/ui/src/lib/supabase-client.ts` docblock lines 5–7 — same correction, plus a line
     saying credential submission goes to `POST /api/auth/sign-in`.
2. **`ai/standards/security-standards.md`** gains the §Authentication note that sign-in is the
   one unauthenticated route and what protects it (the convergence and the floor).
3. **`ai/standards/api-standards.md`** gains a `503` row: a named downstream outage, distinct
   from `500`, which stays "never intentional".
4. **Confirm the Supabase project's auth rate limits** against the single-IP consequence above.
   Owner: DevOps, before Gate 3.

## Not closed by this decision

Whether the product needs a rate limit or an account lockout. BRD-001 specifies neither, this
ADR invents neither, and US-001 raises it as an open question. It is a PO decision: either a
new requirement routed through `/ba`, or an accepted risk recorded in BRD-001 §9.

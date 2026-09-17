# US-002 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-002 — Sign out](../../stories/user-stories/US-002-sign-out.md)        |
| **Screen**   | The shell's account menu on [SCR-002](../../design/screens/SCR-002-my-bookings.md), [SCR-004](../../design/screens/SCR-004-settings.md), [SCR-005](../../design/screens/SCR-005-all-bookings.md); destination [SCR-001](../../design/screens/SCR-001-sign-in.md) ST-01; **[SCR-010](../../design/screens/SCR-010-set-your-password.md)** for AC-04 — see §7 |
| **Tier**     | Complex — four surfaces, none of them a protected path (see §0)          |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-003](../../../knowledge/decisions/ADR-003-express-mediated-sign-in.md) — **no new ADR** (§8) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is
argued before the code, not in a review thread. `decisions.md` in this package stays DEV's.

The US-001 note deferred this endpoint by name — *"a new route is a contract, and a contract
with no AC has no test to cite"* ([§2.3](../US-001-sign-in/design-note.md)). US-002 is the AC.
This note settles the contract the story's **API impacts** section handed to `/architect`.

---

## 0. The tiering

**Complex**, on four surfaces from `ai/standards/task-surfaces.md`:

- **A new route** (`§Server` — Complex outright), and it is a `POST`.
- **The props or events of a shared component** — `AppShell` gains an account menu (AC-01).
- **A new or changed slice of shared/global state** — `AuthContextValue` gains `signOut`.
- **Token handling in the browser** — §6.2. `getAccessToken` currently returns `undefined`,
  and until it does not, the server half of AC-02 cannot happen at all.

**What it is *not*** is worth as much as what it is. This design touches **no protected path**:
no `libs/contracts` change (§3), no `apps/api/src/http/middleware/**` change (§2.2), no
migration, no config key. A sign-out that required editing the auth chain would be a change to
the one file every other story's security depends on, and §2.2 is largely an argument for why
it does not have to be.

**Two things the story's own framing understates**, and both change the plan:

- **AC-04 cannot be fully proven by this story.** SCR-010 does not exist until US-004. Its
  server half and its credential half *are* provable today and are the durable halves; the link
  on the screen is US-004's to carry. §7.
- **AC-02 rests on one empirical assumption about GoTrue** that nobody in this repository has
  yet observed to be true. §5. If it is false, the story is not done when its tests are green.

---

## 1. What sign-out actually has to end

The story's API-impacts line is precise and is the whole requirement: *"a session-termination
endpoint whose effect is server-side, not merely a cleared cookie."* Three things carry the
session, and clearing one of them is the failure mode the QA note is warning about.

| What | Where it lives | Who ends it | If only this is ended |
| --- | --- | --- | --- |
| The **refresh token** | browser storage (supabase-js) **and** GoTrue's session row | `auth.admin.signOut(jwt, scope)` on the server | — |
| The **access token** | browser storage, sent as our bearer | GoTrue, *if* it validates the session behind the JWT (§5) | — |
| The **rendered application** | React state in this tab | the browser | **This is the failure the QA note names**: the interface is cleared, the session still authorises everything |

`revokeSession` in `apps/api/src/modules/auth/auth.adapter.ts` already does the server-side half
— it was built for US-001's deactivated-account path and is adapter-level, not sign-in-specific.
**Reuse it; do not build a second termination path.** One correction to it is required, and only
one: its scope. See §2.3.

---

## 2. The endpoint shape

### 2.1 `POST /api/auth/sign-out` — mounted **outside** the session chain

**Method and path.** `POST`, not `DELETE`; `/sign-out`, not `/session`. It sits on the existing
`authRouter`, beside `POST /sign-in`, and reads as the verb it is. `DELETE /api/auth/session`
is the tidier REST reading and is rejected for two reasons: it pairs a destroy semantic with the
resource `GET /api/auth/session` returns a *user* from, and it breaks the symmetry with
`/sign-in` that makes the auth surface legible at a glance. The name is also already written
down in three places in this repository (US-001 note §2.3, `require-session.ts` step 5,
`app-architecture.md` §5.1) — changing it now would cost more than it buys.

**Request body: none.** The bearer token *is* the session to end; there is nothing else to send.

**No request schema, deliberately.** `app-architecture.md` §5.2 says every request body is
parsed by a schema at the route edge. A request with no body is not a body that went
unvalidated. Adding an empty strict schema would turn a stray field from a well-meaning client
into a `400` **on the one endpoint whose entire value is that it never fails** (§2.2), and a
schema that validates nothing is decoration with a failure mode. The handler ignores the body.

**Response: `204 No Content`.** Always. No body, no schema, nothing to parse.

```
POST /api/auth/sign-out
Authorization: Bearer eyJ...

204 No Content
```

**`204` is the only outcome.** Not on success — *always*. A missing token, a malformed token,
an expired token, a token whose session GoTrue has already forgotten, a token belonging to a
deactivated account: all `204`.

The reasoning is AC-02's own words. The criterion asks that *"the session no longer authorises
anything"* — it does not ask that sign-out reject a session that already authorises nothing.
Every condition on which a session-checking middleware would refuse this request is a condition
that means **the caller has already got what they asked for**. Answering `401 session_invalid`
to *"please end my session"* is answering a question nobody asked, and it would hand the browser
a failure it has no state to display: the story says plainly that *"nothing in BRD-001 asks for
a 'you have been signed out' confirmation"*, and there is no ST-## for a sign-out that failed
on any of the three screens or on SCR-010.

**One visible consequence, and its mitigation.** Always-`204` hides a real client bug: a browser
that forgets the `Authorization` header gets a cheerful `204` while the session lives on. That
is not hypothetical — it is exactly the state `apps/ui` is in today (§6.2). Two things catch it:

- **The server logs a warning when there was nothing to revoke.** A sign-out with no bearer
  token skips the GoTrue call entirely and logs that it revoked nothing. This is the same device
  US-001 used for the failure-delay floor: when a guarantee quietly stops holding, one log line
  is the operational signal, and it costs one `if`. It also bounds the cheapest abuse of an
  unauthenticated endpoint — no token, no downstream call.
- **The browser test asserts the header was sent** (§10). "The request carried a bearer token"
  is a property of what crossed the wire, not an assertion about a mock.

*Rejected: `401` when the `Authorization` header is absent, `204` otherwise.* It makes the
client bug loud at the cost of reintroducing the question "when does sign-out fail?" for a case
that is our defect rather than the user's situation — and the browser ignores the outcome
either way (§6.3), so the `401` would be just as invisible in practice as the log line, while
costing the always-succeeds property that §2.2 leans on. Argue it back if you disagree; it is
the one place in this note where both answers are defensible.

### 2.2 Why it is mounted outside `requireSession` — and how that settles AC-04

This is the decision the note exists for.

`requireSession` is a **protected path** and its step 5 is a named, empty seam whose comment
already anticipates this story: *"`must_change_password = true` → 403 on every route except the
password-change route and sign-out."* AC-04 is that exemption becoming a requirement.

**The design: sign-out runs no session middleware at all.** It reads the bearer token from the
`Authorization` header itself and hands it to the adapter — the route sits on `authRouter`
beside `POST /sign-in`, which `app.ts` already mounts unguarded.

**Why the whole chain, not just step 5.** Work through what each step of `requireSession` does
to *this* request:

| Step | Refuses when | What that refusal means for sign-out |
| --- | --- | --- |
| 1 | no bearer token | nothing to revoke — the caller is already where they asked to be |
| 2 | the token is invalid or expired | the session is already dead |
| 3 | no profile, or `is_active = false` | **the one case where refusing is actively harmful** — a deactivated user's live refresh token would never be revoked, because the chain refuses the very request that would have revoked it |
| 4 (US-003) | `last_seen_at` older than 30 days | the session is already dead |
| 5 (US-004) | `must_change_password = true` | **AC-04**, verbatim |
| 6 | — | attaches a user this route does not use |

Every row is either "already true" or "harmful". That is not a coincidence to be patched step by
step: **`requireSession`'s job is to decide whether a session may act. Sign-out does not act on
behalf of a session; it destroys one.** The chain is the wrong tool for this route by nature,
and AC-04 is the first symptom rather than the whole disease.

*Rejected: mount behind `requireSession` and allowlist the route inside step 5.* Three reasons,
in order of how much they would cost:

1. **It makes a security criterion depend on a string comparison a future author must remember.**
   The exemption would live inside the middleware, keyed on the path, and US-004's author would
   have to get it right while writing a different story. Mounted outside, AC-04 holds
   *structurally*: US-004 adds a gate to a chain this route never runs.
2. **The request path inside a mounted router is a known footgun.** Under a mount at
   `/api/auth`, the middleware sees `/sign-out` on `req.path` and `/api/auth/sign-out` on
   `req.originalUrl`. An allowlist written against the wrong one either exempts nothing or
   exempts too much, and both fail silently.
3. **It would make US-002 a change to a protected path.** The current design leaves
   `apps/api/src/http/middleware/**` untouched by a story that has no business editing the auth
   chain, and leaves step 5's seam exactly as US-004 will find it — with its comment now
   *describing* reality rather than promising it. Optionally amend that comment to say sign-out
   never reaches this chain, pointing here. The behaviour does not depend on the edit.

*Rejected: a lighter `requireBearerToken` middleware (steps 1–2 only).* It buys a `401` for a
missing token — which §2.1 argues against — and costs a new file in the protected middleware
directory plus a second, nearly-identical chain for future authors to choose between wrongly.
The four lines that parse an `Authorization` header do not need a middleware to live in.

**Consequential edit to the architecture.** `app-architecture.md` §5.1 opens with *"One
middleware runs on every route except sign-in"*. That sentence now has a second exception, and
a stronger one than its step-4 clause implies: sign-out is exempt from the **whole chain**, not
only from the password gate. Edit §5.1 to say so, the way ADR-003's consequential edits were
made rather than discovered later.

**Three smaller consequences, named so they are not mistaken for oversights:**

- **No acting-user id in the request log.** `app-architecture.md` §5.5 wants one line per
  request with the acting user's id; this route has no `req.user`. Accepted: identifying the
  user would cost a token-verification round trip whose only purpose is a log line, and the
  GoTrue call we do make already records the session server-side. The log line says a sign-out
  happened, not whose.
- **No CSRF exposure.** This system carries no cookies — authorisation is a bearer token the
  browser attaches explicitly — so an unauthenticated `POST` is reachable only by someone who
  already holds the token, and someone holding the token can do strictly worse things than end
  the session. Abuse with random tokens inherits **US-001 open item 3** (no rate limit on the
  auth surface); it does not open a new one, and the no-token fast path in §2.1 keeps the
  cheapest version of it from reaching Supabase.
- **No timing concern.** Sign-out answers `204` for every input, so it is not an
  account-existence oracle and needs no equivalent of US-001's failure-delay floor.

### 2.3 Scope: `local`, not `global` — the one correction the adapter needs

`auth.adapter.ts` line 102 hardcodes the scope:

```ts
const { error } = await supabase().auth.admin.signOut(accessToken, 'global');
```

`global` is **correct for the caller it was written for** — US-001 refuses a deactivated
account, and REQ-005 means that account holds no working credential anywhere. It is **wrong for
sign-out.** Nothing in REQ-003 or the story asks to end sessions on devices the user is not
holding, and a person who signs out of the office desktop and finds themselves signed out on
their phone has been surprised by a side effect nobody specified. The story's own sentence is
*"the next person to use **this browser** cannot act as me."*

**Recommendation: make the scope an explicit argument at both call sites** —
`revokeSession(accessToken, scope)` on the `AuthAdapter` seam in `auth.service.ts`. One Supabase
call site, two callers that each state their intent where a reader can see it. A second method
(`endSession`) would hide the same decision behind a name, and a default would put the more
destructive behaviour one forgotten argument away.

**The second-tab edge case survives this choice**, and that is worth checking rather than
assuming: both tabs of one browser share **one** GoTrue session, so a `local` revoke ends the
session the other tab is using too. `local` narrows the blast radius across *devices*, not
across tabs. §5.

### 2.4 What US-002 does not build

- **No "you have been signed out" confirmation.** The story says BRD-001 does not ask for one.
- **No sign-out on SCR-004 or SCR-010.** Both specs promise the control (SCR-004 has a **Sign
  out** button in its content area; SCR-010 has a ghost link beneath the card). Neither screen
  exists. US-002 builds the mechanism and the shell's account menu; those two screens attach to
  it when they are built. §7.
- **No cross-tab broadcast, no session heartbeat, no token denylist.** §5.
- **No cold-boot session rehydration.** US-003's. §6.2 is deliberately the smallest change that
  makes this tab's token reach the server.

---

## 3. `libs/contracts` — nothing to add, and that is the answer

**No new schema. No new error code. The package is untouched.**

This is worth stating rather than leaving as an absence, because ADR-002's rule is "any new
request/response shape goes here first" and a reviewer will look for the file that did not
change.

- **No request schema** — there is no request body (§2.1).
- **No response schema** — `204` has no body. An empty object schema would describe nothing and
  would then have to be exported and maintained forever.
- **No new error code.** Walk the list: the route cannot return `invalid_request` (nothing to
  parse), `no_session` / `session_invalid` / `account_inactive` (§2.1 — all `204`),
  `password_change_required` (§2.2 — the gate is never reached), `admin_only` (not an admin
  route) or `service_unavailable` (a GoTrue failure is logged, not surfaced — §6.3). Only
  `internal_error` remains reachable, for our own defect, and it already exists.

**One standards row, not a contract change.** `ai/standards/api-standards.md`'s status table
stops at `201` on the success side. Add:

```
| `204`  | A state-changing request succeeded and has nothing to say                     |
```

Same treatment US-001 gave the `503` row: the table is the place a reviewer checks whether a
status was chosen or improvised.

---

## 4. AC-03 — plainly, what is the browser's and what is the server's

The story's QA note is the right instinct and the criterion is genuinely split. Said flatly:

| Half | Mechanism | Where it is proven |
| --- | --- | --- |
| *"they are returned to the sign-in screen"* | **Browser.** A client session guard on the shell's route element renders a redirect to `/sign-in` instead of the screen (§6.4) | component test |
| *"no personal or office data is shown"* | **Browser**, and it follows from the same guard: the screen component never mounts, so it never fetches | component test |
| *"the session no longer authorises anything — a subsequent request is refused"* (AC-02) | **Server.** The revoked session is refused by `requireSession` on the next request | API test (§10) |

**No new server mechanism is needed for AC-03, and none should be invented.** In particular
nothing server-rendered is load-bearing here, because nothing is server-rendered — this is a
client-routed SPA, and back navigation after a client-side navigation re-renders React
components rather than re-fetching a document.

**Back/forward cache: do not build for it.** bfcache restores a whole document, and sign-out
navigates within one. The path that could restore a signed-in document — leaving the origin
entirely and coming back — restores a tab whose in-memory auth state is gone and whose guard
therefore redirects. A `pageshow` / `event.persisted` listener would be machinery guarding a
route the mechanism already closes. If a reviewer asks for it, the honest answer is that it
protects nothing the guard does not.

**One cheap hardening, explicitly *not* required by AC-03.** Once real data screens exist
(US-010, US-013), a `GET /api/bookings` response with no cache directives is eligible for the
browser's heuristic cache, and a back navigation could paint stale personal data before the
guard redirects. `Cache-Control: no-store` on `/api/*` responses closes that for one line in
`app.ts`. **It is not this story's** — US-002 has only stub screens and nothing to leak — and it
should land with the first story that renders real data rather than be bolted on here where no
test can distinguish it from a no-op. Carried as an open item.

**Work already in flight** (the story's edge case, and explicitly `/architect`'s to answer):
**a request that is already past `requireSession` completes server-side.** We do not cancel it.
The alternative — a registry of in-flight requests the sign-out path aborts — is shared
machinery nobody asked for, and it would not help: the server has already accepted the work.
The browser drops the outcome because the screen that would show it has unmounted. That is
precisely the story's *"the in-flight request's outcome is not reported to the departed user"*,
and it needs no code to be true.

---

## 5. The second tab, and the one assumption this story rests on

**No cross-tab mechanism is invented.** The story says none is specified; this design adds
none. No `BroadcastChannel`, no `storage` event listener, no polling, no service-worker message.
The second tab keeps rendering what it has until it asks the server for something, and then it
is refused. That is the story's own sentence — *"the second tab is not required to react
immediately, but its next request must be refused rather than served"* — and it is satisfied by
the server, not by tab coordination.

**But "its next request is refused" is an assumption, not an established fact, and it is
load-bearing for AC-02 as well.**

Supabase access tokens are JWTs. Revoking a session revokes the **refresh** token; whether an
already-issued **access** token stops being honoured depends on whether the thing verifying it
checks the session behind it. Our verifier is `supabase().auth.getUser(accessToken)`
(`composition.ts` line 33) — a round trip to GoTrue, which is the *good* case, since a local
signature check would certainly still pass. Recent GoTrue validates the session claim inside the
JWT against its session table and refuses a token whose session is gone, which would make AC-02
true within one request. **I have not observed this on the installed version in this project,
and neither has anyone else in this repository.** Asserting it here would be exactly the kind of
thing that passes review and fails in use.

**Required before this story is called done** (a single manual check, not a build): sign in,
capture the access token, `POST /api/auth/sign-out`, then `GET /api/auth/session` with the
*same* access token. Paste the real output in the PR. If it returns the user rather than `401`,
AC-02 is **not met**, no test in §10 will have noticed, and the story needs one of:

- **a shorter access-token TTL** (a Supabase project setting — DevOps and the PO; it trades a
  window of validity against refresh frequency), or
- **a server-side revoked-session check** in `requireSession` — a protected-path change, new
  state, and a different story.

**I am not choosing between those here**, because the right answer depends on a measurement
nobody has taken. What this note does is make sure the measurement is taken before the PR is
merged rather than after a user reports it.

---

## 6. The browser side

### 6.1 AC-01 — the account menu

`AppShell` has a nav and an outlet and no account menu; SCR-002, SCR-004 and SCR-005 all name
`app-shell` as the component that owns one. US-002 builds it, because AC-01 is *"reachable from
every signed-in screen"* and the shell is the only thing every signed-in screen shares.

**Contents in US-002: Sign out, and nothing else.** SCR-002's component table lists Settings
beside it, and `/settings` does not exist. `routes.tsx` already carries the rule in its own
docblock — *"a route with no screen behind it is a 404 that looks like a bug"* — and a menu row
leading to one is the same bug with a nicer entrance. The Settings row arrives with the Settings
screen.

**Build it as a disclosure, not as `role="menu"`.** A real ARIA menu obliges arrow-key roving,
a roving tabindex or `aria-activedescendant`, typeahead and wrap-around — and a half-built one
is *worse* for a screen-reader user than no menu, because it announces affordances it does not
have. A `<button aria-expanded aria-controls>` revealing a short list of ordinary buttons is
fully keyboard-operable with none of that. AC-01 asks for *"present and operable by keyboard"*,
which this meets exactly.

- The trigger is a real `<button>` — reachable by Tab, activated by Enter and Space for free.
- `Escape` closes the menu and **returns focus to the trigger**.
- A click outside closes it, without stealing focus from wherever the user clicked.
- All values from `inception/design/tokens.css`; no literals.

**Confirm the pattern with UX before building**, since SCR-004 gives the account menu a
*current-page state* for Settings (`Nav=Employee-Settings`) that assumes rows behave like nav
items. Nothing in US-002 depends on the answer — one row, no current state — but the second row
will.

### 6.2 The token that is not currently being sent — read this first

```ts
// apps/ui/src/lib/auth/auth-context.tsx:44
// US-001 has no stored session to read yet; US-003 is the story that gives this a body.
getAccessToken: () => undefined,
```

**As the code stands, a sign-out request would carry no `Authorization` header, the server would
revoke nothing, answer `204`, and every client-side test would pass.** That is the precise
failure the story's QA note describes — *"a client-side-only sign-out that clears the interface
while leaving the session valid passes a naive UI test and fails the story"* — and it is
currently the default outcome, not a mistake someone has to make.

**Smallest fix that is honest: `AuthProvider` retains the access token it was already given.**
`signIn` receives `result.data.session`, hands it to `onSession` and drops it. Keep it in a ref
and point `getAccessToken` at that ref. No new storage, no new dependency, no rehydration.

**Scope discipline — read this as a boundary, not a suggestion.** This gives the token to
requests made *in this tab, in this session*. Reading a session back from storage on a cold boot
is **US-003's**, and building it here would be building an unplanned story inside this one.
After a reload there is no in-memory user, so the §6.4 guard redirects to sign-in and no request
needs a token. The two stories meet cleanly.

### 6.3 `signOut` on the auth context

The mechanism belongs on the context, not in the shell, because **SCR-010 needs sign-out with
no shell around it** (its spec: *"no navigation shell around it — the app shell appears only
once the password is the account holder's own"*). One mechanism, two call sites in time.

Order matters and is the easy thing to get backwards:

1. `POST /api/auth/sign-out` **first** — while the token is still available to send.
2. `supabaseBrowserClient.auth.signOut({ scope: 'local' })` — clears the stored session.
   **`{ scope: 'local' }` is required, not cosmetic**: the supabase-js default is `global`,
   which makes the *browser* call GoTrue directly. ADR-001 and ADR-003 keep GoTrue calls on the
   server, and this client's one permitted job is refreshing a token. The server has already
   done the revocation; `local` here means "forget what is in storage", which is all we want.
3. Clear `user` in the context.

**The browser proceeds to SCR-001 whatever the server answered.** A transport failure must not
strand the user on a signed-in screen: there is no ST-## for it, local state is cleared
regardless, and SCR-010's spec is explicit that an outage must never trap someone.
**Residual, named rather than buried:** if the sign-out request never reached the server, the
token remains valid until it expires even though no copy of it remains in the browser. The
exposure is limited to a token that was already exfiltrated, and the alternative — refusing to
let a user leave because our server is down — is worse.

### 6.4 The client session guard (AC-03)

`routes.tsx` today guards `/admin/bookings` with `RequireRole` and guards `/bookings` **with
nothing**. After sign-out, back-navigating to `/bookings` renders the shell with `user`
undefined. AC-03 needs that closed.

**Add `RequireSession` and wrap the shell route element**, so every screen inside the shell
inherits it:

```tsx
<Route element={<RequireSession><AppShell /></RequireSession>}>
```

This is the browser's echo of `app.ts`'s own rule — *"the admin guard mounts on the mount point,
never per route... every future admin route inherits it before it is written"*. Same reasoning,
same shape, one level up. Per-route client guards rot exactly as fast as per-route server ones.

`RequireRole` already redirects when `user` is undefined, so `RequireSession` is the same check
without the role half; keep them as two components rather than making `role` optional, so a
reader can tell which guarantee a route is claiming.

Navigation on sign-out replaces the current history entry rather than stacking on it. Deeper
entries are still reachable by repeated Back and are covered by the guard — which is why the
guard, not the replace, is the mechanism.

### 6.5 `api-client` cannot currently read a `204`

```ts
// apps/ui/src/lib/api-client.ts:63
body = await response.json();   // a 204 has no body -> throws -> { kind: 'unavailable' }
```

Every `204` this application ever returns would arrive at the screen as an outage. US-002 is the
first story to send one.

**Fix it in the layer, once.** US-001 set this precedent deliberately for the response-parse
decision (D-04, ADR-002 follow-up 3): the data-fetching layer is where "what did the server
mean?" is answered for all forty endpoints, not per screen. Add a sibling that shares the same
transport, timeout, abort and error mapping — `requestNoContent(path, init)` returning
`ApiResult<void>` — succeeding only on a genuinely empty `2xx` and mapping everything else
exactly as `request` does. DEV owns the factoring (extracting the shared send-and-map half is
the obvious one); what matters is that `request` keeps treating an unexpected empty body as
`unavailable`, since a `204` arriving where a schema was expected is still a contract violation.

*Rejected: return `200 {}` so the existing code path works.* It ships a meaningless body and an
empty schema in `libs/contracts` forever to avoid a small change in the one file whose job this
is, and the next `204` in the system hits the same wall.

---

## 7. AC-04 spans two stories — and what US-002 can actually prove

AC-04's *Given* is *"a user on **Set your password** (SCR-010)"*. **SCR-010 is US-004's screen
and does not exist.** US-002 cannot put a sign-out link on it, and should not create the screen
to hold one.

What US-002 **can** prove today — and both halves are the durable ones:

1. **The structural half.** A sign-out request succeeds for a token `requireSession` would
   refuse. Today's step 5 is empty, so a test written against `must_change_password = true`
   would pass **vacuously** and prove nothing. **Use the one refusal that already exists**: a
   token whose profile is inactive is refused by step 3 today. If sign-out still answers `204`
   for that token, the route demonstrably does not run the chain — which is the property AC-04
   will depend on when step 5 is filled in. A test that can fail today, protecting a criterion
   that arrives tomorrow.
2. **The credential half**, which is what RISK-009 actually cares about: *"the
   administrator-set password still works at the next sign-in, and the change is required
   again."* Fully provable now — sign in as an account with `must_change_password = true`, sign
   out, sign in again with the same password, and assert `200` with `mustChangePassword` still
   `true`. Sign-out must not rotate, invalidate or consume the credential, and this asserts it
   directly.

What must be carried into US-004: **the SCR-010 sign-out link, with a component test citing
`US-002/AC-04`.** Route it to the Manager as a delivery constraint on US-004, not as a comment
here. The `aidlc-check` gate is satisfied at US-002's merge — both tests above cite
`US-002/AC-04` — so this is a completeness obligation, not a blocked gate.

**Manifest gap.** `knowledge/traceability/manifest.json` lists US-002's screens as SCR-002,
SCR-004 and SCR-005. AC-04 happens on **SCR-010**, and the story's UI section does not mention
it either. Add SCR-010 to US-002's `screens[]`, or the trace says AC-04 has no screen.

---

## 8. No new ADR — and the test for why not

**I agree with the read that prompted this note: no ADR.** The test I apply is whether a
decision binds work beyond the story that made it, with a rejected alternative a future author
would otherwise re-litigate. This one does not:

- The **server-side termination primitive** is already accepted architecture. ADR-001 puts every
  Supabase call behind Express; ADR-003 makes Express the only thing that talks to GoTrue about
  credentials. Sign-out is those two decisions applied to a fourth verb, not a fifth position.
- The **contract package** pattern is ADR-002, and this story exercises it by adding nothing
  (§3). A decision that produces no change to the shared contract is not a contract decision.
- The **mount decision** (§2.2) is the one real trade-off here, and it is local and reversible:
  it governs one route, and reversing it would be a change to that route plus a middleware
  allowlist. It binds US-004 in exactly one way, which is why it is written down in a note
  US-004 will read and carried as an open item — not as project-wide guidance.

Two things *do* need editing, and neither is an ADR: `app-architecture.md` §5.1's "every route
except sign-in" sentence (§2.2), and `api-standards.md`'s status table (§3). Both are the same
kind of consequential edit ADR-003 made — keeping an existing document true, rather than adding
a new one.

**The honest counter-argument**, so you can weigh it: §2.2 sets a precedent — *"a route whose
purpose is to end authority is not subject to the authority chain"* — and precedents that are
not written as decisions get re-derived. If you expect more such routes, an ADR is cheap. I do
not: sign-out is the only one among the forty endpoints this BRD describes.

---

## 9. File placement

**New**

```
apps/ui/src/components/app-shell/AccountMenu.tsx (+ account-menu.css, + AccountMenu.spec.tsx)
                                                  <- shell-private; SCR-002/004/005 name
                                                     `app-shell` as the owning component
apps/ui/src/lib/auth/require-session.tsx (+ .spec.tsx)    <- AC-03's client half
```

**Modified**

```
apps/api/src/modules/auth/auth.adapter.ts      revokeSession takes an explicit scope (§2.3)
apps/api/src/modules/auth/auth.service.ts      + signOut(accessToken); AuthAdapter signature
apps/api/src/modules/auth/auth.router.ts       + POST /sign-out, outside requireSession (§2.2)
apps/api/src/modules/auth/auth.routes.spec.ts  + the sign-out describe block (§10)
apps/api/src/modules/auth/auth.service.spec.ts + scope is `local` for sign-out, `global` for
                                                 the US-001 refusal path

apps/ui/src/lib/auth/auth-context.tsx          + signOut; retain the access token (§6.2, §6.3)
apps/ui/src/lib/api-client.ts                  + requestNoContent (§6.5) — Complex surface:
                                                 this is the data-fetching layer
apps/ui/src/components/app-shell/AppShell.tsx  + the account menu (AC-01)
apps/ui/src/components/app-shell/AppShell.spec.tsx
apps/ui/src/routes.tsx                         wrap the shell element in RequireSession

ai/standards/api-standards.md                    + the 204 row (§3)
inception/architecture/app-architecture.md §5.1  sign-out is exempt from the chain (§2.2)
apps/api/src/http/middleware/require-session.ts  step 5's comment, optional (§2.2)
inception/specs/index.md                         the US-002 row
knowledge/traceability/manifest.json             US-002 tests[]; + SCR-010 in screens[] (§7)
```

**Not modified, and worth saying so:**

- **`libs/contracts/**`** — §3. The API-impacts question resolves to "no contract change".
- **`apps/api/src/composition.ts`** — the route joins the already-wired `authRouter` and needs
  no new dependency. There is nothing to wire.
- **`apps/api/src/http/app.ts`** — `/api/auth` is already mounted unguarded, which is exactly
  the mount §2.2 wants.
- **`supabase/migrations/**`** — sign-out stores nothing and stamps nothing.

Three of those four are protected paths. A story that ends sessions without touching the schema,
the contract or the auth chain is the shape to aim for, and it is the payoff of §2.2.

---

## 10. Test placement summary

QA's flag is the organising constraint: **AC-02 and AC-03 need a real server-response
assertion, and AC-04 needs the forced-password-change scenario.** A client-only sign-out test is
the trap the story names.

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `AccountMenu.spec.tsx` / `AppShell.spec.tsx` — the action is present and reachable by keyboard from the shell; `Escape` returns focus to the trigger | component |
| **AC-02** | `auth.routes.spec.ts` — **the server-response sequence below** | **API — a UI test is not the proof** |
| AC-02 | `auth-context` test — the sign-out request **carried the bearer token** (§6.2's failure mode) | component |
| AC-03 | `require-session.spec.tsx` plus a routing test: after sign-out, rendering a shell route redirects to `/sign-in` and the screen component never mounts | component |
| AC-03 | the same API sequence as AC-02 — the server half of *"no data is shown"* | API |
| **AC-04** | `auth.routes.spec.ts` — sign-out answers `204` for a token `requireSession` refuses (§7.1); and the administrator-set password still signs in, still `mustChangePassword: true` (§7.2) | **API** |
| AC-04 | the SCR-010 link — **US-004's PR**, citing `US-002/AC-04` (§7) | deferred, tracked |

**The AC-02 assertion, concretely**, because "assert against the server's response" has a right
and a wrong shape and the wrong one looks identical in a diff.

`auth.routes.spec.ts` already builds the real app over stubs, with `tokens: Record<token,
userId>` behind the verifier and a `revoked: string[]` the stub adapter pushes to. **Do not
assert against `revoked`** — `ai/standards/testing-standards.md` bans asserting the mock, and
"the adapter was called" is not "the session no longer authorises anything".

Instead, make the stub adapter's `revokeSession` **delete the token from the `tokens` map the
verifier reads**. The stub then models the one behaviour that matters, and the test becomes a
sequence of real requests against the real `createApp`:

```
POST /api/auth/sign-in   -> 200, access token T
GET  /api/auth/session   with T -> 200            (the session authorises something)
POST /api/auth/sign-out  with T -> 204
GET  /api/auth/session   with T -> 401            (it no longer does)   <- AC-02
```

That is the criterion's own sentence executed, at the level the criterion lives at. It is also
the shape the second-tab edge case needs — the same token, a second request, refused.

**And it does not close §5.** This proves *our* chain refuses a session our adapter revoked.
Whether real GoTrue refuses a real access token after a real revoke is the empirical question,
and the pasted manual check in the PR is its evidence. Green tests here plus a missing check
there is the exact combination that ships a sign-out that does not sign anyone out.

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§5** — does `getUser()` refuse an access token whose session was revoked, on the installed GoTrue? Manual check, output pasted in the PR | DEV → Joy Joshua | **AC-02 being true** |
| 2 | If item 1 is false: a shorter access-token TTL, or a server-side revoked-session check (a different story) | Joy Joshua / DevOps / PO | AC-02 |
| 3 | **§2.1** — always-`204` vs `401` on a missing `Authorization` header. Both defensible; I recommend `204` plus the warning log | Joy Joshua | nothing |
| 4 | **§2.3** — `local` scope for sign-out, `global` kept for US-001's refusal path. Confirm nobody expects "sign me out everywhere" | Joy Joshua / PO | nothing |
| 5 | **§7** — AC-04's SCR-010 link is US-004's, with a test citing `US-002/AC-04` | Manager → US-004 | US-004's definition of done |
| 6 | **§7** — add SCR-010 to US-002's `screens[]` in the manifest; the story's UI section omits it too | DEV / `/ba` | nothing |
| 7 | **§6.1** — confirm the disclosure pattern (not `role="menu"`), and that the menu carries Sign out alone until Settings exists | `/ux` | nothing |
| 8 | **§4** — `Cache-Control: no-store` on `/api/*`, with the first story that renders real data (US-010 / US-013) | Architect / DEV | nothing |
| 9 | **§2.2** — `app-architecture.md` §5.1's "every route except sign-in" sentence needs its second exception | DEV, in this PR | nothing |
| 10 | US-001 open item 3 (no rate limit on the auth surface) now covers a second unauthenticated route; the gap is unchanged, its surface is wider | Joy Joshua / PO | **Gate 3** |

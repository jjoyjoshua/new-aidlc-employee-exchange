# US-003 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-003 — Stay signed in for 30 days](../../stories/user-stories/US-003-thirty-day-session.md) |
| **Screen**   | [SCR-001](../../design/screens/SCR-001-sign-in.md) **ST-01 only** — AC-03's destination and AC-05's absent control. The story adds no state and builds no screen |
| **Tier**     | Complex — three protected paths (see §0)                                 |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-003](../../../knowledge/decisions/ADR-003-express-mediated-sign-in.md) — **no new ADR** (§8) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is
argued before the code, not in a review thread. `decisions.md` in this package stays DEV's.

The story hands one thing to `/architect` by name: *"Needs session lifetime and sliding renewal
to be configuration, not a literal. Mechanism is `/architect`'s to settle."* US-001 left the
place for it as a named, empty seam — `require-session.ts` step 4, lines 75–78 — and both
[`db-design.md` §1.1](../../architecture/db-design.md) and
[`app-architecture.md` §5.1](../../architecture/app-architecture.md) already state the *rule*.
What nobody has written down is the **arithmetic**: what is compared against what, in which
order, with which clock, and what the hourly throttle does to the answer. That is §2, and it is
the reason this note exists.

---

## 0. The tiering

**Complex**, on three protected paths from `ai/standards/task-surfaces.md` and two more surfaces:

- **`apps/api/src/http/middleware/**`** — the auth chain itself. Step 4 stops being a comment.
- **`libs/contracts/**`** — `session_expired` **does not exist yet** (§4). The chain's docblock
  and four documents name it; the enum does not contain it.
- **`apps/api/src/config/**`** — the startup validator gains two keys (§3).
- **Server:** "a newly required config value" and "anything touching the middleware chain".
- **Browser:** "a new or changed slice of shared/global state" and "token handling in the
  browser" — `AuthProvider` gains a boot phase (§5). This is the cold-boot rehydration
  [US-002 §6.2](../US-002-sign-out/design-note.md) deferred here by name.

**What it is *not*.** No migration (§7). No new route. No change to any response body — the only
wire change is one new string in an error enum. No change to `apps/ui`'s screens: AC-05 is
satisfied by what is already there and needs an assertion, not a component (§6.2).

**One thing the story's framing understates**, and it changes the plan: **the premise that
`last_seen_at` is stamped on every request is false today.** §1. US-003 builds the stamping as
well as the comparison, and a plan written on the other assumption will be short by a repository
method, a service method and a clock.

---

## 1. Check the premise first: nothing stamps `last_seen_at` on a request today

`require-session.ts`'s own docblock (line 13) says, under step 3, *"Stamp `last_seen_at`."*
The code does not. Step 3 is one call — `service.currentUser(userId)` (line 69) — and
`currentUser` (`auth.service.ts` lines 128–131) does a `findById` and nothing else.

The only caller of `profiles.stampLastSeen` is `attemptSignIn` (`auth.service.ts` line 122).
**`last_seen_at` is written at sign-in and never again.** US-001's own spec agrees and is the
more honest of the two records: `inception/specs/US-001-sign-in/spec.md` FR-18 is marked
**`not started`**.

```
$ grep -rn "stampLastSeen" apps/api/src --include=*.ts
apps/api/src/modules/auth/auth.service.ts:122:      await profiles.stampLastSeen(profile.id);
apps/api/src/modules/auth/auth.repository.ts:25:  stampLastSeen(id: string): Promise<void>;
apps/api/src/modules/auth/auth.repository.ts:45:  async stampLastSeen(id) {
```

Three consequences for this story, none of them optional:

1. **US-003 owns the write, not only the comparison.** "Otherwise refresh it, throttled to once
   an hour" is net-new behaviour, not a throttle added to an existing write.
2. **Without it, AC-02 fails outright and the failure is silent.** The 30 days would run from
   *sign-in*, which is precisely what AC-02 says they must not do — and every test that only
   checks "a 31-day-old session is refused" would still pass.
3. **FR-18 closes here.** It is carried in US-001's spec as unfinished; US-003's traceability
   should say so rather than leaving a requirement recorded as `implemented` in one file
   (`US-001-sign-in/traceability.md` line 45) and `not started` in another.

---

## 2. The mechanism

### 2.1 The rule is two pure predicates in `domain/`

`api-standards.md` names this case explicitly: *"Requirement-level rules — **the 30-day
window**, the weekday rule, the desk-number format — are not edge concerns. They live in
`domain/` and are called by the service."* `eslint.config.mjs` Boundary 2 enforces it, down to
banning `Date.now` inside `domain/`.

`apps/api/src/domain/session-lifetime.ts`:

```ts
/** NFR-009. Also the ceiling: RISK-010 was accepted for 30 days, not for more (§3). */
export const SESSION_LIFETIME_DAYS = 30;
/** db-design.md §1.1 — "a write per read" is the thing this avoids (§2.2). */
export const LAST_SEEN_THROTTLE_MINUTES = 60;

/** AC-01, AC-03. Expired when the gap exceeds the lifetime — 30 days exactly is still alive. */
export function isSessionExpired(lastSeenAtMs: number, nowMs: number, lifetimeMs: number): boolean {
  return nowMs - lastSeenAtMs > lifetimeMs;
}

/** AC-02. The throttle: rewrite only once the stored value is older than the interval. */
export function shouldStampLastSeen(lastSeenAtMs: number, nowMs: number, throttleMs: number): boolean {
  return nowMs - lastSeenAtMs >= throttleMs;
}
```

Every input is an argument, including the clock reading — the shape `remainingDelayMs` already
has (`domain/sign-in-failure-delay.ts` line 42), and the reason the QA note's *"test them against
an injectable clock"* costs nothing here: both criteria are provable at any boundary date with
no database, no app and no fake timers.

**Two predicates, not one function returning a verdict enum.** They answer two different
questions — *may this session act?* and *is it worth a write?* — and the second is a cost
decision that will be tuned without touching the first.

**`>` and `>=`, deliberately, and they differ.** Expiry is strictly greater: *"a session lasts
30 days"* (AC-01) reads as 30 days being inside the window, and no AC lands on the boundary.
The throttle is `>=` because there is no meaning to defend at its edge and the inclusive form
makes a throttle of zero mean "write every time", which is what a reader expects from that
value. **A negative gap** — `last_seen_at` in the future, which clock skew between Postgres's
`now()` default and the Node process can produce — is never expired and never re-stamped by
either predicate. That is the safe direction for both, and it falls out of the comparison rather
than being a special case anyone has to write.

### 2.2 The crux: expiry compares against the *throttled* value, and that is correct

This is the question the story leaves open, and the one a reviewer should check hardest: if
`last_seen_at` is only rewritten once an hour, is the expiry check comparing against a lie?

**It is comparing against a value that is stale by a bounded amount, and the bound is the
throttle interval.** Work it through. Let `W` be the instant of the last write and `L` the
user's true last use. No write has happened since `W`, so every request after `W` found
`now - W < throttle` — which means every such request happened before `W + throttle`.
Therefore:

```
W  <=  L  <  W + throttle          i.e.   0 <= L - last_seen_at < throttle
```

`last_seen_at` **understates** true last use, never overstates it. So the effective session
length sits in `(lifetime - throttle, lifetime]`: with the defaults, between 29 days 23 hours
and 30 days. The error is one-sided, always in the direction of expiring *earlier*, and it is
**1/720 of the window — 0.139%**.

`db-design.md` §1.1 already accepted this trade explicitly: *"Writing it on every request would
be a write per read, so it is throttled... The window is 30 days; an hour of imprecision is
immaterial."* This note adds the bound that sentence asserts without stating, and checks it
against the ACs:

| AC | Distance from the boundary | Margin, in throttle intervals |
| --- | --- | --- |
| AC-01 — 29 days, used since | 1 day inside | 24x |
| AC-02 — daily use over 40 days | always at most 1 day old | 24x |
| AC-03 — 31 days unused | 1 day outside | 24x |

**No AC lies within the imprecision, and no second column, cache or timestamp is needed.**
The answer to "does the expiry check need its own tracking?" is **no**: the throttled
`last_seen_at` *is* the comparison basis, and the throttle's only cost is that a session can
expire up to one hour early after a month of disuse.

*Rejected: write `last_seen_at` on every authenticated request.* It is exact, and it turns every
`GET` in the system into a read plus a write — a second round trip on the hot path of every
request, forever, to remove a 0.139% error nobody can perceive. `db-design.md` decided this
before any code existed; nothing has changed to reopen it.

*Rejected: a second column — `session_started_at`, or a `last_activity_at` written every time.*
New schema, a new migration and a second value that can disagree with the first, bought to fix
an error smaller than the clock skew between two machines.

*Rejected: an in-process cache of true last-use times.* It makes the guarantee a property of one
server process, so it evaporates on restart and is wrong the moment there are two instances.

### 2.3 Order: expire before you renew

The single easiest bug to write in this story:

```
  read last_seen_at   (already loaded by step 3 — no extra query, §2.6)
  now = nowMs()       (one reading, §2.4)
1 isSessionExpired(last_seen_at, now, lifetime)    -> 401 session_expired, and DO NOT stamp
2 shouldStampLastSeen(last_seen_at, now, throttle) -> stamp
3 next()
```

**Stamping before comparing resurrects exactly the session the rule exists to kill**, and it
does it silently: the 31-day-old session in AC-03 would have its `last_seen_at` set to *now* by
the very request that should have refused it, pass the comparison, and never expire again. No
test that checks a single request catches that — the first request looks fine and the session is
already immortal. Write the expiry test as *two* requests where possible (§10).

**A refused request is not a use.** Step 4's `401` must leave the column untouched, which also
means a stream of requests from a dead session cannot keep the row warm.

### 2.4 One clock reading per request, and the caller supplies it

`profileRepository.stampLastSeen` reads the clock itself today:

```ts
// apps/api/src/modules/auth/auth.repository.ts:48
.update({ last_seen_at: new Date().toISOString() })
```

**Change it to `stampLastSeen(id: string, at: Date)`.** Two reasons, and the first is a rule
this codebase already applies: `attemptSignIn`'s comment says *"The clock is read **once** per
rejection. Reading it twice... would let the two readings drift apart."* Here the drift is worse
than cosmetic — the value compared and the value written would come from two different readings,
so a session could be judged against one instant and stamped with another. Second, a clock
inside a repository is a clock no test can fix, and AC-02 is a test about what gets written.

**Which clock seam?** `composition.ts` line 49 already builds **one** `nowMs: () => number` and
threads it into the service and the router. Thread the same one into `requireSession`'s deps.
`infra/clock`'s `Clock` and `fixedClock` exist and are the nicer interface, but picking them here
would give the application two sources of "now" wired side by side in one composition root —
and `buildApp` already exposes `nowMs` as an override, which is the seam the API tests need.
**Recommendation: `nowMs`, for consistency; say so if you would rather migrate everything to
`Clock` in a separate change.**

`last_seen_at` arrives from PostgREST as an ISO string. Parse it once at the repository edge into
the row type, so the middleware compares numbers and never a string.

### 2.5 A failed stamp must not fail the request — and concurrent stamps need no lock

`stampLastSeen` throws on error today (`auth.repository.ts` line 51), which is right for sign-in
and wrong here. A transient write failure on a renewal would turn a perfectly good authenticated
request into a `500`.

**Await it, catch it, log it at `warn`, continue.** Awaiting keeps the ordering deterministic for
tests and costs a round trip at most once per user per hour. The consequence of a lost stamp is
at most one throttle interval of un-renewed session, and the next request retries it. This is the
same device `attemptSignIn` uses for a failed revoke — a catch plus a log line — and the log
matters for the same reason: **a persistently failing stamp expires every user in the system
after 30 days**, and one warn line is the difference between noticing that on a dashboard and
noticing it in a support queue.

**Two concurrent requests may both decide to stamp.** Both write nearly the same instant, last
write wins, and the row is correct either way. No lock and no conditional update guard: the write
is idempotent in effect, and the guard would buy nothing but a second way to be wrong.

### 2.6 What step 4 needs that step 3 cannot give it today

`last_seen_at` is not in `COLUMNS` (`auth.repository.ts` line 21), not in `UserProfileRow`, and
could not cross `currentUser` anyway: that method returns `AuthenticatedUser`, a **contract
type**, and putting a server-side timestamp on the wire is data exposure with no requirement
behind it (`security-standards.md` — *"responses are explicit allowlists"*).

**Recommended shape:**

- `UserProfileRow` gains `last_seen_at: string`; `COLUMNS` gains the column. Same query, same
  primary-key lookup, one more field — **no extra round trip, and no index needed**.
- `AuthService.currentUser` becomes
  `loadSession(userId): Promise<{ user: AuthenticatedUser; lastSeenAtMs: number } | undefined>`.
  The middleware is its only caller — `GET /session` reads `req.user`, which step 6 has already
  attached — so this is a one-call-site change, and `currentUser` is the wrong name for something
  that now also reports the session's age.
- `AuthService` gains `markSeen(userId: string, at: Date): Promise<void>` wrapping the repository
  call with §2.5's catch-and-log. The middleware stays what it is — a chain of decisions — and the
  I/O stays in the service.

*Rejected: widening `AuthenticatedUser` with `lastSeenAt`.* A `libs/contracts` change that ships a
server-side timestamp to every browser to save one destructuring.

*Rejected: a second `findById` for the timestamp.* Two queries per request to avoid renaming one
method.

---

## 3. Configuration — where the 30 days and the hour live

Two new keys, **both optional, both defaulted, and the default is the requirement**:

| Key | Type | Default | Bounds | Why it is configurable |
| --- | --- | --- | --- | --- |
| `SESSION_LIFETIME_DAYS` | integer | `30` | `1..30` | NFR-009's window. Shortening it is a real incident lever; lengthening it past 30 is not an operator's decision (see (c)) |
| `SESSION_LAST_SEEN_THROTTLE_MINUTES` | integer | `60` | `1..1440` | A **cost** knob, not a requirement — how much write traffic the renewal is worth |

**Read in `apps/api/src/config/index.ts`**, the only module permitted to touch `process.env`,
validated with the rest at startup. Documented by name in `.env.example` under a new
`# ---- Session (NFR-009) ----` heading.

**Converted to milliseconds once, in `composition.ts`**, and injected into `requireSession`'s
deps — exactly how `floorMs` reaches the service today (`composition.ts` line 55):

```ts
const sessionLifetimeMs = config().SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
const lastSeenThrottleMs = config().SESSION_LAST_SEEN_THROTTLE_MINUTES * 60 * 1000;
```

`buildApp` gains `sessionLifetimeMs?` and `lastSeenThrottleMs?` overrides. **That injection
point, not the environment, is the test seam** — which is how the QA note's *"make the 30 days a
configuration value so the test can shorten it"* is satisfied without fractional days in an
`.env` file. An API test passes `sessionLifetimeMs: 50`.

*Rejected: keeping the env value in days but storing milliseconds under the same key name.*
`CORS_ORIGINS` changes type in its transform, not its unit; a field called `..._DAYS` holding
`2592000000` is a trap.

**Three decisions inside that table worth defending separately:**

**(a) Defaulted, not required.** `OFFICE_TIMEZONE` deliberately has no default because a *wrong*
default (UTC) is the named failure case of BR-001.14. Here the correct value is the requirement
itself, known, and identical in every environment. A required key would break every existing
deployment and every developer's `.env` on the day this merges, to make them retype `30`. **So
this story adds no newly *required* configuration** — the `task-surfaces.md` Complex trigger is
the config module changing at all, which it does.

**(b) The `30` is one constant, in `domain/`, imported by the config schema.**
`SESSION_LIFETIME_DAYS` from `domain/session-lifetime.ts` (§2.1) serves as both `.max()` and
`.default()`, so NFR-009's number appears once in the codebase. `eslint.config.mjs` Boundary 2
bans `domain/` importing `config/`; the reverse direction is unrestricted and is the direction
that makes sense — `domain/` still depends on nothing.

**(c) The ceiling at 30 is the one opinionated part.** An operator can shorten the window during
an incident; they cannot lengthen it, because the 30 days are what the PO accepted RISK-010
against on 2026-09-07, and a longer window is a re-decision rather than a deployment. It costs
one `.max()`. *If you think that is over-reach, drop it* — it is the single most droppable
recommendation in this note, and `security-standards.md`'s *"config validation is a security
control"* is the only thing arguing for it.

**Cross-field check, and this one is not droppable:** refuse to start when
`throttle >= lifetime`. At that setting `last_seen_at` is never refreshed before the session
expires, so **AC-02 stops holding entirely and sliding renewal silently becomes a fixed
30-days-from-sign-in window** — the exact behaviour AC-02 forbids, reachable by a plausible typo
(`SESSION_LAST_SEEN_THROTTLE_MINUTES=43200`). A `superRefine` on the schema turns that into a
process that will not boot, which is what this module is for.

---

## 4. `session_expired` is named everywhere except in the contract

`require-session.ts` line 14, `app-architecture.md` §5.1, `security-standards.md`,
`middleware/README.md` and US-001's own design note all say step 4 answers `401 session_expired`.
**The enum does not contain it:**

```ts
// libs/contracts/src/error.ts:10-23
export const errorCodeSchema = z.enum([
  'invalid_request', 'invalid_credentials', 'no_session', 'session_invalid',
  'account_inactive', 'admin_only', 'password_change_required',
  'route_not_found', 'service_unavailable', 'internal_error',
]);
```

**Add `'session_expired'` to `errorCodeSchema`**, between `session_invalid` and
`account_inactive`. `libs/contracts` is a protected path; this is the whole of US-003's wire
change. The status is **`401`** via the existing `unauthorized(...)` helper —
`api-standards.md`'s table already reads *"`401` — No session, **expired session**, inactive
account"*, so no standards row is added and no document needs editing. The message is the one
SCR-001 ST-01 already expects: *"Your session has ended. Sign in again."*

**A fourth 401 code, so the docblock's "three distinct 401 codes" (line 18) becomes four.**
Keeping it distinct rather than reusing `session_invalid` is what that docblock already argued
for, and US-003 is the story it named: the browser treats all four identically (SCR-001 ST-01),
but an operator triaging *"users are being signed out"* needs to tell a 30-day idle expiry from a
token Supabase refused from a deactivated account. Collapsing them now would mean widening the
contract later. Update that line's count in the same PR — it is a comment that becomes false.

**The browser must not switch on it for anything but telemetry.** `api-client.ts` maps every
`4xx` through `readErrorBody` into `{ kind: 'error', code }`; §5 handles **any** `401` the same
way, because `no_session`, `session_invalid`, `account_inactive` and `session_expired` all mean
"this token is finished" to a screen.

---

## 5. The browser: AC-01 and AC-03 are about **opening the application**

Both criteria say *"when they open the application"*. That is a cold boot, and today a cold boot
signs the user out no matter how fresh their session is:

```ts
// apps/ui/src/lib/auth/auth-context.tsx:73-75
// The access token for the life of this tab, and nothing more durable than that (US-002/§6.2).
// Reading a session back from storage on a cold boot is US-003's; after a reload this ref is
// empty, there is no in-memory `user`, and `RequireSession` already redirects to sign-in.
```

**As things stand, AC-01 fails on a reload and AC-03 "passes" for the wrong reason** — every
session, 29 days old or 29 seconds old, lands on SCR-001. US-002 named this and handed it here;
it is the second half of US-003 and it is not optional.

### 5.1 The boot sequence

`supabaseBrowserClient` is `createClient(url, anonKey)` with default options, so supabase-js is
**already** persisting the session US-001 handed it via `setSession` and **already** refreshing
the access token. Nothing new is stored; what is missing is reading it back.

On `AuthProvider` mount:

1. `const { data } = await supabaseBrowserClient.auth.getSession()` — returns the stored session,
   refreshing the access token first if it has expired. No session, so: signed out.
2. Put the access token in `accessTokenRef` and call **`GET /api/auth/session`**.
3. `200` — `setUser(data.user)`, signed in. The user never saw a password prompt (AC-01).
4. `401`, any code — clear the ref, `await supabaseBrowserClient.auth.signOut({ scope: 'local' })`
   so a dead session is not retried on every boot, leave `user` undefined. `RequireSession`
   redirects to `/sign-in` (AC-03).
5. `unavailable` — **do not** clear the stored session. An outage is not an expiry, and discarding
   a valid 30-day session because the server was briefly unreachable would sign people out for the
   one reason NFR-009 exists to prevent. Render SCR-001; the next boot retries.

**`GET /api/auth/session` is exactly the route this needs**, and its docblock already says so:
*"AC-03 is a direct address request: the user types `/admin/bookings`, the app boots cold with a
stored token and must decide what to render. It cannot decide from localStorage, which is
client-controlled, and it must not decide from a JWT claim."* The role comes from the table.

**A pleasing consequence: the boot request is both the check and the renewal.** It runs the whole
chain, so opening the application expires a dead session (AC-03) and re-stamps a live one (AC-02)
in one round trip. No client-side date arithmetic exists anywhere in this story, and none should
be added — the browser must never decide whether a session is expired.

### 5.2 The boot state is load-bearing, and it is where this gets broken

`RequireSession` renders `<Navigate to="/sign-in" replace />` the moment `user` is undefined
(`require-session.tsx` line 24). During steps 1–2 above, `user` **is** undefined.

**Without an explicit boot state, every cold boot redirects to sign-in before the rehydration
finishes, and AC-01 fails in the way that looks like a flicker rather than a bug.**

`AuthContextValue` gains `status: 'booting' | 'signedIn' | 'signedOut'`, and `RequireSession`
renders nothing (or SCR-001's existing loading treatment) while `status === 'booting'` instead of
navigating. `status` is derived, not a second source of truth — `signedIn` is exactly
`user !== undefined` once booting is over.

**This is the Complex surface in `apps/ui`**: a changed slice of shared global state, consumed by
`RequireSession`, `RequireRole` and the shell. Note that `RequireRole` has the same
undefined-user redirect and inherits the fix only if it is also made boot-aware, or only ever
mounted inside `RequireSession` — which it is today (`routes.tsx` lines 29–45), so **no change to
`RequireRole` is required**. Say so in the PR rather than leaving a reviewer to check.

### 5.3 What the browser does *not* get

- **No client-side expiry countdown, no session timer, no idle detector.** The server decides.
- **No re-fetch of `GET /api/auth/session` on focus or on an interval.** REQ-036's
  refresh-on-focus is a property of the data-fetching layer, set once, and **nothing built in
  US-003 should turn it on** — see open item 4, which is a real consequence of sliding renewal
  and not a footnote.
- **No "your session expired" toast.** No ST-## specifies one; SCR-001 ST-01 is the whole of
  AC-03's user-visible behaviour.

---

## 6. AC-04 and AC-05, honestly

### 6.1 AC-04 asks about three stories that do not exist

*"When the user cancels a booking (US-011), books a desk (US-007), or changes their notification
setting (US-031) — then no password prompt or re-authentication step appears."* None of those
three exist, and `aidlc-check` still requires a passing test citing `US-003/AC-04` when this PR
merges. The temptation is a vacuous test.

**What is actually provable today, and is the durable form of the criterion:**

1. **Structural.** There is exactly one place in the server that can issue an authentication
   challenge — `requireSession` — and within the window it issues none. An API test that makes a
   sequence of authenticated requests at simulated day 1, day 15 and day 29 and asserts every one
   is `200` (never `401`, never `403`) proves that the only mechanism that could interrupt a user
   does not. That is what the QA note means by *"assert no authentication challenge is issued on
   those request paths"*, and it can fail today.
2. **Against real routes only.** The sequence uses whatever authenticated route exists — today
   that is `GET /api/auth/session`; `POST /api/auth/sign-out` is mounted *outside* the chain and
   proves nothing here. **Do not invent a route to test against.**

**What must be carried into US-007 / US-011 / US-031:** nothing new to build — those stories
inherit the chain — but their PRs are where AC-04 becomes true of the named flows. Route it to
the Manager as a completeness note, the way [US-002 §7](../US-002-sign-out/design-note.md) routed
AC-04's SCR-010 link. The gate is satisfied at this merge.

**One genuine re-authentication exists in this system and is not a counter-example:** US-004's
V-15 attempts a sign-in with the *candidate* password to prove it differs from the
administrator-set one (`security-standards.md`). That is a server-side comparison inside a
password change the user already asked for, not a prompt. Name it in the PR so nobody
"discovers" it as a violation of AC-04 later.

### 6.2 AC-05 needs zero backend change and touches no component

Confirmed against the code and the spec:

```
$ grep -rni "remember|keep me" apps/ui/src
(no matches)
```

`SCR-001-sign-in.md` line 124 lists *"No 'remember me' control"* as a **structural decision**,
with the rejected alternatives recorded, and line 137 resolves the open question that produced
NFR-009. There is nothing to build and nothing to remove.

**One assertion in `apps/ui/src/screens/sign-in/SignIn.spec.tsx`**, citing `US-003/AC-05`,
querying for `/remember|keep me signed in|stay signed in/i` and expecting nothing. Its entire
value is as a **regression guard** — it stops a well-meaning developer adding the control back,
which is precisely what the QA note says. The design does not otherwise touch `apps/ui`'s
screens; §5's changes are in `lib/auth`, not in a screen folder.

---

## 7. No migration, and here is the confirmation

`last_seen_at` already exists, with the right type, not-null and defaulted:

```sql
-- supabase/migrations/0001_user_profiles.sql:39
last_seen_at          timestamptz not null default now(),
```

US-003 reads it and writes it. It adds no column, no constraint, no default and no index — the
only access is by primary key, which the table's own PK already serves.
**`supabase/migrations/**` is untouched**, and a reviewer should expect to find no file there,
which is why this section exists at all.

Worth stating because it is the other thing a reviewer will look for: **no index on
`last_seen_at` is needed and none should be added.** Nothing queries *by* last-seen; there is no
sweep job, no "expire idle sessions" batch, and no story asking for one. Expiry is evaluated
lazily, on the request that would have used the session, which is why this story needs no
scheduled work at all.

---

## 8. No new ADR — and the test for why not

**No ADR.** The test I apply is the one US-002 used: does a decision bind work beyond the story
that made it, with a rejected alternative a future author would otherwise re-litigate?

The one candidate is real and worth naming rather than skipping: **we enforce idle expiry
ourselves, from a column we own, instead of configuring Supabase Auth's own session timeout.**
Someone will ask. But it is **already decided and already written down**, in the Gate 1
architecture deliverable, with its rejected alternative and its reason
(`db-design.md` §1.1, *"Why `last_seen_at` is ours too"*):

> Supabase's own inactivity timeout is a project setting on paid plans; depending on it would
> make an approved requirement a function of the billing tier.

That is a decision record in the place this framework puts them before delivery starts. Writing
an ADR now would be transcribing an existing decision into a second document, and the charter is
explicit that the architecture deliverable is a starting shape that later artefacts realise
rather than duplicate. The rest of this note is arithmetic (§2), a config key shape (§3), one
enum entry (§4) and a boot sequence (§5) — none of which binds anything beyond US-003.

**It also rests cleanly on the three ADRs rather than bending them.** ADR-001 and ADR-003 make
Express the thing that decides what a token permits; a 30-day idle rule is that decision applied
to *time* — the fifth verb rather than a fifth position. ADR-002 is exercised by adding one string
to the shared enum, which is the package working as designed, not a contract decision.

**The honest counter-argument, so you can weigh it.** Our expiry is enforced **at our boundary
only**. A session we have expired still holds a live GoTrue refresh token: the browser can keep
minting access tokens, and every one of them is refused by step 4. That is correct behaviour and
costs nothing, but it means "expired" is our word, not Supabase's — and if the team later decides
it wants defence in depth (a GoTrue-side timebox, so a stolen refresh token is dead even if our
middleware is bypassed), **that** is a real trade-off spanning DevOps, the billing tier and this
chain, and it deserves an ADR in the story that does it. It is not this story: nothing in NFR-009
or US-003 asks for it, and building it here would be building an unplanned story inside this one.
Carried as open item 3.

**Nothing to edit elsewhere, and that is unusual enough to state.** Unlike US-002 — which had to
correct `app-architecture.md` §5.1 and add a row to `api-standards.md` — every document that
describes this behaviour already describes it correctly: `app-architecture.md` §5.1 step 3,
`security-standards.md` §"Every other route" step 3, `middleware/README.md` step 3,
`db-design.md` §1.1, and `api-standards.md`'s `401` row. US-003 makes four documents true rather
than changing any of them. The two comments that *do* need editing are in code: step 4's seam
itself, and the "three distinct 401 codes" count (§4).

---

## 9. File placement

**New**

```
apps/api/src/domain/session-lifetime.ts (+ .spec.ts)   <- the two predicates and the two
                                                          constants (§2.1). Pure; provable at
                                                          any boundary date with no app
```

**Modified**

```
libs/contracts/src/error.ts                    + 'session_expired' in errorCodeSchema (§4)
                                                 <- protected path

apps/api/src/config/index.ts                   + SESSION_LIFETIME_DAYS,
                                                 SESSION_LAST_SEEN_THROTTLE_MINUTES,
                                                 + the throttle < lifetime refine (§3)
                                                 <- protected path
apps/api/src/config/index.spec.ts              + the bounds and the cross-field refusal

apps/api/src/http/middleware/require-session.ts  step 4 (§2.3); deps gain nowMs,
                                                 sessionLifetimeMs, lastSeenThrottleMs;
                                                 docblock: "three distinct 401 codes" -> four
                                                 <- protected path
apps/api/src/modules/auth/auth.service.ts      currentUser -> loadSession; + markSeen (§2.6)
apps/api/src/modules/auth/auth.repository.ts   + last_seen_at in COLUMNS and UserProfileRow;
                                                 stampLastSeen(id, at) (§2.4)
apps/api/src/composition.ts                    read the two keys, convert to ms, inject;
                                                 buildApp gains two overrides (§3)
apps/api/src/modules/auth/auth.routes.spec.ts  + the US-003 describe blocks (§10)
apps/api/src/modules/auth/auth.service.spec.ts + markSeen; stampLastSeen's new signature
.env.example                                   + the Session section (§3)

apps/ui/src/lib/auth/auth-context.tsx          + the boot sequence and `status` (§5)
apps/ui/src/lib/auth/auth-context.spec.tsx
apps/ui/src/lib/auth/require-session.tsx       hold while booting instead of redirecting (§5.2)
apps/ui/src/lib/auth/require-session.spec.tsx
apps/ui/src/screens/sign-in/SignIn.spec.tsx    + the AC-05 absence assertion (§6.2)

inception/specs/index.md                       the US-003 row
inception/specs/US-001-sign-in/spec.md         FR-18 is closed here, not there (§1) — or record
                                               the correction in this package's traceability
knowledge/traceability/manifest.json           US-003 tests[]
```

**Not modified, and worth saying so:**

- **`supabase/migrations/**`** — §7. The column exists; nothing is added.
- **`apps/api/src/modules/auth/auth.router.ts`** — no new route, and `GET /session` already does
  what §5 needs.
- **`apps/api/src/http/app.ts`** — the chain is already mounted on everything it guards.
- **`apps/ui/src/routes.tsx`** — `RequireSession` already wraps the shell (US-002).
- **`apps/ui/src/lib/supabase-client.ts`** — persistence and refresh are already the defaults;
  §5 reads what is stored rather than changing how it is stored.
- **`apps/ui/src/lib/api-client.ts`** — a `401` already arrives as `{ kind: 'error', code }`.

---

## 10. Test placement summary

The organising constraint is the QA note: **AC-01 – AC-03 are clock-dependent and must be proven
against an injected clock and a shortened lifetime, never by waiting.** Both seams exist:
`buildApp({ nowMs, sessionLifetimeMs, lastSeenThrottleMs })` (§3) and the pure predicates (§2.1).

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `session-lifetime.spec.ts` — 29 days in, not expired; 30 days exactly, not expired | unit (boundary) |
| AC-01 | `auth.routes.spec.ts` — a token whose profile's `last_seen_at` is 29 days old gets `200`, no challenge | API |
| AC-01 | `auth-context.spec.tsx` — a cold boot with a stored session renders signed in and never redirects (§5) | component |
| **AC-02** | `auth.routes.spec.ts` — **the renewal sequence below** | **API — the unit test alone is not the proof** |
| AC-02 | `session-lifetime.spec.ts` — `shouldStampLastSeen` at 59 min (no) and 61 min (yes) | unit |
| AC-03 | `session-lifetime.spec.ts` — 31 days, expired | unit |
| AC-03 | `auth.routes.spec.ts` — 31-day-old `last_seen_at` gives `401` `session_expired`, **and the row was not stamped** (§2.3) | API |
| AC-03 | `auth-context.spec.tsx` + `require-session.spec.tsx` — a boot whose `GET /session` answers `401` lands on `/sign-in` and mounts no screen | component |
| AC-04 | `auth.routes.spec.ts` — a sequence of authenticated requests across the window, every one `200`, no `401`/`403` (§6.1) | API |
| AC-05 | `SignIn.spec.tsx` — the control is absent (§6.2) | component |

**The AC-02 assertion, concretely**, because "the session slides" has a right and a wrong shape
and the wrong one passes.

`auth.routes.spec.ts`'s harness already builds the real app over stub adapters with a mutable
`rows` array and a `tokens` map (lines 46–85). Its `stampLastSeen` is a no-op — **make it write
to the row**, so the stub models the one behaviour that matters and the next request in the same
test sees the renewal. Then AC-02 is the criterion's own sentence executed:

```
now = T0                 last_seen_at = T0 - 20 days   (a 20-day-old session, used today)
GET /api/auth/session  -> 200   and last_seen_at becomes T0        (renewal)
now = T0 + 20 days
GET /api/auth/session  -> 200                                      <- AC-02: 40 days after
                                                                      sign-in, still valid
```

and the same harness proves the throttle without a second mechanism:

```
now = T0                 GET -> 200, last_seen_at = T0
now = T0 + 30 minutes    GET -> 200, last_seen_at UNCHANGED        <- throttled
now = T0 + 90 minutes    GET -> 200, last_seen_at = T0 + 90 min    <- re-stamped
```

**Assert against the stored value, not against the call.** `ai/standards/testing-standards.md`
bans asserting the mock, and "`stampLastSeen` was called" is not "the session was renewed" — the
version of this test that checks `toHaveBeenCalled` passes even if the write is dropped, which is
§2.5's failure mode exactly. The one place a *call* assertion is right is AC-03's "and it was
**not** stamped", where the absence of a write is the criterion (§2.3).

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§1** — `last_seen_at` is not stamped on the request path today; US-001's FR-18 is `not started` in its spec and `implemented` in its traceability. US-003 closes it; the two records need to agree | DEV, in this PR | nothing |
| 2 | **§3(c)** — the `.max(30)` ceiling on `SESSION_LIFETIME_DAYS`: an operator may shorten the window, never lengthen it past the one RISK-010 was accepted against. Droppable if you disagree | Joy Joshua / PO | nothing |
| 3 | **§8** — our expiry does not revoke the GoTrue refresh token; "expired" is our word, not Supabase's. A GoTrue-side timebox as defence in depth is a different story **and would need an ADR** | Joy Joshua / DevOps / PO | nothing |
| 4 | **§5.3** — sliding renewal means *any* authenticated request counts as use. When REQ-036's refresh-on-focus or any polling lands (US-012), a tab left open renews the session indefinitely with no human present. RISK-010 accepted a lost *device*; it did not consider a lost *tab* | Architect / PO, at US-012 | nothing now — flag it then |
| 5 | **§2.4** — two clock idioms now coexist (`nowMs: () => number` and `infra/clock`'s `Clock`). This note picks `nowMs` for consistency; converging them is a separate change | Joy Joshua / DEV | nothing |
| 6 | **§6.1** — AC-04 becomes true of its three named flows in US-007 / US-011 / US-031; those PRs should carry a test citing `US-003/AC-04` | Manager → US-007/011/031 | their definitions of done |
| 7 | **§4** — `require-session.ts`'s "three distinct 401 codes" docblock becomes four | DEV, in this PR | nothing |
| 8 | Story edge case — *"BRD-001 does not say whether deactivating an account (US-025) kills that user's live session."* Step 3 already refuses a deactivated account on the next request, which is the de facto answer and is the same open question `db-design.md` open question 3 carries. Still formally the PO's | Joy Joshua / PO | nothing |

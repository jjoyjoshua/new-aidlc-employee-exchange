# US-001 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-001 — Sign in with email and password](../../stories/user-stories/US-001-sign-in.md) |
| **Screen**   | [SCR-001 — Sign in](../../design/screens/SCR-001-sign-in.md), ST-01–ST-05 |
| **Tier**     | Complex — confirmed, and understated by one surface (see §0)             |
| **Author**   | Architect persona (AI draft), 2026-09-17                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), **[ADR-003](../../../knowledge/decisions/ADR-003-express-mediated-sign-in.md)** |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is
argued before the code, not in a review thread. `decisions.md` in this package stays DEV's.

---

## 0. The tiering

DEV classified this Complex on four surfaces: the middleware chain, new routes on both sides,
`libs/contracts`, and the props/events of shared components. All four hold. **Two more apply**,
and both matter for scoping:

- **`supabase/migrations/**` — a protected path.** No migration exists. US-001 cannot sign
  anyone in without `user_profiles`, so it writes the first one (§6).
- **A new dependency.** `apps/ui` has react, react-dom and supabase-js. AC-03 requires a
  refusal on a direct address request, and AC-01/AC-02 require landing on two different
  addresses. That needs a router. `task-surfaces.md` §Escalate: a dependency is the human's,
  not a persona's. **This blocks the start of UI work.**

**US-001 is bigger than "sign in".** AC-01 lands on SCR-002, AC-02 lands on SCR-005 *and*
requires the admin navigation to be present, AC-03 requires an employee to be bounced off the
admin addresses. So this story delivers route stubs at two addresses and the shell's
role-dependent navigation. The *content* of those screens remains US-010 and US-013. I do not
recommend splitting the story — the ACs are one coherent job — but the plan must say this out
loud rather than discover it at review.

---

## 1. Where "verifying identity" actually happens

ADR-003 settles this. Precisely, and in the order it happens:

| Step | Who does it | Against what |
| --- | --- | --- |
| Shape of the submission (non-empty, plausible email) | **Browser**, then **Express** again | `signInRequestSchema` from `libs/contracts` — literally the same schema object |
| Password verification | **Supabase Auth (GoTrue)**, called **by Express** | `auth.users.encrypted_password`, which nothing in our code ever sees |
| Account state (REQ-005) | **Express** | `user_profiles.is_active`, via the service-role client |
| Role (V-07, AC-02, AC-03) | **Express** | `user_profiles.role` — **never** a JWT claim, which goes stale when REQ-022 changes a role |
| Session validity on every later request | **Express** middleware | Supabase token verification, then `user_profiles` again |

**What the browser holds:** the typed email and password for the life of one submit and no
longer; after success, the Supabase **access token** and **refresh token** returned in our
response body, handed straight to `supabaseBrowserClient.auth.setSession(...)`; and the
**anon key**, which is public by design and build-time.

**What the browser never holds:** the **service-role key**; any password or hash; any database
row it did not receive from `/api/*`; and — new with ADR-003 — any credential it submitted
anywhere other than our own origin. The browser's Supabase client now does exactly one thing:
refresh the access token.

Residual risk, named rather than buried: the tokens live in browser storage (supabase-js
default), so an XSS reaches them. The httpOnly-cookie alternative is in ADR-003's rejected
table with the reason it was rejected.

---

## 2. The endpoint shape

Two endpoints. Both under `/api/auth`. Both shapes live in `libs/contracts` (§3).

### 2.1 `POST /api/auth/sign-in` — unauthenticated

**Request**

```jsonc
{ "email": "priya@company.com", "password": "..." }
```

`.strict()` — unknown fields are rejected, per `api-standards.md`. Email is **trimmed** by the
schema (the story's edge case, and the same treatment BR-001.8 gives desk numbers). Password
is **never** trimmed, normalised or case-folded.

**The password field carries `min(1)` and `max(200)` and nothing else.** Do **not** apply V-12
here. V-12 is the policy for *setting* a password (REQ-018, REQ-021, US-004). Enforcing it at
sign-in would mean a 5-character attempt returns `400` while a wrong 12-character attempt
returns `401` — a distinguishable path that tells an attacker something about the policy, and
it would lock out any account whose stored credential predates a policy change. The `max(200)`
is a wire bound against a pathological body, not a rule; `express.json({ limit: '100kb' })`
already exists above it.

**200 response**

```jsonc
{
  "session": {
    "accessToken": "eyJ…",
    "refreshToken": "…",
    "expiresAt": 1789200000          // seconds since epoch, as Supabase reports it
  },
  "user": {
    "id": "…uuid…",
    "email": "priya@company.com",
    "fullName": "Priya Sharma",
    "role": "employee",              // "employee" | "admin"  → AC-01 / AC-02 landing
    "mustChangePassword": false      // → US-004/AC-01; US-001 returns it, does not act on it
  }
}
```

`mustChangePassword` is in the response **now**, not added by US-004. A changed response shape
is Complex by `task-surfaces.md`; adding one boolean later would re-tier a story that would
otherwise be Medium, for no reason.

**Wire casing is camelCase**, everywhere, for the whole API. The database is snake_case; the
mapping happens in the module's response builder. This is the first endpoint, so it sets the
convention.

**Error responses** — one shape, `{ statusCode, code, message }`, from `http/errors.ts`:

| Status | `code` | When | UI state |
| --- | --- | --- | --- |
| `400` | `invalid_request` | the body failed `signInRequestSchema` | ST-02 (should be unreachable — AC-05 stops it in the browser) |
| `401` | `invalid_credentials` | **all three of** unknown email · wrong password · `is_active = false` | ST-04 |
| `503` | `service_unavailable` | Supabase Auth unreachable, timed out, or 5xx | ST-05 |
| `500` | `internal_error` | our bug | ST-05 |

**The `400` never echoes the submitted value or the Zod issue list.** A generic body, always.
The issue list is the natural thing to return and it would put a fragment of a password into a
response for a malformed submission.

**`503` needs one row added to `api-standards.md`.** Its table currently stops at `500`
("never intentional"). AC-07 exists precisely to separate "the service is unavailable" from
"we rejected you", and an operator needs to tell a Supabase outage from our own defect.

### 2.2 `GET /api/auth/session` — authenticated

Required by US-001, not optional. AC-03 is a **direct address** request: the user types
`/admin/bookings` into the bar, the app boots cold with a stored token and must decide what to
render. It cannot decide from localStorage — that is client-controlled, and AC-03 demands a
server refusal. It must not decide from a JWT claim — `app-architecture.md` §5.1 forbids it
because REQ-022 changes roles under live sessions.

Returns `{ "user": { …the same object as above… } }`, or the standard `401`. This endpoint is
also where US-003's `last_seen_at` refresh and US-004's `must_change_password` routing will
naturally attach.

### 2.3 What US-001 does *not* build

`POST /api/auth/sign-out` is **US-002's**. It is named here only so nobody adds it "while we
are in the file" — a new route is a contract, and a contract with no AC has no test to cite.

---

## 3. `libs/contracts` — the concrete shape

ADR-002 names it; it does not exist. Follow-up 1 of that ADR assigns creation to DEV "as
groundwork before US-001". This section is that groundwork specified.

### 3.1 Where it sits and what it is called

```
libs/contracts/
├── package.json          name: "@desk-booking/contracts"
├── tsconfig.json         extends ../../tsconfig.base.json
└── src/
    ├── index.ts          re-exports everything below
    ├── error.ts          error body + the stable code strings
    ├── error.spec.ts
    ├── auth.ts           US-001's slice, and nothing else
    └── auth.spec.ts
```

`package.json`:

```jsonc
{
  "name": "@desk-booking/contracts",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "zod": "^3.23.8" },   // the version apps/api already has; 3.25.76 installed
  "devDependencies": { "typescript": "^5.6.3", "vitest": "^4.1.11" }
}
```

`zod` and nothing else (ADR-002). **Pin the same range as `apps/api`** — two resolved copies of
Zod produce schema instances whose types are structurally incompatible in ways the error
message does not explain.

### 3.2 How both sides import it

Root `package.json`, `workspaces`, currently `["apps/*"]`:

```jsonc
"workspaces": ["apps/*", "libs/*"]
```

`apps/api` and `apps/ui` each add `"@desk-booking/contracts": "*"` to `dependencies`. Neither
adds `zod` — `apps/ui` receives it transitively, and declaring it twice is how the versions
drift apart.

Import is ordinary: `import { signInRequestSchema } from '@desk-booking/contracts';`

**Build ordering is explicit, not inferred.** `apps/api` emits real JavaScript with `tsc`, so
it must resolve a built `dist/`, not a `.ts` file. Do not rely on `npm run --workspaces`
ordering — say it in the root scripts:

```jsonc
"scripts": {
  "build:contracts": "npm run build -w libs/contracts",
  "build":     "npm run build:contracts && npm run build -w apps/api && npm run build -w apps/ui",
  "test":      "npm run build:contracts && npm test --workspaces --if-present",
  "typecheck": "npm run build:contracts && npm run typecheck --workspaces --if-present"
}
```

`build:contracts` is fast and idempotent; running it three times costs nothing and removes a
whole class of "works on my machine". CI (`.github/workflows/ci.yml`) needs no change — lint,
typecheck, test and build all route through these scripts.

### 3.3 The eslint boundaries — **read this before editing `eslint.config.mjs`**

ADR-002 follow-up 2 asks for two rules. There is a trap in how they must be added, and the
file already warns about it for a different rule (lines 83–86).

**Flat config *replaces* a rule rather than merging it.** `eslint.config.mjs` lines 107–126
already set `no-restricted-imports` for `apps/**` — that is the rule banning
`@supabase/supabase-js` outside `infra/supabase`. A later block that sets
`no-restricted-imports` for `apps/ui/**` **silently deletes that ban for the browser**, which
is the single most important boundary in the project.

So the new `apps/ui` block must **restate** the Supabase path ban alongside the new pattern:

```js
// ---- Boundary 4: the browser cannot reach the server package ----------------
// ADR-002: this is what keeps infra/supabase — and the service-role key it holds —
// unreachable from a browser bundle. It is the reason a shared package was chosen over
// TypeScript path mapping.
//
// NOTE: this block RESTATES the @supabase/supabase-js ban from the apps/** block above.
// Flat config replaces `no-restricted-imports` rather than merging it, so omitting the
// restatement would delete that ban for apps/ui — the exact hole ADR-001 exists to close.
{
  files: ['apps/ui/**/*.ts', 'apps/ui/**/*.tsx'],
  ignores: ['apps/ui/src/lib/supabase-client.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '@supabase/supabase-js',
        message: 'Only apps/api/src/infra/supabase (server) and apps/ui/src/lib/supabase-client.ts (browser, anon key, token refresh only) may construct a Supabase client.',
      }],
      patterns: [{
        group: ['@desk-booking/api', '**/apps/api/**'],
        message:
          'apps/ui may not import from apps/api. That package holds infra/supabase and the ' +
          'service-role key, which bypasses every RLS policy in the project. Shared wire ' +
          'shapes go in @desk-booking/contracts (ADR-002).',
      }],
    }],
  },
},

// ---- Boundary 5: the contract depends on neither side -----------------------
{
  files: ['libs/contracts/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@desk-booking/api', '@desk-booking/ui', '**/apps/**'],
        message:
          'libs/contracts depends on zod and nothing else (ADR-002). It describes what crosses ' +
          'the wire; the rules live in apps/api/src/domain.',
      }],
    }],
  },
},
```

Two ordering constraints:

- The `apps/ui/src/lib/supabase-client.ts` exemption (currently line 130) must stay **after**
  the new `apps/ui` block, or it exempts nothing. Using `ignores` on the new block, as above,
  is belt and braces.
- ADR-002 follow-up 2 says *"verify each fires against a deliberate violation before trusting
  it — a boundary rule that never fires is decoration."* Do that, paste the output in the PR,
  and delete the deliberate violation. A boundary asserted in a config and never observed
  failing is a boundary nobody has tested.

`eslint.config.mjs` is a protected path. This edit is part of the Complex change, not a
drive-by.

### 3.4 The minimum slice US-001 needs

Nothing about bookings, desks, people, or pagination. Two files.

**`src/error.ts`**

```ts
import { z } from 'zod';

/** The stable machine-readable strings the React app switches on (api-standards.md). */
export const errorCodeSchema = z.enum([
  'invalid_request',
  'invalid_credentials',
  'no_session',
  'session_invalid',
  'account_inactive',
  'admin_only',
  'password_change_required',   // US-004's, exported now: it is a contract between a
                                // middleware and SCR-010, and that is the whole point
  'route_not_found',
  'service_unavailable',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Switch on these; never on a string literal. A typo becomes a compile error. */
export const ERROR_CODES = errorCodeSchema.enum;

/**
 * `code` is z.string(), NOT errorCodeSchema — deliberately.
 *
 * ADR-002 exists because a tab loaded before a deploy talks to the server that came after it.
 * If this schema pinned the enum, that tab would fail to PARSE a legitimate new error code and
 * turn a handled error into a crash. Parse it loosely, switch on ERROR_CODES, and give the
 * switch a default branch. Strictness belongs on requests, not on the shape of a failure.
 */
export const errorBodySchema = z.object({
  statusCode: z.number().int(),
  code: z.string().min(1),
  message: z.string(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
```

**`src/auth.ts`**

```ts
import { z } from 'zod';

export const userRoleSchema = z.enum(['employee', 'admin']);   // db-design §1.1 user_role
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * The one definition of "a plausible sign-in submission".
 * The browser parses with it for AC-05; the route parses with it at the edge. Same object —
 * which is the concrete payoff of ADR-002 on the very first story.
 *
 * Email is trimmed (US-001 edge cases). Password is not, ever.
 * V-12 is NOT applied here — see the design note §2.1.
 */
export const signInRequestSchema = z
  .object({
    email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
    password: z.string().min(1, 'Enter your password').max(200),
  })
  .strict();
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
});
export type Session = z.infer<typeof sessionSchema>;

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: userRoleSchema,
  mustChangePassword: z.boolean(),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

/** Responses are NOT .strict() — see the design note §3.5. */
export const signInResponseSchema = z.object({ session: sessionSchema, user: authenticatedUserSchema });
export const sessionResponseSchema = z.object({ user: authenticatedUserSchema });
```

**`apps/api/src/http/errors.ts` must be edited, not duplicated.** It currently declares its own
`ErrorBody` interface (line 11) and its own `PASSWORD_CHANGE_REQUIRED` constant (line 68). Both
now come from `@desk-booking/contracts`. Two declarations are not a contract — that is ADR-002's
own sentence, and this file is the first place it applies.

### 3.5 Requests are strict; responses are not

`.strict()` on a **request** is `api-standards.md`: unknown fields rejected, not stripped.

`.strict()` on a **response** would mean a server that adds a field breaks every tab loaded
before the deploy — turning a harmless additive change into an outage. Responses use Zod's
default `.strip()`. The skew ADR-002 protects against is a field that **disappeared or
changed type**, and `.strip()` still catches both. This asymmetry is the rule for all forty
endpoints, not a US-001 quirk.

---

## 4. The auth middleware chain

`apps/api/src/http/middleware/**` is a protected path and holds the whole chain
(`task-surfaces.md`). `app-architecture.md` §5.1 describes four steps. **US-001 builds steps 1–3
plus `requireAdmin`.** Steps 4 and 5 are other stories' and are written as named, empty,
commented seams so the next author does not have to guess where they go.

### 4.1 `requireSession` — what US-001 builds

```
1. Authorization: Bearer <jwt>?  missing or malformed  → 401 no_session
2. Verify the token with Supabase.  invalid or expired → 401 session_invalid
3. Load user_profiles by the token's subject.
     no profile, or is_active = false                  → 401 account_inactive
   Stamp last_seen_at.
4. [US-003]  last_seen_at older than 30 days           → 401 session_expired
             otherwise refresh it, throttled to once an hour
5. [US-004]  must_change_password = true               → 403 password_change_required
             on every route except the password-change route and sign-out
6. Attach { id, email, fullName, role, mustChangePassword } to the request. Nothing else.
```

Step 3 is REQ-005 biting immediately rather than at token expiry, and it is also the de facto
answer to `db-design.md` open question 3 — *"is a deactivated user's live session ended
immediately?"* US-001 makes the answer "yes". **That question is still formally open and the PO
owns it.** Raise it for confirmation so QA tests a decision rather than an inference.

US-001 **creates** `last_seen_at` in the migration and stamps it at sign-in. The 30-day
comparison and the hourly throttle are US-003's; that story wants the lifetime as a
configuration value it can shorten in a test, and inventing that config here would be building
a story that has not been planned.

**Three distinct `401` codes, one UI behaviour.** All three send the browser to SCR-001 ST-01.
They are distinct because US-003 and US-025 will want to tell them apart operationally, and
because collapsing them now means widening the contract later. They leak nothing: reaching this
middleware at all requires a token, which requires the password.

### 4.2 The `must_change_password` 403 — US-004's, with a sequencing consequence

`db-design.md` §1.1 defaults `must_change_password` to `true`. So from the moment accounts
exist, every one of them is in the state the 403 is meant to gate — and the gate does not land
until US-004. Between US-001 and US-004, an administrator-set credential is unrestricted.

That is acceptable **only** because no protected screens exist yet. **US-004 must land before
any booking story.** This is a delivery-order constraint, and it belongs in front of the
Manager, not buried in a code comment.

The `password_change_required` string is already exported from `libs/contracts` (§3.4) so that
when US-004 arrives, the middleware and SCR-010 are agreeing on a shared constant rather than
on two typed strings.

### 4.3 `requireAdmin`, and how AC-03 is actually proven

AC-03 is the story's other security criterion, and the story's own QA note is blunt about it:
*"a UI test that only checks the nav is absent proves nothing."* It has two halves.

**Server half.** Mount the guard on the **mount point**, never per route:

```ts
// apps/api/src/http/app.ts
app.use('/api/auth', authRouter);                                  // sign-in is unauthenticated
app.use('/api/admin', requireSession, requireAdmin, adminRouter);  // adminRouter is EMPTY in US-001
```

This is the design decision worth defending. Per-route guards are forgettable, and the first
one forgotten is a data leak nobody notices. Mounted this way, **every future admin route
inherits the guard before it is written.**

Because the guard precedes routing, `GET /api/admin/anything` with an Employee token returns
`403 admin_only` rather than `404`. That gives US-001 a real, non-cosmetic assertion today,
with no admin endpoints in existence:

- Employee token → `403 admin_only`, empty of data. **This is AC-03's server half.**
- Admin token → `404 route_not_found` (the guard passed; there is genuinely nothing there yet).
- No token → `401 no_session`.

The role is read from `user_profiles.role`, loaded by `requireSession` — never from a JWT
claim, because REQ-022 changes roles under live sessions and a claim goes stale at that moment.

**Client half.** A `<RequireRole role="admin">` route element. On an Employee it redirects to
`/bookings` — AC-03's *"they are returned to My bookings"*. This is convenience and nothing
more; the guarantee is the server half above, and the tests must say so.

### 4.4 `requireHttps` — AC-08

The story's QA note calls AC-08 environment-level, and the deployed half is. But half of it is
cheaply provable in CI, and proving half of a security criterion in CI beats deferring all of
it to an environment nobody has chosen yet (`app-architecture.md` §7 item 3).

In production only, a request whose `x-forwarded-proto` is `http` is refused or redirected,
and responses carry `Strict-Transport-Security`. A supertest with that header set proves it.

**This needs `app.set('trust proxy', …)`, and that is a decision, not a default.** Trusting
`x-forwarded-proto` from an unproxied source lets a client spoof it. The cleanest form is a
`TRUST_PROXY` boolean in `config/`, defaulting to `false`. `task-surfaces.md` §Escalate says a
change to `.env` key names goes to the human — so ask, do not add it. If the answer is not
ready, ship the header assertion and leave the redirect to the platform, and say so in
`decisions.md`.

---

## 5. AC-04 — one message **and** one response-time band

This is the criterion the story itself flags as *"the security-relevant one and the easiest to
break by accident"*, and the timing half is the half that breaks silently.

### 5.1 Why the timing half is not free

Three different causes, three naturally different costs:

| Cause | Work performed | Natural cost |
| --- | --- | --- |
| Unknown email | GoTrue rejects | fast — and GoTrue's internal behaviour here is not ours to control or test |
| Wrong password | GoTrue compares a hash, rejects | slower |
| Deactivated account | GoTrue **succeeds**, then we read `user_profiles`, then we revoke the session | **slowest** — it does strictly more work than either rejection |

The deactivated case is the one our own design makes slower, and no amount of care about
GoTrue's timing fixes that.

### 5.2 The mechanism — converge, then floor

**Part one: converge.** Every failure path returns the *same value* before anything shapes a
response. There is no early `return res.status(401)…` anywhere in this flow; that is what makes
three messages appear by accident.

```ts
// apps/api/src/modules/auth/auth.service.ts
type SignInOutcome =
  | { kind: 'ok'; session: Session; user: AuthenticatedUser }
  | { kind: 'rejected' }            // AC-04: unknown email, wrong password, deactivated
  | { kind: 'unavailable' };        // AC-07: Supabase is down

async function attemptSignIn(email: string, password: string): Promise<SignInOutcome> {
  const normalised = email.trim().toLowerCase();                 // §7 — email case
  const auth = await authClient.signInWithPassword({ email: normalised, password });

  if (auth.error) {
    return isTransport(auth.error) ? { kind: 'unavailable' } : { kind: 'rejected' };
  }

  const profile = await profiles.findById(auth.data.user.id);
  if (!profile || !profile.is_active) {
    await revokeSession(auth.data.session);   // GoTrue already minted it — see below
    return { kind: 'rejected' };
  }

  await profiles.stampLastSeen(profile.id);
  return { kind: 'ok', session: toSession(auth.data.session), user: toUser(profile) };
}
```

**The revoke is not optional and is the easiest line to omit.** GoTrue has issued a real access
token *and a real refresh token* to a deactivated account. `requireSession` step 3 would refuse
every request made with it — but leaving a live refresh token for a deactivated user
contradicts what REQ-005 means. Use the admin sign-out API on the service-role client. *If the
installed `@supabase/supabase-js` (^2.45.4) does not expose it, report back rather than quietly
skipping it* — a silently dropped revoke is exactly the kind of thing that passes review.

**Part two: the floor.** The rule lives in `domain/`, as a pure function, so it is provable at
the cheapest level with no clock mocking:

```ts
// apps/api/src/domain/sign-in-failure-delay.ts
/**
 * V-01 / US-001 AC-04 — a rejected sign-in must land in one response-time band whatever
 * caused it. Returns how much longer to wait. Every input is an argument, including the
 * clock reading (coding-standards.md, domain/).
 */
export const SIGN_IN_MIN_FAILURE_MS = 500;

export function remainingDelayMs(startedAtMs: number, nowMs: number, floorMs: number): number {
  return Math.max(0, floorMs - (nowMs - startedAtMs));
}
```

The route awaits that delay **only** on the `rejected` path, then responds.

**Four deliberate choices, each with its reason:**

- **A constant, not an env var.** This is a security parameter, not a deployment one, and
  `task-surfaces.md` §Escalate sends every `.env` key-name change to the human. Tests pass a
  small floor as an argument.
- **500 ms.** Comfortably above a normal server→GoTrue→server round trip, so the real work
  fits *under* the floor and the band is genuinely uniform; low enough that a failed sign-in
  does not feel broken. It is the one number here I chose rather than derived — argue it down
  if you have measurements.
- **Success is not padded.** AC-04 asks that the three *failure* causes be indistinguishable
  from each other. A `200` with a session in it announces itself; padding it would add half a
  second to every successful sign-in for no security gain.
- **`400 invalid_request` is not padded.** It depends on the body's shape, not on whether the
  account exists, so it is no oracle.

**One honest limit, and one thing to build because of it.** A floor makes the three causes
share a lower bound; it does not make them identical. If the deactivated path's extra work ever
exceeds 500 ms, it emerges above the band. So: **log a warning whenever a rejection exceeds the
floor.** That single log line is the operational signal that AC-04's guarantee has stopped
holding, and it costs one `if`.

**And say plainly what this is not.** The floor delays each response; it bounds nothing about
concurrency. It is **not** a rate limiter, and somebody will claim it is. See §8.

### 5.3 How AC-04 is tested — four tests, none of them flaky

1. **`domain/sign-in-failure-delay.spec.ts`** — *"pads a fast rejection up to the floor
   (US-001/AC-04)"*, *"adds no delay when the work already exceeded the floor (US-001/AC-04)"*,
   *"never returns a negative delay (US-001/AC-04)"*. Pure, instant, no sleeping.
2. **`modules/auth/auth.service.spec.ts`** — a stub auth adapter produces each of the three
   causes; assert all three yield `{ kind: 'rejected' }` and that each computes the **same
   deadline** from its start time. Assert the *decision* (the computed deadline), not that a
   sleep function was called — `testing-standards.md` bans asserting the mock, and the deadline
   is the decision.
3. **`http/auth.routes.spec.ts`** (supertest) — the three causes produce **byte-identical**
   status and JSON body. `expect(a.body).toEqual(b.body)` across all three. This is the
   "identical message" half, and it is the test that catches the three-code-paths-three-
   messages regression.
4. **`http/auth.routes.spec.ts`**, timing — with a small injected floor (say 50 ms), assert
   each of the three causes took **at least** the floor. Assert the floor only. **Do not assert
   an upper bound and do not compare means between causes** — that is how a timing test becomes
   the flaky test everyone learns to re-run.

The story's other AC-04 clause — *"assert the deactivated-account path does not return a
distinguishable status code"* — is covered by test 3.

---

## 6. The first migration

`supabase/migrations/0001_user_profiles.sql`. **This table only**, plus its enum and RLS.

- `user_role` enum `('employee','admin')`; `user_profiles` exactly as `db-design.md` §1.1
  specifies, including `email citext` (case-insensitive uniqueness, BR-001.10 — and §7 below).
- `id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`.
- Unique on `email`. Index on `(is_active, role)` (`db-design.md` §5).
- **RLS enabled, deny-all**, no permissive policy.

**Not the other four tables.** A migration for a table no code reads is untested schema, and
`task-surfaces.md` makes every migration Complex — each table should arrive with the story that
needs it, under that story's review.

**This re-reads one line of ADR-001.** Its follow-up says *"enable RLS with deny-all policies on
all five tables as part of the first migration"*. Four of those tables do not exist yet, so the
literal instruction cannot be followed. The intent — RLS is on from the beginning rather than
retrofitted — is served by: **RLS deny-all on every table in the same migration that creates
it.** Recording the re-reading rather than quietly diverging.

**No seed, and that is a gap you own.** BRD-001 §8 names "DbInitializer seed when no users
exist", and US-016/AC-01 says *"first run, right after the seeded Admin signs in"*. **No
`US-###` owns it.** US-001 must not invent it: an auto-created admin with a known credential is
a security surface of its own and exactly the kind of thing that reaches production by
accident. US-001's tests create accounts through the Supabase admin API in a fixture. The
bootstrap goes to `/ba` as a missing story.

Test data the story's QA notes require: one active Employee, one active Admin, one deactivated
Employee — **all with `must_change_password = false`**, since AC-01 and AC-02 specify accounts
"whose password was not set by an Admin" and the column defaults to `true`.

---

## 7. Email case-sensitivity — recommendation

**Recommendation: match case-insensitively. Trim, then lower-case, in our own code, before the
auth call and before any profile lookup.**

Three reasons it is safe:

- **BR-001.10 already decided it.** Uniqueness is case-normalised, so two accounts differing
  only in case cannot exist — a case-insensitive match can therefore never be ambiguous.
- **`db-design.md` §1.1 already committed to it.** `user_profiles.email` is `citext`, and the
  uniqueness table in §3 says "case-insensitive" in as many words.
- **The story already says so.** *"the safe reading is case-insensitive match on sign-in […]
  do not ship a case-sensitive comparison without the decision."*

**Do not rely on GoTrue normalising the address for us.** It may; it is not our code and not
under test here. Normalise explicitly, in one place, so the behaviour is ours and has a test.

**Does it need your decision before code? No.** Proceed under the stated assumption, record it
in `decisions.md` with your name as owner, and route it to `/ba` as a one-line BRD addition to
BR-001.10. It is a confirmation, not a decision — and holding up the first story of delivery
for a confirmation that three existing artifacts already imply would be ceremony.

One thing to carry forward: **US-021 must store the same normalised form.** `citext` makes that
true at the database, but the application should not depend on that alone.

---

## 8. Rate limiting — judgement

**Shipping this endpoint with no rate limit is acceptable for writing the code. It is not
acceptable to pass Gate 3 without a recorded decision.** It is a PO call, not mine and not
DEV's.

What makes it sharper than it first looks:

- Sign-in is the **only unauthenticated write endpoint** in the system. There is no lockout, no
  MFA, no CAPTCHA. V-12 is min-8-with-complexity, which is not much against an unthrottled
  grinder who already knows a colleague's email address.
- **The 500 ms floor is not a rate limiter.** It delays each response and bounds nothing about
  concurrency. A hundred parallel attempts still run in parallel. This will be claimed as
  mitigation in a review; it is not.
- Without one, AC-04's enumeration protection is partly undone anyway — an attacker who can
  grind gets an answer eventually.
- **ADR-003 adds a new hazard.** All sign-ins now reach Supabase from **one server IP**, so a
  provider-side per-IP auth limit throttles the whole company at once rather than one user.
  That belongs to `app-architecture.md` §7 item 5 and DevOps, before Gate 3.

Two acceptable outcomes, both yours: a `change-request` to `/ba` adding a rate-limit or
lockout requirement (which becomes its own story), **or** a `RISK-###` row in BRD-001 §9
accepting it in your own words, as RISK-010 accepts the 30-day session. **I am not inventing
thresholds** — a number nobody chose is worse than a documented gap.

---

## 9. The browser side

### 9.1 Routes

Nothing in `ia.md` or the ten screen specs fixes a URL — I checked all of them. SCR-001's
header gives `/sign-in`; the rest are proposed here and UX may veto the strings.

| Address | Screen | US-001? |
| --- | --- | --- |
| `/sign-in` | SCR-001 | **yes** |
| `/bookings` | SCR-002 My bookings | **stub only** — AC-01's landing, AC-03's bounce target |
| `/admin/bookings` | SCR-005 All bookings | **stub only** — AC-02's landing |
| `/set-password` | SCR-010 | reserved (US-004) |
| `/book` · `/settings` · `/admin/desks` · `/admin/people` | SCR-003/004/006/008 | reserved |

SCR-007 and SCR-009 are dialogs on SCR-006 and SCR-008 (their component tables lead with
`dialog`, and `ia.md` line 60 says modal moments earn `ST-##`, not addresses) — no routes.

`/admin/*` on the client mirrors `/api/admin/*` on the server. The symmetry is not decoration:
it makes "is this surface guarded?" answerable by looking at the address.

### 9.2 Component placement

SCR-001's header says surface `features/auth`; the scaffold has `apps/ui/src/screens/` and
`coding-standards.md` says feature folders are named after the specs. Resolving to
`src/screens/sign-in/`, with the `SCR-001` id in the folder's docblock. Minor, flagged so it is
not re-litigated.

Seven shared components, in `apps/ui/src/components/`: `text-field`, `password-field`, `button`,
`alert`, `spinner`, `card`, `login-backdrop`. **Their props and events are a Complex surface**
(`task-surfaces.md` §Browser) — this story sets them for the next nine screens, so design them
for SCR-010's needs too (it reuses `card`, `password-field`, `button`, `alert`, `spinner`,
`login-backdrop`) and for nothing beyond that. No speculative props.

All values from `inception/design/tokens.css` — a protected path, already wired into
`vite.config.ts` via `server.fs.allow`. No literals.

**No CSS framework and no headless UI library is needed for US-001.** See the separate note:
none of these seven components maps onto a headless primitive, so building them by hand now
costs nothing later. The decision is due before SCR-002's cancel dialog (US-010/US-011).

### 9.3 The five states

- **ST-02 (AC-05)** — validate with `signInRequestSchema` from `libs/contracts`, the *same
  object* the route parses with. Put `noValidate` on the `<form>`: keep `type="email"` for the
  mobile keyboard and password managers, but the browser's native bubble must not preempt the
  designed message and the designed focus move. Focus goes to the first invalid field. **No
  request is sent** — that is the assertable half.
- **ST-03 (AC-06)** — disable-while-in-flight plus an `AbortController`. The button keeps its
  label and gains a spinner; the spinner takes the **button's label colour**, not a text colour
  (SCR-001's handoff names this as a defect the SCR-002 build already found). Asserting the
  fetch stub was called exactly once is legitimate here and is *not* "asserting the mock" —
  "only one request exists" is the criterion's own wording.
- **ST-04 (AC-04)** — on `invalid_credentials`. Clear the password, keep the email, move focus
  to the password field, announce via `role="alert"`.
- **ST-05 (AC-07)** — on a network failure, a timeout, or any `5xx`. Keep **both** fields
  including the password; the **Try again** control sits inside the alert and `Sign in` stays
  below it, both live. Focus does not move. No NFR names a client timeout; **10 s** is a
  reasonable DEV decision to record in `decisions.md`.
- **Success** — hand the session to `supabaseBrowserClient.auth.setSession(...)`, then route on
  `user.role`: `employee` → `/bookings`, `admin` → `/admin/bookings` with the admin navigation
  present (AC-02).

**Copy lives in the UI, keyed on `code`.** ST-05 has no server message at all — a network
failure produces no response — so the screen must own copy regardless, and owning half of it in
two places is the drift. The server sends the same ST-04 sentence as its `message` purely so
the three failure bodies are byte-identical on the wire; it is a wire-uniformity value, not
user-facing copy, and the note says so here so the apparent duplication is not "fixed" later.

### 9.4 The data-fetching layer, and ADR-002 follow-up 3

ADR-002 follow-up 3: *"Decide what a failed response parse does to the user, and implement it
once in the data-fetching layer rather than per screen."* US-001 is the first story that
fetches, so it is due now.

**Decision: a failed response parse is treated exactly as a `5xx`** — it lands on the screen's
existing service-unavailable state (ST-05 here) and logs the endpoint and the failing field
path. It is not a crash and not a white screen; it is the one existing state whose message
("we can't reach the booking service right now, try again in a moment") is honest about a
server that is answering wrongly. Confirm with UX, but it needs no new state and no new copy,
which is the point.

One thin `apiClient` does all of it: attach the bearer token, parse with the response schema,
map `ErrorBody` to a typed rejection, map transport failures and parse failures to the same
`unavailable` outcome. **Configured once** — REQ-036's refresh-on-focus is a property of this
layer (`coding-standards.md`), even though nothing uses it until US-012.

---

## 10. File placement

**New**

```
libs/contracts/package.json · tsconfig.json
libs/contracts/src/{index,error,auth}.ts  (+ error.spec.ts, auth.spec.ts)

supabase/migrations/0001_user_profiles.sql

apps/api/src/domain/sign-in-failure-delay.ts (+ .spec.ts)
apps/api/src/http/middleware/require-session.ts (+ .spec.ts)
apps/api/src/http/middleware/require-admin.ts   (+ .spec.ts)
apps/api/src/http/middleware/require-https.ts   (+ .spec.ts)
apps/api/src/modules/auth/auth.router.ts
apps/api/src/modules/auth/auth.service.ts (+ .spec.ts)
apps/api/src/modules/auth/auth.repository.ts
apps/api/src/modules/auth/auth.routes.spec.ts        ← supertest; AC-04's identical-body test
apps/api/src/modules/admin/admin.router.ts           ← empty; exists so the guard has a mount

apps/ui/src/lib/api-client.ts
apps/ui/src/lib/auth/{auth-context.tsx,require-role.tsx}
apps/ui/src/routes.tsx
apps/ui/src/components/{button,text-field,password-field,alert,spinner,card,login-backdrop}/
apps/ui/src/components/app-shell/                     ← AC-02's role-dependent navigation
apps/ui/src/screens/sign-in/SignIn.tsx (+ .spec.tsx)
apps/ui/src/screens/my-bookings/   · screens/all-bookings/    ← stubs; content is US-010/US-013
```

**Modified**

```
package.json            workspaces + libs/*; explicit build ordering (§3.2)
eslint.config.mjs       two boundary blocks — READ §3.3 FIRST (protected path)
apps/api/package.json   + @desk-booking/contracts
apps/ui/package.json    + @desk-booking/contracts, + the router (§0 — your call)
apps/api/src/http/app.ts          mount /api/auth and /api/admin; requireHttps
apps/api/src/http/errors.ts       ErrorBody and the codes come from contracts, not from here
apps/api/src/infra/supabase/index.ts  + supabaseAuthClient() on the anon key (protected path)
apps/api/src/infra/clock/index.ts     + sleep(ms), so the floor is testable without waiting
apps/ui/src/App.tsx               render the router
apps/ui/src/lib/supabase-client.ts    docblock: refresh only (ADR-003)
ai/standards/api-standards.md         + the 503 row
knowledge/decisions/ADR-001…md        + ADR-003's consequential edit
inception/architecture/app-architecture.md §1   + the same
ai/standards/coding-standards.md §Browser       + the same
inception/specs/index.md              the US-001 row
knowledge/traceability/manifest.json  US-001 tests[] — currently empty
```

---

## 11. Test placement summary

Most of this story's weight is **not** in `domain/` — unusually, and worth saying, because
`testing-standards.md` sets `domain/` as the default and a reviewer will ask why.

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01, AC-02 | `auth.routes.spec.ts` (role in the response) + `SignIn.spec.tsx` (landing, admin nav) | API + component |
| AC-03 | `require-admin.spec.ts` + a supertest against the real `/api/admin` mount with an Employee token | **API — the client redirect is not the proof** |
| AC-04 | `sign-in-failure-delay.spec.ts` (domain) + `auth.service.spec.ts` (convergence) + `auth.routes.spec.ts` (identical bodies, floor) | domain + module + API |
| AC-05 | `SignIn.spec.tsx` — fields marked, focus moved, **no request sent** | component |
| AC-06 | `SignIn.spec.tsx` — exactly one request, button busy, label kept | component |
| AC-07 | `SignIn.spec.tsx` against a transport failure and a `503` | component |
| AC-08 | `require-https.spec.ts` (the code half) + the deployment configuration (Gate 3) | API + environment |

Only AC-04's delay rule is genuinely a pure rule. Everything else here is plumbing — the
middleware chain, the error shape, the rendered states — which is exactly the case
`testing-standards.md` names as the reason to reach for a higher level.

---

## 12. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | A router dependency for `apps/ui` | Joy Joshua | **UI work** |
| 2 | ADR-001, ADR-002 → `accepted`; ADR-003 decided | Joy Joshua | the PR |
| 3 | No rate limit: new requirement, or accepted risk? | Joy Joshua / PO | **Gate 3** |
| 4 | Email case-insensitivity confirmed into BR-001.10 | Joy Joshua → `/ba` | nothing |
| 5 | `TRUST_PROXY` config key (AC-08 behind a proxy) | Joy Joshua | nothing |
| 6 | No story owns the first-admin seed; US-016 assumes it | `/ba` | US-016 |
| 7 | `db-design.md` open question 3 — US-001 answers it "immediately"; confirm | PO / BA | nothing |
| 8 | `ai/quality/review-checklist.md` still requires Nx / graph-engine / Angular / NestJS; framework-locked | upstream `change-request` | nothing |
| 9 | `aidlc-check` check 6 looks for `apps/ui/project.json` and `libs/graph-engine`; the UI test-target check warns and skips forever | upstream `change-request` (already `app-architecture.md` §7 item 2) | nothing |
| 10 | US-004 must land before any booking story (§4.2) | Manager | delivery order |

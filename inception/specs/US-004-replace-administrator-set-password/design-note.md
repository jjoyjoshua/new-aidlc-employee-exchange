# US-004 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-004 — Replace an administrator-set password at first sign-in](../../stories/user-stories/US-004-replace-administrator-set-password.md) |
| **Screen**   | [SCR-010 — Set your password](../../design/screens/SCR-010-set-your-password.md), ST-01–ST-06; destinations [SCR-002](../../design/screens/SCR-002-my-bookings.md) / [SCR-005](../../design/screens/SCR-005-all-bookings.md) for AC-07; [SCR-001](../../design/screens/SCR-001-sign-in.md) ST-04 for AC-06 |
| **Tier**     | Complex — six surfaces, two of them protected paths, plus one `§Escalate` item (see §0) |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-003](../../../knowledge/decisions/ADR-003-express-mediated-sign-in.md) — **no new ADR** (§8) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is
argued before the code, not in a review thread. `decisions.md` in this package stays DEV's.

Three earlier artifacts wrote cheques this story cashes, and all three are quoted rather than
paraphrased below: `require-session.ts` step 5 is a named empty seam addressed to US-004;
`app-architecture.md` §5.1 already fixes the V-15 mechanism; `libs/contracts` already exports
`password_change_required` and `mustChangePassword`. US-002's note also left one item for this
PR by name (its §7: the SCR-010 sign-out link with a test citing `US-002/AC-04`) — §7.6.

---

## 0. The tiering

**Complex**, on six surfaces from `ai/standards/task-surfaces.md`. Naming each one precisely,
because two of them are protected paths and the sixth is an escalation rather than a tier:

**Protected paths (always Complex, regardless of diff size):**

- **`apps/api/src/http/middleware/**`** — step 5 of the auth chain. This is the file whose
  docblock says *"any change here is Complex"*, and the change is not a line: the factory gains a
  required argument (§4.2).
- **`libs/contracts/**`** — a new request schema, a new response schema, a shared policy
  evaluator, and **two new error-code strings**. Changing one changes both sides at once.

**`§Server` — Complex:**

- **A new route**, and a new **write** operation: `POST /api/auth/set-password` (§2).

**`§Browser` — Complex, three times over:**

- **A new route** — `/set-password`, reserved for this story by US-001's note §9.1 and still
  absent from `routes.tsx`.
- **The props or events of a shared component** — and this story creates **two** new ones,
  `policy-checklist` (§7.4) and `toast` (§7.5). SCR-010's component table names both.
- **A new or changed slice of shared/global state** — `AuthContextValue` gains `setPassword`,
  and `user` acquires a second thing that mutates it (§7.3).

**What it is *not*, and the absence is the payoff of US-001:**

- **No migration.** `must_change_password` already exists in `0001_user_profiles.sql`, defaulting
  `true`, with a comment addressed to this story. `supabase/migrations/**` is untouched.
- **No new dependency**, no `.env` key, no `eslint.config.mjs` change, no `tokens.css` change, no
  change to `apps/api/src/config/**` or `apps/api/src/infra/supabase/**`.
- **No change to `apps/api/src/http/app.ts`** — §4.4 explains why, and it is not an oversight.

### The one thing that is an escalation, not a tier

`task-surfaces.md` §Escalate: *"anything that would put the service-role key, a token, or a
password on a path toward a log."* **This story handles a plaintext password on three new
paths** — in a request body, in a probe sent to GoTrue (§5), and in a Supabase admin write (§6).
The persona stops and asks here. The answer I recommend is a named set of constraints rather
than a general intention:

1. **The request body is never logged**, and no request-logging middleware is added or widened in
   this PR. `app-architecture.md` §5.5 already forbids it; this is the first route where it bites.
2. **The `400` carries no Zod issue list and never echoes the submitted value** — US-001's rule
   (§2.1 of its note), and it is stronger here because the field *is* the credential.
3. **The probe's failure log carries a status and a message, never the candidate** — the shape
   `auth.adapter.ts` already uses for `supabase auth unreachable`.
4. **`confirmPassword` never crosses the wire at all** (§2.2), so there is exactly one copy of
   the credential in the request rather than two.
5. **No password reaches `decisions.md`, a test fixture committed as a real value, or a PR
   evidence paste.** Evidence pastes show status codes and codes, not bodies.

This is also RISK-005's mitigation (*"no password in persistent audit log"*) meeting its first
piece of code. Confirm it; it is your call, not the persona's.

---

## 1. What the forced change actually has to guarantee

REQ-029 and BR-001.17 are one rule with four clauses, and three of the four are about what must
**not** happen. Written out, because the natural implementation gets the third one wrong:

| Clause | Where it is enforced | Failure if omitted |
| --- | --- | --- |
| *"before any other application function is reachable"* (AC-02) | `requireSession` step 5 — **server** | A client-only redirect passes a click-through test and fails the story (the QA note says so) |
| *"the new password must satisfy V-12 and must not equal the administrator-set password"* (AC-04, AC-05) | V-12 **both sides**, V-15 **server only** (§3, §5) | V-12 in the browser alone is not a check; V-15 cannot be done in a browser at all |
| *"until it succeeds the administrator-set password remains valid"* (AC-08) | **The ordering in §6** | The tidy implementation — invalidate on arrival, or clear the mark first — locks a new starter out on their first morning. RISK-009 |
| *"on success the mark clears and the administrator-set password stops working immediately"* (AC-06) | §6, both halves | Half-implementing this is the specific trap the QA note names |

BR-001.17's full text is worth having in front of you for §6, because it is quoted there and it
settles a question the story does not: it says *"on success the mark clears and the
administrator-set password stops working immediately"* and **nothing whatsoever about other
devices or other live sessions**. §6.3 acts on that silence rather than filling it in.

---

## 2. The endpoint shape

### 2.1 `POST /api/auth/set-password` — inside the session chain, outside the password gate

**Method and path.** `POST`, and `/set-password`, mounted on the existing `authRouter` beside
`/sign-in` and `/sign-out`.

*Rejected: `PUT /api/auth/password`.* It is the tidier REST reading and it implies a resource you
could also `GET`, which this one emphatically is not. More decisively, it breaks the symmetry of
the auth surface — `/sign-in`, `/sign-out`, `/set-password` reads as three verbs a person
performs, and US-002 §2.1 already settled this trade for `/sign-out` on the same grounds. The
client address `/set-password` (reserved in US-001's note §9.1) then mirrors the server's, the
way `/admin/*` mirrors `/api/admin/*`.

*Rejected: `POST /api/auth/password-change`.* Same shape, worse English, no mirror.

**It runs `requireSession` steps 1–4 and 6, and is exempt from step 5.** It genuinely needs a
session: the server must know *whose* password to set, and it must not take the account from the
request body. Exemption from step 5 only — expressed structurally, not by matching a route
string. That is §4, and it is the section this note exists for.

### 2.2 The request — one field

```jsonc
POST /api/auth/set-password
Authorization: Bearer eyJ...

{ "newPassword": "..." }
```

`.strict()`, per `api-standards.md`. The password is **not trimmed, normalised or case-folded** —
the story's own edge case, and the same treatment `signInRequestSchema` gives the sign-in field.

**`confirmPassword` is not on the wire, deliberately.** The confirm field exists to protect a
person from saving a password they cannot retype; the server cannot make that guarantee any
better than the browser can. A client that sends two matching-but-mistyped values passes the
server check too, and a client whose two values differ has already failed its own. AC-04 puts the
mismatch in the browser in as many words — SCR-010 ST-02 is *"caught in the browser before any
request"* — and there is no ST-## for a server-reported mismatch.

*Rejected: send both and re-check equality server-side.* It looks like defence in depth and is
not. It doubles the number of plaintext copies of a credential in the body (§0), and it adds a
`400` with no screen state behind it. Defence in depth is V-12 being re-checked server-side
(§3.2), which is a rule an attacker can actually skip; equality of two fields in one form is not.

**No account identifier in the body.** The account is the bearer token's. A `userId` field would
be an authorization decision expressed as a request field, which is how one becomes forgettable.

### 2.3 The response — `200 { user }`

```jsonc
{
  "user": {
    "id": "…uuid…",
    "email": "priya@company.com",
    "fullName": "Priya Sharma",
    "role": "employee",
    "mustChangePassword": false
  }
}
```

The same shape `GET /api/auth/session` already returns, reusing `sessionResponseSchema` under a
second exported name (§3.1).

*Rejected: `204 No Content`, with the browser flipping its own copy of `mustChangePassword`.* It
is one byte cheaper and it makes two places decide whether the change happened. The browser's
copy of that boolean is what `RequireSession` reads (§7.2); the first time the two disagree, the
user is either trapped on SCR-010 or released into the product early. Returning the user makes
the server the source of truth for the fact the guard acts on, and AC-07's role comes from the
same response rather than from a value the browser has held since sign-in.

**One assumption this response makes, and §6.4 is where it is checked:** that the caller's
existing access token still works after the password write. If it does not, this response shape
must become `{ session, user }` — see §6.4 for exactly what changes and why it is a small change
rather than a redesign.

### 2.4 Errors

| Status | `code` | When | UI state |
| --- | --- | --- | --- |
| `400` | `invalid_request` | the body failed `setPasswordRequestSchema` — including **V-12** | ST-06 (should be unreachable — AC-04 stops it in the browser) |
| `401` | the four existing codes | `requireSession` steps 1–4 refused | back to SCR-001 |
| `403` | **`password_change_not_required`** | `must_change_password` is false — **AC-03's server half** | ST-06 (should be unreachable — §7.2 redirects first) |
| `422` | **`password_same_as_current`** | V-15: the probe says this *is* the current password | **ST-03** |
| `503` | `service_unavailable` | GoTrue unreachable during the probe or the write | ST-06 |
| `500` | `internal_error` | our bug | ST-06 |

**Two new codes, and both earn their place.** `password_same_as_current` is the whole of ST-03 —
the screen's one state that only the server can cause — and the browser switches on it to pick
between ST-03 and ST-06. `password_change_not_required` is AC-03's actual proof (§7.2); it must
be distinguishable from `password_change_required`, which is the opposite condition and one
character away in a switch statement.

**`422`, not `409`, and not `400`.** `api-standards.md`'s split: `409` means the world changed or
a value collides and retrying *differently* could succeed; `422` means *the rule says no*. V-15 is
a rule (it is listed in BRD-001's validation table beside V-06 and V-09), and nothing raced. And
not `400`, because `400` is reserved for "the request did not parse or violates a **field** rule"
— V-12 is a property of the string, V-15 is a property of the string *relative to stored state*,
which is exactly the line the two statuses are drawn on. **`api-standards.md`'s `422` row gains
`V-15`**, the same consequential edit US-001 made for `503` and US-002 for `204`.

**The `400` is generic.** No issue list, no echo. §0, constraint 2.

**No failure-delay floor.** US-001's `SIGN_IN_MIN_FAILURE_MS` exists because sign-in is an
account-existence oracle. This route is authenticated and answers only about the caller's own
account, so there is nothing to enumerate and nothing to pad.

### 2.5 What US-004 does not build

- **No voluntary password change**, no "change my password" link on SCR-004. BRD-001 §10 excludes
  it, AC-03 makes excluding it testable, and SCR-010's decisions table flags a voluntary route as
  a `change-request` if anyone wants it.
- **No password history.** The story's edge case allows reusing a *previously* used password, and
  no requirement asks otherwise.
- **No admin-facing reset** (US-027) and no account creation (US-021). This story consumes the
  mark; two other stories set it. `newPasswordSchema` is exported so SCR-009 inherits the rule
  (§3.1), and that is the only forward-looking thing in this note.
- **No lockout, no rate limit, no password-strength meter.** US-001 open item 3 still owns the
  first two — and §5.4 widens its surface in a way that matters.
- **No toast system.** One component, no provider, no queue (§7.5).

---

## 3. `libs/contracts` — the new slice

A protected path, and the change has two halves: the **policy** (shared with SCR-009 and with
`domain/` when US-021 arrives) and the **endpoint shapes**.

### 3.1 Where each piece goes

**New file `libs/contracts/src/password.ts`** — the V-12 policy, and nothing about auth:

```ts
import { z } from 'zod';

/**
 * V-12 — min 8 characters; an upper-case letter, a lower-case letter, a digit, a special
 * character (BRD-001, PO/security 2026-08-21). Five independent conditions, which is why
 * SCR-010's checklist has five rows.
 *
 * The IDs are stable and the **labels are not here**: copy lives in the UI, keyed on a code
 * (US-001/D-10). SCR-010 and SCR-009 word these rules for their own contexts.
 */
export const PASSWORD_RULE_IDS = ['length', 'upper', 'lower', 'digit', 'special'] as const;
export type PasswordRuleId = (typeof PASSWORD_RULE_IDS)[number];

/**
 * The one evaluation of V-12 in the project. The browser calls it on every keystroke to drive
 * SCR-010's checklist (AC-04); the route calls it through `newPasswordSchema` at the edge.
 * The SAME function — which is ADR-002's payoff a second time.
 *
 * Pure, total, and it never throws: an invalid password is five booleans, not an exception.
 */
export function evaluatePasswordPolicy(password: string): Record<PasswordRuleId, boolean> {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

/**
 * V-12 as a schema, built ON the evaluator rather than beside it — two regexes for one rule is
 * how the checklist and the refusal come to disagree.
 *
 * `max(200)` is the same wire bound `signInRequestSchema` carries: a guard against a
 * pathological body, not a policy. The password is never trimmed (US-004 edge cases).
 */
export const newPasswordSchema = z
  .string()
  .max(200)
  .refine((value) => Object.values(evaluatePasswordPolicy(value)).every(Boolean));
```

**`libs/contracts/src/auth.ts` gains the two endpoint shapes**, beside the existing ones:

```ts
import { newPasswordSchema } from './password.js';

/** `POST /api/auth/set-password` (US-004). One field: the confirm field never leaves the
 *  browser (design note §2.2), and the account is the bearer token's. */
export const setPasswordRequestSchema = z.object({ newPassword: newPasswordSchema }).strict();
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

/**
 * Literally the same shape `GET /session` answers with — "here is who you are now", with the
 * mark cleared. One object under two names, deliberately: a second `z.object({ user })` would
 * be two declarations of one contract, which is the sentence ADR-002 exists for. If the two
 * endpoints ever need to diverge, that is the moment to split them, not before.
 */
export const setPasswordResponseSchema = sessionResponseSchema;
export type SetPasswordResponse = z.infer<typeof setPasswordResponseSchema>;
```

**`libs/contracts/src/error.ts` gains two strings**, in the existing enum, each with the comment
style already there:

```ts
  // US-004/AC-05 — V-15. The new password is the administrator-set one. SCR-010 ST-03 is the
  // only state this code produces, and it is the only refusal on that screen the browser
  // cannot reach on its own.
  'password_same_as_current',
  // US-004/AC-03 — the mirror of `password_change_required`. There is no voluntary password
  // change in this release (BRD-001 §10), so the endpoint refuses an account that is not
  // marked. One character from its opposite in a switch, which is why both are constants.
  'password_change_not_required',
```

**`libs/contracts/src/index.ts`** re-exports `./password.js`.

### 3.2 Why V-12 lives in `libs/contracts` and is checked on **both** sides

This is the one place where an existing document and this note disagree, so it is argued rather
than asserted. `app-architecture.md` §2 lists *"Does this password satisfy V-12"* under `domain/`.
That document predates ADR-002 and `libs/contracts` by three days.

**`api-standards.md` already classifies V-12 as an edge rule**, in two independent places: the
status table's `400` row reads *"The request did not parse, or violates a field rule (**V-12**,
V-16)"*, and the "what does not go in the contract package" section draws the line at *"a desk
number is a non-empty string of at most N characters" is a contract; "this desk number is already
taken" is a business rule*. V-12 is exactly the first shape: a predicate over one string, with no
database, no other row and no context. V-15 is exactly the second, and §5 keeps it on the server.

**And AC-04 makes the shared evaluator a requirement rather than a convenience.** The browser must
name *which* rules are unmet, rule by rule, before any request. A server-only V-12 cannot drive
that checklist, and a browser-only copy of the five regexes is the drift ADR-002 was written to
stop — one that would show a user a green checklist and then a `400`.

**Both sides check it, and neither is redundant.** The browser check is AC-04 (*"no request is
sent"*). The server check is the trust boundary: a client that skips the UI and posts a
one-character password must be refused, or V-12 is decoration and REQ-018's policy is
unenforceable. `security-standards.md`'s rule that the browser is not a trust boundary is the
whole of the argument.

**What stays in `domain/`:** V-18 (REQ-033's generated password excludes `1`/`l`/`I`/`0`/`O`),
when US-021 arrives. That is a generator, it is server-only, and it will import
`evaluatePasswordPolicy` rather than restate it.

### 3.3 Two definitions in V-12 that nobody has written down

Both are decided here under the US-001/D-02 device — proceed under a stated assumption, record it
in `decisions.md`, route a one-line confirmation to `/ba`. Neither blocks code.

- **"A special character" is any character that is not `A–Z`, `a–z` or `0–9`**, including a space.
  *Rejected: an explicit allowlist such as `!@#$%^&*`.* A user whose special character is `£` or
  `—` would be refused by a rule that says "a special character", with no way on the screen to
  learn why. An open definition can only ever *help* someone satisfy the rule.
  **Known wart, named:** under this definition `é` counts as "special" rather than as a letter.
  It cannot block anyone, so it is not worth a second rule.
- **Length is counted in UTF-16 code units** (what `String.length` and Zod's `.min` count), so
  eight emoji count as sixteen. Acceptable; naming it so nobody "fixes" it into a grapheme
  counter and quietly changes a policy.

---

## 4. Step 5 — filling the seam without matching route strings

The DEV's question is the right one and it has three possible answers. This is the section that
picks one.

### 4.1 What the seam says today

`apps/api/src/http/middleware/require-session.ts`, lines 103–114, is a named empty comment
addressed to this story: *"must_change_password = true -> 403 password_change_required on every
route this chain guards"*, with US-002's note recorded beside it (sign-out never reaches the chain
at all, so it needs no allowlist entry here).

### 4.2 The decision: a required factory argument, and two chain instances

**Step 5 is written in the seam, exactly where it is promised. The exemption is a required
argument to the factory, chosen by name at composition.**

```ts
// require-session.ts
export interface RequireSessionDeps {
  // …existing…
  /**
   * US-004 / REQ-029. `'enforced'` is what every module mount takes. `'exempt'` exists for the
   * two routes in `authRouter` that a user with the mark must still be able to reach — the
   * password-change route itself and `GET /session` (design note §4.3).
   *
   * **Required, never defaulted**, for the reason `RevokeScope` is required on the adapter
   * (US-002/D-03): a default lets the consequential choice be made by omission.
   */
  passwordChangeGate: 'enforced' | 'exempt';
}
```

and the seam becomes:

```ts
        // 5 — REQ-029 / BR-001.17. The mark is loaded from user_profiles by step 3, never from
        //     a JWT claim: an admin reset (REQ-021) sets it under a live session, and a claim
        //     would go stale at that moment — the same reason `role` is not a claim.
        //
        //     Sign-out reaches no chain at all (US-002 design note §2.2). The two routes that
        //     run this chain with the gate 'exempt' are named in composition.ts, by name.
        if (passwordChangeGate === 'enforced' && user.mustChangePassword) {
          next(forbidden(ERROR_CODES.password_change_required, 'Choose your own password to continue.'));
          return;
        }
```

`composition.ts` builds the chain twice and names both:

```ts
const session = requireSession({ …deps, passwordChangeGate: 'enforced' });
const sessionForPasswordChange = requireSession({ …deps, passwordChangeGate: 'exempt' });

return createApp({
  authRouter: createAuthRouter({ service, nowMs, requireSession: sessionForPasswordChange }),
  adminRouter,
  requireSession: session,      // every module mount takes this one
});
```

**Why this is structural and not fragile:**

- **No route string is compared anywhere.** US-002 §2.2 documented the footgun in detail — under a
  mount at `/api/auth`, the middleware sees `/set-password` on `req.path` and
  `/api/auth/set-password` on `req.originalUrl`, and an allowlist written against the wrong one
  either exempts nothing or exempts too much, silently. That failure mode does not exist here.
- **The default is safe by shape.** A future author mounting `/api/bookings` reaches for `session`,
  because that is the one `createApp` takes and the one every existing mount uses. The exempt
  instance has a long, unattractive, single-purpose name and two call sites, both commented.
- **The exemption is visible in one file.** Someone auditing "which routes skip the password
  gate?" reads `composition.ts` and gets a complete answer, rather than grepping a middleware for
  a path list.

*Rejected: a separate `requirePasswordChanged` middleware composed after `requireSession`.* It is
the more fashionable factoring and it introduces a sequencing hazard this one does not have: the
new middleware reads `req.user`, which step 6 attaches, so mounting it **without** `requireSession`
in front is either a crash or — worse — a silent pass. That turns a guarantee that is currently
correct by construction into one that is correct by mounting them in the right order every time.
The whole point of US-001's mount-point argument is to remove exactly that class of mistake.

*Rejected: an allowlist of paths inside step 5.* US-002 §2.2's three reasons apply verbatim: it
makes a security criterion depend on a string a future author must remember, the `req.path` /
`req.originalUrl` split fails silently, and it puts route knowledge inside the auth chain.

### 4.3 There are **three** exemptions, not one, and the third is a finding

`app-architecture.md` §5.1 says the gate applies to *"every route except the password-change one
and sign-out"*. **That is incomplete, and building it as written breaks AC-08.**

`GET /api/auth/session` must also be exempt. Follow what happens otherwise, in the code as it
stands today:

1. A user with the mark set signs in, lands on SCR-010, and closes the browser (AC-08's scenario).
2. They come back. `AuthProvider`'s boot effect reads the stored session and calls
   `GET /api/auth/session` (`auth-context.tsx` lines 134–157).
3. With the gate applied, that returns `403 password_change_required`.
4. `auth-context.tsx` line 144: **any `result.kind === 'error'` clears the stored session, calls
   `onSignOut()` and renders signed out.** US-003 wrote that branch for the four `401`s and it is
   correct for them.

So a user who abandons the flow and returns is **signed out instead of being returned to SCR-010**,
and the mark becomes unreachable on a cold boot: the browser's only way to learn
`mustChangePassword` is the very endpoint the gate would refuse. AC-08's *"SCR-010 is required
again"* becomes "sign in again first", every time.

The alternative to exempting it would be to have the browser treat a `403 password_change_required`
from `/session` as a signed-in state — which cannot work, because the fixed error shape
`{ statusCode, code, message }` carries no user, and AC-07 needs the role.

**`GET /session` is exempt, and the justification is REQ-029's own words.** REQ-029 gates *"any
other application function"*. `/session` is not a function; it returns the caller's own identity
and the mark itself, serves no booking, desk or people data, and is the mechanism by which the
browser learns it must go to SCR-010. Gating the announcement of a gate is a loop.

**Consequential edit, in this PR:** `app-architecture.md` §5.1 step 4 becomes *"every route except
the password-change one, `GET /api/auth/session`, and sign-out"*, with the reason in one sentence.
`api-standards.md`'s "One `403` carries extra weight" section carries the same sentence and gains
`password_change_not_required` as its mirror. Same treatment ADR-003 and US-002 gave their own
consequential edits — keeping an existing document true rather than discovering it later.

### 4.4 What this does **not** change, and why that is worth saying

- **`apps/api/src/http/app.ts` is untouched.** It already takes `requireSession` as a dependency
  and mounts it on `/api/admin`; composition hands it the `'enforced'` instance. A story that adds
  a gate to every guarded mount without editing the file that does the mounting is the shape to
  aim for.
- **`POST /sign-out` keeps running no chain at all** (US-002 §2.2). Step 5 never sees it, which is
  what makes US-002/AC-04 hold structurally rather than by allowlist. The seam's own comment
  already says so; it now describes reality.
- **`apps/api/src/http/errors.ts` is untouched.** `forbidden()` and `PASSWORD_CHANGE_REQUIRED`
  already exist, and the two new codes arrive through `ERROR_CODES` from the contract package.

### 4.5 AC-02's server proof, today, against an empty router

The only guarded mount that exists is `/api/admin`, whose router is empty. That is enough, and it
is the same device US-001 used for AC-03:

| Token | Result | What it proves |
| --- | --- | --- |
| Employee, `must_change_password = true` | `403 password_change_required`, no body data | AC-02's server half |
| **Admin**, `must_change_password = true` | `403 password_change_required` — **not** `admin_only` | the gate precedes `requireAdmin`, which is REQ-029's *"before any other function"* |
| Admin, mark clear | `404 route_not_found` | the gate passed; there is genuinely nothing there yet |

The middle row is the one to write deliberately. The gate is about the account's state and
`requireAdmin` is about permission; ordering them the other way would let an admin's role check run
first and would read, in a log, as a permission problem rather than a pending password change.

---

## 5. V-15 — the probe, and what it leaves lying around

`app-architecture.md` §5.1 already fixes the mechanism: *"the check is done by attempting a
sign-in with the candidate password before setting it: success means it is the current password,
and the change is refused."* That is accepted architecture, not this note's invention (§8). What
the architecture does **not** say is what happens to the session that a successful probe mints,
and that is the omission this section closes.

### 5.1 The probe uses the existing adapter and mints a real session

`AuthAdapter.signInWithPassword(email, password)` returns `{ kind: 'ok', session: { access_token,
refresh_token, expires_at }, userId }`. On the refusal path — the candidate *is* the current
password — GoTrue has just issued a **real access token and a real refresh token**, and the
request is about to answer `422`. Left alone, that refresh token outlives the response.

**Revoke it immediately, with scope `'local'`, through the existing
`AuthAdapter.revokeSession(accessToken, scope)`. No new adapter method.**

`'local'` is not a hedge; it is the only correct value, and the reasoning is the inverse of
US-002's. `auth.admin.signOut(jwt, scope)` acts on the session the JWT belongs to: `'local'` ends
*that* session, `'global'` ends every session the account holds. The probe's JWT belongs to the
session the probe just created, so:

- **`'local'`** kills exactly the probe session and nothing else. The user's real session — the one
  they are holding while looking at SCR-010 — is untouched, so they stay on the screen, retype,
  and try again. This is ST-03's own behaviour: *"choose a different password and resubmit"*.
- **`'global'`** would kill the probe session **and the user's live session**, signing them out of
  SCR-010 in the middle of the flow as a side effect of a validation failure. Their next request
  would `401`, the browser would return them to SCR-001, and ST-03 would never render.

So the revoke scope is load-bearing for a *screen state*, not only for hygiene. Write the reason
in the call site's comment, because `'global'` is the value the sibling call site in
`attemptSignIn` uses and a reader will wonder.

**The revoke is best-effort, like its two siblings** — `.catch(() => undefined)`, logged. A failed
revoke must not turn a correct `422` into a `500`. The refusal is the security outcome and it is
already decided; that is `auth.service.ts`'s existing rule for the deactivated-account path, and
it applies unchanged.

### 5.2 A probe that reports `unavailable` fails **closed**

The story's edge case covers *"a save failure that is not AC-05 — server error, timeout, lost
connection"*: the account keeps the administrator-set password, the entered values are retained,
and the message says nothing changed (ST-06).

**A probe that cannot reach GoTrue is that edge case.** Return `503 service_unavailable` and write
nothing. The reasoning is short: we cannot prove the candidate is *not* the administrator-set
password, and V-15 is a security rule — accepting it anyway would let the flow "succeed" while
leaving the administrator holding a working credential, which is the precise thing REQ-029 exists
to end.

Failing closed is also free of the usual cost. Because nothing has been written, the
administrator-set password still works, sign-out is still available (SCR-010's own promise), and
ST-06's copy — *"We couldn't save that just now. The password you signed in with still works."* —
is **true**, not merely reassuring. An outage on this screen cannot strand anyone, which is
RISK-009's mitigation working as designed.

### 5.3 Where the probe sits in the service

```ts
export type SetPasswordOutcome =
  | { kind: 'ok'; user: AuthenticatedUser }
  | { kind: 'not-required' }      // AC-03 — the mark is not set
  | { kind: 'same-as-current' }   // AC-05 / V-15 — ST-03
  | { kind: 'unavailable' };      // ST-06
```

The service takes `(userId, newPassword)` and **re-reads the profile itself** rather than trusting
the `req.user` the middleware attached. One extra query, and it buys two things: the rule's
precondition is read where the rule lives, and the service is testable as `(userId, password) →
outcome` with no Express request in sight. A service that reads its own precondition from its
caller's argument is one refactor away from reading it from the browser.

The email handed to the probe is `profile.email` — the `user_profiles` value, lower-cased with the
same normalisation `attemptSignIn` applies (US-001/D-02), not anything from the token.

### 5.4 Two consequences of the probe that belong in front of you

- **A legitimate flow now produces failed sign-in events.** When the user chooses a *good*
  password, the probe is a **failed** authentication against GoTrue. If a lockout-after-N-failures
  rule is ever adopted — and it is one of the two acceptable outcomes US-001 open item 3 offers —
  **this design would lock people out for choosing a good password.** That is not hypothetical
  enough to ignore: the lockout decision is open, and whoever takes it must exclude the V-15 probe
  or V-15 needs a different mechanism. Carried as an open item, routed to the same owner as US-001
  open item 3 so the two are decided together.
- **Supabase's own auth rate limits now see a second class of request from one server IP.**
  US-001 §8 named the hazard — ADR-003 routes every sign-in through one IP, so a provider-side
  per-IP limit throttles the whole company rather than one user. Set-password requests now
  contribute to that budget. The gap is unchanged; its surface is wider. Same open item.

---

## 6. The write — an order in which every partial failure is safe

There is no transaction across GoTrue and Postgres, so "atomic enough" means: **choose an order in
which every way it can stop halfway leaves a state that is safe and recoverable.** That is a
design decision with a wrong answer, and the wrong answer is the tidier-looking one.

### 6.1 The order

```
1. Re-read user_profiles.                      no profile / inactive -> the chain already refused
2. must_change_password is false               -> not-required (403)            [AC-03]
3. PROBE: signInWithPassword(email, candidate)
     ok         -> revokeSession(probe token, 'local'); same-as-current (422)   [AC-05]
     unavailable-> unavailable (503)                                            [§5.2]
     rejected   -> continue
4. WRITE THE CREDENTIAL: auth.admin.updateUserById(userId, { password })
     failure    -> unavailable (503); NOTHING has changed                       [AC-08 holds]
5. CLEAR THE MARK: user_profiles.must_change_password = false
     failure    -> log at ERROR, still answer ok                                [§6.2]
6. ok, with the user carrying mustChangePassword: false                         [AC-06, AC-07]
```

**Steps 1–3 touch no credential whatsoever.** That is AC-08 restated as a property of the code:
until step 4 runs and succeeds, signing out or closing the browser leaves the administrator-set
password working and the mark set. SCR-010's own decisions table rejects the alternative in as many
words — *"Invalidating the old password on arrival. Tidier, and it can lock a new starter out on
their first morning."*

### 6.2 Why the mark clears **after** the credential, not before

| Order | If the second step fails | Verdict |
| --- | --- | --- |
| **Credential, then mark** (chosen) | The new password works; the mark is still set. The user is sent to SCR-010 again on their next request. They choose a *different* password and it works. No lockout, and an `ERROR` log line names the account | **Recoverable, loud, safe** |
| Mark, then credential | The user is released into the product **with the administrator-set password still working and the mark cleared**. REQ-029 is permanently defeated for that account, silently, and nothing will ever ask again | **Unrecoverable without an admin, and invisible** |

The second row is the whole argument. The first row has one wart worth naming: if the user retypes
the *same* new password on the second attempt, the probe now succeeds (it really is the current
password) and they get ST-03 — *"That's the password your admin gave you"* — which is false. It is
a confusing message in a rare double-failure, not a lockout, and buying it off would mean tracking
state nobody asked for.

**On a failed mark-clear the endpoint still answers `200`.** *Rejected: answer `503` / ST-06.* ST-06
says *"The password you signed in with still works"*, which after step 4 is **a lie** — and it would
send the user straight into the ST-03 confusion above. The browser's copy of the boolean governs
only the client-side guard; the server's step 5 remains the authority, so the worst case is a `403`
on the next request bouncing the user back to SCR-010. Log at `error` with the user id: that single
line is the operational signal, the same device US-001 used for the failure-delay floor and US-002
for a sign-out with no token.

### 6.3 No other sessions are revoked, because nothing asks for it

BR-001.17's full statement is: *"On success the mark clears and the administrator-set password stops
working immediately."* It says nothing about other devices or other live sessions, and neither does
REQ-029, the story, or SCR-010.

**So: no `'global'` revoke, no `'others'` revoke, and the caller's own session is left alone** — it
has to be, since AC-07 requires the user to continue straight into the product.

*Rejected: revoke `'others'` on success.* It is a defensible security instinct and it is US-002 §2.3's
argument in reverse: a person who changes their password on the office desktop and is signed out on
their phone has been surprised by a side effect nobody specified. If the PO wants it, it is a
one-line change and a `change-request`, not a silent addition. Note that the administrator never had
a *session* here — they had a *password*, and step 4 is what takes that away.

### 6.4 The assumption AC-07 rests on — take the measurement before merging

**Does the caller's existing access token still work after `auth.admin.updateUserById(userId,
{ password })`?**

GoTrue has configuration around revoking sessions on password change, and the admin API's behaviour
is not the same as the user-facing `updateUser` path. **I have not observed this on the installed
version in this project, and neither has anyone else in this repository.** Asserting it is exactly
the kind of thing that passes review and fails in use — US-002 §5 is the precedent, and its manual
check is now a habit worth keeping.

If the token is revoked, the `200 { user }` response in §2.3 is useless: the browser navigates to
SCR-002, the first request `401`s, and the user is thrown back to sign-in holding a password that
works — AC-07 fails while every test in §10 stays green.

**Required before this story is called done** (a manual check, output pasted in the PR): sign in as
an account with the mark set, capture the access token, `POST /api/auth/set-password`, then
`GET /api/auth/session` with the **same** access token. If it returns the user, the design as
written is correct.

**If it returns `401`, the fix is specified here so it is a change and not a redesign:** after
step 4, the service signs in once with the *new* password — the adapter method already exists — and
the route answers `{ session, user }`, the same shape `POST /sign-in` answers with and the same
shape `signInResponseSchema` already describes. The browser hands the session to `onSession` exactly
as `signIn` does (`auth-context.tsx` line 189) and stores the token in `accessTokenRef`. Three small
edits: the response schema, four lines in the service, six in the context.

I am not building that path speculatively, because it costs a round trip and a second live session
on every successful change, and it may be unnecessary. I am specifying it so that a `401` in the
check above is twenty minutes of work rather than a re-opened design.

---

## 7. The browser side

### 7.1 One function decides where anyone lands — AC-01, AC-03 and AC-07 are the same question

Three criteria ask "where does this user belong right now?", and answering it in three places is how
they come to disagree. One pure function, three call sites:

```ts
// apps/ui/src/lib/auth/landing.ts
import type { AuthenticatedUser } from '@desk-booking/contracts';

/**
 * Where a signed-in user belongs. The mark outranks the role: REQ-029 is "before any other
 * application function is reachable", and SCR-010 has no shell around it.
 *
 * US-004/AC-01 (sign-in lands here instead of the usual destination), AC-03 (someone without the
 * mark is sent away from SCR-010) and AC-07 (the destination after a successful change) are the
 * same question asked three times, and a pure function is the only way they cannot answer it
 * differently.
 */
export function landingPathFor(user: AuthenticatedUser): string {
  if (user.mustChangePassword) return '/set-password';
  return user.role === 'admin' ? '/admin/bookings' : '/bookings';
}
```

Four inputs, four outputs, one instant unit test — and the cheapest proof in this story.

**AC-01 is then two characters of change in `SignIn.tsx`.** Line 84 currently reads
`navigate(result.user.role === 'admin' ? '/admin/bookings' : '/bookings', { replace: true })`; it
becomes `navigate(landingPathFor(result.user), { replace: true })`. **`signIn()` in the context
stays navigation-free** — it is state, not routing, and that separation is already the shape of the
file.

### 7.2 Two guards that are exact complements — AC-02 and AC-03

`RequireSession` today handles booting and no-user. It gains the mark, and gets a mirror image:

```tsx
// require-session.tsx — a session AND the password already the holder's own
if (status === 'booting') return null;
if (!user) return <Navigate to="/sign-in" replace />;
// US-004/AC-02 — every screen inside the shell inherits this, because the guard is on the
// shell's route element rather than per route (US-002 §6.4's reasoning, unchanged).
if (user.mustChangePassword) return <Navigate to="/set-password" replace />;
return <>{children}</>;
```

```tsx
// require-password-change.tsx — a session AND the mark still set
if (status === 'booting') return null;
if (!user) return <Navigate to="/sign-in" replace />;
// US-004/AC-03 — there is no voluntary password change in this release (BRD-001 §10). Sent to
// where they do belong, the way RequireRole returns an employee to My bookings.
if (!user.mustChangePassword) return <Navigate to={landingPathFor(user)} replace />;
return <>{children}</>;
```

**The invariant, and it is what the tests assert:** for every `(user, status)` pair, **exactly one**
of the two renders its children. Two components rather than one boolean prop, for the reason
`RequireRole` and `RequireSession` were kept apart in US-002 §6.4 — a reader can tell which
guarantee a route is claiming by reading the route.

`routes.tsx` gains one route, deliberately **outside** the shell element, because SCR-010 has no
`app-shell` (*"the navigation appears only once the account is the holder's own"*):

```tsx
<Route
  path="/set-password"
  element={<RequirePasswordChange><SetPassword /></RequirePasswordChange>}
/>
```

**Neither guard is the guarantee, and the tests must say so.** The QA note is blunt: *"a redirect
implemented only in the client passes a click-through test and fails the story."*

- **AC-02's guarantee** is §4.5's `403` from the server on every guarded mount.
- **AC-03's guarantee** is `403 password_change_not_required` from `POST /api/auth/set-password`.
  This is worth stating plainly because it is easy to look for the wrong proof: SCR-010 is a client
  screen, so "the screen is not served" has no server-side meaning. The *thing* AC-03 protects is
  the ability to change a password voluntarily, and the endpoint is where that is refused.

### 7.3 `setPassword` on the auth context

The screen cannot call the API directly — the `ApiClient` is constructed inside `AuthProvider` and
is the only thing holding the access token. So the mechanism goes on the context, which is the
"changed slice of shared global state" in §0's tiering:

```ts
export type SetPasswordResult =
  | { kind: 'ok'; user: AuthenticatedUser }
  | { kind: 'same-as-current' }   // ST-03
  | { kind: 'failed' };           // ST-06 — everything else
```

**Three outcomes, because SCR-010 has exactly two failure states.** `same-as-current` is
`result.kind === 'error' && result.code === ERROR_CODES.password_same_as_current`; **everything
else** — `400`, `403`, `503`, a transport failure, an unparseable response — is `failed`. That
collapse is honest rather than lossy: ST-06's copy (*"We couldn't save that just now. The password
you signed in with still works."*) is true for every one of them, and inventing a seventh state for
a `400` that AC-04 makes unreachable would be copy for a situation no user can act on differently.

On `ok`, the provider sets `user` from the response **before** returning, so the guards see the
cleared mark. It does not navigate — the screen does.

### 7.4 `policy-checklist` — a new shared component, and its props are a contract

SCR-010's handoff is explicit: *"`policy-checklist` … is **built here first and inherited by
SCR-009** — so build it as a component with a met/pending/blocking axis, not as three
hand-assembled lists"*, and the Figma build confirms a `Policy rule` set with that axis plus a
`Policy checklist` wrapper.

```ts
// apps/ui/src/components/policy-checklist/PolicyChecklist.tsx

/**
 * Three looks, not two (SCR-010, 2026-09-07):
 *   met      — the rule is satisfied
 *   pending  — not satisfied, and nothing is wrong yet: hollow marker, --c-text-muted
 *   blocking — not satisfied, after a submit was refused: error icon, --c-danger-ink
 *
 * `pending` and `blocking` cannot be the same look, or a refused submit is pixel-identical to
 * the state before it and the button reads as dead. `pending` and error styling cannot be the
 * same either, or an untouched form appears to have five faults. The distinction is carried by
 * icon AND by text, so it survives without colour vision (NFR-008).
 */
export type PolicyRuleStatus = 'met' | 'pending' | 'blocking';

export interface PolicyRule {
  /** Stable, not the label — the test and the announcement key on this (PasswordRuleId). */
  id: string;
  /** The rule as readable text. Never signalled by colour alone (NFR-008). */
  label: string;
  status: PolicyRuleStatus;
}

export interface PolicyChecklistProps {
  rules: PolicyRule[];
  /** For the field's `aria-describedby`, so the list is announced as the field's description. */
  id?: string;
  /** The group's accessible name, e.g. "Your password must contain". */
  label?: string;
}
```

**Four decisions inside those twelve lines:**

- **It receives resolved statuses; it never receives the password.** A component that evaluated
  V-12 would put the policy in a second place (§3.2 exists to stop that), and SCR-009 evaluates the
  same rules in a different flow. It also keeps a plaintext credential out of one more prop, which
  is §0's constraint list applied to the browser.
- **Status is per rule, not a single `blocking` flag on the list.** SCR-010 ST-02 is explicit that
  *"rules already satisfied keep their met `✓` and do not move"* while unmet ones turn blocking —
  one flag cannot express that.
- **The screen owns "has a submit been attempted".** The component has no memory and no effects.
- **The live region lives here** (`aria-live="polite"` on the list), because SCR-010 requires each
  rule to be announced as it is satisfied — *"A number: met"*. The status word is rendered as
  visually-hidden text per row, so the announcement is a sentence rather than an icon nobody can
  hear. This is the component's one piece of behaviour and it is the reason it is a component.

The five labels are SCR-010's copy — *"8 characters or more"*, *"An upper-case letter"*, *"A
lower-case letter"*, *"A number"*, *"A special character"* — and they live in the **screen**, keyed
on `PasswordRuleId`. Copy in the UI, rules in the contract: US-001/D-10, unchanged.

### 7.5 `toast` — the smallest thing that makes ST-05 exist

SCR-010's component table lists `toast` for ST-05, no such component exists, and the story says the
states exercised are *"All six; SCR-010 has no others"*. A state that is not built is a state nobody
counts, which is the thing the numbering exists to prevent.

**Build one component, and no toast system.** `<Toast>{children}</Toast>` with `role="status"`, one
dismiss control, tokens only. The message travels on the navigation:
`navigate(landingPathFor(user), { replace: true, state: { toast: 'password-saved' } })`, and
SCR-002 / SCR-005 render it when that state is present, then clear it with a
`navigate(pathname, { replace: true, state: null })` so a reload does not replay it.

*Rejected: a toast provider, context or queue.* That is a new slice of global state for a feature
with exactly one message in the whole application. Promote it when a second toast exists (US-010's
cancellation is the likely one).

*Rejected: auto-dismiss after N seconds.* No spec gives a duration, a message that vanishes on its
own is one a screen-reader user may never finish hearing, and inventing a timing constant is
inventing design. **Confirm with `/ux`** — it is the one piece of this screen the spec does not
pin down, and it changes nothing structural either way.

**SCR-005 has no `HF /` frames**, and SCR-010's handoff defers ST-05's admin path to SCR-005's own
build. The component is the same object on both destinations, so it is built and rendered on both;
what remains outstanding is the *frame*, which is UX's, not this story's.

### 7.6 The screen itself, and the debt US-002 left here

`apps/ui/src/screens/set-password/SetPassword.tsx`, composing `card`, `password-field`,
`policy-checklist`, `button`, `alert`, `spinner`, `login-backdrop` (1280 only) and the ghost
**Sign out** button beneath the card. Six states, mapped:

| State | Trigger | Behaviour that is easy to get wrong |
| --- | --- | --- |
| ST-01 | mount | Five rules **pending**, never error styling. New-password field focused. Button **enabled** — a disabled submit hides which rule is missing |
| ST-02 | submit with unmet rules, a mismatch, or an empty field | Unmet rules turn **blocking**; met ones do not move; *"These don't match."* under the confirm field; focus to the first field needing attention; **no request is sent** |
| ST-03 | `422 password_same_as_current` | **Both fields cleared** (whatever was typed is now known to be the wrong value); focus to the new-password field; assertive alert |
| ST-04 | in flight | Button busy with its label kept; both fields read-only; spinner takes the **button's label colour**; double submit prevented |
| ST-05 | `200` | Navigate to `landingPathFor(user)` carrying the toast |
| ST-06 | anything else | **Both fields keep their contents** — a compliant password retyped from memory tends to be a weaker one. Sign-out stays reachable |

Two mechanics worth writing down:

- **`noValidate` on the form**, `autocomplete="new-password"` on both fields (SCR-010: this *is* the
  holder's own credential, so a password manager should be encouraged to save it). Five tab stops,
  **Sign out** last.
- **AC-07's navigation must happen in the same continuation as the state update.** `setPassword`
  resolves, the provider has set `user` with the mark cleared, and the screen calls `navigate(...)`
  immediately after the `await` — React 18's automatic batching then applies both in one render and
  the destination is reached with the toast state intact. Put a `setTimeout` or a second `await`
  between them and `RequirePasswordChange` re-renders first, redirects to the same destination on
  its own, and the toast is silently lost. Same place, no toast, no error — the kind of bug that is
  found in a demo.

**US-002 §7 left this story an obligation by name:** the SCR-010 **Sign out** link, with a component
test citing `US-002/AC-04`. It is the ghost button beneath the card, it calls the existing
`signOut()` from the context, and its test title cites **both** stories. This is the completeness
half of a criterion whose durable halves US-002 already proved at the API level.

---

## 8. No new ADR — including for the probe

**No ADR.** The test is US-002 §8's: does a decision bind work beyond the story that made it, with a
rejected alternative a future author would otherwise re-litigate?

- **The V-15 probe is not a new decision.** `app-architecture.md` §5.1 already specifies it, in an
  approved document, in one sentence. An ADR now would document a decision that was taken
  elsewhere and is already written down.
- **And it has no real alternative to reject.** Supabase exposes no password-comparison API; storing
  or comparing a hash ourselves would put credential material inside our own process, which is the
  shape ADR-001 and ADR-003 exist to keep out. An ADR whose "alternatives considered" column is
  empty is a template filled in, and this repository's ADRs are not that.
- **The step-5 gate itself is accepted architecture** — §5.1 step 4, `api-standards.md`'s "one 403
  carries extra weight", the code string already exported from `libs/contracts`. US-004 implements
  it; it does not decide it.
- **The contract package pattern is ADR-002**, exercised here by adding to it exactly as intended.

**Three consequential edits instead**, and none of them is an ADR — the same kind of upkeep ADR-003
and US-002 performed: `app-architecture.md` §5.1's exemption list (§4.3), `api-standards.md`'s `422`
row and its `403` section (§2.4, §4.3), and `inception/specs/index.md`'s row.

**The honest counter-argument, so you can weigh it.** Two consecutive stories have now each invented
a different way for a route to relate to the auth chain — US-002 put one outside it entirely, US-004
adds a per-instance gate flag. Two patterns is a coincidence; three is an undocumented convention,
and the third author will re-derive it. **If you expect more exempt routes, an ADR titled "how routes
relate to the auth chain" is cheap and I will draft it.** I do not expect more: `/sign-in`,
`/sign-out`, `/session` and `/set-password` are the whole auth surface, and the remaining thirty-odd
endpoints in BRD-001 all want the chain in full.

---

## 9. File placement

**New**

```
libs/contracts/src/password.ts (+ password.spec.ts)      <- V-12: rule ids, evaluator, schema (§3.1)

apps/ui/src/lib/auth/landing.ts (+ landing.spec.ts)      <- one function, three criteria (§7.1)
apps/ui/src/lib/auth/require-password-change.tsx (+ .spec.tsx)   <- AC-03's client half (§7.2)
apps/ui/src/components/policy-checklist/PolicyChecklist.tsx
                                        + policy-checklist.css + PolicyChecklist.spec.tsx  (§7.4)
apps/ui/src/components/toast/Toast.tsx  + toast.css + Toast.spec.tsx                       (§7.5)
apps/ui/src/screens/set-password/SetPassword.tsx + set-password.css + SetPassword.spec.tsx (§7.6)
```

**Modified**

```
libs/contracts/src/index.ts          re-export ./password.js                     (protected path)
libs/contracts/src/auth.ts           + setPasswordRequest/ResponseSchema         (protected path)
libs/contracts/src/error.ts          + password_same_as_current,
                                       password_change_not_required              (protected path)

apps/api/src/http/middleware/require-session.ts   step 5 filled; `passwordChangeGate`
                                                  REQUIRED on the factory (§4.2) (protected path)
apps/api/src/http/middleware/require-session.spec.ts  the gate, both instances
apps/api/src/composition.ts          two chain instances, both named (§4.2)
apps/api/src/modules/auth/auth.service.ts      + setPassword(userId, newPassword) (§5.3, §6.1);
                                                 AuthAdapter gains setPassword
apps/api/src/modules/auth/auth.adapter.ts      + setPassword via
                                                 auth.admin.updateUserById (§6)
apps/api/src/modules/auth/auth.repository.ts   + clearMustChangePassword(id)
apps/api/src/modules/auth/auth.router.ts       + POST /set-password; GET /session now takes the
                                                 EXEMPT chain instance (§4.3)
apps/api/src/modules/auth/auth.routes.spec.ts  the AC-02/03/05/06/08 sequences (§10)
apps/api/src/modules/auth/auth.service.spec.ts the probe, the revoke scope, the write order

apps/ui/src/lib/auth/auth-context.tsx    + setPassword; sets `user` from the response (§7.3)
apps/ui/src/lib/auth/require-session.tsx + the mark redirect (§7.2)               <- AC-02
apps/ui/src/routes.tsx                   + /set-password, OUTSIDE the shell (§7.2)
apps/ui/src/screens/sign-in/SignIn.tsx   navigate(landingPathFor(user)) (§7.1)    <- AC-01
apps/ui/src/screens/my-bookings/MyBookings.tsx   render the ST-05 toast (§7.5)
apps/ui/src/screens/all-bookings/AllBookings.tsx render the ST-05 toast (§7.5)

ai/standards/api-standards.md            V-15 into the 422 row; the 403 section's
                                         exemption list + the mirror code (§2.4, §4.3)
inception/architecture/app-architecture.md §5.1  three exemptions, not one (§4.3)
inception/specs/index.md                 the US-004 row
knowledge/traceability/manifest.json     US-004 tests[]; + SCR-001/SCR-002/SCR-005 in
                                         screens[] (§11 item 7)
```

**Not modified, and worth saying so:**

- **`supabase/migrations/**`** — the column exists, defaulting `true`, written by US-001 for this
  story to act on. A Complex story that adds a security gate without a schema change is what that
  foresight bought.
- **`apps/api/src/http/app.ts`** — §4.4. Composition hands it the enforcing chain; the mount is
  already correct.
- **`apps/api/src/http/errors.ts`** — `forbidden()`, `unprocessable()` and
  `PASSWORD_CHANGE_REQUIRED` all already exist.
- **`eslint.config.mjs`, `apps/api/src/config/**`, `apps/api/src/infra/**`, `tokens.css`** — four
  protected paths untouched.

---

## 10. Test placement summary

The organising constraint is the story's own QA note: **AC-02 and AC-03 are security criteria that
need direct-address requests, not UI navigation**, and **AC-06 has two halves that are easy to
half-implement**.

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `landing.spec.ts` (four inputs, four outputs) + `SignIn.spec.tsx` — a user with the mark lands on `/set-password`, not on their role's home | unit + component |
| **AC-02** | `auth.routes.spec.ts` — §4.5's table: employee **and** admin with the mark get `403 password_change_required` from `/api/admin/*`, before `requireAdmin`, with no data | **API — the redirect is not the proof** |
| AC-02 | `require-session.spec.tsx` — rendering a shell route with the mark set redirects to `/set-password` and the screen component never mounts | component |
| **AC-03** | `auth.routes.spec.ts` — `POST /set-password` with the mark **clear** answers `403 password_change_not_required` and writes nothing | **API — this is AC-03's real server half (§7.2)** |
| AC-03 | `require-password-change.spec.tsx` — the complement invariant over all four `(user, mark)` combinations | component |
| AC-04 | `password.spec.ts` (each of the five rules, independently, both ways) + `SetPassword.spec.tsx` — rules named in the checklist, the mismatch message, **no request sent** | unit + component |
| **AC-05** | `auth.service.spec.ts` — a probe that succeeds yields `same-as-current` **and the probe's token is revoked with scope `'local'`**; `auth.routes.spec.ts` — `422` + the code; `SetPassword.spec.tsx` — ST-03 clears both fields and moves focus | module + API + component |
| **AC-06** | `auth.routes.spec.ts` — **the sequence below**. Both halves | **API** |
| AC-07 | `SetPassword.spec.tsx` — employee → `/bookings`, admin → `/admin/bookings`, toast rendered; `landing.spec.ts` | component + unit |
| **AC-08** | `auth.routes.spec.ts` — sign out mid-flow, then sign in with the administrator-set password: `200`, `mustChangePassword` **still true**; plus `GET /session` still reachable with the mark set (§4.3) | **API** |
| AC-08 | `SetPassword.spec.tsx` — the **Sign out** control is present and ends the session, citing `US-002/AC-04` as well (§7.6) | component |

**The AC-06 sequence, concretely**, because "the old password stops working" has a right and a wrong
assertion and the wrong one looks identical in a diff:

```
POST /api/auth/sign-in    old password -> 200, mustChangePassword: true, token T
POST /api/auth/set-password  with T, { newPassword: N } -> 200, mustChangePassword: false
POST /api/auth/sign-in    OLD password -> 401 invalid_credentials      <- half one
POST /api/auth/sign-in    N            -> 200, mustChangePassword: false <- half two + the mark
```

**The stub adapter has to model a credential for that to mean anything.** `auth.routes.spec.ts`
already carries a stub with `tokens: Record<token, userId>` and a `revoked: string[]`, and US-002
made `revokeSession` delete from the `tokens` map so the test asserted behaviour rather than a call.
Extend it the same way: hold `passwords: Record<userId, string>`, have `signInWithPassword` compare
against it, and have `setPassword` **overwrite** it. Then the four lines above are four real requests
against the real `createApp`, and the old password stops working because it genuinely stopped
working.

**Do not assert against `revoked`** for AC-05 either — `testing-standards.md` bans asserting the
mock. Assert that the probe's token no longer verifies, the way US-002 did.

**And none of this closes §6.4.** These tests prove our service behaves correctly over a stub. Whether
real GoTrue leaves the caller's access token alive after `updateUserById` is an empirical question,
and the pasted manual check in the PR is its only evidence. Green tests here plus a missing check
there is the exact combination that ships a password change that signs the user out.

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§0** — the `§Escalate` surface: a plaintext password on three new paths. Confirm the five named constraints (no body logging, no issue list, no echo, no probe-value logging, no password in fixtures or evidence) | Joy Joshua | **the start of code** |
| 2 | **§6.4** — does the caller's access token survive `auth.admin.updateUserById`? Manual check, output pasted in the PR. Fallback specified in §6.4 | DEV → Joy Joshua | **AC-07 being true** |
| 3 | **§5.4** — the V-15 probe produces a **failed** GoTrue sign-in whenever the user picks a *good* password. If a lockout rule is ever adopted (one of US-001 open item 3's two outcomes), it must exclude this probe or V-15 needs a different mechanism | Joy Joshua / PO | **a future lockout decision** |
| 4 | **§5.4** — US-001 open item 3 (no rate limit on the auth surface) now has a second class of request contributing to Supabase's per-IP auth budget from one server IP. Gap unchanged, surface wider | Joy Joshua / PO / DevOps | **Gate 3** |
| 5 | **§3.3** — V-12's "special character" defined as any non-alphanumeric, and length counted in UTF-16 code units. Proceeding under the assumption; a one-line confirmation into V-12 | Joy Joshua → `/ba` | nothing |
| 6 | **§4.3** — `GET /api/auth/session` exempt from the gate. `app-architecture.md` §5.1's "every route except the password-change one and sign-out" needs its third exception | DEV, in this PR | nothing |
| 7 | **Manifest** — US-004's `screens[]` lists only SCR-010. AC-06 refuses on **SCR-001** ST-04 and AC-07 lands on **SCR-002 / SCR-005**. Add all three, or the trace says those criteria have no screen | DEV / `/ba` | nothing |
| 8 | **§7.5** — the toast's dismissal: a control only, or also a timer? No spec gives a duration | `/ux` | nothing |
| 9 | **§6.3** — no other sessions are revoked on success, because BR-001.17 does not ask. Confirm nobody expects "sign me out everywhere after a password change" | Joy Joshua / PO | nothing |
| 10 | **§8** — the honest counter: two stories, two patterns for relating a route to the auth chain. An ADR if you expect a third; I do not | Joy Joshua | nothing |
| 11 | **US-002 §7's debt** — the SCR-010 sign-out link with a test citing `US-002/AC-04` lands in this PR (§7.6) | DEV, in this PR | US-002's definition of done |
| 12 | **US-001 open item 10** — *"US-004 must land before any booking story"*. This story closes that constraint on merge; tell the Manager | Manager | delivery order |

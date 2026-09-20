# US-027 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-027 — Reset somebody's password](../../stories/user-stories/US-027-reset-somebodys-password.md) |
| **Screen**   | SCR-008 **ST-10 – ST-13, ST-15**. **Not frame-verified** — the Figma connector was unauthorized in the review session; see open item 1. ST-11's substance *is* verified against the approved spec text (`SCR-008-people.md:171, :225, :281-285`) |
| **Tier**     | Complex — **contract** (a new write endpoint, a new response schema, a new prop on a shared component) and **trust** (the system's second credential-minting surface, and the first that returns a plaintext credential to a caller). Either alone carries it (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-20                                 |
| **Rests on** | ADR-001, ADR-002, ADR-010, ADR-011, ADR-012 — and one new ADR, [ADR-014](../../../knowledge/decisions/ADR-014-generated-credential-alphabets.md), for D-01 only (§9) |

**Advisory.** The human's GitHub review is the authority. `spec.md`, `impact-analysis.md`,
`implementation-plan.md`, `decisions.md` and `traceability.md` stay DEV's.

**Written after Gate D1**, per `ai/gates/delivery.md`'s ordering, before Step 1 starts.

**The verdict, in one line each:**

- **The write order is wrong, and it is the one finding that strands a person's account.** The
  original plan's Step 5 ran `setPassword` before `armMustChangePassword`. A failure between them
  leaves the account holding a password nobody has ever seen, and ST-13 saying "Nothing has
  changed." **ADR-012 already decided the opposite order for the sibling write** — profile first,
  Supabase Auth second — and the plan neither cited it nor rebutted it (§2.1). **blocker, fixed in
  the plan below.**
- **The `findById` pre-read is deleted, not reordered.** With the profile write first,
  `armMustChangePassword` can `RETURNING` the five columns `mapAccount` needs, exactly as
  `activateAccount` already does (`users.repository.ts:461-471`). One statement is the existence
  check, the write and the response body. That also closes the read-then-write race
  `impact-analysis.md` had booked as an accepted risk (§2.2).
- **Putting `setPassword` on `users.adapter.ts` is correct.** The boundary rule is at
  **`eslint.config.mjs:12-22` in the repository root** (the package files cited a nonexistent
  `apps/api/eslint.config.mjs` — corrected, §4.2).
- **`auth.adapter.ts` already has a `setPassword` doing the identical GoTrue call**
  (`auth.adapter.ts:110-136`). The duplicate is *required* by the boundary, not sloppy — but the
  new method must inherit the old one's log-line discipline verbatim: `userId` and
  `error.message`, never the password, never the whole options object (§4.1).
- **AC-08 holds by construction on both sides, verified rather than assumed.**
  `infra/logger` redacts any field keyed `password` at any depth (`logger/index.ts:14-31`);
  `error-handler.ts:32-37` logs only `message`/`stack`; `api-client.ts:135-138` logs the request
  path and zod *issue paths*, never values. **The one uncovered path is string interpolation into
  a log message**, which no redactor can see (§3). That, not the response body, is what AC-08's
  test must aim at.
- **`domain/` is declared pure and a CSPRNG is not pure.** `domain/README.md:3-4` — "Every input
  arrives as an argument, including today's date" — and `eslint.config.mjs` bans `Date.now` for
  exactly that reason. `crypto.getRandomValues` is the same nondeterminism and no lint rule catches
  it. The generator takes the RNG as an argument (§5.1) — this also buys a test that proves the
  one-of-each-class guarantee structurally instead of statistically.
- **D-01 is sound, permitted, and deserves an ADR — but it falsifies a shipped docblock nobody has
  noticed.** `generate-password.ts:10-12` justifies the create path's exclusion set by citing
  "SCR-008 ST-10's own reasoning, reused here verbatim" — this story's own screen. ST-10
  (`SCR-008-people.md:164`) contains no glyph reasoning at all, so that citation is already
  inaccurate; after D-01 it is actively contradictory. This story corrects the record (§5.3,
  ADR-014).
- **D-01 does not violate V-18.** V-18 is scoped by its own text and its own trace to a generated
  **initial** password (`BRD-001:281` → REQ-033, and `BRD-001:84` reads "When creating a
  user…"). US-027 traces to V-12 and never to V-18. The story asked the question, the human
  answered it. No Gate 1 round trip (§5.2).
- **D-01 said nothing about the special-character set, and it should.** The credential is read
  aloud. Keep `!@#$%^&*-_=+?` (`generate-password.ts:19`) verbatim — never a space, quote,
  backslash or backtick, which break dictation and clipboard round-trips in ways a glyph never
  does. `evaluatePasswordPolicy`'s "anything outside A-Za-z0-9" is deliberately open
  (`password.ts:28-31`) and will not stop a wider alphabet (§5.4).
- **D-02 is right, and the approved spec proves it without Figma.** `SCR-008-people.md:225` —
  "the trap is strict: no outside click, no Escape, only **Done**" — and `:284-285` — "The
  dialog has **no ✕ in its header**". A `busy`-only workaround renders a disabled icon
  (`Dialog.tsx:117-125`), which is the wrong picture (§7).
- **Half of AC-04 is already true and must be tested as inherited, not built.** `.dialog__overlay`
  (`Dialog.tsx:105`) carries **no click handler** — this component has never dismissed on a
  backdrop click. `dismissible` only has to remove the ✕ and suppress Escape (§7.1).
- **`dismissible` is the first prop admitted to a component that refuses props by name**
  (`Dialog.tsx:16-27` refuses `scrim`, `anchor`, `modal`). Admit it on a stated principle — it
  modifies chrome this component already owns — and write that principle into the docblock (§7.2).
- **A new response schema is right (D-05), and `emailTakenDetailsSchema` is the precedent to
  cite** (§6). Its `password` field must be `z.string().min(1)`, never `newPasswordSchema` —
  re-validating a credential the server has already *set* turns a policy change into an
  unrecoverable account.
- **Nothing in the original package addresses an administrator resetting their own password**,
  which the story explicitly permits. Their next `/api/admin/*` call answers `403
  password_change_required`, every fetcher maps an unrecognised code to `failed`, and the People
  screen dies silently until a reload. This is US-025's self-deactivation finding recurring
  (§8) — server behaviour is correct as planned; the copy question is UX's → open item 2.
- **AC-06 and AC-07 are both inherited, and `require-session.ts:116-130` names this story in its
  own comment** — "an admin reset (REQ-021) sets it under a live session, and a claim would go
  stale at that moment." The mark is read from `user_profiles` per request, so a live session is
  gated at its very next call. Test it; do not build it (§1).

---

## 0. The tiering — confirmed

| Surface | What it is here |
| --- | --- |
| **Contract** | `POST /api/admin/users/:id/reset-password` — a new write operation, Complex outright. Plus `resetPasswordResponseSchema` and an additive prop on a shared component |
| **Trust** | The system's **second** credential-minting surface and the **first** that returns a plaintext credential in a response body. `POST /users` mints one, but the caller supplied it (`admin.router.ts:140-152`) |
| **Persistence** | **No.** `must_change_password` exists and defaults `true` (`0001_user_profiles.sql:35`). This story is its first re-armer; that is a write, not a schema change. `impact-analysis.md` is right |

**Not a new guard.** `requireAdmin` mounts once at `/api/admin`, so AC-11's production diff is empty
and its test is not. **No `requireActingAdmin`** (D-03 is right): `user_profiles` has no actor
column for a reset, and `POST /users/:id/role` is the standing precedent for an admin write with no
attribution. State in the PR that this is deliberately unlike `/deactivate`, so the asymmetry reads
as a decision.

---

## 1. What this story actually is

| AC | Where it is answered |
| --- | --- |
| **AC-01** a new V-12-compliant password is set | §5's generator + §2's service |
| **AC-02** the confirmation states every consequence | Copy only. Four clauses, in `SCR-008-people.md:164`'s order |
| **AC-03** shown once, monospaced, with Copy | `ResetPasswordDialog` + `--t-mono` (`SCR-008-people.md:281-282`) |
| **AC-04** cannot be dismissed | **Half inherited** — no backdrop handler exists today (§7.1). `dismissible={false}` supplies the other half |
| **AC-05** cannot be shown again | Structural: the value lives only in the hook's state and nothing persists it (§3.3) |
| **AC-06** the old password stops working | **Inherited from GoTrue.** `updateUserById({password})` replaces the credential; nothing in this repository caches or compares one |
| **AC-07** sent to Set your password | **Inherited, and designed for this story.** `require-session.ts:116-130` reads the mark from `user_profiles` **per request**, never from a JWT claim, and its comment names REQ-021 as the reason. This story only writes the flag |
| **AC-08** never emailed, never logged | §3. `modules/notifications` is untouched — a diff there is a review finding |
| **AC-09** nothing changes until it succeeds | Fixed by the reordered write in §2.1 |
| **AC-10** re-resettable mid-forced-change | Structural: `armMustChangePassword` sets `true` unconditionally; an already-`true` row is a no-op (§2.3) |
| **AC-11** admins only | Inherited (§0), proven at the real mount |

---

## 2. The endpoint

### 2.1 Two systems, no shared transaction — order corrected

This is ADR-011/ADR-012's exact situation: a `user_profiles` write and a Supabase Auth write with no
transaction spanning them. The write order must be **profile first, Supabase Auth second**:

| | failure point | resulting state | what ST-13 tells the administrator |
| --- | --- | --- | --- |
| **Wrong order** (Auth first) | the profile write fails after the Auth write | The account's password is a random string nobody has ever seen. The person cannot sign in. The flag is not armed | "Nothing has changed." — **false**, and the administrator now believes the old password still works |
| **Correct order** (profile first) | the Auth write fails after the profile write | The old password **still works** (AC-09's substance). The flag is armed, so the person is sent to *Set your password* at next sign-in — a state BR-001.17 already considers normal | "Nothing has changed." — true about the password, which is what the copy is about |

`users.service.ts:231-304`'s `updateAccount` states the rule already: "`user_profiles` first,
Supabase Auth second, the REVERSE of `createAccount` above, because the foreign key that forces
Auth-first on an insert constrains nothing here." A reset is an update; the same reasoning applies
unchanged. This is recorded as **D-06** in `decisions.md`.

### 2.2 The service shape

```ts
/**
 * US-027/AC-01, AC-06, AC-07, AC-09, AC-10. Two systems, one write each, in ADR-012's order —
 * `user_profiles` first, Supabase Auth second — for ADR-012's own reason, restated for the case
 * that makes it sharper here: the reverse order can leave an account holding a credential NOBODY
 * has seen, which no later request can recover (design note §2.1).
 *
 * The plaintext exists in exactly one place — `password` below — and leaves this function in
 * exactly one direction: the returned object. It is never passed to `logger`, never interpolated
 * into an Error message, and never written to any column (AC-08, RISK-005).
 */
async resetPassword(id: string): Promise<ResetPasswordOutcome> {
  // No `findById`. The WRITE is the arbiter — the house rule every other writer in this module
  // states, and `activateAccount` is the exact shape: one statement is the existence check, the
  // write, and the five columns `mapAccount` needs.
  const armed = await users.armMustChangePassword({ id, updatedAt: new Date(nowMs()) });
  if (armed.kind === 'not_found') return { kind: 'not_found' };

  const password = generateResetPassword(randomInt);

  const auth = await usersAuth.setPassword(id, password);
  if (auth.kind !== 'ok') {
    // Logged, never thrown, never surfaced (ADR-011 item 3). No compensating un-arm — §2.4.
    logger.error('password reset failed at the auth write; the credential was NOT changed', { id });
    return { kind: 'unavailable' };
  }

  return { kind: 'ok', account: mapAccount(armed.profile), password };
}
```

### 2.3 `armMustChangePassword`

Modelled on `activateAccount` (`users.repository.ts:461-471`) exactly: names `must_change_password`
and `updated_at` and nothing else, `.maybeSingle()` (zero rows → `not_found`, never a throw),
unconditional (no `already_armed` branch — a plain `UPDATE` cannot see the pre-write state, and a
repeat has no side effect to double-fire, so `ok` is honest either way — this is what makes AC-10 a
no-op rather than a branch). `RETURNING id, full_name, email, role, is_active` — the same five
columns every other writer in this file returns — is what lets §2.2 drop the pre-read. Do not add
`must_change_password` to that select list: nothing downstream reads it, and `adminUserSchema` is
deliberately not `.strict()`, so a widened select list is exactly how a column leaks.

### 2.4 No compensating un-arm

ADR-012's compensating restore does not carry over: `updateAccount` restores because a half-applied
rename leaves `user_profiles` and `auth.users` disagreeing about the address sign-in uses — real
divergence. Here, a failed Auth write leaves `must_change_password = true` on an account whose
password did not change; the person signs in with their existing password and is asked to choose
their own, which is what BR-001.17 wants anyway. For AC-10's population (already `true`) the
residual is exactly zero. Restoring would require a pre-read this design just removed, to undo a
harm smaller than the read costs (ADR-011 item 4's warning against self-healing). Accepted; put to
the human as open item 3.

### 2.5 The route

```
router.post('/users/:id/reset-password', …)
  → userIdParamsSchema, reused verbatim. NO body — the verb sub-resource shape, and a body would
    be a second place for the same fact
  → NO requireActingAdmin (D-03; /users/:id/role's precedent, deliberately unlike /deactivate)
  → not_found   → notFound(ERROR_CODES.user_not_found, …)
  → unavailable → serviceUnavailable('The account service is unavailable. Try again.')
  → 200 { account, password }, Cache-Control: private, no-store
```

No new error code. `Cache-Control: private, no-store` is required here (NFR-01), and the route test
must assert the header, not just the body.

---

## 3. The credential's blast radius (AC-08) — verified, one uncovered path

### 3.1 What protects the log, and what does not

| Layer | Evidence | Verdict |
| --- | --- | --- |
| `infra/logger` | `logger/index.ts:14-31` — `REDACT` includes `password`, matched at any depth | `logger.error('…', { password })` is safe, and recurses safely into nested objects |
| `error-handler` | `error-handler.ts:32-37` logs `method`, `path`, `error.message`, `error.stack` | Safe unless something throws an Error whose *message* interpolates the password |
| `console.*` | banned in server code by `eslint.config.mjs` | Enforced |
| Browser client | `api-client.ts:135-138` logs the request path and zod issue *paths*, never values | Safe |
| The wire | `POST` body over HTTPS, `no-store`, never a query string | Safe |

**The one path no redactor can see is string interpolation into a log or error message.** The
rule the new code must follow, and that review must check: the plaintext is passed as a value to
exactly two callees — `usersAuth.setPassword` and the response object — and appears in no template
literal, anywhere, ever.

### 3.2 The AC-08 test

- Stub the RNG so the generated value is known to the test.
- Spy on all four logger levels, not just `error`.
- Assert `JSON.stringify(everyCallArgument)` does not contain that value.
- Run the assertion on the failure branches too — `setPassword` returning `unavailable` is the
  path that logs most.
- Add the same shape at the route level with the real `errorHandler` in the chain.
- Assert `modules/notifications` is never imported or called on this path (structural proof for
  "never emailed", the same "proven by an absence" shape `users.service.spec.ts` already uses).

### 3.3 AC-05 is structural

Nothing persists the value. The honest tests are negative — `dismiss()`/`Done` clears it from hook
state, and no second request can retrieve it (there is no `GET` to write a test against, which is
itself the proof). Review rule: a diff adding any "show again" affordance, or any `useRef` that
outlives the dialog, is a finding.

### 3.4 Two residuals, named rather than fixed

- The clipboard outlives the dialog — accepted, inherent to the Copy affordance.
- React DevTools can read the hook's state while the dialog is open — inherent to any
  browser-rendered credential; RISK-005 already names on-screen exposure and US-004's forced
  change is the stated mitigation.

---

## 4. The module boundary

### 4.1 `setPassword` belongs on `users.adapter.ts` — confirmed, with a duplication to name

`eslint.config.mjs`'s `MAY_IMPORT.users = ['notifications']` forbids `modules/users` from reaching
`auth.adapter.ts`. `auth.adapter.ts:110-136` already has a `setPassword` making the identical
`updateUserById(userId, { password })` call — this is the third deliberate duplication across that
boundary. Three rules for the new method: mirror `auth.adapter.ts:121-136` structurally including
its `catch`-to-`unavailable`; inherit its log lines verbatim (`{ userId, message: error.message }`,
never the options object); name it `setPassword`, take exactly two arguments, construct no other
key. `UpdateAuthPasswordOutcome` is `{ kind: 'ok' } | { kind: 'unavailable' }` — no `duplicate`
branch; a password cannot collide.

### 4.2 Citation correction

The package files cited `apps/api/eslint.config.mjs:16-22`. That file does not exist — the config
is at the **repository root**, `eslint.config.mjs`, where the `MAY_IMPORT` block lives. Corrected in
`spec.md`, `impact-analysis.md` and `implementation-plan.md`.

---

## 5. The generator

### 5.1 `domain/` is pure — inject the RNG

`domain/README.md:3-4`: pure functions, no database, no network, no `Date.now()` — "every input
arrives as an argument, including today's date." `crypto.getRandomValues` is the same
nondeterminism and no lint rule catches it.

```ts
/** US-027/AC-01 (REQ-021, V-12). Server-side by requirement (D-04) — this value is never
 *  client-supplied, unlike the create path's.
 *
 *  `randomInt` is a PARAMETER for the same reason `officeToday` takes its clock reading as one
 *  (`domain/README.md:3-4`): a rule that reaches for a source of nondeterminism is a rule whose
 *  guarantees can only be sampled, never asserted. The service supplies the crypto-backed one.
 *
 *  Self-verifies against `evaluatePasswordPolicy` before returning — the same function the
 *  browser's checklist and `newPasswordSchema` run, so this generator and the policy cannot
 *  silently drift.
 *
 *  Does NOT exclude 1/l/I/0/O: ADR-014, and V-18 does not reach this path (design note §5.2).
 *  See apps/ui/src/lib/generate-password.ts for the create-path generator this deliberately
 *  differs from. */
export function generateResetPassword(randomInt: (maxExclusive: number) => number): string;
```

The service holds the one crypto-backed implementation and threads it in, exactly as `nowMs` is
threaded through `UsersServiceDeps`. This buys a test that asserts the "one guaranteed character
per V-12 class, then filler, then shuffle" structure directly, with a stubbed RNG, in addition to a
200-sample property run with the real RNG.

### 5.2 V-18 does not reach this story

`BRD-001:281` scopes V-18 to a generated **initial** password (REQ-033, which opens "When creating
a user…", `BRD-001:84`). US-027 traces to REQ-021, BR-001.12, BR-001.17, V-12. The story's edge case
asked the question explicitly and the human answered it in chat. No Gate 1 change-request needed.

### 5.3 Correcting `generate-password.ts`'s docblock

`generate-password.ts:10-12` currently justifies its exclusion set by citing "SCR-008 ST-10's own
reasoning, reused here verbatim" — SCR-008 is the *reset* screen and ST-10 contains no glyph
reasoning at all (the real source is decision B2 in
`2026-09-10-uncodified-design-decisions.md`). After D-01, that citation becomes actively
contradictory: the create path would be citing the very screen that now declines its rule. **This
PR corrects that docblock** to cite REQ-033/V-18 and decision B2, and states that the reset path
deliberately differs under ADR-014. `generate-reset-password.ts`'s own docblock points back the
other way (§5.1). `decisions.md` D-04 cites ADR-014 as the reason unification is refused.

### 5.4 The special-character set

D-01 removed only the alphanumeric exclusions. Reuse `!@#$%^&*-_=+?` (`generate-password.ts:19`)
verbatim for the reset generator too — a credential that is read aloud must be dictatable, and a
space, backslash, backtick or curly quote is a hazard no font disambiguates.
`evaluatePasswordPolicy`'s open "special" definition will not stop any of them on its own. Assert
alphabet membership (every character drawn from the union of the four declared alphabets) across
the property test, which also catches a future widening.

---

## 6. The response schema

D-05 is right; the precedent to cite is `emailTakenDetailsSchema` (`libs/contracts/src/users.ts:147-156`),
which already establishes a purpose-built schema per distinct response shape.

```ts
/**
 * `POST /api/admin/users/:id/reset-password`'s `200` body (US-027/AC-01, AC-03).
 *
 * NOT `adminUserSchema` extended (D-05): `password` is a fact about THIS ONE RESPONSE, never a
 * field of an account. `emailTakenDetailsSchema`'s own docblock is the precedent.
 *
 * `password` is `z.string().min(1)` and NOT `newPasswordSchema`: the browser's job is to DISPLAY
 * what the server generated, not to re-adjudicate V-12 against it. Re-validating here would make
 * a server-side policy change a client-side rejection of a credential that has ALREADY been set —
 * the account changed, the browser refused to show the password, and nobody can recover it.
 *
 * Not `.strict()` — additive-safe, matching every response in this package.
 */
export const resetPasswordResponseSchema = z.object({
  account: adminUserSchema,
  password: z.string().min(1),
});
```

---

## 7. `Dialog.dismissible` (D-02)

### 7.1 Half of AC-04 already holds

`Dialog.tsx:104-106`'s overlay has no click handler — this component has never dismissed on a
backdrop click. So `dismissible={false}` has exactly two jobs: omit the close button
(`Dialog.tsx:117-125`) entirely, and return early from the Escape branch (`Dialog.tsx:75-78`)
regardless of `busy`. The focus trap and focus capture/restore need no change. The AC-04
outside-click test must still be written and annotated as inherited, per the story's own QA note
that this property is easy to lose to a generic dialog refactor.

### 7.2 Admitting the prop

`Dialog.tsx:16-27` refuses `scrim`/`anchor`/`modal` by name, stating they are refused by design.
`dismissible` is the first prop admitted since. The docblock gains this principle beside the
existing refusal: `dismissible` modifies chrome this component already owns (the header and
Escape-suppression are both in its own "Owns" list) — `scrim`/`anchor`/`modal` were refused because
they import a *different widget's* vocabulary into a dialog. A prop that turns an owned affordance
off is not the same kind of prop as one that turns this component into another one.

### 7.3 Implementation details

`onDismiss` stays required — ST-11's **Done** calls it directly; the Dialog itself simply never
calls it when `dismissible` is false. The Escape branch checks `dismissible` before `busy`, and a
test covers `dismissible={false} busy={false}` (the combination the result phase actually ships).

### 7.4 Regression proof

The four existing `Dialog` consumers' specs stay green with zero edits to their own spec files —
the same proof the `ConfirmDialog` extraction used.

---

## 8. The administrator who resets their own password

The story's edge cases permit it explicitly. Traced through the shipped code: the credential is
safe to read (the in-memory session doesn't re-check `mustChangePassword` mid-session), but every
subsequent `/api/admin/*` request then answers `403 password_change_required`, which the fetchers
map to a generic failure — the People screen goes silently dead until reload. This is US-025's F13
self-deactivation finding recurring in the same position.

**The server must not block self-reset** — that would invent a rule BRD-001 does not have.
Suppressing the row action or adding copy for this case is UX's call, not DEV's (open item 2). What
this PR does add: one People-screen test asserting a self-reset returns 200 and renders ST-11
before the next request's redirect would matter, proving the credential is not lost.

---

## 9. ADR judgement

**D-02 → no ADR.** One additive optional prop, one caller, backward-compatible, and the requirement
is already written into an approved artifact (`SCR-008-people.md:225, :284-285`). US-020 evaluated
a comparable prop on this same component and declined it **in a design note**, not an ADR — the
same weight class. §7.2's docblock amendment is the right artifact.

**D-01 → ADR-014** (`knowledge/decisions/ADR-014-generated-credential-alphabets.md`, status
`proposed`). A real trade-off with a rejected alternative, on a question the story itself raised;
it establishes a reading of an approved BRD rule's scope; it creates a standing divergence across
two packages whose comments currently contradict each other; and ADR-010's own precedent is to
write the ADR at the second occurrence of a pattern, not the third. Accept, downgrade, or reject —
it's the decider's call (open item 4).

---

## 10. Findings

| # | Rating | Finding | Disposition |
| --- | --- | --- | --- |
| F1 | blocker | Write order (`setPassword` before `armMustChangePassword`) could strand an account holding an unseen credential (§2.1) | **Fixed** — plan reordered, D-06 added |
| F2 | major | `resetPasswordResponseSchema.password` must be `z.string().min(1)`, not `newPasswordSchema` (§6) | **Fixed** in plan/spec |
| F3 | major | `domain/` is declared pure; inject the RNG (§5.1) | **Fixed** in plan |
| F4 | major | D-01 falsifies `generate-password.ts:10-12`'s docblock (§5.3) | **Fixed** — plan includes the docblock correction as its own step |
| F5 | major | Self-reset is undesigned (§8) | Server behaviour unchanged (correct as planned); copy routed to UX as **open item 2** |
| F6 | major | The AC-08 test as originally specified proves too little (§3.2) | **Fixed** in plan's test description |
| F7 | minor | Wrong eslint config path cited in three files (§4.2) | **Fixed** |
| F8 | minor | `auth.adapter.ts` already has an identical `setPassword`; state it (§4.1) | **Fixed** — noted in plan/spec |
| F9 | minor | D-01 silent on special-character set (§5.4) | **Fixed** — reuses existing set, test added |
| F10 | minor | `Dialog.tsx`'s refusal docblock needs the admitting principle (§7.2) | **Fixed** — added as its own step |
| F11 | minor | `findById` should be deleted, not reordered (§2.2) | **Fixed** — folded into F1's fix |
| F12 | nit | `Dialog.spec.tsx` already exists; modify, don't create | **Fixed** in plan wording |
| F13 | nit | `modules/users/README.md` missing from file list | **Fixed** — added to Step 13 |
| F14 | nit | No `400 invalid_request` test case listed for the route | **Fixed** — added to Step 6 |

Everything else is sound: the verb sub-resource with no body; D-03's no-attribution position; D-04's
refusal to unify the generators; D-05's new schema; the `dismissible` default of `true`; the
zero-edits-to-existing-specs regression proof; and the Rollback section.

---

## 11. Constraints the implementation must satisfy

| # | Constraint | Severity |
| --- | --- | --- |
| C1 | `armMustChangePassword` runs before `setPassword`; a failed Auth write returns `unavailable` with the old password still valid | blocker |
| C2 | The plaintext appears in no template literal anywhere, is passed to `logger` in no form, reaches no column | blocker |
| C3 | `resetPasswordResponseSchema.password` is `z.string().min(1)`, never `newPasswordSchema` | blocker |
| C4 | The route sets `Cache-Control: private, no-store`, asserted by a test | blocker |
| C5 | `setPassword` lives on `users.adapter.ts`, never imports `modules/auth`, mirrors `auth.adapter.ts`'s `catch`-to-`unavailable` and log line | blocker |
| C6 | `generateResetPassword` takes `randomInt` as a parameter and self-verifies against `evaluatePasswordPolicy` | major |
| C7 | The AC-08 test stubs the RNG, spies all four logger levels, stringifies every call argument, covers failure branches and the route level | major |
| C8 | `generate-password.ts:10-12` corrected, cites ADR-014; `generate-reset-password.ts` points back; D-04 cites ADR-014 | major |
| C9 | `armMustChangePassword` names only `must_change_password`/`updated_at`, `.maybeSingle()`, `RETURNING`s the same five columns `activateAccount` does | major |
| C10 | No `findById` on the reset path | major |
| C11 | Special alphabet is `!@#$%^&*-_=+?` verbatim; alphabet-membership assertion in the property test | minor |
| C12 | `Dialog`'s Escape branch checks `dismissible` before `busy`; a test covers `dismissible={false} busy={false}` | minor |
| C13 | AC-04's outside-click test written and annotated as inherited | minor |
| C14 | `Dialog.tsx`'s refusal docblock gains §7.2's admitting principle | minor |
| C15 | eslint path corrected to the repository root in all three package files | minor |
| C16 | A People test proves a self-reset returns 200 and renders ST-11 | minor |
| C17 | `modules/users/README.md` records this story as `must_change_password`'s first re-armer, and that no compensating un-arm exists | nit |

---

## 12. Missing tests and edge cases (folded into the plan)

1. A failure *between* the two writes (AC-09's substance).
2. AC-06 as an explicit adapter-level assertion that `updateUserById` is called with `{ password }`
   and no other key.
3. AC-07 end to end: the *affected* account, not the caller, is gated at next sign-in.
4. AC-11 at the UI layer: an Employee session never reaches the row menu item.
5. A deactivated-account reset still succeeds (story edge case 2) — no `is_active` predicate added
   by analogy with `deactivateAccount`.
6. The self-reset case (§8).
7. AC-02's clause *order* (shown-once warning first, forced-change sentence last), not just
   presence.
8. AC-08's structural proof that `modules/notifications` is never touched.
9. Copy's in-place confirmation is a live-region announcement ("Copied"), not just a re-render.
10. ST-11's initial focus goes to the password field, via `Dialog`'s `initialFocusRef`, not to
    Done.

---

## 13. Open items for the human

| # | Item | Owner |
| --- | --- | --- |
| 1 | The ST-11 Figma frame was not read directly by this review (connector unauthorized in that session); D-01/D-02 are verified against the approved spec text instead. One ambiguity remains in how "the four glyphs this state exists to disambiguate" should be read — confirm against the real frames before Step 11 if there's any doubt | Joy Joshua / DEV |
| 2 | **Resolved 2026-09-20 (Joy Joshua) — allow it, no special copy.** Self-reset stays permitted with no row-menu exception and no extra ST-10 sentence, matching the story's edge case and SCR-008's own spec (no self-row exception listed). Same call as US-025's self-deactivation | — |
| 3 | **Resolved 2026-09-20 (Joy Joshua) — accepted, no compensating rollback.** The residual (an armed `must_change_password` flag on an account whose password did not change) is accepted as designed | — |
| 4 | **Resolved 2026-09-20 (Joy Joshua) — accepted.** ADR-014 status set to `accepted` | — |
| 5 | Not verifiable from this environment: whether GoTrue's `updateUserById({ password })` revokes existing sessions. The product outcome is correct either way (`require-session.ts` gates a surviving session at its next request), but worth confirming against a real project before release | DEV / DevOps |

# US-023 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-023 — Correct a person's name or email](../../stories/user-stories/US-023-correct-a-persons-details.md) |
| **Screen**   | [SCR-009](../../design/screens/SCR-009-user-form.md) — User form. **ST-02** (the one state US-021 did not build), reusing **ST-03, ST-04, ST-06, ST-08** unchanged, plus **ST-07**'s edit variant. **ST-05 belongs to US-024** and is not designed here |
| **Tier**     | Complex — **contract** (a new write operation, new schemas in a protected path), **persistence** (the module's first `UPDATE`), **trust** (a sign-in identity rewritten on the service-role key). Any one carries it (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-20 |
| **Rests on** | ADR-002, ADR-004, ADR-009, **ADR-010**, **ADR-011**, and the US-018 / US-020 / US-021 design notes — **one new ADR, `ADR-012`** (§7) |

**Advisory.** The human's GitHub review is the authority.

**Written before Gate D1, not after it — and that is deliberate.** US-021's design note reviewed an
approved plan, so its §8 amended one. No plan existed for US-023 yet when this note was written, so
§8 here states the constraints the plan must satisfy. `spec.md`, `impact-analysis.md`,
`implementation-plan.md`, `decisions.md` and `traceability.md` are DEV's, at D1.

**The verdict, in one line each:**

- **The write order reverses for update, and ADR-011 does not forbid it — it never reached the question.** ADR-011 item 1 says "Auth first", but that is a *consequence of the foreign key needing a row to reference*, not a standing preference. On an update both rows already exist and the FK constrains nothing, so ordering becomes a real decision for the first time (§2.1). **`user_profiles` first, Supabase Auth second.**
- **The deciding argument is which residual mismatch is safe, and it is grounded in this story's own purpose.** AC-05 is served by `auth.users.email` alone; AC-06 by `user_profiles.email` alone (§2.2). Profile-first's residual notifies the **corrected** address while the sign-in identifier lags; Auth-first's residual notifies the **old, possibly-mistyped** address — the exact harm REQ-019 exists to remove, and plausibly mail about someone's bookings to a stranger (§2.4).
- **Profile-first also puts the *rarer* failure on the compensating path.** A `user_profiles_email_key` violation is an ordinary concurrent race; a GoTrue `email_exists` that the profile pre-check did not see is already an ADR-011 anomaly. Profile-first detects the ordinary one before any cross-system write (§2.5).
- **The compensation is a restore-to-remembered-value, not a delete — and it is still ADR-011 item 2, not a violation of item 4.** The request undoes *its own* write; it never heals another request's debris (§2.6). The restore must carry the old **name as well as** the old email, because ST-08's approved copy says "Nothing has changed" (§2.7).
- **`auth.admin.deleteUser` must be unreachable from this path. This is the AC-07 finding to read twice.** `user_profiles.id` is `on delete cascade` (`0001_user_profiles.sql:28`), so a "re-provision on email change" implementation reaching for ADR-011's *create* compensation would destroy the profile row and every booking keyed to it. **blocker** if a diff does it (§3.3).
- **`email_confirm: true` on the Auth update is the single most likely silent failure in the story.** Without it, a project with SMTP configured may send a confirmation email nobody wrote code to send (US-021/AC-10's reason), and — more seriously — the new address may sit unconfirmed and **never become the sign-in identifier**, failing AC-05 while every unit test passes. **Not verifiable from this environment** (§3.4, open item 3).
- **AC-03 gets two independent proofs, and only one of them is load-bearing.** The guard — no email write at all when the normalised email is unchanged — is what makes AC-03 true. `findByEmail(email, excludeId)` is what keeps it true if the guard is ever weakened. Say which is which rather than implying both do work (§2.8).
- **A mismatch breaks US-004, not merely US-023.** `auth.service.ts:228` and `:259` sign in with `profile.email`. Any divergence silently disables V-15's same-as-current check and degrades the post-change re-sign-in. Neither ordering escapes it, which is why the answer is *compensate*, not *tolerate* (§2.9).
- **AC-06 cannot be proven by observing an email, and the note says so rather than pretending.** `apps/api/src/modules/notifications/` is a README and nothing else. AC-06 is structural, exactly as US-018/AC-06 was (§3.6).
- **Two new error codes' worth of thinking, one new code.** `email_taken` and `emailTakenDetailsSchema` are **reused verbatim** — ST-04 is the same state with the same two facts. `user_not_found` is genuinely new (§3.5).
- **SCR-009 ST-02's role radios show a control this story cannot save, and `RadioGroup` disables it the way ADR-010 forbids.** `RadioGroup.tsx:33` renders native `<fieldset disabled>`, which removes focusability — the precise failure ADR-010 was written about (§4.3). **major.**
- **`user_profiles.updated_at` has never been written by anything. US-023 is its first writer** (§2.10) — the US-018 §2.4 finding, recurring exactly where that note predicted.
- **ADR-012 is warranted.** Not for the endpoint shape, which is ordinary, but for the rule underneath: *update-shaped* cross-system writes, where the first write has no clean undo. US-025 and US-027 each face it again (§7).

---

## 0. The tiering — confirmed

| Surface | What it is here |
| --- | --- |
| **Contract** | A **new write operation**, `PATCH /api/admin/users/:id`. `libs/contracts/**` is a protected path and gains a request schema, a params schema and one new error code |
| **Persistence** | `modules/users`'s first **`UPDATE`**. No migration — every column written already exists (`0001_user_profiles.sql:27-44`) |
| **Trust** | The **sign-in identity** is rewritten on the service-role client. US-021 minted a credential; this story re-points one |

**Not a Dependency surface.** `@supabase/supabase-js` 2.109.0 is already here; `updateUserById` is
new *usage* of an installed SDK, exactly as `createUser` was.

**Not a migration.** `supabase/migrations/**` is a protected path and a diff there is a review
finding. `email`, `full_name` and `updated_at` all exist; `user_profiles_email_key` (`:48`) already
arbitrates BR-001.10 for updates as well as inserts, because a unique index constrains the table's
*contents*, not its insert path — the identical property US-018 §2.1 established for
`desks_desk_number_key`.

**Not a middleware or `app.ts` change.** AC-09 is inherited: `requireAdmin` mounts once at
`/api/admin` (`http/app.ts:78`) and `admin.router.ts:1-17` states the property in writing. A diff to
`apps/api/src/http/middleware/**` or `http/app.ts` is a review finding. AC-09 still needs its own
test through the real mount with a real Employee session.

---

## 1. What this story actually is

**One correction, two systems, and — unlike create — no clean undo on either side.** Everything hard
about US-023 is in that sentence, and the second clause is the whole of §2.

| AC | Where it is answered |
| --- | --- |
| **AC-01** name and email change; identity, role, state and history survive | §2.3 (the `UPDATE` targets `id`), §3.2 (the `200` body), §4.2 (the list re-sort) |
| **AC-02** a duplicate is refused, including a deactivated holder's | §2.8 (the pre-check), §2.5 (what actually arbitrates), §3.5 (`409 email_taken` + `details`) |
| **AC-03** the account's own email is not a self-collision | **§2.8** — the section to read twice. Two proofs; one load-bearing |
| **AC-04** browser-side field validation | §4.4 — the same schema the route parses with |
| **AC-05** the new email signs them in | **§2.2**, **§3.4** — served by the Auth write *alone*, and `email_confirm` is the part that silently fails |
| **AC-06** notifications follow the new address | **§3.6** — structural; there is no notification code to observe |
| **AC-07** password and administrator-set flag untouched | **§3.3** — three structural guarantees, one of them a prohibition |
| **AC-08** guarded save; a failure changes nothing | §4.1 (the `inFlight` ref, reused unchanged), §2.7 (the restore carries *both* fields) |
| **AC-09** admin only | Inherited (§0), proven at the real mount |

---

## 2. The partial-failure question

### 2.1 The order is a decision here, and it was not for create

`user_profiles.id references auth.users (id) on delete cascade` (`0001_user_profiles.sql:28`). At
**create** time, that FK makes "Auth first" forced — a profile row cannot reference a credential that
does not exist. ADR-011 item 1 is a statement about row *creation*.

At **update** time both rows already exist. The FK constrains nothing, and neither write depends on
the other's result. The order is genuinely free, which is why ADR-011 could not have settled it and
did not try.

### 2.2 The two ACs are served by different systems, and that is why a mismatch is not merely untidy

| | Arbitrated by | Consumed by |
| --- | --- | --- |
| **AC-05** — the sign-in identifier | `auth.users.email` **only** | `auth.service.ts:129` calls GoTrue with the typed address; `:137` then finds the profile **by id**, never by email |
| **AC-06** — where notifications go, and the address the product displays | `user_profiles.email` **only** | `toUser` (`auth.service.ts:88-94`) returns `row.email`; `users.repository.ts`'s select list is the people list's address |

A divergence is therefore not "stale data". It is **AC-05 and AC-06 disagreeing about which address
is this person's**, with each holding a different answer and both being served correctly by their
own system.

### 2.3 The shape, when the email did not change

If the normalised email equals the stored one, **no Auth call is made at all.** One `UPDATE` on
`user_profiles`, one system, no compensation, no ADR-012. This is the common case — most corrections
are name typos — and it should be *structurally* incapable of touching the credential system, not
merely arranged not to.

A case-only change (`dana@x.com` → `Dana@X.com`) collapses into this branch, because the request
schema lower-cases before comparison and `email` is `citext`.

### 2.4 The shape, when the email changed — and why profile first

Four arguments, in descending weight.

**1. The residual mismatch is the safer of the two, and this story's own purpose decides it.**
REQ-019's stated job is *"so that a typo does not stop their notifications arriving"*. So the old
address may be wrong — plausibly not even this person's.

| Residual | Notifications go to | Sign-in works with | Verdict |
| --- | --- | --- | --- |
| **Profile first** (profile = new, Auth = old) | the **corrected** address | the old address | The story's purpose is served; the identifier lags until a retry |
| **Auth first** (Auth = new, profile = old) | the **old, possibly mistyped** address | the new address | The story's purpose is defeated, and a person's booking mail may go to a stranger |

Both heal on the administrator's retry — the operation is idempotent in either direction. The
difference is entirely in what is true *during* the window.

**2. The ordinary failure should not be the one that needs compensating.** A `user_profiles_email_key`
violation is an ordinary concurrent race — two administrators, or a create and an edit, meeting on
one address. A GoTrue `email_exists` that the profile pre-check did not see requires an email held in
`auth.users` but *not* in `user_profiles`: an ADR-011 orphan, or this story's own residual. Profile
first puts the ordinary failure **before** any cross-system write and leaves only the anomaly on the
compensating path.

**3. The compensating write should be in the system we own.** The restore is a plain PostgREST
`UPDATE` against a database this product owns, whose reachability was demonstrated microseconds
earlier, with no side effects. The Auth-first alternative compensates with a second
`updateUserById` — another write to the credential record, in a system this product does not own.

**4. Fewer Auth writes is an AC-07 argument.** Every touch on the credential record is surface for
the "re-provision" mistake the story's QA notes name. The happy path makes exactly one; the
compensating path makes none.

### 2.5 What actually arbitrates a duplicate

Two indexes, as always in this codebase: GoTrue's own uniqueness on `auth.users.email`, and
`user_profiles_email_key` (`0001_user_profiles.sql:48`). `findByEmail` is a **message-composition
read** — US-021 §2.7's finding, unchanged, and `users/README.md` already states it. Its only job is
to let ST-04's refusal name the holder and say whether that account is deactivated, which neither
index's violation error carries.

With profile first, the `user_profiles_email_key` violation is the one that can fire mid-request, and
it is the one whose refusal **can** be composed: re-read `findByEmail(email, excludeId)` once, the
row is now visible, return `duplicate` with its fields. That is US-021 §2.4's re-read device pointed
at the more likely case.

### 2.6 The compensation is still ADR-011 item 2 — the difference is the undo's shape

ADR-011 item 4 forbids one operation healing **another** operation's debris. The restore here is the
request undoing **its own** write, which is item 2. The difference from create is only that create's
undo restores *"nothing existed"* with a delete, while update's restores *"the row said X"* with a
remembered value.

That has one hard design consequence: **the service must read the current row before writing.** A
blind `UPDATE` in the shape of `updateDeskNumber` is not available — there would be nothing to
restore. The same read answers three other questions (does the account exist, did the email change,
what `role`/`isActive` does the response carry), so it costs nothing extra.

The read-then-write window is real: a concurrent edit of the same account could make the restored
value stale. **Accepted, not closed.** An optimistic-concurrency guard (`.eq('email', oldEmail)` on
the update) would close it and is one line — it is named and rejected in ADR-012's alternatives as
speculative, because no story describes two administrators editing one account, and US-018 built no
such guard for the identical exposure. Note it in the plan so the human can overrule cheaply.

### 2.7 The restore carries the old **name** as well as the old email

The profile write sets both fields. If the Auth write then fails, restoring only the email would
leave the name change applied — a partial save. SCR-009 ST-08's approved copy is *"Nothing has
changed."* and AC-08 says the same. **The restore passes the old `fullName` and the old `email`.**

A "keep the name, revert the email" partial success was considered and rejected: it is a third
outcome with no numbered state on SCR-009 and copy that contradicts it.

### 2.8 AC-03 — two proofs, and only one of them is load-bearing

The story's API-impacts line (`:99`) asks for the account to be *"excluded from the uniqueness
comparison"*. US-018 had to push back on identical wording, because there the exclusion was
structural — that story runs no pre-check at all. **Here it is not structural, because ST-04 forces a
pre-check to exist**, so the story's wording is honoured rather than corrected.

- **Load-bearing: the §2.3 guard.** When the normalised email is unchanged, the duplicate check never
  runs and neither write touches the email. A self-collision is not refused because it is never
  tested for.
- **Defence in depth: `findByEmail(email, excludeId)`.** One `.neq('id', excludeId)`. If the guard is
  ever weakened — most plausibly by an implementation that checks duplicates unconditionally because
  the form always posts an `email` — AC-03 stays true.

Say which is which. A note claiming both do equal work would be wrong, and a reviewer should be able
to delete the guard in a scratch branch and watch a *different* test fail.

**Already proven at the database, and not by this story:** `admin.concurrency.spec.ts:110` asserts
against a real Postgres that updating a row to its own current value raises no `23505`. That is
US-018's evidence and it transfers unchanged — the index is not the self-collision risk. The
pre-check is.

### 2.9 A mismatch breaks US-004, not merely US-023

`auth.service.ts:228` probes V-15 with `auth.signInWithPassword(profile.email, newPassword)`, and
`:259` re-signs in the same way. Both read the **profile's** email while GoTrue arbitrates on the
**Auth** email.

If the two ever diverge, US-004's V-15 "same as current" check silently stops detecting anything —
the probe with a stale address is rejected, which the code reads as *"not the current password,
proceed"* — and the post-change re-sign-in degrades to a session-less success.

Both orderings expose this equally, so it does not decide §2.4. It decides something else: **the
mismatch must be compensated and loudly logged, never tolerated as an acceptable steady state.** It
is a cross-story consequence only a reader of `auth.service.ts` would find, and it belongs in
`users/README.md` where the next author will.

### 2.10 `updated_at` — the most likely omission

`0001_user_profiles.sql:41` creates `updated_at timestamptz not null default now()` with **no
trigger**, and nothing in this codebase has ever written it. US-023 is its first writer, exactly
where US-018 §2.4 predicted the pattern would recur.

Write it, from one `nowMs()` reading threaded in by the service — the `updateDeskNumber(id, n,
updatedAt)` shape (`desks.repository.ts:191-203`), so the repository reads no clock. No AC names the
column and no test will miss it unless one is written for it.

### 2.11 The recommended shape

```ts
async updateAccount({ id, fullName, email }: UpdateAccountInput): Promise<UpdateAccountOutcome> {
  // The read that makes everything else possible (§2.6): existence, the old values to restore,
  // whether the email changed at all, and the role/isActive the response carries.
  const current = await users.findById(id);
  if (!current) return { kind: 'not_found' };

  const emailChanged = current.email.toLowerCase() !== email;

  // §2.8's load-bearing guard. A message-composition read, NOT the arbiter (§2.5). `excludeId`
  // is defence in depth, not the reason AC-03 holds.
  if (emailChanged) {
    const holder = await users.findByEmail(email, id);
    if (holder) return { kind: 'duplicate', fullName: holder.full_name, isActive: holder.is_active };
  }

  // Profile FIRST (ADR-012 §Decision item 1) — the reverse of create, because the foreign key
  // that forces Auth-first on an INSERT constrains nothing on an UPDATE (§2.1).
  const written = await users.updateProfileDetails({ id, fullName, email, updatedAt: new Date(nowMs()) });
  if (written.kind === 'not_found') return { kind: 'not_found' };
  if (written.kind === 'duplicate') {
    const holder = await users.findByEmail(email, id);
    if (holder) return { kind: 'duplicate', fullName: holder.full_name, isActive: holder.is_active };
    logger.error('user_profiles_email_key fired but no row holds the email — inconsistent', { id });
    return { kind: 'failed' };
  }

  // §2.3 — no Auth call at all when the email did not change. Structurally, not by arrangement.
  if (!emailChanged) return { kind: 'ok', account: mapAccount(written.profile) };

  // ONE attribute. No `password` key is ever constructed (§3.3). `email_confirm: true` is AC-05's
  // other half and AC-10-of-US-021's reason both (§3.4).
  const auth = await usersAuth.updateEmail(id, email);
  if (auth.kind === 'ok') return { kind: 'ok', account: mapAccount(written.profile) };

  // Compensation: this request undoing its OWN write (ADR-012 §Decision item 2 / ADR-011 item 2).
  // BOTH old values (§2.7). Logged, never thrown, never surfaced (ADR-011 item 3).
  logger.error('auth email update failed after the profile was written; compensating', {
    id, kind: auth.kind,
  });
  const restored = await users.updateProfileDetails({
    id, fullName: current.full_name, email: current.email, updatedAt: new Date(nowMs()),
  });
  if (restored.kind !== 'ok') {
    logger.error('COMPENSATING RESTORE FAILED — user_profiles and auth.users now disagree about ' +
      'this account\'s email; sign-in uses the OLD address and notifications the NEW one', { id });
    return { kind: 'failed' };
  }

  // `duplicate` from GoTrue is NOT a duplicate the administrator can act on — no profile row holds
  // the address, so there is nothing to name in ST-04 (ADR-011 item 4: no adopting, no deleting).
  if (auth.kind === 'duplicate') {
    logger.error('auth.users holds this email but user_profiles does not — orphaned or diverged ' +
      'credential (ADR-011 §Decision item 5)', { id, email });
    return { kind: 'failed' };
  }
  return { kind: 'unavailable' };
}
```

---

## 3. The contract

### 3.1 `PATCH /api/admin/users/:id`

A plain field update on an existing resource, not a refusable transition — `api-standards.md:13-21`,
which US-018 set as the binding rule for *"every update-in-place endpoint after it"*.
`PATCH /api/admin/desks/:id` is the precedent in this same router.

**New in `libs/contracts/src/users.ts`:**

```ts
export const userIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const userUpdateSchema = z.object({ fullName: fullNameSchema, email: emailSchema }).strict();
```

Three things about that, each a decision:

- **The field schemas are extracted and shared, not the object.** `fullNameSchema` and `emailSchema`
  move out of `createAccountRequestSchema` and both schemas use them, so AC-02/AC-04's "the same
  rules as create" is true *because it is the same object* — `deskNumberSchema`'s own stated reason
  for existing. This is a pure extraction: `createAccountRequestSchema`'s behaviour and every
  existing test are unchanged.
- **Not `createAccountRequestSchema.omit({ role: true, password: true })`.** `deskUpdateSchema`'s
  docblock (`desks.ts:138-142`) names this hazard exactly: they are two contracts that happen to
  coincide, and a future required field on *create* would silently appear on *edit* — where SCR-009
  forbids a password field in writing.
- **Both fields required, not optional.** The form always posts both (prefilled), and the server
  compares against the stored value regardless, so optionality buys nothing and costs a branch —
  a PATCH omitting `email` and one sending the unchanged email would have to behave identically.
  True partial-update semantics are the rejected alternative; state so in `decisions.md`.

No `id` in the body: it is the path parameter, and accepting it in both places creates two sources
for one fact that can disagree (US-018 §3.2).

### 3.2 `200` with `adminUserSchema` — reused, not derived

Unlike US-018, **no new response schema.** `adminUserSchema` is exactly what the profile `UPDATE`'s
`.select('id, full_name, email, role, is_active')` returns, and unlike the desk case there is no
field on it this write cannot supply. Reuse it directly and say so, so a reviewer does not go looking
for a `userUpdateResponseSchema` that should not exist.

`Cache-Control: private, no-store`, matching both `/users` GET and `POST /users`.

**`toEqual`, never `toMatchObject`, in the route test.** `adminUserSchema` is deliberately not
`.strict()`, so nothing schema-level stops `must_change_password`, `deactivated_at`, `push_opt_in`
or `last_seen_at` leaking through a careless `select('*')` — `users/README.md:29-40` states this at
length and it applies identically to the write path.

### 3.3 AC-07 — three structural guarantees, and one of them is a prohibition

**1. The Auth call names one attribute.** `AdminUserAttributes extends Omit<UserAttributes, 'data'>`
and `password?` is optional (`node_modules/@supabase/auth-js/dist/module/lib/types.d.ts`, verified
against the installed 2.109.0 — not assumed). `updateUserById(id, { email, email_confirm: true })`
constructs **no `password` and no `password_hash` key**, so there is no value for GoTrue to write.
The SDK's own docblock shows each attribute updated in isolation.

**2. The profile write names three columns.** `email`, `full_name`, `updated_at`. It must not name
`must_change_password` — the same discipline `insertProfile`'s docblock already states for leaving
`is_active` and `must_change_password` unnamed. Make it unrepresentable: `UpdateProfileDetailsInput`
has exactly those fields and no index signature.

**3. `usersAuthAdapter.deleteAccount` must be unreachable from this path — blocker if it is not.**
That method is ADR-011's *create* compensation. `user_profiles.id` is `on delete cascade`
(`0001_user_profiles.sql:28`), so calling it here would delete the credential **and** the profile row
**and** cascade through everything keyed to it. An implementation that "re-provisions" the account on
an email change — the exact trap the story's QA notes name (`:94`) — reaches for precisely this call.
Say so in the service docblock and assert it in a test: the adapter fake's `deleteAccount` is never
invoked by `updateAccount`.

The adapter method is named **`updateEmail`**, not `updateAccount`, for this reason. A name that
states its one attribute makes a diff adding `password` to it visibly wrong.

### 3.4 `email_confirm: true` — AC-05's other half, and the story's likeliest silent failure

Two reasons, and the second is the dangerous one:

1. **US-021/AC-10's reason, unchanged.** Without it, a project with SMTP configured may have GoTrue
   send a confirmation email — an email nobody in this repository wrote code to send.
2. **AC-05 itself.** An unconfirmed address can sit pending rather than becoming the account's
   sign-in identifier. If that is how the live project behaves, AC-05 fails **while every unit test
   passes**, because a recording fake cannot model GoTrue's confirmation state.

`email_confirm` is a documented attribute of `updateUserById` — the SDK's own *"Confirms a user's
email address"* example passes it to that method
(`node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts:556-561`). **Whether it is
*required* for the new address to sign in immediately is not verifiable from this environment**, and
that uncertainty is carried as open item 3, not resolved by assertion. Pass it either way: reason 1
stands alone.

### 3.5 Refusals

| Outcome | Status + code | Notes |
| --- | --- | --- |
| `duplicate` | `409 email_taken` + `details: { fullName, isActive }` | **`emailTakenDetailsSchema` reused verbatim** — ST-04 is the same state, with the same two facts, and `emailTakenMessage` (`screens/people/copy.ts:116`) already composes it. ADR-009's third application, not a new decision |
| `not_found` | `404 user_not_found` | **The one new error code.** `error.ts` has `desk_not_found` and `booking_not_found` but nothing for an account. US-018 §3.5's reasoning: a well-formed request naming a missing resource must answer something, and a `500` is the wrong shape. No existence-oracle concern — an administrator can already enumerate every account via `GET /api/admin/users` |
| `unavailable` | `503 service_unavailable` | GoTrue unreachable, after a successful restore |
| `failed` | bare `500`, via a thrown `Error` | The profile write failed, or the compensation did. `POST /users`'s precedent (`admin.router.ts:167-169`) |
| parse failure | `400 invalid_request` | The existing branch, no new code |
| Employee caller | `403 admin_only` | From the mount. No role check in the handler — the mount already decided |

The browser folds `404`, `503` and `500` all into `failed` → ST-08, because no approved SCR-009 copy
exists for "that person is gone". `rename-desk.ts:18-19` does exactly this for `desk_not_found` and
says why.

### 3.6 AC-06 is structural, and there is nothing to observe

`apps/api/src/modules/notifications/` contains a `README.md` and nothing else. No notification code
exists, so AC-06 **cannot** be proven by observing a sent email, and a test that claims to is
counting zero emails from a system that has no email — US-018 §7.3's warning, verbatim.

What proves AC-06:

1. `user_profiles.email` **is** the account's address (ADR-004: `users` owns the table), and the
   profile write updates it. Assert the stored value after a successful update.
2. A line in `users/README.md` binding future notification work to read the account's *current*
   address from `user_profiles`, never a value captured at booking time.

Tell QA and the human plainly that a browser-level or end-to-end proof of AC-06 is not available this
release. That is honest and checkable; a green test asserting nothing is neither.

---

## 4. The browser seam

Lower risk than the server, and largely pre-shaped: `UserFormDialog.tsx:1-13` names US-023 as the
story that grows its edit mode.

### 4.1 Generalise the hook in place, never a sibling

`use-user-form-dialog.ts` gains `mode: 'create' | 'edit'` and `account?: AdminUser`, exactly as
`use-desk-form-dialog.ts` was generalised from `use-add-desk-dialog.ts` for US-018. **Not** a
`use-edit-user-dialog.ts`: AC-08 requires the edit path's save-guarding to match create's, and that
is true because it is the **same `inFlight` ref** (`use-user-form-dialog.ts:39`), not because two
files agree today. That hook's own docblock already predicted this change.

### 4.2 `markUpdated` — and it is *not* `markAdded` with a different verb

`use-users.ts` gains `markUpdated(account: AdminUser)`. Three differences from `markAdded`, each one
a bug if copied wrong:

- **`summary` does not change.** US-023 alters neither `role` nor `is_active`, so no count moves.
  Copying `markAdded`'s increments would inflate `total` on every edit. **Say so in the docblock**,
  because `markAdded` sitting directly above it is the thing a developer will copy.
- **Replace by `id`, then re-sort with `byFullName`.** A name change moves the row in a `full_name`
  ASC list — the same §4.1 finding US-021 already fixed for `markAdded`, using the comparator that
  already exists at `use-users.ts:38`.
- **Always replace in place, even under an active search; never remove.** This is where US-023
  *diverges* from US-021's `appendToList` option, and the divergence needs stating or a reviewer will
  read it as an inconsistency. `markAdded` had to abstain because inserting a row into a filtered
  view is the hook inventing a server-side filter decision. `markUpdated`'s row is **already
  rendered**: leaving it showing the old name after a successful save reads as a failed save.
  Renaming "Dana Silva" to "Dana Okafor" while searching `Silva` leaves one row visible that no
  longer matches until the next fetch — the lesser wrong, and the match line's numerator is
  unaffected because the count does not change.

### 4.3 SCR-009 ST-02's role radios — **major**

ST-02 (`SCR-009:126`) shows *"role radios on the current value"*, but role change is US-024 and
`userUpdateSchema` carries no `role`. So the radios render a control that cannot save.

`RadioGroup.tsx:33` renders `<fieldset disabled={disabled}>` — the **native** `disabled` attribute,
which removes focusability. That is precisely the failure ADR-010 was written about: US-020's DEV
applied a precedent verbatim and produced a menu with zero focusable elements.

**Recommendation:** in edit mode, render the radios visible and **`aria-disabled`**, carrying the
reason in a `title` and a visually-hidden span — ADR-010's established pattern, already implemented
at `AccountRowMenu.tsx:160-178`. That means `RadioGroup` gains an `aria-disabled` path distinct from
its native `disabled` one. **That is a component-props change and the one place US-023 widens a
shared surface** — flag it in the tiering, and keep `RadioGroup` screen-private under
`screens/people/` where US-021 §4.4 put it.

Alternative, if the human prefers: omit the radios from edit mode entirely until US-024. Cheaper, and
it contradicts an approved screen spec — which is a Gate 1 `change-request`, not a delivery decision.
**Route it to the human rather than choosing silently.**

### 4.4 The rest of edit mode

- Title **`Edit person — {fullName}`**, plus **(you)** when editing your own account
  (`SCR-009:126`, `:191`). The dialog's accessible name is that string.
- **No `PasswordField`, no `PolicyChecklist`, no Suggest a password, no delivery warning.** In their
  place the one line SCR-009 specifies: *"To change their password, use **Reset password** on the
  people list."* This is the story's own design commitment (`:88`) and a review finding if broken.
- Submit label **Save changes**; ST-07's toast is *"{fullName} updated."* (`SCR-009:157`), distinct
  from create's.
- AC-04's client validation parses with **`userUpdateSchema`** — the same object the route parses
  with, `UserFormDialog.tsx:102`'s existing pattern.
- ST-04 focus goes to the email field **with its content selected** (`SCR-009:189`).
- `AccountRowMenu.tsx:186`'s **Edit** item stops being `aria-disabled` and gains its handler.
  ADR-010's rule is that the control ships visible and disabled *until its destination exists* — this
  is that moment, for one of the four items only.

### 4.5 `lib/update-account.ts`

`rename-desk.ts`'s shape with `create-account.ts`'s details handling: `PATCH`, parse the `200`
through `adminUserSchema`, map `email_taken` → `duplicate` via `emailTakenDetailsSchema.safeParse`,
and fold everything else — including a `details` that fails to parse — into `failed`
(`create-account.ts:40-45`, ADR-009's own discipline).

---

## 5. Method signatures

**`users.repository.ts`**

```ts
export interface ProfileDetailsRow {
  id: string; full_name: string; email: string; role: UserRole; is_active: boolean;
}

/** US-023. The current row, read BEFORE any write — §2.6. Four jobs in one read: existence (404),
 *  the old values the compensation restores, whether the email changed at all, and the role/
 *  isActive the 200 body carries. A second `findById` beside `modules/auth`'s is correct, not
 *  duplication: `eslint.config.mjs`'s MAY_IMPORT forbids `users` importing `auth`, and that
 *  method's select list serves a session, not an edit. */
findById(id: string): Promise<ProfileDetailsRow | undefined>;

/** US-023/AC-02, AC-03. `excludeId` is defence in depth, NOT why AC-03 holds — §2.8. */
findByEmail(email: string, excludeId?: string): Promise<EmailLookupRow | undefined>;

export interface UpdateProfileDetailsInput {
  id: string; fullName: string; email: string; updatedAt: Date;
}
export type UpdateProfileDetailsOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow }
  | { kind: 'duplicate' }
  | { kind: 'not_found' };

/** US-023/AC-01, AC-07. Names `email`, `full_name`, `updated_at` and NOTHING else — never
 *  `must_change_password`, never `is_active` (§3.3). `.maybeSingle()`, never `.single()`:
 *  `.single()` turns zero rows into a thrown error and loses the 404 (`updateDeskNumber`'s own
 *  stated reason). `23505` naming `user_profiles_email_key` -> `duplicate`; any other `23505`
 *  throws rather than being mapped to a refusal it is not. Also the COMPENSATING restore's own
 *  statement, called with the remembered old values — one method, two callers. */
updateProfileDetails(input: UpdateProfileDetailsInput): Promise<UpdateProfileDetailsOutcome>;
```

**`users.adapter.ts`**

```ts
export type UpdateAuthEmailOutcome =
  | { kind: 'ok' }
  /** GoTrue's `email_exists` — verified against the installed @supabase/auth-js 2.109.0 by
   *  `createAccount`'s own branch, reused here rather than re-derived. */
  | { kind: 'duplicate' }
  | { kind: 'unavailable' };

/** US-023/AC-05, AC-07. `updateUserById(userId, { email, email_confirm: true })` — ONE attribute
 *  plus its confirmation, and deliberately named `updateEmail` so a diff adding `password` to it
 *  is visibly wrong (§3.3). NEVER `deleteAccount` + `createAccount`: `user_profiles.id`'s
 *  `on delete cascade` makes that a data-loss bug, not a re-provision (§3.3 item 3).
 *  Three kinds, not four — any non-`email_exists` GoTrue error logs and returns `unavailable`,
 *  matching `createAccount` exactly. A `user_not_found` kind would be unreachable (the profile
 *  write already answered 404) and `setDeskActive`'s docblock is the precedent for refusing to
 *  add an outcome a reader would then have to disprove. */
updateEmail(userId: string, email: string): Promise<UpdateAuthEmailOutcome>;
```

**`users.service.ts`**

```ts
export interface UpdateAccountInput { id: string; fullName: string; email: string }

export type UpdateAccountOutcome =
  | { kind: 'ok'; account: AdminUser }
  | { kind: 'duplicate'; fullName: string; isActive: boolean }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

updateAccount(input: UpdateAccountInput): Promise<UpdateAccountOutcome>;
```

Five kinds — `CreateAccountOutcome`'s four plus `not_found`, the same single addition
`RenameDeskOutcome` makes over `CreateDeskOutcome`.

`UsersServiceDeps` gains `nowMs: () => number` for `updated_at` (§2.10) — `DesksServiceDeps`'
existing shape, and a `composition.ts` wiring change worth naming in the plan.

---

## 6. What this story must NOT build

- **No migration.** Every column exists.
- **No new index.** `user_profiles_email_key` already arbitrates updates.
- **No change to `http/app.ts` or `http/middleware/**`.** AC-09 is inherited.
- **No `deleteAccount` call**, on any path (§3.3).
- **No session revocation on an email change.** The story's edge cases are explicit: *"their session
  is not required to end. BRD-001 says nothing about it; nothing is invented."*
- **No re-notification of existing bookings.** *"Only future events use the new address."*
- **No role field on the request.** US-024's.
- **No self-healing of a pre-existing mismatch found by this request** — ADR-011 item 4, unchanged.
- **No background reconciliation job, no operator cleanup screen.** ADR-011 already rejected both as
  surfaces with no story; ADR-012 does not reopen it.
- **No `data-refresh.ts` change.** `apps/ui/src/lib/data-refresh.ts` is set once for the whole app;
  this screen is not on it and does not join it.

---

## 7. One new ADR — `ADR-012`

**Warranted, as a *new* ADR rather than an edit to ADR-011.** Three reasons:

1. ADR-011's item 1 says "Auth first". US-023 does the opposite, for a defensible reason. Editing
   item 1 in place would make ADR-011 read as false for the story it was written for.
2. The Architect charter forbids contradicting an accepted ADR silently; it must be superseded or
   extended **explicitly**. ADR-012 does that, item by item, in a "Relationship to ADR-011" section.
3. ADR-011 forecast that US-023 would *apply* it. What is actually happening is *extending* it — a
   compensation with a different shape (restore-to-value, not delete) on a different ordering. That
   is more than the forecast, which is exactly when a second ADR earns its place.

**ADR-011 gains one forward-pointing line**, landed in this same PR: a one-line addition to a
`proposed` ADR naming its successor is not a silent contradiction. Flag it for the human to confirm
(open item 4).

**Numbering verified** by listing `knowledge/decisions/`: ADR-001–004, 007–011 exist. **ADR-012 is
next free.** (ADR-005 and ADR-006 have no files, though `ai/gates/delivery.md:37` links to
`ADR-006-e2e-testing-layer.md` — a dangling link, unrelated to this story, worth its own issue. **nit**.)

---

## 8. Constraints the implementation plan must satisfy

Unlike US-021's design note, this is not a list of amendments to an approved plan — no plan existed
yet when this note was written. These are the constraints DEV's plan must meet to be approvable at D1.

| # | Constraint | Severity |
| --- | --- | --- |
| C1 | `user_profiles` is written **before** Supabase Auth, and Auth is not called at all when the normalised email is unchanged (§2.3, §2.4) | **blocker** |
| C2 | A failure of the Auth write compensates by restoring **both** the old email and the old name, logged, never thrown, never surfaced (§2.6, §2.7) | **blocker** |
| C3 | `usersAuthAdapter.deleteAccount` is unreachable from `updateAccount`, asserted by a test (§3.3) | **blocker** |
| C4 | The Auth call is `updateUserById(id, { email, email_confirm: true })` and constructs no `password` key; the adapter method is named `updateEmail` (§3.3, §3.4) | **blocker** |
| C5 | `updateProfileDetails` names `email`, `full_name`, `updated_at` only — never `must_change_password` — and its input type makes anything else unrepresentable (§3.3) | **blocker** |
| C6 | AC-03 has two tests: one that deletes the §2.3 guard and fails, one that deletes `excludeId` and fails. They must fail for *different* reasons (§2.8) | **major** |
| C7 | `409 email_taken` reuses `emailTakenDetailsSchema` verbatim; no new details schema (§3.5) | **major** |
| C8 | `fullNameSchema`/`emailSchema` extracted and shared; `userUpdateSchema` declared separately, not derived from `createAccountRequestSchema` (§3.1) | **major** |
| C9 | `markUpdated` leaves `summary` untouched, replaces by id, re-sorts, and never removes a row — with the divergence from `markAdded` stated in its docblock (§4.2) | **major** |
| C10 | SCR-009 ST-02's role radios ship `aria-disabled` per ADR-010, not native `disabled` — or the human approves omitting them, as a Gate 1 change (§4.3) | **major** |
| C11 | `updated_at` is written, from one `nowMs()` reading threaded through the service (§2.10) | **major** |
| C12 | `user_not_found` added to `error.ts`; the browser folds `404` into `failed` (§3.5) | **minor** |
| C13 | The `200` reuses `adminUserSchema`; the route test asserts with `toEqual`, never `toMatchObject` (§3.2) | **minor** |
| C14 | `use-user-form-dialog.ts` is generalised in place; no sibling edit hook (§4.1) | **minor** |
| C15 | The edit form shows no password field and carries SCR-009's reset-password line instead (§4.4) | **minor** |
| C16 | `users/README.md` records the reversed order, the restore compensation, ADR-012, AC-06's structural proof, and §2.9's US-004 consequence | **minor** |
| C17 | `ADR-012` lands in this PR, with ADR-011's one forward-pointing line (§7) | **minor** |
| C18 | `spec.md` Out of scope: role change (US-024), session termination on an email change, re-notifying existing bookings, and any operator repair path for a diverged account | **minor** |
| C19 | The read-then-write window (§2.6) is recorded in `decisions.md` as accepted, with the one-line optimistic guard named as the option not taken | **nit** |

---

## 9. Open items for the human

| # | Item | Owner |
| --- | --- | --- |
| 1 | **§4.3.** SCR-009 ST-02 shows role radios US-023 cannot save. Recommendation: ship them `aria-disabled` per ADR-010. Omitting them instead contradicts an approved screen spec and would be a Gate 1 `change-request` | Joy Joshua |
| 2 | **§2.4.** ADR-012 reverses ADR-011's write order for updates. The argument is the harm asymmetry between the two residual mismatches. If you disagree that a wrong notification address outranks a lagging sign-in identifier, the decision flips — and ADR-012's alternatives table is written so it can | Joy Joshua |
| 3 | **§3.4.** Whether `email_confirm: true` is *required* for a changed address to sign in immediately is **not verifiable from this environment**. Needs a check against the live Supabase project, like US-021's A16. Until then AC-05 has a unit-test proof and no integration one | DEV |
| 4 | **§7.** ADR-012's Decider is you; §Decision is the proposed text. It also adds one forward-pointing line to ADR-011, which is still `proposed` | Joy Joshua |
| 5 | **§2.6.** The read-then-write window on a concurrent edit of the same account. Recommendation: accept and log, as US-018 did. A one-line optimistic guard closes it if you would rather | Joy Joshua |
| 6 | **§3.6.** AC-06 has no observable proof this release — the notifications module is empty. Confirm a structural proof plus a README constraint is acceptable evidence at D2 | Joy Joshua / QA |

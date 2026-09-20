# US-026 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-026 — Bring a deactivated account back](../../stories/user-stories/US-026-reactivate-an-account.md) |
| **Screen**   | SCR-008 **ST-12 – ST-15** — no new state; the **Activate** branch of an item that already exists |
| **Tier**     | Complex — **contract** only (one new write operation). Persistence and trust are both *not* crossed, and §2/§5 below are the proof rather than the assertion |
| **Author**   | Architect persona (AI draft), 2026-09-20 |
| **Rests on** | ADR-001, ADR-013, and the US-019 / US-024 / US-025 design notes — **no new ADR** (§7) |

**Advisory.** The human's GitHub review is the authority. `spec.md`, `impact-analysis.md`,
`implementation-plan.md`, `decisions.md`, `traceability.md` and `change-log.md` stay DEV's.

**Written after Gate D1**, as Step 0 of the approved plan requires, and *before* any code. It
constrains an unwritten implementation rather than amending an approved one.

**This note is deliberately short.** US-026 is a narrow mirror of two already-shipped patterns —
`setRole` at the repository, `POST /desks/:id/activate` at the route. Manufacturing design depth
for it would be the wrong service to the reviewer. The four claims the plan asked me to test all
hold; the findings below are all `minor` or smaller, and every one is a line, not a redesign.

**The verdict, in one line each:**

- **Claim A — no new migration. CONFIRMED, and provable rather than inherited.** The trigger's
  `WHEN` clause (`0004:114-117`) requires `old.is_active AND old.role = 'admin'`. A reactivation's
  `old.is_active` is `false` by definition — it is the flag this write flips — so the `WHEN` is
  false on *every* reactivation regardless of role, and the function is never entered. That is a
  stronger statement than `0004:108`'s own comment ("it can only increase the count"), which argues
  from the count; the `WHEN` clause means the count is never even consulted (§2).
- **Claim B — plain `UPDATE`, not an RPC. CONFIRMED, and the asymmetry with US-025 is the
  justification, not an inconsistency to apologise for.** An RPC buys exactly one thing: two
  statements in one transaction. This write has one statement. Mirroring `deactivateAccount` would
  add a migration, a four-name PostgREST wire contract (`users.repository.ts:178-181`), a
  `PGRST202` failure mode and a `jsonb` outcome envelope, to protect an atomicity that a single
  `UPDATE` already has for free (§3).
- **Claim C — `deactivated_at` left untouched. CONFIRMED.** `0001_user_profiles.sql:42` scopes the
  column in writing: *"Audit: when REQ-020 last ran. Null for an account that has never been
  deactivated."* Nulling it on reactivation would make the second sentence false — a never-
  deactivated account and a reactivated one would become indistinguishable, destroying the only
  fact the column carries. `is_active` is the state flag; this is the audit stamp (§4).
- **Claim D — no `requireActingAdmin`. CONFIRMED, and for the *stated* reason, which matters.**
  That helper is attribution-only and says so at `admin.router.ts:58-60`; authority is the
  `requireAdmin` mount. With D-01 holding, this write has no attribution column to fill, so calling
  it would read `req.user` and discard it — `POST /users/:id/role`'s own documented position
  (`admin.router.ts:236-237`). AC-08 is served by the mount, unchanged (§5).
- **The new route must set `Cache-Control: private, no-store`, and the plan's chosen mirror is the
  one that drops it.** `minor`, one line (§6.1).
- **The live **Activate** item must not inherit `people-menu__item--danger`, or must inherit it on
  purpose with a test.** `minor`, and currently it would inherit it silently (§6.2).
- **`updated_at` IS written here, and the plan is right — but its two mirrors disagree about it and
  the code should say which one won.** `minor`, a comment (§6.3).
- **No new ADR.** ADR-013 already owns the mechanism this story inherits without touching. Everything
  else is an executable contract carrying an ordinary decision — the case `ai/roles/architect.md`
  says should *not* mint one (§7).

---

## 1. What this story actually is

One boolean, flipped back. Every acceptance criterion other than AC-01 and AC-06 is satisfied by
code that already ships, and the right way to read the ACs is as a list of things this story must
**not** do.

| AC | Where it is answered |
| --- | --- |
| **AC-01** state becomes Active | The `UPDATE`. The only new behaviour in the story |
| **AC-02** they can sign in again | Inherited, no code. `auth.service.ts:139, 167, 220` all gate on `profile.is_active`; flipping the flag is the whole of it |
| **AC-03** role comes back as it was | Structural — `role` is not in the `SET` list, so it cannot change. Proven by an absence, the same discipline `updateProfileDetails` states at `users.repository.ts:129-130` |
| **AC-04** cancelled bookings stay cancelled | Structural — this write never names `bookings` |
| **AC-05** password state untouched | Structural — `must_change_password` is not in the `SET` list |
| **AC-06** outcome stated in place | `markReactivated` (−1 to `deactivated` only) + toast + focus return (§6.2) |
| **AC-07** failure changes nothing | One statement, no optimistic UI, an `inFlight` ref — `Desks.tsx:193-196`'s own shape |
| **AC-08** admins only | Inherited from the `requireAdmin` mount (`admin.router.ts:4-13`) |

AC-03, AC-04 and AC-05 are therefore each proven by what is *absent* from the `SET` list. Step 1's
tests should assert that absence directly (`expect(update).not.toHaveProperty('role')`), the shape
`users.service.spec.ts:311` already uses for US-021/AC-08 — not merely assert the returned row.

## 2. Claim A — no new migration. Confirmed

`0004_last_active_admin_guard.sql:111-118` is an `AFTER UPDATE OF role, is_active` row trigger with
this `WHEN`:

```sql
when (
  old.is_active and old.role = 'admin'
  and not (new.is_active and new.role = 'admin')
)
```

A reactivation targets a row where `is_active = false`. The first conjunct `old.is_active` is
therefore false, the `WHEN` is false, and the trigger function is never invoked — no advisory lock
taken, no `exists` run, no `Z0011` reachable. This holds for a deactivated **admin** as well as a
deactivated employee, which is exactly AC-03's case.

This is why `SetRoleOutcome`'s `blocked` kind has **no counterpart** in the new
`ActivateAccountOutcome`, and its absence is deliberate, not an oversight: adding a `blocked` branch
would create an unreachable outcome a future reader would have to disprove — `setDeskActive`'s own
stated reasoning for omitting a `23505` branch (`desks.repository.ts:135-137`).

Nothing else in the schema needs a change either:

- **The column exists** — `is_active boolean not null default true` (`0001:32`).
- **The index exists** — `user_profiles_is_active_role_idx` (`0001:52`); a single-row `.eq('id',…)`
  write uses the primary key regardless.
- **No email collision is possible.** `user_profiles_email_key` (`0001:48`) is an *unconditional*
  unique index with no partial predicate, so a deactivated row keeps its email reserved the whole
  time it is deactivated. A reactivation can never resurrect a now-duplicate address. This is also
  why the shipped refusal copy at `people/copy.ts:119` — *"That account is deactivated — reactivate
  it on the people list instead of creating a new one"* — has been correct since US-021 and points
  at a disabled menu item until this story lands. **US-026 is what makes an already-approved
  sentence true.** Worth a line in `traceability.md`.

## 3. Claim B — plain `UPDATE`, not an RPC. Confirmed

The rule that separates the two, stated so the next writer can apply it without re-deriving it:

> **Reach for an RPC only when two or more statements must succeed or fail together.** One
> statement is already atomic; wrapping it in a function buys nothing and costs a migration, a
> wire contract, and a failure mode.

US-025 met that bar (`user_profiles` + `bookings`, one transaction). US-026 does not — no cascade,
no cross-table write, no second statement. `.update({ is_active: true, updated_at }).eq('id', id)
.select(…).maybeSingle()` is the correct shape, and `setRole` (`users.repository.ts:341-352`) is the
correct model down to the `.maybeSingle()` choice.

**One consequence the package does not name, and should:** a plain `UPDATE` cannot distinguish "was
already active" from "was deactivated" — `.select()` returns the *new* row, always `is_active: true`.
There is therefore **no `already_active` outcome**, in deliberate contrast to US-025's
`already_inactive` (`users.repository.ts:227-230`). That asymmetry is correct, and the reason is
side effects, not symmetry: `already_inactive` mattered for deactivation because re-running the
cascade on an already-inactive account would have been a second, wrong write. Reactivation has no
side effect to double-fire, so a repeat is genuinely idempotent and `ok` is an honest answer.
`POST /desks/:id/activate` has the identical property today. Worth one sentence in the repository
docblock so nobody later reads the missing kind as an omission.

## 4. Claim C — `deactivated_at` untouched. Confirmed

`0001_user_profiles.sql:42` is the whole argument, and it is a **written scope**, not an inference:

```sql
-- Audit: when REQ-020 last ran. Null for an account that has never been deactivated.
deactivated_at        timestamptz
```

Two facts live in that column: *was this account ever deactivated*, and *when, most recently*.
Nulling it on reactivation destroys both, and destroys the first irrecoverably — a reactivated
account would become indistinguishable from one that has never been deactivated at all. No AC asks
for that, and `is_active` already answers "is it deactivated right now".

This is the same discipline `setDeskActive` applies to `desks.updated_at`
(`desks.repository.ts:130-133`): a column whose migration states its meaning is not widened by a
story that was not consulted about the meaning. D-01's default ships; the open question routed to
the PO is correctly *non-blocking*, because leaving an audit stamp alone is the reversible choice
and clearing it is not.

## 5. Claim D — no `requireActingAdmin`. Confirmed

`admin.router.ts:58-60` states the helper's scope in the code itself: *"Read ONLY for ATTRIBUTION
(`cancelled_by`), never for authorization — `requireAdmin` (the mount) is the sole authority."*

US-025 used it because `bookings.cancelled_by` is a real column to fill (`admin.router.ts:299-301`).
`POST /users/:id/role` does not, for the reason recorded at `admin.router.ts:236-237`: `user_profiles`
has no actor column for a role change. With D-01 holding, US-026 is in exactly the role route's
position — there is no column to attribute to, so reading `req.user` would return a value the handler
then discards.

**AC-08 is unaffected and needs no new guard.** An Employee token is refused by the mount before
Express matches this path at all (`admin.router.ts:8`). Step 3's planned AC-08 test — an Employee
token against the real route — is the right test: it proves the mount covers the *new* path, which
is the only thing a new route can get wrong here.

Adding a `reactivated_by` column would be a persistence-surface change with no requirement behind
it. D-03 rejects it on those grounds and is right to.

## 6. What the package missed

### 6.1 `Cache-Control: private, no-store` — `minor`

Every `/api/admin/users/*` route that returns an account body sets it: `admin.router.ts:226`
(`PATCH /users/:id`), `:266` (`/role`), `:289` (`/deactivation-preview`), `:324` (`/deactivate`).
**No desk route does** — `/desks/:id/activate` (`:465-482`) ends at `res.status(200).json(outcome.desk)`
with no header, because a desk body carries no personal data.

`implementation-plan.md:55` instructs Step 3 to mirror `/desks/:id/activate` *"exactly"*. Followed
literally, the new route returns an `adminUserSchema` body — `email` and `fullName`
(`libs/contracts/src/users.ts:22-28`) — with no cache directive, from behind an admin guard. This is
the one place where "mirror the desk route" is the wrong mirror.

**Fix:** `res.setHeader('Cache-Control', 'private, no-store');` before `res.status(200).json(...)`,
and a Step 3 assertion on the header. The route is the desk route's shape in every other respect.

### 6.2 The live **Activate** item and `--danger` — `minor`

`AccountRowMenu.tsx:248` currently renders the placeholder as
`renderDisabledItem({ label: ACTIVATE_LABEL, danger: true })`, and `implementation-plan.md:71` says
the branch gains a handler *"shaped exactly like `handleDeactivate` at `:218-222`"* — whose button
(`:239-246`) carries `people-menu__item--danger`. Followed literally, **Activate** ships
danger-styled, and that will have been decided by nobody.

The evidence points the other way. SCR-008 ST-15 attributes the divider to the slot — *"separated by
a divider because it is the destructive one"* — describing **Deactivate**, not the branch that
replaces it. On the sibling screen, `DeskInventoryRow.spec.tsx:51` already asserts the inactive
chip is *"quiet-neutral, never danger"*, a shipped, tested position that inactive-state affordances
are not styled as destructive. And the story's own edge case says activating *"restores access,
harms nobody"*.

**Fix:** drop `--danger` from the live item and assert its absence in `AccountRowMenu.spec.tsx`. If
the team prefers slot consistency, keep it — but as a `decisions.md` row with a test, not as an
argument default inherited from a placeholder.

Two smaller things in the same step, both already right, worth confirming so they are not "fixed":

- **`markReactivated` moving `summary.deactivated` by −1 only is exactly correct.** `deactivated`
  counts rows *inside* `total`, not a fourth bucket (`libs/contracts/src/users.ts:52-54`), and
  `role` is untouched, so `total`/`employees`/`admins` must all stay byte-identical — the precise
  inverse of `markDeactivated` (`use-users.ts:92-98, 175-184`).
- **Focus (AC-06) falls out of `handleDeactivate`'s shape unchanged.** `triggerRef.current?.focus()`
  then `onDismiss()` (`AccountRowMenu.tsx:218-222`) returns focus synchronously, before the write
  resolves, which is right: there is no dialog for focus to visit. SCR-008 ST-14 guarantees the
  trigger survives the action.

### 6.3 `updated_at` — the plan is right, and the code should say why — `minor`

The plan mirrors `setRole` at the repository and `/desks/:id/activate` at the route, and those two
mirrors **disagree** about `updated_at`: `setDeskActive` deliberately does not write it
(`desks.repository.ts:130-133`), because `0002_desks.sql` scopes that column to renaming.

The plan takes `setRole`'s side and is correct to. `0001_user_profiles.sql:41` scopes
`user_profiles.updated_at` to nothing, and both writers on that table set it for non-rename edits —
`updateProfileDetails` (`:330`) and `setRole` (`:344`). The desk exception is a property of
`0002`'s comment, not a general rule, and does not transfer.

**Fix:** one sentence in the Step 1 docblock saying so. Without it, a reviewer comparing the two
activate paths sees an unexplained asymmetry and files it as a finding.

### 6.4 The index row is stale — `minor`

`inception/specs/index.md:32` reads `draft — awaiting Gate D1 \`go\`` while
`implementation-plan.md:15-18` carries a completed approval stamp (Joy Joshua, 2026-09-20, base
`5ed8d73`). Check 16 reads this index for package honesty. Update the row in the same commit that
lands this note.

### 6.5 Copy naming — `nit`

`implementation-plan.md:71` proposes `activateAccountFailedAlert` in `people/copy.ts`, but that
file's own sibling is `deactivateFailedAlert` (`copy.ts:252`), so `activateFailedAlert` is free
here — the collision is with `desks/copy.ts`, a different module. Same for `reactivatedToast`
beside `deactivatedToast` (`copy.ts:258`), though `reactivated` reads better and carries meaning;
keep it if preferred. Either way, match the file you are editing rather than the file you copied
from.

## 7. No ADR

Nothing here is a trade-off with a live rejected alternative:

- The concurrency mechanism was decided by **ADR-013** and is inherited **untouched** — §2 shows
  this story cannot even reach it.
- The `UPDATE`-vs-RPC choice (§3) has no real second option: an RPC for a single-statement write is
  strictly more machinery for strictly no benefit. A rejected alternative has to be *viable*.
- `deactivated_at` (§4) is settled by the column's own written scope, with the open variant already
  routed to the PO as a non-blocking question.

**No ADR needed. The code goes exactly where the plan says it goes:**
`users.repository.ts` (beside `setRole`), `users.service.ts` (beside `changeRole`),
`admin.router.ts` (beside `POST /users/:id/deactivate`), and the SCR-008 wiring in
`apps/ui/src/screens/people/`.

## 8. Findings and suggested verdict

| # | Rating | Where | What |
| --- | --- | --- | --- |
| F1 | `minor` | `admin.router.ts` (new route, Step 3) | No `Cache-Control: private, no-store` on a response carrying email and full name — the desk mirror drops the header every `/users/*` route sets (§6.1) |
| F2 | `minor` | `AccountRowMenu.tsx:248`, Step 5 | Live **Activate** inherits `people-menu__item--danger` from the placeholder; decide it and test it (§6.2) |
| F3 | `minor` | `users.repository.ts` (new method, Step 1) | Two mirrors disagree about `updated_at`; the plan picks right, the code should say why (§6.3) |
| F4 | `minor` | `inception/specs/index.md:32` | Status row still says "awaiting Gate D1 `go`" after the stamp landed (§6.4) |
| F5 | `nit` | `people/copy.ts`, Step 5 | `activateAccountFailedAlert` breaks the file's own `deactivateFailedAlert` symmetry for a collision that is in another module (§6.5) |

**Suggested verdict: proceed.** Claims A, B, C and D are all **confirmed**. No `blocker`, no
`major` — Step 1 is unblocked and the plan needs no amendment; F1–F5 are line-level and can be
carried into the steps that already touch those files. The human's GitHub review at Gate D2 remains
the authority.

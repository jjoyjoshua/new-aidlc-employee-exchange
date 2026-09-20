# US-021 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | `inception/stories/user-stories/US-021-create-a-user-account.md` |
| **Screen**   | SCR-009 — User form. **ST-01, ST-03, ST-04, ST-06, ST-07, ST-08, ST-09.** ST-02/ST-05 belong to US-023/US-024 and are not designed here |
| **Tier**     | Complex — **contract** (a new write endpoint, new required fields), **persistence** (this module's first write), **trust** (a credential minted on the service-role key, PII echoed on a `201`). Any one carries it (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-20 |
| **Rests on** | ADR-001, ADR-002, ADR-004, **ADR-009** (§3.1 is its second application), and the US-017 / US-020 design notes — **one new ADR, `ADR-011`** (§7) |

**Advisory.** The human's GitHub review is the authority. This note does not edit `spec.md`, `decisions.md`, `impact-analysis.md`, `implementation-plan.md` or `traceability.md` — they were approved at Gate D1 and every change asked for is collected in §8, applied by DEV with a `change-log.md` row.

**The verdict, in one line each:**

- **The compensating delete is confirmed — and it is only half the answer.** Best-effort `auth.admin.deleteUser` is right, for a reason stronger than the plan gives: the FK's `on delete cascade` makes one call restore "nothing happened" (§2.2). But the plan's Step 4 also has a **blocker** in it — the adapter's `duplicate` branch has no message to compose from, because the pre-check just returned nothing (§2.4). The branch that fixes that *is* the orphan detector. Detection is not extra work; it is work the plan already needs.
- **Self-healing on a later attempt: rejected, and the reason is mechanical, not philosophical.** `listUsers(params?: PageParams)` takes no email filter (`GoTrueAdminApi.d.ts:361`) — recovering an orphan's id means paging the whole auth table on a write path. And the common cause of the condition is a *concurrent request mid-flight*, so deleting or adopting the row is destructive on a race (§2.5).
- **An orphan is not a security hole, and it was checked rather than assumed.** `auth.service.ts:137-151` refuses a sign-in whose profile is missing and revokes globally. The real cost is operational: that email becomes **uncreatable through the product** until a human with the service-role key removes it (§2.3). One greppable log line and a rollback row close it. **No cleanup screen, no background job** — both would be new surfaces with no story behind them (§2.6).
- **D-02's framing needs correcting, even though its choice is right.** The pre-check is a **message-composition read**, not the uniqueness arbiter. Two indexes arbitrate: GoTrue's on `auth.users.email`, and `user_profiles_email_key` (`0001:48`). `desks.repository.ts:56-58` states the identical property and refuses a pre-check for it (§2.7).
- **The duplicate refusal must carry facts in `details`, not prose in `message`.** SCR-009:138 bolds the email inside the sentence; composing that server-side means dropping the emphasis or regex-parsing prose to restore it — ADR-009's two rejected options, verbatim. This is **ADR-009's second application**, not a new decision (§3.1). **major.**
- **Two real bugs in the browser step.** `markAdded` appending rather than re-sorting puts every new person at the bottom of a `full_name`-ordered list (§4.1), and appending **into an active search** makes the list, the match line and the ST-03 empty state all lie (§4.2). Both **major**.
- **D-03 refined, not confirmed: build `RadioGroup` under `screens/people/`.** `components/README.md:6-7` and this project's own two-consumer bar both point the other way, and US-024's second "consumer" is the same file (§4.4).
- **ADR-011 is warranted.** Not for any of D-01–D-06, but for the rule underneath the compensation: **write ordering and compensation across GoTrue and our Postgres, which have no shared transaction.** US-023, US-025 and US-027 each face it again (§7).

---

## 0. The tiering — confirmed

| Surface | What it is here |
| --- | --- |
| **Contract** | A new **write** endpoint and new **required** request fields. `libs/contracts/**` is a protected path — Complex outright |
| **Persistence** | `modules/users`'s **first write**. A new `user_profiles` row per call |
| **Trust** | A credential **minted** on the service-role client, and a `201` echoing a name and an email |

**Not a Dependency surface.** `@supabase/supabase-js` 2.109.0 is already here and already called (`auth.adapter.ts`). New *usage*, not a new package.

---

## 1. What this story actually is

**One account, two systems, one of which cannot be rolled back.** Everything hard about US-021 is in that sentence.

---

## 2. The partial-failure question

### 2.1 The order is not a decision — the foreign key makes it

`user_profiles.id` is `references auth.users (id) on delete cascade` (`0001_user_profiles.sql:28`). A `user_profiles` row **cannot exist before its `auth.users` row**. "Auth first, profile second" is forced, not chosen.

### 2.2 The same foreign key is what makes the compensation complete

`on delete cascade` means `auth.admin.deleteUser(userId)` removes the credential **and** any `user_profiles` row keyed to it, in one call — no second compensating write, no ordering hazard inside the compensation.

**One verified detail that inverts the outcome if missed:** `deleteUser(id, shouldSoftDelete?)` defaults `shouldSoftDelete = false`. A **soft** delete leaves the row and the email still occupied — exactly the harm being compensated. Call it with **one argument only**, and assert that in `users.adapter.spec.ts`.

### 2.3 What an orphan actually costs

`auth.service.ts` refuses a sign-in whose profile is missing and revokes globally — an orphan **cannot sign in** and carries no role. The real cost is that the email becomes **uncreatable through the product** until a human with the service-role key clears it. That is an operations cost, not an access one; it belongs in the rollback section, which the plan already has.

### 2.4 The blocker — the adapter's race-duplicate branch has no message to compose

AC-06/ST-04 requires the holder's name and whether the account is deactivated, and both come from `user_profiles` — the table the pre-check just found empty. **Fix:** on a race-`duplicate` from the adapter, re-read `findByEmail` once. A row now visible → `duplicate` with its fields (the concurrent request completed). Still absent → this is the orphan state; log distinctly and return `failed` — nothing the administrator can do.

### 2.5 Self-healing on a later attempt — rejected

| Variant | Why rejected |
| --- | --- |
| Adopt the existing auth user | An account-takeover primitive — it hands an administrator control of a credential the product did not mint |
| Delete the orphan and retry | Destructive on a race: the common cause is a *concurrent request mid-write*, and deleting its auth user turns another admin's successful create into a foreign-key failure |
| Either, narrowed by age | A magic number with no story behind it — speculative generality |

Also mechanical: `listUsers` takes no email filter, so recovering an orphan's id means paging the whole auth table on a write path.

**No cross-system self-healing in US-021: detect, refuse, log.**

### 2.6 Residual risk

Reaching an orphan needs all three: Auth create succeeds → profile insert fails → the compensating delete *also* fails. What closes it: a greppable `logger.error` line (the same "logged, never thrown" device `auth.adapter.ts` and `auth.service.ts` already use), and a rollback-section row (already present). **Not** an admin cleanup screen or a background job — both are new surfaces with no story, no AC, no SCR behind them; out of scope for US-021.

### 2.7 The pre-check is not the arbiter

Two indexes arbitrate a real race: GoTrue's uniqueness on `auth.users.email` (which fires first, being the second write) and `user_profiles_email_key`. `desks.repository.ts` states the identical property for `insertDesk` and refuses a pre-check for uniqueness on those grounds. US-021's pre-check is correct anyway — but only because it is a **message-composition read**, never the uniqueness check. `decisions.md` D-02 is reworded accordingly.

### 2.8 The recommended shape

```ts
async createAccount({ fullName, email, role, password }) {
  // 1. A message-composition read, NOT a uniqueness check (§2.7).
  const existing = await users.findByEmail(email);
  if (existing) return { kind: 'duplicate', fullName: existing.fullName, isActive: existing.isActive };

  // 2. Auth first is FORCED by user_profiles.id's FK (§2.1).
  const created = await usersAuth.createAccount(email, password);
  if (created.kind === 'unavailable') return { kind: 'failed' };

  if (created.kind === 'duplicate') {
    const now = await users.findByEmail(email);
    if (now) return { kind: 'duplicate', fullName: now.fullName, isActive: now.isActive };
    logger.error('auth.users holds this email but user_profiles has no row — orphaned credential', { email });
    return { kind: 'failed' };
  }

  try {
    await users.insertProfile({ id: created.userId, email, fullName, role });
  } catch (error) {
    logger.error('profile insert failed after the credential was minted; compensating', { userId: created.userId });
    const undone = await usersAuth.deleteAccount(created.userId);
    if (undone.kind !== 'ok') {
      logger.error('compensating delete FAILED — an orphaned credential remains', { userId: created.userId });
    }
    return { kind: 'failed' };
  }

  return { kind: 'ok', account: { id: created.userId, fullName, email, role, isActive: true } };
}
```

---

## 3. The contract

### 3.1 The duplicate refusal carries facts, not prose — ADR-009's second application (**major**)

SCR-009's copy bolds the email inside the sentence and the field carries its own short message. Composing that server-side loses the emphasis or forces regex-parsing prose back out of it — exactly the two options ADR-009 already rejected. `conflict()` gains the same optional `details` parameter `unprocessable()` already has; a new `emailTakenDetailsSchema` carries `{ fullName, isActive }`; `screens/people/copy.ts` composes both sentences client-side. No ADR — ADR-009 already named this extension point.

### 3.2 `201` + `Cache-Control: private, no-store` — confirmed

Matches `GET /users`'s own PII convention.

### 3.3 `toEqual`, never `toMatchObject` — confirmed

The service assembles the response by hand (no repository select-list backstop here), so the route test is the only thing standing between the response and a leaked `must_change_password`.

### 3.4 AC-10 has two proofs

The notifications module being untouched is one. The other is **`email_confirm: true`** on `auth.admin.createUser` — without it, GoTrue itself can send a confirmation email in any project with SMTP configured, an email nobody in this repository wrote code to send. State both in the adapter's docblock and title its test with AC-10 too.

### 3.5 `createAccountRequestSchema` — confirmed as written

---

## 4. The browser seam

### 4.1 `markAdded` must re-sort, not append (**major**)

The list is `full_name` ASC server-side. A `byFullName` comparator, extracted the way `use-desks.ts`'s `byDeskNumber` is, so the two cannot diverge. AC-01 asserts the row's presence, not its index.

### 4.2 `markAdded` must not append into a filtered list (**major**)

`useUsers` takes a one-argument fetcher and never sees the active search term. Appending blindly under a search makes the row appear outside the filter, the match line's numerator disagree with what's rendered, and the ST-03 no-match empty state get silently replaced by a non-matching row. **`markAdded(account, { appendToList })`**: `summary` always updates; the array updates only when no committed term is active. `People.tsx` passes `appendToList: committedQ === undefined`. With a search active, the ST-07 toast is the whole of the confirmation; the row appears once the search is cleared or re-run.

### 4.3 `markAdded` silently no-ops before the first load (**minor**)

Same hazard already live for desks — not a regression. Document with a test, not new machinery.

### 4.4 D-03 refined — `RadioGroup` belongs under `screens/people/` (**minor**)

The design doc's "no new component is needed" is about the Figma library, not this codebase's React tree. This project's own extraction bar is two real consumers, and US-024's second "consumer" is most likely the same file (`UserFormDialog` gaining an edit mode). Build it screen-private; extract only when a second screen needs one.

### 4.5 Use the existing `password-field` component for the reveal (**minor**)

### 4.6 Confirmed as planned

The two `ADD_PERSON_LABEL` call sites, the `inFlight` ref guard, and `PolicyChecklist`'s three looks are all cited accurately and need no change.

---

## 5. D-01 through D-06

| ID | Verdict |
| --- | --- |
| D-01 | Confirmed, no change |
| D-02 | Confirmed as a choice, reworded as a claim — it composes the refusal's message, it does not arbitrate uniqueness (§2.7) |
| D-03 | Refined — build screen-private (§4.4) |
| D-04 | Confirmed |
| D-05 | Confirmed — the orphan branch folds into `failed` and never reaches the browser, consistent with D-05's own argument. The service's `duplicate` now additionally carries `{ fullName, isActive }` — a widening, not a fourth outcome kind |
| D-06 | Confirmed — and it is not a decision at all, it is an already-enforced rule being followed |

None of D-01–D-06 is an ADR.

---

## 6. The rest of the plan

- **Step 2** — `findByEmail` selects `full_name, is_active` only, no `id`. Deliberate: an `id` is exactly what a "adopt the orphan" refactor would reach for.
- **Step 5** — `BuildAppOptions.usersAuth` mirrors `options.users`. Expect existing partial `createUsersService({ users })` fixtures across specs to need the new dependency added — mechanical, not a design question.
- **Step 6** — `failed` is a **returned value**, not a thrown error; the router converts it explicitly. Distinguish adapter `unavailable` (GoTrue unreachable) → `503 service_unavailable` from a profile-insert failure → bare `500`. No new error code; the browser is unaffected either way (both map to `failed` client-side).
- **Step 7** — build the role control on **native radios** in a `<fieldset>`/`<legend>` — one tab stop and arrow-key movement for free, rather than hand-rolling a `role="radiogroup"` widget.
- **Step 13** — `users/README.md` must record this module's first write, the forced order, the compensation, and what arbitrates a real race. `admin.router.ts`'s "most sensitive read" comment gains a write sibling.

---

## 7. One new ADR — `ADR-011`

**Write ordering and compensation across Supabase Auth and this application's Postgres, which have no shared transaction.** This binds at least three queued stories (US-023 edit, US-025 deactivate + cascade, US-027 admin password reset) — each a two-system write that would otherwise re-derive the ordering rule from scratch — and the rejected alternatives (a shared transaction, which is impossible; self-healing on a later attempt; adopting an existing auth user) are ones a future author will actively argue for. Numbering verified by listing `knowledge/decisions/`: ADR-001–004 and 007–010 exist; **ADR-011 is next free**.

---

## 8. Amendments to the implementation plan

This note does not edit `implementation-plan.md` directly — applied by DEV with a `change-log.md` row.

| # | Step | Amendment | Severity |
| --- | --- | --- | --- |
| A1 | 4 | Adapter-`duplicate` branch re-reads `findByEmail` once; a row now visible → `duplicate` with its fields; still absent → log the orphan distinctly, return `failed` | **blocker** |
| A2 | 3 | `UsersAuthAdapter` gains `deleteAccount(userId)`, never throwing, **one argument** (soft delete stays `false`) | **blocker** |
| A3 | 4 | Compensating delete on the `insertProfile` catch, including the `23505` path — do NOT map `23505` straight to `duplicate` the way `insertDesk` does; that would leak an orphan silently | **blocker** |
| A4 | 1/6/9 | Duplicate refusal carries `details: { fullName, isActive }`; `conflict()` gains ADR-009's optional 4th argument; `screens/people/copy.ts` composes ST-04's copy | **major** |
| A5 | 10 | `markAdded` re-sorts with a `byFullName` comparator, never appends | **major** |
| A6 | 10/12 | `markAdded(account, { appendToList })`: `summary` always, array only when no committed search term | **major** |
| A7 | 4/6 | `unavailable` → 503 `service_unavailable`; profile-insert failure → bare 500; router throws explicitly on the returned `failed` value | **minor** |
| A8 | 7 | Build `RadioGroup`/`RadioOption` under `apps/ui/src/screens/people/`, on native radios | **minor** |
| A9 | 2 | `findByEmail` selects `full_name, is_active` only; docblock states why | **minor** |
| A10 | 3 | Adapter docblock states `email_confirm: true` is half of AC-10's proof; test titled with AC-10 too | **minor** |
| A11 | 11 | Name the existing `password-field` component for FR-05's reveal | **minor** |
| A12 | 13 | `users/README.md` and `admin.router.ts`'s "most sensitive read" comment both updated | **minor** |
| A13 | 13 | Land `ADR-011` in this PR | **minor** |
| A14 | spec.md Out of scope | Add: an operator-facing orphan-cleanup path and any background reconciliation job are out of scope | **minor** |
| A15 | 10 | Document `markAdded`'s no-op before the first load with a test, not new machinery | **nit** |
| A16 | 3, Open q. 2 | While verifying GoTrue's duplicate error shape against a live Supabase instance, also check whether that build refuses a password over 72 bytes | **nit** |

A1–A4 are the load-bearing ones: A1–A3 are one finding in three halves (the two-system write is not correct without all three); A4 is the difference between SCR-009's approved copy and an approximation of it.

## 9. Open items for the human

| # | Item | Owner |
| --- | --- | --- |
| 1 | Is a log line enough for the orphan case, or should a follow-up issue track an operator cleanup path? Recommendation: log line + rollback row now; issue only if wanted | Joy Joshua |
| 2 | The orphan-detection log line uses an email, not a userId (none is held) — acceptable? | Joy Joshua |
| 3 | ADR-011's Decider is the human; §7's paragraph is the proposed Decision text | Joy Joshua |
| 4 | A16 needs a live Supabase instance to verify — not verifiable from this environment; carried as still-open | DEV |

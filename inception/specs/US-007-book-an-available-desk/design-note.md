# US-007 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-007 — Book an available desk](../../stories/user-stories/US-007-book-an-available-desk.md) |
| **Screen**   | [SCR-003](../../design/screens/SCR-003-book-a-desk.md) **ST-07–ST-12**, plus **SCR-002 ST-07** (the cancel confirmation dialog) for AC-07 |
| **Tier**     | Complex — new write route, new cancel route, a changed response shape on an existing route |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md) — **no new ADR** (§0) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is argued
before the code, not in a review thread. `decisions.md` in this package stays DEV's; nothing here
overwrites D-01–D-07, it accepts, sharpens or disputes them one at a time.

---

## 0. No ADR, and why that is the honest answer

An ADR is warranted when there is a real trade-off with a rejected alternative. This story has none
left open. The one decision that *would* have earned an ADR — what arbitrates two employees racing
for the same desk — was made at architecture time and written down three times:
[`app-architecture.md` §4.1 steps 4–5](../../architecture/app-architecture.md) (`:151-164`),
`ai/standards/api-standards.md:79-83`, and `ai/standards/testing-standards.md:52-59`. The two partial
unique indexes that implement it already exist in `supabase/migrations/0003_bookings.sql:64-68`,
created whole by US-006 **specifically so this story would not need fresh design work**.

So this note does three things instead:

1. Confirms the mapping of that settled design onto `POST /api/bookings` — and asks for one change to
   how the violated index is identified (§1). That is the only place I push back on mechanism.
2. Settles the API shape the story explicitly delegated: *"Shape is `/architect`'s to settle — no
   OpenAPI contract exists in this repository yet"* (story §API impacts). §2, §3.
3. Names two gaps in the plan that are not design disagreements but will bite during implementation
   (§4, §2.3), and one contained rework risk that is **not** a reason to stop (§7).

**What this note does not reopen.** D-02's additive field, D-03's narrow cancel scope and D-07's
choice of layout were all answered by the human at D1. I agree with all three on the merits, and §2,
§3 and §7 say why rather than merely deferring.

---

## 1. Identifying which index fired (D-01) — endorsed, with a required shape

### 1.1 What is actually reliable here, and what is assumed

D-01 picks the constraint **name** out of the Postgres error's `message` rather than parsing the
`details` column list. That is the right choice, and for a better reason than the one D-01 gives:

- `details` for a unique violation is `Key (desk_id, booking_date)=(<uuid>, <date>) already exists.`
  — it **contains row data**. The constraint name carries none. A mapping keyed on the name can be
  logged, asserted on, and read in a stack trace without anyone deciding whether the values in it are
  safe to be there. `http/errors.ts:1-9` and `api-standards.md:31-33` already say Postgres messages
  and constraint names never cross the HTTP boundary; keeping row values out of the *internal* path
  too costs nothing.
- The index names are declared in `0003_bookings.sql:64,67` and nowhere else. `details`'s column
  order is implied by the index definition, so it is the same fact one indirection further away.

**What I cannot confirm without running it, stated plainly.** There is no precedent in this codebase
for inspecting a Supabase/PostgREST error object at all — `grep` for `error.code`, `PostgrestError`
or `23505` across `apps/api/src` returns only `error-handler.ts:26`, which is an `HttpError`. Both
existing repository reads discard the structured error entirely:
`bookings.repository.ts:39` and `:50` do `throw new Error(\`… failed: ${error.message}\`)`. So US-007
is the first place in this project that depends on the *shape* of a Postgres error surfaced through
PostgREST. Two specifics I believe but have not executed:

- that `error.code` carries the SQLSTATE `23505` for a unique violation, and
- that the message names the **index**, not a constraint — these are bare `CREATE UNIQUE INDEX … WHERE`
  statements (`0003_bookings.sql:64-68`), not table constraints, and Postgres reports both under the
  same `unique constraint "<name>"` wording.

I will not assert either as fact in a design note. §1.3 is how they stop being assumptions.

### 1.2 The shape the mapping must have

Match on the **bare index name**, not on the English sentence around it, and gate on the SQLSTATE
first:

```ts
// bookings.repository.ts — insertConfirmedBooking
if (!error) return { kind: 'ok', booking: data };

// Not a unique violation at all -> a bug, not an outcome.
if (error.code !== '23505') {
  throw new Error(`booking insert failed: ${error.message}`);
}
if (error.message.includes('bookings_one_confirmed_per_desk_per_day')) return { kind: 'desk_conflict' };
if (error.message.includes('bookings_one_confirmed_per_user_per_day')) return { kind: 'user_conflict' };

// A unique violation naming something we do not know about. NOT a 409.
throw new Error(`unrecognised unique violation: ${error.message}`);
```

Three properties, each load-bearing:

- **Never match the prefix `duplicate key value violates unique constraint`.** Postgres localises
  message text via `lc_messages`; the identifier inside the quotes is not localised. Supabase's
  default locale makes this latent rather than live, but matching the name alone costs one
  `.includes()` and removes the dependency entirely.
- **An unrecognised `23505` must throw, not fall through to `desk_conflict`.** This is the finding I
  care most about in §1. If the error shape ever drifts, a fall-through produces a *plausible* wrong
  answer — an employee told "someone else took that desk" when the truth is unknown — and nothing
  fails. Throwing lands in `error-handler.ts:32-44`, which logs the full message for us and returns a
  bare `500 internal_error`. A wrong answer nobody notices is worse than an honest 500.
- **A non-`23505` error is not an outcome either.** The two `CHECK` constraints on cancellation
  (`0003_bookings.sql:48-53`) and the `desks` foreign key (`:27`) can also reject a write. Those are
  `23514`/`23503` and they mean the code is wrong, not that the user is. Same throw, same 500.

The same rule applies to `cancelOwnedBooking`: the schema requires `cancelled_at` and
`cancellation_source` to be set in the *same* `UPDATE` as `status = 'cancelled'`
(`bookings_cancelled_at_matches_status`, `bookings_cancelled_has_source`). If DEV forgets one, the
database rejects the write rather than storing an inconsistent row — a `23514`, which must surface as
a 500, **never** as `404 booking_not_found`. The schema is already doing this work; the repository
only has to not swallow it.

### 1.3 The real-Postgres test is the proof, not a nice-to-have

`testing-standards.md:52-59` already requires it and `implementation-plan.md` Step 3 already plans
it. I am adding one requirement to that step: **the concurrency spec must assert the raw error object,
not only the mapped outcome.** One test that performs a real duplicate insert and asserts
`error.code === '23505'` and `error.message` contains `bookings_one_confirmed_per_desk_per_day` pins
both assumptions in §1.1 to something executable. Without it, Step 3 proves the mapping works today
and says nothing about *why*, so a future supabase-js upgrade that changes the surfaced shape fails
with "expected ok, got desk_conflict" instead of "the error no longer carries a code".

Two consequences of Step 3 being env-gated (skipped when no database is configured) that the PR must
own explicitly:

- **No AC may have its only citation inside the gated file.** A skipped test is not an active test
  and `aidlc-check` reads active tests. As planned this is fine — AC-05 and AC-08 also have non-gated
  citations in Steps 5 and 8 — but the PR should say so rather than leave a reviewer to work it out.
- **The gated run's output must be pasted into the PR**, as Step 11 already says. Until CI runs it, a
  pasted run is the only evidence the arbitration works, and the note above about drift is the reason
  it matters more than a normal evidence paste.

---

## 2. `myBooking` on the availability response (D-02) — endorsed, with two conditions

### 2.1 The additive field is right

AC-06 is explicitly about the wasted choice never happening: the existing-booking state must be
renderable *at the moment the desk list arrives*. A second endpoint makes the client sequence two
requests before it can render anything, or render a desk list it may have to tear down. The response
schema is already non-`.strict()` by the project's stated rule for every endpoint
(`libs/contracts/src/availability.ts:38-39`), so the field is additive for tabs loaded before the
deploy. Nothing here needs an ADR. Agreed as written.

`myBooking` is `{ id, deskId, deskNumber }` — **no `userId`, and it must stay that way.** Adding one
would be the caller's own id today and an invitation to generalise the object into "whose booking"
tomorrow. The shape as specified is correct.

### 2.2 It only ever describes the caller — here is what makes that structural

I checked this against US-006's own guarantee, because this story loosens it. US-006 made
non-disclosure structural rather than careful: `listConfirmedDeskIds` selects `desk_id` **only**, and
the repository says why in `bookings.repository.ts:25-28` — *"The occupant is never read, not merely
never sent … there is no column here to forget to strip in a later refactor."* US-007 is the first
story that must read `bookings.user_id` at all, so that structural property weakens by necessity. It
is still safe, on three counts, and each is worth naming so a reviewer can check it rather than trust it:

1. **`userId` can only come from the session.** `availabilityQuerySchema` is `.strict()`
   (`availability.ts:14`), so a client-supplied `?userId=` is a `400 invalid_request` at the route
   edge — it cannot even reach the service. The router must thread `req.user.id`
   (`bookings.router.ts:40` today passes only the date) and nothing else.
2. **The new read is filtered on it.** `findMyConfirmedBooking(userId, date)` must filter
   `user_id = :userId AND booking_date = :date AND status = 'confirmed'`, with an explicit column
   list (`id, desk_id` + `desks(desk_number)`), never `select('*')` — same rule as ADR-004 and the
   existing reads.
3. **A leaked id would still be inert.** `myBooking.id` feeds the cancel endpoint, which is
   owner-scoped in its own `WHERE` clause (§3.2). Even a bug that surfaced a foreign booking id could
   not be used to cancel it. That is defence in depth working as intended, not a reason to relax (1).

**Required test, and it is not in the plan today.** Seed a *different* user's confirmed booking on
the requested date and assert the caller gets `myBooking: null` — and that the desk still appears as
`taken` in `desks[]` with no occupant field anywhere in the body. The plan's Step 4 only covers
"the caller's own booking, or null" (the positive and the empty case). The negative case is the one
that catches a dropped `.eq('user_id', …)`, which is exactly how this class of leak ships. Name it
`… (US-007/AC-06)` alongside the positive case, and re-assert US-006's AC-06 non-disclosure in the
same file so the guarantee this story loosens is re-proved in the story that loosens it.

### 2.3 The response is now per-caller, and nothing says so on the wire

This is the finding I would not have gone looking for if D-02 were a separate endpoint, and it is the
concrete cost of the additive field.

`GET /api/bookings/availability` returns a body that is **identical for every employee** today — every
active desk and its taken/free state, no caller-specific content. After this story it contains the
caller's own booking. Yet a `grep` for `Cache-Control` / `no-store` across `apps/**` returns nothing:
the only response header this app sets is `Vary: Origin` on the CORS path (`http/app.ts:46`). Express
adds an `ETag` to `res.json` and no `Cache-Control` at all, and a 200 on a `GET` with no freshness
directives is heuristically cacheable by a shared intermediary. Session cookies do not prevent that
the way an `Authorization` header historically did.

Today the exposure is nil because the body is the same for everyone. From this story on it is not.

**Recommendation:** set `Cache-Control: private, no-store` on the availability response in this PR,
in `bookings.router.ts`, with a one-line comment naming `myBooking` as the reason. It is two lines
and it closes the question permanently. The wider point — that every authenticated route in this API
should carry it — is real but is DevOps/US-0xx's, not this story's; I would not expand scope for it
here, and I have not written it as a blocker.

---

## 3. `POST /api/bookings/:id/cancel` (D-03) — shape settled, scope endorsed

The story delegates API shape to me by name, so this section settles it rather than deferring to the
plan.

### 3.1 A `POST` action sub-resource is correct; `DELETE` would be wrong

`api-standards.md:8-11` allows an action sub-resource when a noun genuinely does not fit, with
`/api/internal/reminders/run` as the standing precedent. Cancellation qualifies, and the two
alternatives are worse:

- **`DELETE /api/bookings/:id`** implies the row goes away. It must not. `bookings` rows are retained
  with `cancelled_at`, `cancelled_by` and `cancellation_source` (`0003_bookings.sql:35-37`), the FKs
  are `on delete restrict` (`:26-27`), and REQ-031/BR-001.9 read cancelled history. A verb whose
  plain meaning is the opposite of what happens is a contract defect even when the handler is right.
- **`PATCH /api/bookings/:id` with `{ status: 'cancelled' }`** puts a state machine on the wire and
  invites a second transition later. Cancellation has side effects the client does not get to choose
  (`cancellation_source = 'owner'` here; `'admin'` and `'deactivation_cascade'` on paths US-011/US-029
  own). Naming the action keeps the source server-decided.

**The URL will not need to change when US-011 lands.** US-011 extends what this endpoint distinguishes,
not where it lives. That matters: D-03 deliberately builds less, and the cost of building less should
not be a breaking URL later. It is not.

### 3.2 The single owner-scoped `UPDATE … RETURNING` is the right primitive

`UPDATE bookings SET … WHERE id = :id AND user_id = :userId AND status = 'confirmed' RETURNING *`
is one statement. There is no read-then-write window, so two concurrent cancels of the same booking
produce exactly one row returned and one empty result — the same property the unique indexes give the
insert, obtained the same way (the database arbitrates, not the application). No advisory lock, no
transaction wrapper, nothing further needed. Agreed exactly as the plan writes it.

### 3.3 The undistinguished `404` is the secure answer, not merely the cheap one

The question asked was whether one `404` for *not found* / *not yours* / *not confirmed* leaks
anything. My read: it leaks **less** than distinguishing them would, and there is no observable
difference worth worrying about at this scope.

- **Response shape:** all three produce a byte-identical
  `{ statusCode: 404, code: 'booking_not_found', message: … }`. Distinguishing "not yours" from "no
  such booking" would turn the endpoint into an existence oracle over booking ids — the
  enumeration weakness US-001/AC-04 already rejects elsewhere in this codebase, where sign-in returns
  byte-identical bodies for unknown email, wrong password and deactivated account. This endpoint
  inherits that precedent rather than departing from it.
- **Timing:** all three follow the same path — one `UPDATE` with a three-predicate `WHERE`, returning
  zero rows. There is no branch on existence, no second query on the miss path, no bcrypt-style
  asymmetric work. Row-count differences at this scale are not a signal an attacker can extract over
  a network, and booking ids are v4 UUIDs (`0003_bookings.sql:25`), so there is nothing to enumerate
  toward in the first place.
- **The one observable difference, named for the reviewer:** a second cancel of a booking the caller
  *does* own returns the same 404 as a cancel of a booking that never existed. That is correct and
  intentional. It is also the one case where "undistinguished" has a user-visible consequence — §3.4.

D-03's scope call is right on the merits, not just because the human approved it: US-011 does not list
US-007 as a dependency, so it must not inherit a half-built eligibility surface it did not ask for,
and a narrow endpoint is far easier to widen than a wrong one is to narrow.

### 3.4 What the UI does with a `404` from cancel is not specified — and should be

FR-12 says what happens on success (reload availability for the same date). Nothing in `spec.md` or
the plan says what happens on a `404`. Double-submit protection on cancel is explicitly US-011's
(`spec.md`, Out of scope), which is fine — but the dialog's confirm button still exists in this story
and can still be pressed twice.

**Recommendation — converge, do not fail.** Treat a `404 booking_not_found` from cancel exactly like
success: refetch availability for that date and re-render. A 404 here means the booking is no longer
confirmed, which is the state the employee was asking for. Showing them a failure for a thing that
already happened is the worst of the three possible behaviours, and this costs one branch. It adds no
US-011 scope: it does not distinguish *why*, it just stops treating "already done" as an error.

---

## 4. AC-05's race variant has no data to render with (a gap, not a disagreement)

This is the one place where the plan, followed literally, does not produce the behaviour the AC asks
for. It is a sequencing gap rather than a design flaw, and it is cheap to close — but it is not
visible until you try to write Step 8.

FR-14 says a `409 already_booked_that_date` on confirm must *"replace the desk list with the
existing-booking state, the same rendering FR-11 uses."* FR-11's rendering needs
`myBooking` — the desk number and the booking id of the booking the employee already holds. In this
exact path the client does not have it: `myBooking` was `null` when availability loaded (that is
precisely why the desk list was rendered and a confirm was possible), and the booking was made
elsewhere in between. The `409` body cannot supply it either — `api-standards.md:31-33` is explicit
that the error body is `{ statusCode, code, message }` and *"nothing else crosses the boundary"*, and
I would not carve out an exception for one screen.

**Recommendation:** on `409 already_booked_that_date`, **refetch availability for the same date and
render the existing-booking state from the refetched `myBooking`** — the same refetch-then-render
shape AC-08 already uses for `409 desk_already_booked`, which the plan's Step 8 does spell out. Two
details worth writing into the test:

- Focus moves to the explanation, not to the cancel action (SCR-003 ST-10's stated commitment) —
  and it must move *after* the refetch resolves, or it lands on a node about to be replaced.
- If the refetch returns `myBooking: null` (the conflicting booking was cancelled in the intervening
  moment), fall back to the ordinary desk list rather than rendering an existing-booking state with
  nothing in it. Rare, but it is the natural consequence of a two-step read and costs one guard.

Fold this into `spec.md`'s FR-14 and the plan's Step 8 verification line before implementing. Nothing
else in the package changes.

---

## 5. The desk-active check (D-05) — endorsed

A plain `SELECT id, is_active FROM desks WHERE id = :deskId` is correct. D-05's stated reason is
right (a Postgres `CHECK` cannot reference another table, and a trigger would put a business rule
where `coding-standards.md` says rules must not live), and ADR-004 already precedents this module
reading `desks` with an explicit column list (`bookings.repository.ts:12-13`, `listActiveDesks`).

Two things to add rather than change:

- **The TOCTOU window is theoretical today and should be said so, once.** Nothing can flip
  `is_active` concurrently — `modules/desks` does not exist (US-015/US-017). When it does, the
  question "can a desk be deactivated out from under an in-flight booking?" becomes real and belongs
  to *that* story, which also owns BR-001.7's cascade. `modules/bookings/README.md` is the right
  place for that sentence, and Step 10 already edits it.
- **The existence half has a database backstop the code should not fight.** `bookings.desk_id`
  references `desks(id)` (`0003_bookings.sql:27`), so a genuinely absent desk fails the insert with a
  `23503` even if the `SELECT` missed it. Per §1.2 that is an unrecognised error and becomes a 500 —
  correct, because desks are deactivated and never deleted, so reaching it means something is wrong.
  The pre-`SELECT` exists to turn the *common* case into a friendly `404 desk_not_found`, not to be
  the only guard. Worth one comment so a later reader does not "simplify" it away.

---

## 6. The shared confirm dialog (D-06) — endorsed, briefly

The story text says *"the cancel confirmation dialog reused from SCR-002 ST-07"*. "Reused" is an
instruction, and no dialog or modal primitive exists under `apps/ui/src/components/` today, so there
is nothing to reuse and one must be built. Building it generic (title / body / confirm / cancel,
Escape to dismiss, the solid danger fill, no `bookings` vocabulary inside it) so US-011 extends rather
than reconciles is the obviously cheaper end state, and the plan's Step 7 already describes it that
way. No change requested.

The one thing a reviewer should check at D2: that no booking-specific string leaked into
`ConfirmDialog.tsx`. That is the whole difference between D-06 as decided and D-06 as a one-off with
a shared-looking directory name.

---

## 7. Building on the merged layout (D-07) — rework risk, contained, and not a reason to stop

D-07 is right and I am not reopening it. Building this story's UI on an uncommitted, unapproved
design revision that names itself as needing a separate follow-up story would make US-007's scope
hostage to that spec's own open questions. The scope decision was put to the human and answered.

What I owe the note is an honest statement of what the eventual tile-grid rebuild will have to redo,
since this story's ACs are what it will be measured against:

| Survives the rebuild | Redone by the rebuild |
| --- | --- |
| `POST /api/bookings`, `POST /:id/cancel`, `myBooking` — the entire server half | `DeskRow`'s new `selected`/`onSelect` props and their unit tests, if `desk-row` is replaced by a desk tile |
| `confirm-dialog`, `existing-booking-state`, `confirm-booking-bar` — all layout-agnostic | `zone-group` → zone tabs, if the tabbed layout lands as drafted |
| FR-11/FR-12 (the existing-booking state replaces the whole list in either layout) | AC-01/AC-02's *assertions*, if they live only in `DeskRow.spec.tsx` |

**One cheap thing that shrinks this to almost nothing, and I would do it regardless of the rebuild:**
keep the selection state — the single-select invariant and the clear-on-date-change rule — in
`BookADesk.tsx` / `use-book-desk.ts`, and let `DeskRow` be purely presentational (`selected` in,
`onSelect` out). Then write the **AC-01 and AC-02 assertions at screen level** in
`BookADesk.spec.tsx`, in addition to the component-level ones in Step 6. Component tests are worth
having; they are just the wrong place for the only citation of an AC, because a presentational swap
deletes the file and orphans the traceability row. Screen-level assertions survive the swap, and the
rebuild story then re-runs US-007's ACs against the new layout instead of rewriting them.

There is also a substantive reason AC-02 will need re-proving under tabs: a zone-tabbed layout can
put the selected desk in a tab that is not visible. "Only one desk is ever selected" still holds, but
"the confirm action names the choice" (AC-01) carries more weight when the selected row is off-screen
by construction rather than by scrolling. That is a note for the rebuild story, not a change here.

**Process, for whoever opens this PR:** the 2026-09-18 SCR-003 revision is sitting **uncommitted in
the working tree right now** (`git status` shows `M inception/design/screens/SCR-003-book-a-desk.md`,
128 lines changed). It must not ride into the US-007 PR unannounced — either leave it out, or commit
it separately with a message saying it is a design revision awaiting its own Gate 1 story. A reviewer
who sees a tile-grid spec and a row-list implementation in one PR will reasonably think the
implementation is wrong.

---

## 8. Findings

Rated per `ai/quality/review-checklist.md`. None is a blocker; the story is safe to implement.

| # | Rating | Where | Finding | Fix |
| - | ------ | ----- | ------- | --- |
| F-1 | major | `bookings.repository.ts` (`insertConfirmedBooking`) | An unrecognised unique violation falling through to `desk_conflict` gives a plausible wrong answer that no test catches | Gate on `error.code === '23505'`, match the bare index name, `throw` on anything else (§1.2) |
| F-2 | major | `bookings.repository.concurrency.spec.ts` (Step 3) | The plan proves the mapping works, not why; the error-shape assumption stays unpinned | Assert the raw error's `code` and `message` in one test, not only the mapped outcome (§1.3) |
| F-3 | major | `spec.md` FR-14 / plan Step 8 | The `409 already_booked_that_date` path has no data to render the existing-booking state with | Refetch availability, render from the refetched `myBooking`, guard the `null` case (§4) |
| F-4 | major | `bookings.router.ts` (`GET /availability`) | The response becomes caller-specific while carrying no `Cache-Control` at all | `Cache-Control: private, no-store`, with `myBooking` named as the reason (§2.3) |
| F-5 | major | `bookings.service.spec.ts` (Step 4) | No negative test that another user's confirmed booking never surfaces as `myBooking` — the exact shape a dropped `.eq('user_id', …)` takes | Add it, and re-assert US-006/AC-06 non-disclosure in the same file (§2.2) |
| F-6 | minor | `ExistingBookingState` / `use-book-desk.ts` | A `404` from cancel (double-confirm) has no specified behaviour and would land in the generic failure state | Treat it as success: refetch and re-render (§3.4) |
| F-7 | minor | plan Steps 3 and 5 | AC-09's "exactly one booking exists" is proved only at the UI level; the per-user index is what actually guarantees it | Also cite the per-user concurrency case as `(US-007/AC-09)`, and add a non-gated API test: two sequential POSTs, same user and date → `201` then `409` |
| F-8 | minor | Steps 6 and 8 | AC-01/AC-02 cited only in `DeskRow.spec.tsx` will be orphaned by the tile-grid rebuild | Assert them at screen level too; keep selection state in the screen (§7) |
| F-9 | nit | `libs/contracts/src/bookings.ts` | `confirmationEmail` names an address no mail reaches until US-028 | Say so in the schema comment — it is the address the confirmation *will* go to, not evidence of a dispatch |
| F-10 | nit | `bookings.router.ts` | `req.user!.id` asserts away a real possibility | Use `require-admin.ts:22-29`'s shape — read `req.user`, refuse if absent, because absence means the guard was mounted wrong |
| F-11 | nit (process) | working tree | The uncommitted SCR-003 tile-grid revision may ride into this PR silently | Leave it out, or commit it separately and say what it is (§7) |

**Suggested verdict: proceed.** F-1 through F-5 should land in the implementation rather than in a
D2 review thread — F-1 and F-3 change code that is about to be written, and F-4 and F-5 are each a
handful of lines. Nothing here requires re-approving the plan.

---

## 9. What I did not touch

- `inception/architecture/app-architecture.md` §4.1 — implemented as written, not revised.
- `decisions.md` D-01–D-07 — DEV's file. §1 asks for a change to D-01's *implementation shape*, not
  to its decision; the decision (match the name, not the column list) stands and is right.
- The Gate D1 approval — this note is a persona obligation between D1 and D2, not a second gate.
  `ai/gates/delivery.md:37` says so in those words.

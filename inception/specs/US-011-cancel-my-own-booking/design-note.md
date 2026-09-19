# US-011 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-011 — Cancel my own booking](../../stories/user-stories/US-011-cancel-my-own-booking.md) |
| **Screen**   | [SCR-002](../../design/screens/SCR-002-my-bookings.md) **ST-07 – ST-10**. ST-01 – ST-06 are US-010's and are built; this story adds the cancel interaction on top of them |
| **Tier**     | Complex — a protected contract path, a changed response shape on an existing write, and a shared component's props (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), [ADR-007](../../../knowledge/decisions/ADR-007-derived-booking-status.md), and **US-007/D-03, which this note amends in place (§3)** — **no new ADR** (§7) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is argued
before the code, not in a review thread. `decisions.md` in this package stays DEV's.

The story hands `/architect` its API shape by name (story line 106: *"Shape is `/architect`'s to
settle"*), and the shape turns on one question: **how much of US-007's deliberately
undiscriminated `404` survives contact with AC-09?** The answer is *almost all of it*. AC-09 needs
exactly one case to peel off, and that case discloses nothing, because it is a fact about a booking
the caller already owns and can already read.

**The verdict, in one line each:**

- **One new error code**, `booking_already_cancelled`, returned as **`409`** — the only case that
  peels off D-03's single `404` (§1).
- **AC-02's past-dated refusal lives in the `UPDATE`'s own `WHERE` clause and folds into the
  existing `404 booking_not_found`.** No second new code, no new dialog outcome (§2).
- **Write first, then explain.** The `UPDATE` stays the sole arbiter; a second, owner-scoped,
  read-only lookup runs *only on the miss path* and only to classify it (§1.4).
- **D-03 is amended, not overturned** — "no such booking" and "not the caller's" stay
  indistinguishable, and four docblocks that currently assert otherwise must be corrected (§3).
- **`200` with an empty body is unchanged**, and `libs/contracts/src/bookings.ts` gains nothing
  (§6).
- **No new ADR** (§7). D-03 named US-011 as the owner of this distinction; recording that US-011
  did what D-03 said it would is ceremony, not architecture.

§8 is the list of things a DEV building this gets wrong without reading further. Three of them
(§8.1, §8.2, §8.4) produce green tests and a broken product — and §8.2 breaks a **different
screen** than the one this story is about.

---

## 0. The tiering

**Complex**, on three surfaces, as
[`task-surfaces.md`](../../../ai/standards/task-surfaces.md) names them here:

| Surface | What it is here |
| --- | --- |
| **Contract (protected path)** | `libs/contracts/src/error.ts` gains one enum member. `task-surfaces.md` lists `libs/contracts/**` as always-Complex — *"the error body and its stable `code` strings. Changing one changes both sides at once"* |
| **Contract (server)** | `POST /api/bookings/:id/cancel`'s **response shape changes**: a status code it could never return before (`409`) becomes reachable. `task-surfaces.md` §Server names *"a changed response shape"* explicitly |
| **Contract (UI)** | `ConfirmDialog`'s public props gain an error region and a single-action mode, and its keyboard contract changes (§5.1). A **shared** component under `apps/ui/src/components/` — the same surface US-009 marked for `EmptyState` and US-010 for `StatusChip` |

**Not Persistence.** No migration, no column, no index. Everything the write needs already exists:
`cancelled_at`, `cancelled_by`, `cancellation_source` (`supabase/migrations/0003_bookings.sql:35-37`),
their two CHECK constraints (`:48-53`), the partial unique indexes (`:64-68`), and
`bookings_user_id_booking_date_idx` (`:77`) which serves the new lookup. The repository already
writes all three columns (`bookings.repository.ts:234-239`).
**A migration appearing in this PR is a review finding.**

**Not Trust.** No new authz surface. The route is already behind `requireSession`
(`apps/api/src/http/app.ts`), and owner-scoping stays exactly where it is — a predicate in the
`WHERE` clause, not a check the service could forget (§4.2).

**Not Dependency, not Operational.** Nothing new, nothing scheduled.

Two tiers this note deliberately **keeps down**:

- **`BookingRow` gains a Cancel action and stays screen-private.** `task-surfaces.md` §Browser makes
  *"a change inside one screen's folder"* Medium. US-010 §0 already argued the extraction question
  and deferred it to US-013; nothing here changes that.
- **No new `domain/` function.** BR-001.6's rule already exists — see §2.1. A DEV following US-010's
  pattern will reflexively create `domain/booking-cancellation.ts`; it would have no caller.

A Complex change carries a design note written *before* the code
([`ai/gates/delivery.md`](../../../ai/gates/delivery.md)). This is it.

---

## 1. AC-09 — the wire shape for "already cancelled"

### 1.1 The decision

`libs/contracts/src/error.ts` gains exactly one member:

```ts
  // US-011/AC-09 — the row exists, belongs to the caller, and is ALREADY `cancelled`: an admin
  // got there first (US-015), a deactivation cascade voided it (US-025), or a concurrent request
  // of the caller's own won the UPDATE. SCR-002 ST-09 renders this differently from a transient
  // failure — not retryable, the confirming action becomes Close, and the list refreshes on
  // dismissal — which is why it cannot stay inside `booking_not_found`.
  //
  // This is the ONE case that peels off US-007/D-03's single undiscriminated 404. "No such
  // booking" and "not the caller's" remain indistinguishable, deliberately (design note §1.2, §3).
  'booking_already_cancelled',
```

Returned as **`409`**, with the router's `conflict()` helper (`apps/api/src/http/errors.ts:60`).

Nothing else changes in `libs/contracts/`. In particular `bookings.ts` is untouched: the route
params schema (`bookings.ts:46-48`) is unchanged, the success body is still `200`-empty (§6), and
no request or response schema gains a field.

### 1.2 Why this does **not** reopen the enumeration oracle D-03 closed

This is the load-bearing paragraph, because D-03's argument was a **security** argument
(`US-007/design-note.md` §3.3), and a story that walks past a security argument without answering
it is how a project acquires a hole.

D-03's concern: distinguishing *"not yours"* from *"no such booking"* turns the endpoint into an
existence oracle over booking ids — the enumeration weakness `US-001/AC-04` rejects, where sign-in
returns byte-identical bodies for unknown email, wrong password and deactivated account.

**That concern is untouched here, because of exactly where the new code is emitted.**
`booking_already_cancelled` is produced **only** when all three hold:

1. the row exists, **and**
2. `user_id` equals the caller's, **and**
3. `status = 'cancelled'`.

An attacker probing UUIDs they do not own receives `404 booking_not_found` for every one of them,
byte-identical, exactly as today. The new code discriminates **only among the caller's own
bookings** — and the caller can already enumerate those, with their statuses, by calling
`GET /api/bookings` (US-010). **Zero new information crosses the boundary.**

State that as a rule, because US-013, US-014, US-015 and US-025 will each face it:

> Discriminating among the states of a resource the caller already owns discloses nothing, because
> the caller can already read those states. Discriminating **across** the ownership boundary is the
> oracle. The `.eq('user_id', userId)` on the disambiguating read (§4.2) is what keeps this
> distinction structural rather than remembered.

**Timing is unchanged in the only direction that matters.** The miss path now costs one extra
indexed `limit 1` read, so a miss is *slower* than a success. The three miss reasons — not found,
not yours, past-dated — all follow the identical two-statement path and are indistinguishable by
timing from each other. The only newly-distinguishable outcome is one the caller is entitled to.

### 1.3 Why `409`, and not `404` with a new code, or `422`

| Shape | Why not |
| --- | --- |
| **`404` with `code: 'booking_already_cancelled'`** | The status code and the code string would contradict each other in the same body: `404` asserts the resource was not found, while the code asserts it was found and names its state. A reader triaging a log sees two claims and has to know which one lies. It also makes `404` a bucket meaning two different things on one endpoint |
| **`422 booking_already_cancelled`** | `errors.ts:62-66` reserves 422 for *"well-formed but the rule refuses it. **Not a race**: the rule says no"*. AC-09 is explicitly a race in two of its three causes (a concurrent request, or an admin acting between page load and confirm). Using the one status code whose docblock says "not a race" for the endpoint's only genuine race is a contract that has to be explained to be understood |
| **`200` with a body naming the outcome** | Would change the success shape for both callers (§6) and turn "your request did not do what you asked" into a success, which is what `requestNoContent` (`api-client.ts:138-155`) exists to keep honest. It also strands every non-browser consumer that switches on status class |
| **`409 booking_already_cancelled` (chosen)** | *"Something else got there first"* — `errors.ts:57` — is AC-09's exact sentence. The project's two existing 409s (`desk_already_booked`, `already_booked_that_date`) are both "somebody else won"; this is the third of the same kind. And the resource genuinely exists and genuinely conflicts with the requested transition, which is what 409 means |

**One docblock correction this requires.** `errors.ts:56-60` currently reads *"The world changed, and
retrying differently can succeed"*. For `booking_already_cancelled` retrying can **never** succeed —
cancellation is terminal (story edge case: *"A cancelled booking is never revived"*). Amend the
sentence to *"…and retrying differently can succeed, or the resource has already moved past the
state the request asked for."* One line, and it stops the next reader concluding the code is
misfiled. **Retryability is carried by the `code`, not by the status class** — the screen decides
what to offer (§5.2), which is why ST-09 can make this the non-retryable branch under a 409.

### 1.4 Write first, then explain

The order is the whole design, and inverting it is the defect this section exists to prevent.

```
1. UPDATE bookings SET status='cancelled', cancelled_at=?, cancelled_by=?, cancellation_source='owner'
     WHERE id=? AND user_id=? AND status='confirmed' AND booking_date >= ?   -- ? = office today (§2.1)
     RETURNING id
2. if a row came back                -> 200
3. otherwise, and ONLY otherwise:
   SELECT status, booking_date FROM bookings WHERE id=? AND user_id=?        -- read-only
4.   status = 'cancelled'            -> 409 booking_already_cancelled
5.   anything else, or no row        -> 404 booking_not_found
```

**Why the write must come first.**

- **It preserves §3.2's primitive exactly.** `US-007/design-note.md` §3.2 established the single
  owner-scoped `UPDATE … RETURNING` as the right shape precisely because there is *no read-then-write
  window*. Reading first to classify, then writing, would reintroduce it — and would classify
  *wrongly* in the case AC-09 is about: the read says `confirmed`, the admin cancels, the `UPDATE`
  misses, and the endpoint now reports `booking_not_found` for a booking it just observed.
- **Step 3 is not a race, and this is provable rather than hopeful.** If the `UPDATE` in step 1
  returned zero rows *because a concurrent cancel won*, then under `READ COMMITTED` this statement
  blocked on the winner's row lock and re-evaluated its `WHERE` only after the winner **committed**.
  The winner's commit is therefore strictly ordered before step 3 is even issued, so step 3 is
  guaranteed to observe `status = 'cancelled'`. **No retry loop, no polling, no "eventually
  consistent" hedge.** And because `cancelled` is terminal, nothing can move the row back between
  the two statements — the read is monotone-safe in the one direction it needs to be.
- **Step 3 costs nothing on the happy path.** It is issued only on a miss, which is the rare branch.
  It is one `limit 1` lookup on the primary key, further narrowed by `user_id`.

### 1.5 The no-double-write, no-double-email invariant — confirmed, and why

AC-09 requires *"no second cancellation or second email"*. Under this shape:

- **The `UPDATE` remains the only writer**, and its `WHERE` still carries `status = 'confirmed'`. Of
  two concurrent cancels, exactly one updates one row and the other updates zero. The database
  arbitrates, as it does for the insert's unique indexes. Nothing in §1.4 adds a second write path.
- **Step 3 is read-only.** It cannot produce a second cancellation by construction, not by
  discipline.
- **`cancelled_at` / `cancelled_by` / `cancellation_source` are written exactly once**, and the
  `status = 'confirmed'` predicate is what structurally prevents an owner's cancel from overwriting
  `cancellation_source = 'admin'` that US-015 or US-025 already wrote. **That matters beyond this
  story**: BR-001.20 and US-029's notification composer key on `cancellation_source`
  (`0003_bookings.sql:18-22`), so a stray owner-cancel overwriting an admin attribution would make
  the *wrong email* be sent later. The predicate is load-bearing for a story that does not exist yet.
- **AC-10's email (US-029) must be triggered by the returned row of step 1, never by the router's
  `200`, and never on the 409 branch.** US-029 is not built, so this is a forward constraint rather
  than code in this PR — but it is the one sentence that makes AC-09's "no second email" true by
  construction instead of by testing. Record it in `decisions.md`.

---

## 2. AC-02 — the past-dated refusal

AC-02 is currently **not enforced**. `cancelOwnedBooking` (`bookings.repository.ts:231-248`) filters
on id, owner and `status = 'confirmed'` and has **no date predicate at all**, so a Confirmed booking
dated last Tuesday is cancellable today. US-007/D-03 says so in as many words: US-011 owns
*"past-dated"*. This is that.

### 2.1 The check lives in the `UPDATE`'s own `WHERE` clause

Add `.gte('booking_date', today)`, with `today` **threaded in as a parameter** from the service —
never read from a clock inside the repository, matching the convention `cancelledAt` already follows
(`bookings.repository.ts:222-224`, and `auth.repository.ts`'s `stampLastSeen` before it).

**Why the `WHERE` clause and not a service-level pre-check:**

| Candidate | Why not |
| --- | --- |
| **A service pre-check** — read the booking, compare the date, then `UPDATE` | Reintroduces the read-then-write window `US-007` §3.2 removed, for a rule the database can evaluate in the same statement as the write. It also puts the endpoint's correctness in two places that can disagree |
| **A CHECK constraint or trigger** | A `CHECK` cannot reference "today" without `current_date`, which is the database server's zone — exactly the NFR-001 defect ADR-007 rejected at length. A trigger moves a rule out of `domain/`/`modules/`, which `US-007/D-05` already refused for the desk-active check |
| **`refusalFor` from `domain/booking-window.ts`** | It refuses dates for **booking** (`past`, `too-far-ahead`, `closed`). A cancel has no forward window and no weekend rule — a booking on a weekend cannot exist (`bookings_weekday_only`, `0003_bookings.sql:45`), and cancelling a booking 29 days out is legal. Reusing it would emit `too-far-ahead` on a cancel, which is nonsense. US-010 §1.5 drew the same line for the same reason |

**There is no new `domain/` function, because the rule already exists.** ADR-007 gives it:
`bookingDisplayStatus(stored, date, today) === 'confirmed'` **is** BR-001.6's cancellability test.
US-010's note said so before this story was designed — *"'is this cancellable' (BR-001.6, US-011) is
exactly `status === 'confirmed'`, because a passed confirmed booking is already `'completed'`"*
(US-010 §1.4). The SQL predicate `status='confirmed' AND booking_date >= today` is that same rule
expressed where the write happens.

**The latent drift is real and is answered by a test, not by a comment.** Two expressions of one
rule — `bookingDisplayStatus` in TypeScript, and the compound `WHERE` in the repository — can drift.
The guard is a **cross-endpoint consistency test** (§10): over a fixture holding one Confirmed-today,
one Confirmed-future, one Confirmed-past and one Cancelled booking, `POST /:id/cancel` succeeds on
**exactly** the rows that `GET /api/bookings` reports as `status: 'confirmed'`. Anything else is a
red test rather than a rule that quietly forked. Put a comment on the repository predicate citing
ADR-007 and `bookingDisplayStatus` so the next reader finds the other half.

**One clock reading, not two.** The service needs both `cancelledAt` (a `Date`) and `today` (an
`OfficeDate`), and they must come from the same instant:

```ts
const now = nowMs();
const today = officeToday(now, officeTimezone);      // domain/booking-window.ts:18
await availability.cancelOwnedBooking(userId, bookingId, new Date(now), today);
```

Calling `nowMs()` twice is a defect that reproduces once per office midnight and never in a test.
The repository's own docblock already states the rule — *"the value compared upstream and the value
written here must come from the same instant"* (`bookings.repository.ts:223-224`) — and this is the
first call site where it has two values to keep in step.

### 2.2 It folds into `booking_not_found`. One new code, not two

A past-dated Confirmed booking produces `404 booking_not_found`, the same as a booking that does not
exist or is not the caller's.

**Why:**

- **AC-02 does not ask for more.** Its wording is *"a cancellation request naming it is **refused at
  the server**"* — a refusal, not a distinguishable message. Contrast AC-09, which says *"they **are
  told** it is already cancelled"*. The two ACs were written with different verbs, and the difference
  is the whole design.
- **SCR-002 ST-09 draws exactly two outcomes.** A third would need copy nobody approved and a frame
  nobody drew. `ai/roles/architect.md`: *"No speculative generality; design for the approved stories
  only."*
- **The refusal protects data integrity, not the user.** Cancelling a booking whose date has passed
  frees a desk for a day nobody can still book. The act has **no business value**, so a refusal that
  says only "we couldn't do that" costs the employee nothing real.
- **It stays a server-side defence of the same kind the router already documents** —
  `bookings.router.ts:28-33` on US-007/AC-04 and AC-08: *"a server-side defence with no live UI path,
  not a state a screen renders."* Under ADR-007's wire invariant, AC-01's Cancel control is rendered
  only on rows whose display status is `confirmed`, and a `confirmed` item's date is never before
  `today`. So the ordinary path cannot reach this refusal at all.

Rejected: a second new code (`booking_not_cancellable`, `422`). It is *defensible* — it would let the
screen say something true in §2.3's case, and it carries the same nil disclosure as §1.2 — but it
buys one sentence of accuracy in a state whose value to the user is zero, at the cost of a third
dialog branch, a third piece of unapproved copy, and a frame. If §2.3's open item comes back from the
PO saying the midnight case must read correctly, **this is the shape to add**, and it is additive.

### 2.3 The one case this leaves ugly, named rather than hidden

§2.2's fourth bullet says the ordinary path cannot reach the refusal. **There is an extraordinary one,
and it is not exotic.**

Priya leaves the tab open overnight. Her TODAY row — dated Monday — is still rendered Confirmed, with
a live Cancel control, after office midnight. She presses Cancel at 00:03 on Tuesday. The server
computes `today = Tuesday`, the booking is past-dated, and the request is refused. The screen shows
ST-09's **retryable** message, *"We couldn't cancel that just now. Try again."* Retrying fails again.
The row still says Confirmed after she closes the dialog.

REQ-036's focus refresh (US-012) does **not** fix this — it fires on the window regaining focus, and
this tab never lost it. This is the same family as SCR-002's **open conflict row 4** (*"nothing says
what Priya sees when that refresh removes a row"*), which is the only unresolved question on that
screen, and it is not this story's to settle.

**Recommended mitigation, cheap and needing no new copy: refresh the list when the dialog is
dismissed after any outcome the *server answered*, and never after a transport failure.** A server
answer means our view of that booking is provably wrong; a transport failure means we learned
nothing, and refreshing then risks replacing the whole list with ST-06 because one cancel timed out.
After the refresh the stale row reads **Completed** and carries no Cancel control, so the retry loop
ends on its own. ST-09 already specifies refresh-on-dismissal for the already-cancelled branch; this
extends it by one condition. **It is a small deviation from an approved screen spec, so it is
open item 1, not a decision I am making.**

---

## 3. US-007/D-03: amended, not overturned — and the four docblocks that must change

D-03 reads: *"`POST /api/bookings/:id/cancel` is undiscriminating: it returns cancelled, or one `404
booking_not_found` for every other reason (not found, not owned, not currently confirmed)."*

After this story, the three reasons resolve like this:

| D-03's case | After US-011 | Why |
| --- | --- | --- |
| **No such booking** | `404 booking_not_found`, unchanged | D-03's oracle argument applies in full |
| **Not the caller's** | `404 booking_not_found`, unchanged | D-03's oracle argument applies in full — **this is the security-load-bearing one and it is untouched** |
| **Not currently confirmed** | **splits in two** — `409 booking_already_cancelled` when the row is the caller's and already cancelled (§1); `404 booking_not_found` when it is the caller's, still confirmed, and past-dated (§2) | Only the first half is newly distinguishable, and only among the caller's own rows (§1.2) |

**This is D-03 executing as designed, not being reversed.** D-03's own rationale says it in as many
words: *"US-011 is the story that owns **why** a cancellation was refused (past-dated, already
cancelled, wrong owner) and the richer UI around it."* US-007 built the narrow endpoint on purpose
and named the story that would widen it. `US-007/design-note.md` §3.1 also promised *"the URL will not
need to change when US-011 lands"* — it does not.

**What must not happen is the silent contradiction.** `ai/roles/architect.md` guardrail: *"Never
contradict an accepted ADR silently — supersede it explicitly."* D-03 is not an ADR, but four
docblocks currently state the undiscriminated behaviour as a standing rule, and a reader will hit
them before they hit this note. **All four must be corrected in this PR**, and a reviewer should
treat a missing one as a finding:

| File:line | What it says today | What it must say |
| --- | --- | --- |
| `libs/contracts/src/error.ts:46-50` | *"one code for 'no such booking', 'not the caller's' and 'not currently confirmed' alike (D-03)"* | Two of the three. The already-cancelled case is `booking_already_cancelled` (US-011/AC-09), and the reason the other two stay merged is the oracle |
| `apps/api/src/modules/bookings/bookings.router.ts:154-160` | *"`404 booking_not_found` covers … 'not currently confirmed' … deliberately undiscriminated"* | Same correction, plus the new 409 branch |
| `apps/api/src/modules/bookings/bookings.service.ts:192-198` | *"One outcome for 'cancelled' and one for everything else"* | Three outcomes, and the write-then-explain ordering (§1.4) with the reason |
| `apps/api/src/modules/bookings/bookings.repository.ts:75-78` | *"`undefined` covers … 'not currently confirmed' … deliberately undiscriminated"* | `undefined` means the write did not apply; classification is the service's, from a second read |

Also amend `apps/ui/src/components/existing-booking-state/cancel-booking.ts:6-12`, whose docblock
explains the 404→`ok` mapping by citing D-03's undiscriminated behaviour (§5.2).

Record the amendment as a row in this story's own `decisions.md`, citing `US-007/D-03`, so the change
is findable from either end.

---

## 4. The server

### 4.1 The service

```ts
export type CancelBookingOutcome =
  | { kind: 'ok' }
  /** US-011/AC-09. The row is the caller's and is ALREADY cancelled — an admin (US-015), a
   *  deactivation cascade (US-025), or a concurrent request of the caller's own. */
  | { kind: 'already_cancelled' }
  /** No such booking, not the caller's, or the caller's and past-dated (US-011/AC-02).
   *  Deliberately merged — design note §1.2, §2.2; amends US-007/D-03. */
  | { kind: 'not_found' };

/**
 * US-011/AC-02, AC-04, AC-09. Write first, then explain (design note §1.4): the UPDATE is the sole
 * arbiter and the sole writer, and the second read runs ONLY when it applied to nothing, ONLY to
 * classify the miss. Inverting the order reintroduces the read-then-write window US-007 §3.2
 * removed and misclassifies the very race AC-09 is about.
 */
async cancelBooking(userId: string, bookingId: string): Promise<CancelBookingOutcome> {
  // ONE clock reading for both values — §2.1. Two calls to nowMs() differ across office midnight
  // and never inside a test.
  const now = nowMs();
  const today = officeToday(now, officeTimezone);

  const cancelled = await availability.cancelOwnedBooking(userId, bookingId, new Date(now), today);
  if (cancelled) return { kind: 'ok' };

  const existing = await availability.findMyBookingState(userId, bookingId);
  if (existing?.status === 'cancelled') return { kind: 'already_cancelled' };
  return { kind: 'not_found' };
}
```

`existing` present with `status: 'confirmed'` is exactly the past-dated case, and it falls to
`not_found` by §2.2. That is the fold, in one line, and it is the line to point at in review.

### 4.2 The repository

One changed method, one new one. Both read and write `bookings`, the table this module **owns** —
ADR-004 applied, not widened.

```ts
/** US-007/FR-06, AC-07, D-03 as amended by US-011 (design note §3). One
 *  `UPDATE … RETURNING`, scoped to id / owner / confirmed / **not past** — no read-then-write
 *  window (US-007 design note §3.2).
 *
 *  `today` is the office's own calendar date, passed in from the service's single
 *  `officeToday(nowMs(), officeTimezone)` reading — never read here (domain/ and repositories
 *  take their clock as an argument). It is BR-001.6 / US-011/AC-02 expressed where the write
 *  happens; the same rule in TypeScript is `bookingDisplayStatus(...) === 'confirmed'`
 *  (ADR-007), and `bookings.routes.spec.ts` pins the two together (design note §2.1).
 *
 *  `undefined` means the write applied to nothing. It does NOT say why — classification is the
 *  service's, from `findMyBookingState` (design note §1.4). */
cancelOwnedBooking(
  userId: string, bookingId: string, cancelledAt: Date, today: OfficeDate,
): Promise<{ id: string } | undefined>;

/** US-011/AC-09. The caller's own booking's current state, or `undefined`. Read-only, and issued
 *  ONLY after `cancelOwnedBooking` returned nothing (design note §1.4).
 *
 *  `.eq('user_id', userId)` is what keeps US-007/D-03's anti-enumeration guarantee structural: a
 *  booking that is not the caller's is `undefined` here, indistinguishable from one that does not
 *  exist, so the new 409 can only ever describe a row the caller already reads through
 *  `GET /api/bookings` (design note §1.2). Never drop it, and never widen the select list —
 *  `status, booking_date` is all the service needs. */
findMyBookingState(
  userId: string, bookingId: string,
): Promise<{ status: BookingStatus; booking_date: OfficeDate } | undefined>;
```

```ts
async cancelOwnedBooking(userId, bookingId, cancelledAt, today) {
  const { data, error } = await supabase()
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt.toISOString(),
      cancelled_by: userId,
      cancellation_source: 'owner',
    })
    .eq('id', bookingId)
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('booking_date', today)      // <- the only change. US-011/AC-02, BR-001.6
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`booking cancel failed: ${error.message}`);
  return (data as { id: string } | null) ?? undefined;
}

async findMyBookingState(userId, bookingId) {
  const { data, error } = await supabase()
    .from('bookings')
    .select('status, booking_date')   // no id, no user_id, no desk — nothing else is needed
    .eq('id', bookingId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`bookings lookup failed: ${error.message}`);
  return (data as { status: BookingStatus; booking_date: OfficeDate } | null) ?? undefined;
}
```

- **`.gte('booking_date', today)` is string comparison against a `date` column** and is correct:
  `booking_date` is a real `date` (`0003_bookings.sql:32`) and `OfficeDate` is zero-padded
  `YYYY-MM-DD`, which Postgres coerces unambiguously. No `Date`, no zone, as everywhere else.
- **No `.select('*')`, and no `user_id` in any select list** — the discipline
  `bookings.repository.ts:12-13` states and every method in this file keeps.
- The write still sets all three cancellation columns in the **same** `UPDATE`, so
  `bookings_cancelled_at_matches_status` and `bookings_cancelled_has_source`
  (`0003_bookings.sql:48-53`) still fire as a `23514` — an honest 500 — if one is ever dropped,
  rather than a silent `404`. That property is stated in the existing docblock
  (`bookings.repository.ts:226-229`); keep the sentence.

### 4.3 The router

```ts
const outcome = await service.cancelBooking(user.id, parsed.data.id);

if (outcome.kind === 'already_cancelled') {
  // US-011/AC-09. SCR-002 ST-09's non-retryable branch. The browser renders its OWN copy keyed on
  // the `code`; this message is for logs and non-browser consumers (design note §5.2).
  throw conflict(ERROR_CODES.booking_already_cancelled, 'That booking has already been cancelled.');
}
if (outcome.kind === 'not_found') {
  throw notFound(ERROR_CODES.booking_not_found, 'That booking could not be found.');
}

res.status(200).end();
```

Two branches instead of one, in that order, and the `200` path is byte-for-byte what it is today.
`ERROR_CODES` is switched on, never a string literal (`error.ts:57-58`).

---

## 5. The browser

### 5.1 `ConfirmDialog` — three changes, and one of them is a live defect

ST-07 – ST-09 all render through `ConfirmDialog` (`apps/ui/src/components/confirm-dialog/`), built as
a shared primitive by US-007/D-06 with the explicit expectation that *"US-011 needs the identical
dialog for its own cancel flow and extends this one"*. It cannot render ST-09 as it stands.

**(a) An error region inside the dialog, and a single-action mode.** Additive optional props, so the
existing call site (`ExistingBookingState.tsx:66-75`) compiles untouched — the same discipline
US-009 §4.4 chose for `EmptyState.actions` and US-010 §4.4 for `StatusChip.kind`:

```ts
export interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** SCR-002 ST-09 — an error region INSIDE the dialog, which stays open (US-011/AC-08).
   *  Rendered through `Alert` with `live="assertive"`, so it is announced when it appears. */
  error?: ReactNode;
  /** ST-09's non-retryable branch: the dialog collapses to one acknowledging action ("Close").
   *  Two ways to dismiss, one of them labelled "Keep it", is incoherent once there is nothing
   *  left to keep. */
  singleAction?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
```

Rejected: a generic `actions: ReactNode` slot. It would let a caller replace the buttons and lose the
busy/Escape/focus contract this component exists to guarantee — the same argument US-010 §4.4 used
against a sibling `BookingStatusChip`.

**Verified against the real Figma frames (DEV, this PR — see traceability.md):** the dialog header
also carries a close (✕) icon on every state (default/busy/error), calling the same `onCancel` — not
a new prop. The centred card is `480px` (not the CSS's current `420px`), on `--c-surface-overlay` +
`--shadow-3` with **no border**, over a `--c-scrim` overlay (currently a raw `rgba(0,0,0,0.4)`), and
below 768px it becomes a full-width bottom sheet with squared bottom corners on `--shadow-sheet`.
None of this changes the props above; it corrects the component's CSS and markup to match its own
approved Figma master component (`Dialog`, node `34:122`), which predates this story and was never
fully built out. Fixed here since ST-07–ST-09 are exactly the states that expose it.

**(b) Escape must be suppressed while busy — this is a defect today.** `ConfirmDialog.tsx:46-52`
calls `onCancel()` on Escape unconditionally. SCR-002 ST-08 says *"Escape is suppressed while in
flight"*, and US-011/AC-07 is the first AC that asserts it. One line:

```ts
if (event.key === 'Escape' && !busy) onCancel();
```

Safe for the existing caller: `ExistingBookingState` already disables both buttons while busy, so
Escape was the one remaining way to dismiss a dialog with a request in flight. The new close (✕)
icon must be disabled under the same condition.

**(c) Focus trap and focus restore — ST-07 requires both and neither exists.** `ConfirmDialog.tsx:42-44`
moves focus *into* the dialog and stops there. SCR-002 ST-07: *"Focus is trapped in the dialog and
returns to the originating row's control on dismissal."* Both belong in the shared component, not in
this screen: capture `document.activeElement` on mount and restore it on unmount, and cycle Tab
within the dialog's focusable descendants. Both are pure improvements for the existing caller, so
there is nothing to gate.

`Button` needs no change: `disabled={disabled || busy}` (`Button.tsx:60-62`) already makes AC-07's
double-submit guard structural, including Enter and Space.

### 5.2 The fetcher is now shared, and it has three outcomes

**`cancel-booking.ts` is the single most likely place this story breaks something it is not about.**
`apps/ui/src/components/existing-booking-state/cancel-booking.ts:24-26` maps `ok → ok`,
`booking_not_found → ok`, everything else `→ failed`. A new `409` falls to `failed`, so SCR-003's
double-confirm — which converges silently today (US-007 §3.4, finding F-6) — starts showing a
failure. **A regression in a different screen, invisible to every SCR-002 test in this PR.**

Widen the outcome to three and let each screen collapse what it does not need:

```ts
export type CancelBookingOutcome =
  | { kind: 'ok' }
  /** US-011/AC-09 — 409. The booking is gone, and the caller is told so distinctly (SCR-002 ST-09). */
  | { kind: 'already_cancelled' }
  /** The server ANSWERED a refusal we cannot name — today, only `booking_not_found`, which from a
   *  screen rendering the caller's own list means the row is stale (design note §2.3). Distinct
   *  from `failed`, because a server answer means our view is wrong and a refresh is warranted;
   *  a transport failure means we learned nothing (open item 1). */
  | { kind: 'refused' }
  /** Transport failure, timeout, 5xx, unparseable body — `ApiResult`'s `unavailable`. */
  | { kind: 'failed' };
```

- **SCR-003 (`ExistingBookingState`) collapses `already_cancelled` and `refused` into its own `ok`**,
  preserving US-007's converge-don't-fail behaviour exactly. One added branch, no behaviour change.
- **SCR-002 uses all four** (§5.3).

**Move the file to `apps/ui/src/lib/cancel-booking.ts`.** It is now a two-consumer API seam, not one
component's private detail, and it is the same "two real consumers in front of it" test US-010 §0 and
§4.5 applied when it *refused* to extract. A `git mv` plus two import updates and the spec file, no
behaviour change.

**The browser renders its own copy, keyed on `kind`, never on `result.message`.** `copy.ts:7` already
states the rule for this screen — *"Render this copy, never a server-derived string"* — and wiring
the server's sentence into the dialog would put user-visible copy in `bookings.router.ts`, where no
designer will ever find it.

### 5.3 Success: flip the one row, do not refetch

On `ok`, add a targeted `markCancelled(bookingId)` action to `useMyBookings` that sets that item's
`status` to `'cancelled'` in place. Do **not** call `retry()`.

- **It produces exactly ST-10.** Sectioning is by `status` (`MyBookings.tsx:172-185`), so flipping the
  field moves the row out of Upcoming and into Past as **Cancelled**, in one render, with no flicker
  — including when the booking was dated next week, which ST-10 requires. Past is DESC straight from
  the wire, so the row lands at the top of Past, which is where the newest past-dated thing belongs.
- **A refetch would be audibly wrong.** `retry()` puts the hook back into `status: 'loading'`
  (`use-my-bookings.ts:52-74`), which re-announces *"Loading your bookings"* through AC-08's live
  region at the exact moment ST-10's toast should be announced, re-renders skeletons over a list the
  user is looking at, and **drops every accumulated older page** — its own docblock says so
  (`use-my-bookings.ts:34-36`).
- **This is not the optimistic update ST-08 forbids.** It happens *after* the server confirmed, which
  is precisely the distinction ST-08 draws.

On `already_cancelled`, the dialog stays open showing ST-09's non-retryable message with **Close**,
and **`retry()` runs on dismissal** — a full refresh, as ST-09 specifies, because an admin who
cancelled one booking may have cancelled several and the screen should stop disagreeing with reality
in every way at once, not just this row's.

On `refused`, see open item 1. Until it is answered, render ST-09's retryable message; AC-02 is
proven at the API level regardless, which is where the story's own QA note (line 99) puts it.

On `failed`, ST-09's retryable message, the dialog stays open, nothing behind it changes (AC-08).

### 5.4 `BookingRow` gains the Cancel control

`BookingRow.tsx:6-9` currently documents its own absence: *"No `Cancel` control (`decisions.md`
D-05) … cancellation's behaviour is explicitly US-011's."* That docblock is this story's to replace.

Additive prop, screen-private, no tier change (§0):

```ts
/** US-011/AC-01. Rendered only when the row is cancellable — which, by ADR-007's wire invariant,
 *  is exactly `status === 'confirmed'`. The screen must NOT re-derive this from `date` (§8.3). */
onCancel?: () => void;
```

`MyBookings` passes it only for `todayItem` and `upcoming` rows, never for `past`. Per SCR-002's
structural-decisions row, the control is `variant="secondary"`, **right-aligned at its natural width
at 360px, not full width**, and 48px tall at every breakpoint. No token change — `--c-danger-action`
already exists for the dialog's confirming action, and `Button variant="danger"` already renders it
(`Button.tsx:8-11`).

### 5.5 Copy, focus, announcements

- **New copy goes in `my-bookings/copy.ts`**, beside US-010's, with the same verbatim-from-the-frame
  discipline. **Verified directly against the real Figma frames (DEV, node ids in traceability.md)**:
  ST-07 dialog title *"Cancel your desk?"*, body *"{desk} · {date}. The desk goes back into the pool
  and we'll email you a confirmation."*, buttons **Cancel booking** / **Keep it**; ST-09's retryable
  message *"We couldn't cancel that just now. Try again."*; ST-09's non-retryable message *"That
  booking has already been cancelled."* (from SCR-002's prose — the frames only draw the retryable
  branch); ST-10's toast *"Desk {desk} released for {date}. Cancellation emailed to {email}."* —
  this resolves open item 2 below for every state except the exact **Close** label's frame
  confirmation, which the frames don't draw either (SCR-002 says so explicitly).
- **ST-07's copy quotes a desk-and-date pair that is not in this screen's list.** SCR-002's designer
  handoff says so explicitly: *"The sentence is the approved copy; the desk and date are data, and
  they should name the row the dialog was opened from."* Build the sentence from the row, not the
  literal.
- **Date labels use `formatOfficeDateLabel`** (`lib/format-office-date.ts:47-49`) — "Wed 9 Sep",
  which is ST-07's form. Never a raw ISO string, never the device's zone.
- **The dialog's accessible name must carry the desk and date** (SCR-002 §Interaction), so a screen
  reader user knows which booking they are releasing without re-reading the row. `ConfirmDialog`
  already wires `aria-labelledby` to its title; putting desk + date in the **title** is the cheapest
  way to satisfy it, and matches ST-07's own sentence.
- **ST-10's toast names the email address, and it comes from `useAuth().user.email`**
  (`authenticatedUserSchema.email`, `libs/contracts/src/auth.ts:64-66`) — **not** from the response
  (§6). It is an account attribute, not a per-request derivation, so it is safe in the way
  `office.timezone` is safe and `office.today` is not (US-010 §7.2).
- **Focus**, per ST-10: to the confirmation, then to **Book a desk** — the row that held focus no
  longer has a Cancel control. On dismissal without cancelling, `ConfirmDialog`'s new focus restore
  (§5.1c) returns focus to the originating row's control, with nothing screen-specific to write.
- **One live region, still.** `MyBookings.tsx:111-116`'s single `role="status"` node stays the only
  one. ST-09's error is announced by `Alert`'s own `role="alert"` inside the dialog, and ST-10's
  toast by `Toast`'s `role="status"`. Do not add a fourth.

---

## 6. What deliberately does **not** change

| Not changed | Why |
| --- | --- |
| **`POST /:id/cancel`'s `200` with an empty body** | AC-04 and AC-05 are two UI outcomes of one success; the browser already holds the desk number, the date and the email address it needs for ST-10. Adding a body would also break the *other* caller silently: `requestNoContent` maps any non-empty 2xx to `unavailable` (`api-client.ts:148-152`), so SCR-003's cancel would start reporting an outage. **The one condition that would flip this:** if an email change (US-023) could ever land mid-session without a session refresh, the address in the auth context could be stale and the response should echo it, as `POST /api/bookings` echoes `confirmationEmail` |
| **`libs/contracts/src/bookings.ts`** | `cancelBookingParamsSchema` (`:46-48`) is already exactly right. No new request schema, no new response schema, no change to `bookingCreateSchema`, `bookingSchema`, or either status enum |
| **`supabase/migrations/**`** | §0. Every column, constraint and index this needs exists. **A migration in this PR is a finding** |
| **`inception/design/tokens.css`** | The destructive action fill and the three booking-state chip families all exist (SCR-002 conflict row 3, resolved 2026-09-08). A protected path with no diff |
| **`apps/api/src/domain/**`** | §2.1. BR-001.6's rule is `bookingDisplayStatus` (ADR-007), already built and already called. A new file here would have no caller |
| **`apps/api/src/composition.ts`, `http/app.ts`, the middleware chain** | The route, the mount and both injected dependencies (`nowMs`, `officeTimezone`) already exist |
| **`GET /api/bookings`** | Unchanged in every respect. The list already carries what the cancel flow needs |
| **`refusalFor` / `REFUSAL_MESSAGE` / `date_not_bookable`** | §2.1. They refuse dates for *booking* |
| **The OpenAPI document** | There isn't one yet (story line 106). Nothing to update; do not create one under this story |

---

## 7. ADR judgement — **none**

The test the last seven notes applied: *does the decision bind work beyond the story that made it,
with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **`booking_already_cancelled`, and the partial amendment of D-03** | **No ADR.** It looks like the strongest candidate here — it partially reverses a recorded decision whose rationale was a *security* argument, and that is normally an ADR trigger. It is not one, because **D-03 explicitly named US-011 as the owner of this distinction** (*"US-011 is the story that owns why a cancellation was refused"*). An ADR recording that US-011 did what D-03 said it would is ceremony. The change is one enum member on one endpoint with one browser consumer, it is reversible, and §3's four docblock corrections put the supersession exactly where a reader will hit it — which is what the charter's *"supersede explicitly"* is actually asking for. US-010 §6's phrasing applies verbatim: *"If it is ever revisited, the revisiting story will be looking straight at the code that implements it"* |
| **Write-first-then-explain, and the owner-scoped disambiguating read (§1.4)** | **No ADR.** It applies `US-007/design-note.md` §3.2's primitive as written and adds one read-only statement on a rare branch. No new mechanism, no rejected alternative anyone would re-litigate once they read the four lines of service code |
| **AC-02 enforced in the `UPDATE`'s `WHERE` (§2.1)** | **No ADR** — it is ADR-007's rule applied at a second call site, and ADR-007 already priced the compound predicate in its own Consequences section (*"REQ-013's filter … is a compound predicate, not an equality"*). This is the same predicate pointed the other way |
| **`ConfirmDialog`'s new props (§5.1)** | **No ADR.** It applies the additive-optional-prop discipline US-009 §4.4 and US-010 §4.4 both established, and SCR-002's approved frames already specify the states |
| **The disclosure rule in §1.2** | **No ADR — but it is a standard, not a story decision.** *"Discriminating among states of a resource the caller already owns discloses nothing; discriminating across the ownership boundary is the oracle."* It will govern US-013, US-014, US-015 and US-025's error shapes. Its home is a row in `ai/standards/api-standards.md`, not `knowledge/decisions/`. **Open item 4** |

**No accepted ADR is bent.** ADR-001 is applied — the write is server-mediated and the browser never
touches Supabase. ADR-002 is applied — one shared enum, one error body, the browser switching on
`code` with a default branch, and no business rule crossing into `apps/ui`. ADR-004 is applied and
**not widened** — one table, owned by this module, one more read and one changed write. ADR-007 is
applied at its second call site and is what makes §2.1 need no new rule.

**If the human overrules this and wants an ADR, it is ADR-008**, not 005 or 006: those two are
referenced by name in six places under `ai/` and neither file exists (US-010 §6, open item 6).

---

## 8. What a DEV gets wrong without this note

Five, in the order they will bite. Three produce green tests.

### 8.1 Reading to classify, then writing

§1.4. It is the obvious shape — *"look it up, see why, then act"* — and it is wrong twice over: it
reintroduces the read-then-write window US-007 §3.2 removed, and in AC-09's own scenario it
**misclassifies**. The read says `confirmed`, the admin's cancel commits, the `UPDATE` matches
nothing, and the endpoint reports `booking_not_found` for a booking it observed one millisecond ago.
Every single-actor test passes. **Write first; read only to explain a miss.**

### 8.2 Leaving `cancel-booking.ts`'s mapping alone

§5.2. Adding a `409` without widening `createCancelBooking` sends SCR-003's already-cancelled case
down the `failed` branch, and US-007/AC-07's converge-don't-fail behaviour — a deliberate decision
with its own finding number (F-6) — silently reverses. **It is a regression in a screen this story
does not touch, and no SCR-002 test can see it.** Add a `book-a-desk` regression test citing
`US-007/AC-07` alongside this story's own.

### 8.3 Deriving cancellability from the date in the browser

The Cancel control is rendered iff `status === 'confirmed'`, full stop. Writing
`item.date >= today && item.status === 'confirmed'` is the same class of mistake US-010 §7.1 caught
for sectioning: it is the browser re-deriving BR-001.6, which ADR-002 forbids and ADR-007's wire
invariant makes unnecessary. It compiles, it is right all day, and it is a second implementation of a
rule that is already on the server.

### 8.4 Calling `nowMs()` twice

§2.1. `cancelledAt` and `today` must come from **one** reading. Two readings differ only across an
office midnight — so this never fails in CI, never fails in review, and produces one unexplainable
refusal a year on the one request that straddles it.

### 8.5 Refetching the whole list on success

§5.3. It re-announces *"Loading your bookings"* over ST-10's toast, flashes skeletons over a list the
employee is reading, and silently discards every "Show more" page they loaded. Flip the one row's
status; the server already confirmed the outcome. Reserve `retry()` for ST-09's already-cancelled
dismissal, where a full refresh is what the spec asks for.

**And two that are only smells:** rendering `result.message` in the dialog instead of `copy.ts`
(§5.2); and creating `apps/api/src/domain/booking-cancellation.ts` because the last three stories
each added a `domain/` file (§2.1 — this one has no rule left to hold).

---

## 9. File placement

**New**

```
apps/ui/src/lib/cancel-booking.ts (+ .spec.ts)        <- MOVED from components/existing-booking-state/,
                                                         widened to four outcomes (§5.2)
inception/specs/US-011-cancel-my-own-booking/         <- the spec package (DEV's)
```

**Modified**

```
libs/contracts/src/error.ts                  + `booking_already_cancelled`; correct the
                                               `booking_not_found` comment (§3)   <- PROTECTED PATH

apps/api/src/http/errors.ts                  the `conflict` docblock's retryability sentence (§1.3)

apps/api/src/modules/bookings/bookings.repository.ts   `.gte('booking_date', today)` + `today` param;
                                                       + `findMyBookingState` (§4.2); docblock (§3)
apps/api/src/modules/bookings/bookings.service.ts      three outcomes, one clock reading,
                                                       write-then-explain (§4.1); docblock (§3)
apps/api/src/modules/bookings/bookings.router.ts       the 409 branch (§4.3); docblock (§3)
apps/api/src/modules/bookings/bookings.repository.spec.ts   predicates and select lists
apps/api/src/modules/bookings/bookings.service.spec.ts      classification and ordering
apps/api/src/modules/bookings/bookings.routes.spec.ts       the three outcomes + §10's consistency test
apps/api/src/modules/bookings/bookings.fixtures.ts          the four-row eligibility fixture
apps/api/src/modules/bookings/README.md                     what US-011 added

apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx (+ .spec.tsx, .css)   §5.1
                                                        ^ shared component props: a Complex surface
apps/ui/src/components/existing-booking-state/ExistingBookingState.tsx (+ .spec.tsx)
                                                        collapse the two new outcomes (§5.2)
apps/ui/src/screens/my-bookings/BookingRow.tsx (+ .spec.tsx, booking-row.css)   the Cancel control (§5.4)
apps/ui/src/screens/my-bookings/MyBookings.tsx (+ .spec.tsx)   ST-07 – ST-10
apps/ui/src/screens/my-bookings/use-my-bookings.ts (+ .spec.ts)  + `markCancelled` (§5.3)
apps/ui/src/screens/my-bookings/copy.ts (+ .spec.ts)             §5.5
apps/ui/src/screens/my-bookings/my-bookings.css

knowledge/traceability/manifest.json    US-011 tests[]  (currently empty — verified)
inception/specs/index.md                the US-011 row
```

**Not modified, and worth saying so in the PR:** `supabase/migrations/**`, `inception/design/tokens.css`,
`libs/contracts/src/bookings.ts`, `apps/api/src/domain/**`, `apps/api/src/composition.ts`,
`apps/api/src/http/app.ts`, `apps/api/src/http/middleware/**`, `apps/ui/src/lib/api-client.ts`,
and `inception/design/screens/SCR-002-my-bookings.md` (approved; open item 1 is a question *about* it,
not an edit *to* it).

---

## 10. Test placement

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `MyBookings.spec.tsx` — a Cancel control on the TODAY row and on every Upcoming row; **none** on any Past row, including a future-dated Cancelled one | component |
| **AC-02** | `bookings.routes.spec.ts` — over `fixedClock`, `POST /:id/cancel` on a **past-dated Confirmed** booking of the caller's answers `404 booking_not_found`, and **the row is still `confirmed` afterwards**. The second assertion is the one that proves the refusal rather than the status code (the story's QA note, line 99) | API |
| **AC-02** | `bookings.routes.spec.ts` — **the cross-endpoint consistency test (§2.1).** Over one fixture of four bookings, cancel succeeds on exactly the ids that `GET /api/bookings` reports as `status: 'confirmed'`. This is the guard against the SQL predicate and `bookingDisplayStatus` drifting apart | API |
| AC-02 | `bookings.repository.spec.ts` — `cancelOwnedBooking` issues all four predicates: `id`, `user_id`, `status='confirmed'`, `booking_date >= today` | unit (recording fake) |
| AC-03 | `MyBookings.spec.tsx` — pressing Cancel opens a dialog whose accessible name contains the desk number **and** the date label; Escape dismisses; **nothing is requested** | component |
| AC-03 | `ConfirmDialog.spec.tsx` — focus moves in on mount, is trapped across Tab and Shift+Tab, and **returns to the element that had it** on unmount (§5.1c) | component |
| AC-04 | `bookings.routes.spec.ts` — a successful cancel returns `200` with an **empty body**, and the row is `cancelled` with `cancelled_at` set, `cancelled_by` the caller, `cancellation_source = 'owner'` | API |
| AC-04 | `bookings.routes.spec.ts` — after the cancel, `GET /availability` for that date reports the desk **available** (BR-001.5's "frees the desk", end to end) | API |
| AC-05 | `MyBookings.spec.tsx` — on success the row leaves Upcoming, appears in Past as **Cancelled**, a toast names the desk, date and email, and **no skeleton row appears** (§8.5 — the assertion that catches a refetch) | component |
| AC-06 | `MyBookings.spec.tsx` — the whole flow renders no password field and issues no `set-password` or sign-in request. Cheap, negative, and the story asks for it (line 101) | component |
| **AC-07** | `MyBookings.spec.tsx` — activating the confirming action twice produces **exactly one** fetch call, the dialog stays open, the action is `aria-busy`, **Escape does nothing while busy**, and the row behind is untouched (§5.1b) | component |
| AC-08 | `MyBookings.spec.tsx` — a `failed` outcome leaves the dialog open with the retryable message, the row still **Confirmed**, and a working retry | component |
| **AC-09** | `bookings.routes.spec.ts` — **the two-actor test the story calls the one most likely to be missed (line 100).** Cancel as an admin-style writer first, then `POST /:id/cancel` as the owner: `409 booking_already_cancelled`, and assert `cancelled_at`, `cancelled_by` and `cancellation_source` are **unchanged** — the owner's cancel must not overwrite the first actor's attribution (§1.5) | API |
| **AC-09** | `bookings.service.spec.ts` — the classification table over a stub repository: `UPDATE` hit → `ok`; miss + row `cancelled` → `already_cancelled`; miss + row `confirmed` → `not_found`; miss + no row → `not_found`. **And that the second read is not issued at all on the success path** | unit |
| AC-09 | `bookings.repository.spec.ts` — `findMyBookingState` filters on `user_id`, selects only `status, booking_date`, and selects **no** `user_id` (§1.2's guarantee, asserted rather than trusted) | unit (recording fake) |
| AC-09 | `MyBookings.spec.tsx` — an `already_cancelled` outcome renders the **non-retryable** message, the confirming action reads **Close**, and dismissing it re-fetches the default page | component |
| AC-10 | Not provable here — US-029 builds the email. What **is** provable and belongs in this PR: the service's success path performs exactly one write (`bookings.service.spec.ts`), which is the invariant AC-10's "no second email" rests on (§1.5) | unit |
| — | `bookings.spec.ts` (contract) — `errorCodeSchema.safeParse('booking_already_cancelled')` succeeds; `errorBodySchema` still parses an unknown code, so a tab loaded before this deploy does not crash (`error.ts:60-67`) | unit (contract) |
| — | `cancel-booking.spec.ts` — all four mappings, **including `409 → already_cancelled`** | unit |
| — | `ExistingBookingState.spec.tsx` — a `409` still converges to `onCancelled()`, citing **`US-007/AC-07`** (§8.2's regression guard) | component |

**Four things that produce a green test proving nothing:**

1. **Do not prove AC-02 by asserting the status code alone.** A `404` proves the request was refused;
   it does not prove the row was left alone. Assert the stored `status` afterwards.
2. **Do not prove AC-09 with a single actor pressing twice.** That proves the double-submit path
   (AC-07). AC-09 is a *two-actor* criterion and the story says so (line 100); the fixture needs a
   booking cancelled by somebody else between load and confirm.
3. **Do not use the real clock.** `fixedClock` (`apps/api/src/infra/clock/`) and `buildApp({ nowMs })`
   exist. A test that computes "yesterday" from `Date.now()` fails once a year at office midnight —
   which is, with some irony, exactly the bug §2.3 is about.
4. **Do not assert ST-09's two branches on a CSS class or the server's `message`.** NFR-008 is about
   what a person perceives, and §5.2 keeps the copy in `copy.ts`. Assert the rendered text.

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§2.3, §5.2 — what the screen does with a server-answered refusal it cannot name.** The proposal: refresh the list on dialog dismissal after any outcome the *server answered* (never after a transport failure), so a stale row self-corrects with no new copy. It extends ST-09's already-cancelled behaviour by one condition and touches an approved screen spec, which is why it is not decided here. It is the same family as SCR-002's own open conflict row 4, the only unresolved question on that screen | PO / Designer, at D1 | the `refused` branch's final behaviour, not AC-02's provability |
| 2 | **§5.5 — ST-07's, ST-09's and ST-10's copy.** Resolved for every state DEV could verify directly against the live Figma frames (see `traceability.md`) except the exact **Close** label's own frame, which SCR-002 says the frames do not draw either | Resolved by DEV against Figma; confirm at D1 | `copy.spec.ts` |
| 3 | **§5.2 — where `cancel-booking.ts` lives.** Recommended: `apps/ui/src/lib/`. Accepted below (`decisions.md` D-0x) | DEV, at D1 | nothing |
| 4 | **§1.2, §7 — the disclosure rule belongs in `ai/standards/api-standards.md`.** *"Discriminating among the states of a resource the caller already owns discloses nothing; discriminating across the ownership boundary is the oracle."* US-013, US-014, US-015 and US-025 will each need it. One row, a separate Simple-tier change, not this PR | Architect / human, after this story | nothing |
| 5 | **§5.1 — `ConfirmDialog` has no focus trap, no focus restore, and fires Escape while busy.** All three are required by SCR-002 ST-07/ST-08 and all three are absent today, so they are also latent gaps on **SCR-003**, which shipped with them. Fixed here; worth knowing they were shipped | DEV, in this PR | AC-03, AC-07 |
| 6 | **§1.5 — US-029's cancellation email must be triggered by the successful `UPDATE`'s returned row**, never by the router's `200` and never on the 409 branch. Not this story's code; this story's constraint on the next one | DEV, at US-029 | nothing now |
| 7 | **§5.4, §5.5 — the hi-fi frames are the visual authority.** `HF / SCR-002 · My bookings / ST-07…ST-10` at 360/768/1280 in Figma `xjFVgBbMrJUl7Ys3EX3Cbn`. DEV opened them directly (node ids in `traceability.md`) and found the dialog's close icon, width, overlay tokens and mobile bottom-sheet behaviour undocumented in this note's first pass — folded into §5.1 and §5.5 above | Resolved by DEV | the four states' build |

---

**Limits on this note:** reasoned from reading the named files at `63befe2` on `main`; nothing run,
nothing measured. The `READ COMMITTED` argument in §1.4 is reasoned from Postgres's documented
locking behaviour; `bookings.repository.concurrency.spec.ts` (real Postgres) is where it can be
proven rather than argued, alongside its existing two-insert cases. Advisory throughout — `spec.md`,
`decisions.md`, `impact-analysis.md` and `implementation-plan.md` in this package are DEV's, and the
GitHub review on the story PR is the authority.

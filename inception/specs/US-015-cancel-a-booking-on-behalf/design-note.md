# US-015 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-015 — Cancel an employee's booking on their behalf](../../stories/user-stories/US-015-cancel-a-booking-on-behalf.md) |
| **Screen**   | [SCR-005](../../design/screens/SCR-005-all-bookings.md) **ST-07, ST-08, ST-09, ST-10, ST-11**. ST-01/ST-03/ST-05 are US-013's, ST-02/ST-04/ST-06/ST-12 are US-014's — all preserved, none re-opened |
| **Tier**     | Complex — a new **write** route **and** a cross-employee write path (§0)  |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), [ADR-007](../../../knowledge/decisions/ADR-007-derived-booking-status.md), and the [US-011](../US-011-cancel-my-own-booking/design-note.md) and [US-013](../US-013-see-every-booking/design-note.md) design notes — **no new ADR** (§7) |

**Advisory.** The human's GitHub review is the authority. `decisions.md` in this package stays DEV's.

The story hands `/architect` one question and says so plainly (line 106): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §2 and §3 are the answer.

**The verdict, in one line each:**

- `POST /api/admin/bookings/:id/cancel`. `cancelBookingParamsSchema` reused verbatim, **`200` with an empty body**, and `libs/contracts/src/error.ts` is **not modified** — every reachable code already exists (§2).
- The write goes on **`AdminBookingsRepository`/`AdminBookingsService`** — DEV's plan is correct, and US-013 §4.1 predicted it in writing. The unscoped classification read goes there too, and **must not** sit beside `findMyBookingState` (§3.1).
- There is no row-version column and none is needed: `status = 'confirmed'` **is** the compare-and-set, because the transition is one-way and terminal. §3.4 proves it and names the one change that would invalidate it.
- **AC-05/AC-06 are two column writes and nothing else** — `cancellation_source: 'admin'`, `cancelled_by: <adminId>` — plus one forward constraint US-029/US-032 must honour (§3.5).
- **AC-04 forbids a refetch.** Under US-014's `status=confirmed` filter a refetch would make the cancelled row *vanish*, which is the exact behaviour AC-04 exists to prevent. `useAllBookings` gains `markCancelled`, mirroring `useMyBookings`'s (§5.3). **This is the single most likely wrong turn in the story.**
- No migration, no middleware, no `app.ts`, no `composition.ts`, no shared-component prop, no new error code, and **no email or push code** (§6).

§6's "not built" list is as load-bearing as the built one. Two things in §5 are genuinely new problems this story creates rather than inherits: the skeleton's row height (§5.5, open item 3) and focus after a successful cancel (§5.6).

---

## 0. The tiering — confirmed, and it is Complex for a different pair of reasons than US-013/US-014

**Complex.** DEV's classification is right. Both of DEV's named signals hold, but the second one is right for a reason DEV did not state, and the correction matters for review focus.

| Surface | What it is here |
| --- | --- |
| **Server** | A **new write route**, `POST /api/admin/bookings/:id/cancel`. `task-surfaces.md:39` — *"a new route, or a new write operation (`POST/PUT/PATCH/DELETE`)"* — Complex outright, twice over, regardless of diff size |
| **Trust** | Not the *guard* (§0's third bullet below), but the **write scope**: this is the first write in the codebase that changes a row belonging to somebody other than the caller |

**On DEV's "Contract" signal — correct, but weaker than DEV thinks, and that is good news.** `libs/contracts/src/bookings.ts` gains **nothing**: `cancelBookingParamsSchema` (`:47`) is reused verbatim and there is no response body (§2.3). `libs/contracts/src/error.ts` gains nothing either (§2.4). So the protected-path `libs/contracts/**` surface (`task-surfaces.md:26-28`) is **not** actually touched by this story. The tier does not move — the new write route carries it alone — but **a diff that modifies anything under `libs/contracts/src/` is a review finding**, and that is a much sharper review instruction than "the contract changes".

**On DEV's "Trust" signal — correct conclusion, wrong mechanism.** DEV described it as an "admin-only permission boundary". No permission boundary is built here. `app.ts:78` mounts `/api/admin` behind `requireSession` + `requireAdmin`, and `require-admin.ts:1-16`'s own docblock states the property this story consumes — *"every future admin route inherits the guard before it is written"*. A new route inside `createAdminRouter` is guarded before it exists. **`apps/api/src/http/middleware/**` and `apps/api/src/http/app.ts` are untouched, and a diff touching either is a review finding.** US-013 §0 made this argument for its own AC-10; it is unchanged.

What *is* a trust surface is narrower and more interesting: the `UPDATE` in §3.2 deliberately omits the `.eq('user_id', …)` predicate that every other booking write in this codebase carries. **The absence is the feature, and §3.1 is entirely about making that absence impossible to copy by accident.**

**What it is *not*, and each absence is defended below:**

- **Not Persistence.** DEV is right, and this is verifiable rather than assumed. `0003_bookings.sql:22` creates `cancellation_source as enum ('owner','admin','deactivation_cascade')` — the `'admin'` value this story writes already exists — and `:36` creates `cancelled_by uuid references user_profiles (id)`. The migration's own comment at `:18-21` names this story's requirement by name: *"cancelled_by alone cannot distinguish an admin cancel from the deactivation cascade … Key the notification composer on THIS."* The two CHECK constraints at `:48-53` already require exactly the column set §3.2 writes. **No column, no index, no migration. A migration appearing in this PR is a review finding.**
- **Not a middleware or mount change.** Above.
- **Not a shared-component change.** DEV's Figma reading is confirmed against the code: `ConfirmDialog` already carries `title`, `body`, `confirmLabel`, `cancelLabel`, `error`, `singleAction`, `busy`, `onConfirm`, `onCancel` (`ConfirmDialog.tsx:28-45`), renders the danger-variant confirm at `:147`, the header close-✕ at `:124-132`, the in-dialog `Alert tone="danger"` at `:136-140`, and suppresses Escape while busy at `:77-80`. `Button` already has `busy` (`Button.tsx:32`) and `variant="secondary"`. `StatusChip` already carries `kind="booking"` with the `cancelled` variant (used at `AdminBookingRow.tsx:53`). **`apps/ui/src/components/**` is not modified, and a diff adding a prop to `ConfirmDialog` is a review finding** — `components/README.md:3` makes those props a contract, which would be a second Complex surface for no gain.
- **Not a data-fetching-layer change.** `AllBookings` does not subscribe to `lib/data-refresh.ts` and **must not start** (US-014 §0). REQ-036's behaviour is set once for the whole app.
- **Not Dependency, not Operational, not Config.**

**The browser half is Medium on its own** (`task-surfaces.md:66` — *"a change inside one screen's folder that keeps its props and events"*, plus screen-private components), with one exception argued in §5.1. The Complex tier is carried entirely by the server write. **That is not where this story's difficulty is.** The server half is forty lines that mirror an existing pattern almost exactly; the browser half carries three decisions that produce green tests if got wrong (§5.3, §5.5, §5.6).

---

## 1. What this story actually is

One `UPDATE` with one predicate removed, and a dialog that already exists.

| AC | Where it is answered |
| --- | --- |
| AC-01 Cancel offered on today-or-future Confirmed | `item.status === 'confirmed'` — **never a date comparison in the browser** (§5.4). ADR-007's wire invariant is what makes one field sufficient |
| AC-02 offered nowhere else, and refused server-side | The same one field for the UI; `status = 'confirmed' AND booking_date >= today` in the `UPDATE`'s own `WHERE` (§3.2). The refusal's *code* is §2.4 — and it is the one place I recommend something the standard's letter argues against |
| AC-03 the confirmation names the employee | `employeeName`, already on `allBookingsListItemSchema` (`bookings.ts:179`) — **this story adds no wire field** (§2.3) |
| AC-04 cancels, frees the desk, **row stays in place** | The partial unique indexes free the desk for free (§3.3); the row staying is `markCancelled`, **not** a refetch — §5.3 is the argument, and it is the one that bites |
| AC-05 the *owner* is emailed | Two column writes, no send (§3.5) |
| AC-06 push names the admin | `cancellation_source`, read by US-032 later (§3.5) |
| AC-07 one click, one cancellation, one email | Two independent mechanisms that prove different things (§3.4) |
| AC-08 failure changes nothing, offers retry | `ConfirmDialog`'s existing `error` prop; the write is a single statement, so "nothing changed" is structural (§5.2) |
| AC-09 the employee got there first | `already_cancelled`, and the service's docblock at `bookings.service.ts:60-61` already names this story as the cause (§3.3) |
| AC-10 no bulk cancel | A structural absence with a test that can fail (§5.7) |

---

## 2. The endpoint contract

### 2.1 `POST /api/admin/bookings/:id/cancel`

```
POST /api/admin/bookings/3f2504e0-…/cancel      -> 200, empty body       (AC-04, ST-11)
                                                -> 409 booking_already_cancelled (AC-09, ST-10)
                                                -> 404 booking_not_found (AC-02, ST-10)
```

Three properties, none of them a free choice:

- **`/api/admin/*`, because the authority is the mount.** `api-standards.md:10` — *"Admin-only surfaces live under `/api/admin/*` and carry the `requireAdmin` middleware"*. No `?onBehalfOf=`, no role check in the handler, no path word. Exactly as US-013 took its authority from the mount, so does this.
- **The shape mirrors `POST /api/bookings/:id/cancel` exactly** (`bookings.router.ts:165`), so the two cancel endpoints differ in precisely one visible respect — which mount they sit on, and therefore who may call them. That is the whole difference, and the URL says so.
- **`POST`, not `DELETE`.** A cancellation is a state transition that leaves the row readable (AC-04's *"the row stays in place showing its new status"*), not a deletion. The employee endpoint settled this in US-007 and nothing has changed.

### 2.2 The request — `cancelBookingParamsSchema`, unchanged

```ts
// libs/contracts/src/bookings.ts:47 — REUSED VERBATIM, not copied, not extended
export const cancelBookingParamsSchema = z.object({ id: z.string().uuid() }).strict();
```

It is the right schema and it needs nothing: one route param, a uuid, `.strict()`. A malformed id is `400 invalid_request` at the route edge before the service is reached, matching `bookings.router.ts:167-171` line for line.

**No body, and none is parsed.** There is nothing the caller could say that the server would honour — not a reason, not a notify-flag, not an actor id (the actor is the session's, §4). An endpoint whose body can only be empty does not get a body schema, which is the same reasoning `api-standards.md` records for `204`: *"An empty response schema would be exported and maintained forever to describe nothing."*

**A caution for the reviewer.** `.strict()` on `req.params` is safe here and would not be under a wildcard route: Express populates `req.params` from the path pattern alone, and `/bookings/:id/cancel` yields exactly `{ id }`. The employee route already relies on this.

### 2.3 The response — `200`, empty body. And this is where US-013's deliberate omission pays off

**`200` with an empty body, exactly as the employee endpoint answers** (`bookings.router.ts:185`), consumed by `api-client.ts`'s `requestNoContent`. Nothing is echoed.

The question DEV raised is the right one: *does the UI need the body to distinguish `ok` from `already_cancelled`?* **No.** The employee flow already does it on status plus `code` alone (`cancel-booking.ts:39-44`), and the admin flow's outcome set is identical. A body would add a second source for a fact the status line already carries.

**The more interesting half is what the success copy needs, and the answer confirms a decision US-013 made a story early.**

SCR-005 ST-11's toast — *"A-01 released for Mon 7 Sep. Priya Raman has been emailed."* — and ST-08's dialog body — *"The desk goes back into the pool and Priya is emailed."* — both name the **person**, never an address. Compare `my-bookings/copy.ts:104-106`, whose toast names the **address** (`Cancellation emailed to ${email}`) and takes it from `useAuth().user.email` — *the caller's own*.

The two toasts differ because one is about you and the other is about a colleague, and both the design and the requirements point the same way:

- `allBookingsListItemSchema` (`bookings.ts:171-183`) deliberately carries **no `employeeEmail` and no `employeeId`** — US-013 §2.3 called that *"a constraint on this payload, not only on who may call it"*.
- BRD-001 §10's *"no admin copies"* is the same instinct at the notification layer.
- **An administrator does not need to see a colleague's email address in order to be told that colleague was emailed.**

So: **no `employeeEmail` is added to the item schema, no address is echoed in a response body, and the toast is built from `item.employeeName` the browser already holds.** A diff adding an email field anywhere in this story is a review finding, and it would be the kind that passes every test.

### 2.4 Errors — nothing new, and the one place I am departing from the standard's letter

Walking `libs/contracts/src/error.ts`, the reachable codes are:

| Code | When | Status |
| --- | --- | --- |
| `invalid_request` | a malformed `:id` | 400 |
| `no_session` / `session_expired` / `session_invalid` / `account_inactive` | the session chain | 401 |
| `admin_only` | the mount's guard — an Employee session | 403 |
| `password_change_required` | the enforced chain | 403 |
| `booking_already_cancelled` (`error.ts:60`) | **AC-09** | 409 |
| `booking_not_found` (`error.ts:53`) | no such booking, **or** past-dated (AC-02) | 404 |
| `internal_error` | never intentional | 500 |

**All nine already exist. `libs/contracts/src/error.ts` is not modified, and a new code appearing in this PR is a review finding.**

**The one genuine question, and it deserves a straight answer rather than a shrug.** AC-02 cites **V-06** for the server-side refusal of a past-dated booking, and `api-standards.md:45` maps V-06 to **`422`**, not `404`. US-011 deliberately went to `404` instead — folding "no such booking", "not the caller's" and "the caller's own but past-dated" into one undiscriminated answer — and its reason was explicitly a **security** one: an existence oracle over booking ids (US-011 §1.2, `error.ts:48-52`).

**That reason does not apply here, and saying so is the honest starting point.** US-011 §1.2 wrote the rule down and named this story as one of four that would face it:

> *"Discriminating among the states of a resource the caller already owns discloses nothing, because the caller can already read those states. Discriminating **across** the ownership boundary is the oracle."*

An administrator can already read **every booking in the office, with its status**, via `GET /api/admin/bookings`. There is no ownership boundary on this endpoint at all, so there is nothing the refusal could disclose. **The rule permits the split. The question is whether to build it.**

**Recommendation: do not. Return `404 booking_not_found` for both "no such booking" and "past-dated", exactly as the employee endpoint does.** Three reasons:

1. **SCR-005 ST-10 enumerates exactly two messages** — *"two distinct messages because the responses differ"*, the retryable one and *"Priya has already cancelled this booking."* A third outcome needs a third message, and there is no approved copy and no frame for it. That is a deviation from an approved screen spec, which is not a delivery decision.
2. **A new code is a `libs/contracts/src/error.ts` change** — a protected path — for a distinction no AC asks for. AC-02 asks only that the request *"is refused at the server"*, which `404` does.
3. **The charter's "no speculative generality; design for the approved stories only."**

**And here is the honest cost, stated rather than buried, because it is materially worse here than it was in US-011.** US-011 §2.3 named the case: a tab open across office midnight renders a Confirmed TODAY row with a live Cancel control; the server computes a new `today`, refuses, and the dialog shows the **retryable** message — *"We couldn't cancel that just now. Try again."* — which is a lie, because retrying can never succeed. On SCR-002 that affected **one row, the owner's own**. On SCR-005 it affects **every one of today's bookings across the whole office**, and `AllBookings` has no focus refresh to correct it (US-014 §0). The frequency argument that made it tolerable in US-011 is weaker here.

**This is open item 1**, with a cheap escape if the human wants it: one new code, one new dialog message, and the browser can then also mark the stale row `completed` locally so the retry loop ends on its own. I am recommending against it because the screen spec says two messages and the AC asks for none of it — **but this is the one place in this note where I would not argue hard, and overruling me costs about twenty lines.**

> **Resolved 2026-09-19 (Joy Joshua):** generic `404 booking_not_found`, matching the employee endpoint. No new error code, no new dialog message. See `decisions.md` D-07.

### 2.5 No `Cache-Control`

A `200` with an empty body from a `POST` is not a cacheable representation. The employee endpoint sets no header either (`bookings.router.ts:185`). Nothing to add; named so its absence reads as a decision.

---

## 3. The write

### 3.1 Where it lives — `AdminBookingsRepository`, and the read beside it is the part that can go wrong

**DEV's plan is correct: `cancelAnyBooking` on `AdminBookingsRepository`, `cancelAnyBooking` on `AdminBookingsService`.** US-013 §4.1 did not merely allow this, it predicted it in writing as the reason the admin *read* was put in `modules/bookings` in the first place:

> *"**US-015 will WRITE `bookings`.** … An admin-cancel implemented inside `modules/admin` would either violate [ADR-004's one hard rule] or need a port back into `modules/bookings` … **Put the admin read where the admin write will have to live.**"*

US-014 §3.2 then applied the same rule symmetrically to the desk read. This story is the third application and needs no new reasoning. **`modules/bookings` owns `bookings` (`modules/bookings/README.md`, ADR-004) and this is a write to `bookings`.**

**The part that needs a decision is the disambiguating read, not the write.** §3.3's classification needs an **unscoped** `findBookingState(bookingId)`. There is already a method with almost exactly that name and shape: `findMyBookingState` at `bookings.repository.ts:296-306`, whose docblock says, in bold, what would happen if someone dropped one line:

> *"`.eq('user_id', userId)` is load-bearing for D-03's anti-enumeration guarantee … **Do not drop this filter, and do not widen the select list.**"*

**A sibling `findBookingState` without that filter, three lines away from `findMyBookingState`, is precisely the copy-paste hazard US-013/D-08 exists to prevent** — and it is the *stronger* form of it, because here the two methods would differ by exactly one omitted predicate, which is the shape US-014 §3.2 rejected for `listActiveDesks`. It would also break `AvailabilityRepository`'s cheap, checkable invariant ("if it is in this file, it is scoped to the caller") on the same file that US-006/AC-06 and US-007/D-03 lean on.

**Recommended:**

```
apps/api/src/modules/bookings/admin-bookings.repository.ts
    + cancelAnyBooking(bookingId, adminId, cancelledAt, today)
    + findBookingState(bookingId)
apps/api/src/modules/bookings/admin-bookings.service.ts
    + cancelAnyBooking(adminId, bookingId): Promise<CancelAnyBookingOutcome>
```

Both new repository methods go on the object whose docblock already states the guarantee they need — *"Reachable only behind `requireAdmin` … never call this from a route outside `/api/admin/*`"* (`admin-bookings.repository.ts:9-10`). **`bookings.repository.ts`, `bookings.service.ts` and `bookings.router.ts` are not modified.**

**That docblock's opening line becomes false and must change.** `admin-bookings.repository.ts:1-2` currently reads *"The one cross-employee **read** in this codebase (US-013, REQ-011)."* As of this story it is the one cross-employee **read and write**. Rewrite it to say so and to state the write's own invariant — that the omission of `.eq('user_id', …)` in `cancelAnyBooking` is the requirement (REQ-014), not an oversight, the same way `listBookingsFromDate`'s missing status filter is commented today.

### 3.2 The `UPDATE` — `cancelOwnedBooking` with one predicate removed and one value changed

```ts
/**
 * US-015/AC-01, AC-02, AC-04, AC-07. One `UPDATE … RETURNING id`, scoped to id / confirmed /
 * not-past — NO read-then-write window, exactly as `cancelOwnedBooking` (bookings.repository.ts:265).
 *
 * **There is deliberately no `.eq('user_id', …)`, and the absence IS REQ-014.** This is the only
 * write in the codebase that changes a row belonging to somebody other than the caller; the
 * authority comes from the `/api/admin` mount (app.ts:78), never from a predicate here.
 *
 * `adminId` is ATTRIBUTION, never scope — it is written to `cancelled_by` and is not in the
 * `WHERE` at all. That is why `bookingId` comes FIRST here and `userId` comes first in
 * `cancelOwnedBooking`: the parameter orders differ because the roles differ, and two adjacent
 * uuids are a swap hazard worth naming. A swap fails loudly (`cancelled_by = <a booking id>`
 * violates the FK to user_profiles, a 23503, and `where id = <an admin id>` matches nothing),
 * never silently.
 *
 * `cancelledAt` and `today` are the caller's ONE clock reading, from the SAME instant — two
 * `nowMs()` calls would differ across office midnight (US-011 design note §8.4).
 *
 * `cancellation_source: 'admin'` is BR-001.20's own key (0003_bookings.sql:18-22), not a label:
 * US-029/US-032 select their wording from it and must never compare ids to infer the actor.
 */
cancelAnyBooking(
  bookingId: string,
  adminId: string,
  cancelledAt: Date,
  today: OfficeDate,
): Promise<{ id: string } | undefined>;
```

```ts
async cancelAnyBooking(bookingId, adminId, cancelledAt, today) {
  const { data, error } = await supabase()
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt.toISOString(),
      cancelled_by: adminId,
      cancellation_source: 'admin',
    })
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .gte('booking_date', today)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`admin booking cancel failed: ${error.message}`);
  return (data as { id: string } | null) ?? undefined;
}
```

Four things a reviewer should check, each of which has a real failure behind it:

- **All four column writes in one statement.** `bookings_cancelled_at_matches_status` and `bookings_cancelled_has_source` (`0003_bookings.sql:48-53`) reject the write otherwise, with a `23514` that propagates as an honest `500` rather than a silent `404` — `cancelOwnedBooking`'s docblock already states this and it applies verbatim.
- **`.gte('booking_date', today)` is AC-02 at the write.** BR-001.6 expressed where it cannot be skipped. `today` is the service's single `officeToday(nowMs(), officeTimezone)` reading; **this repository reads no clock** (the rule every repository docblock in this module states).
- **`.eq('status','confirmed')` must not be softened to "not cancelled".** §3.4 is why.
- **No `.eq('user_id', …)`, and no self-guard.** An admin cancelling their own booking is impossible — Admin accounts cannot book (BRD-001 §10, the story's own edge case) — so there is no case to code and none should be coded.

**The desk is freed with no code.** `bookings_one_confirmed_per_desk_per_day` (`0003_bookings.sql:64-65`) is **partial** on `status = 'confirmed'`; the moment the row leaves that status the slot is free, and `listConfirmedDeskIds` (US-006/AC-06) stops returning it on the next availability read. AC-04's *"the desk becomes available for that date"* costs nothing and needs no cache invalidation. Say so in the PR rather than leaving a reviewer to wonder what makes it true.

### 3.3 Classification — write first, then explain; and AC-09 is one outcome, not two

```ts
export type CancelAnyBookingOutcome =
  | { kind: 'ok' }
  /** US-015/AC-09. The row exists and is ALREADY cancelled — the owner got there first
   *  (US-011), a concurrent admin request won, or US-025's cascade voided it. Deliberately
   *  ONE outcome: see below. */
  | { kind: 'already_cancelled' }
  /** No such booking, or a real booking that is past-dated (AC-02). Merged — §2.4. */
  | { kind: 'not_found' };

async cancelAnyBooking(adminId: string, bookingId: string): Promise<CancelAnyBookingOutcome> {
  const now = nowMs();
  const today = officeToday(now, officeTimezone);

  const cancelled = await bookings.cancelAnyBooking(bookingId, adminId, new Date(now), today);
  if (cancelled) return { kind: 'ok' };

  const existing = await bookings.findBookingState(bookingId);
  if (existing?.status === 'cancelled') return { kind: 'already_cancelled' };
  return { kind: 'not_found' };
}
```

This is `bookings.service.ts:213-223` with the ownership argument removed, and the ordering is not stylistic. **The read runs only after the write missed, and only to classify the miss.** Reading first and writing second reintroduces the read-then-write window and — as `bookings.service.ts:200-211`'s docblock already says in this exact scenario — *"a stale read would report 'not found' for a booking that was just cancelled."* US-011 §8.1 lists "reading to classify, then writing" as mistake number one. It is mistake number one here too.

**DEV asked whether "the owner already cancelled it" is distinguishable from "an admin already cancelled it". It is not, and it must not be.**

- **It is not distinguishable from the endpoint's answer**, because both produce a row with `status = 'cancelled'` and the classification read looks at `status` alone.
- **It could be made distinguishable** — `cancellation_source` is right there on the row — and it should not be. AC-09's *Then* is *"they are told it is already cancelled"*, full stop. SCR-005 ST-10 gives one sentence for it, *"Priya has already cancelled this booking."* And widening the select list on the classification read to carry `cancellation_source` would put "who cancelled this" on the response of an endpoint whose job is to cancel, for copy nobody approved. **Select `status, booking_date` and nothing wider**, the same discipline `findMyBookingState` states for itself.
- **The code already anticipated this story by name.** `bookings.service.ts:60-61`: *"The row is the caller's own and is ALREADY cancelled — an admin (US-015) … won the race."* This story is the other end of a sentence that already exists.

**One honest wrinkle in ST-10's copy, for UX.** The approved sentence *"Priya has already cancelled this booking."* asserts **who** cancelled it, and this endpoint does not tell the browser who. If an admin cancels a booking in two tabs, the second tab shows a sentence naming the employee, which is false. Two cheap fixes, neither of them mine to pick: reword to *"This booking has already been cancelled."*, or accept the inaccuracy in a genuinely rare case. **Open item 2.** Do not "fix" it by echoing `cancellation_source` — that is copy shaping the contract.

> **Resolved 2026-09-19 (Joy Joshua):** keep the approved copy, "Priya has already cancelled this booking." — do not reword to be actor-neutral. The rare cross-admin-tab inaccuracy is accepted. See `decisions.md` D-08.

### 3.4 There is no row-version column, and none is needed — the proof, and the one change that would break it

DEV is right that no `version` column exists and that `status = 'confirmed'` does the work. The reason it is *sufficient* is worth stating precisely, because "we use the status as an optimistic lock" sounds like a shortcut and is not.

**`status = 'confirmed'` in the `WHERE` is a compare-and-set on a two-state column, and it is a complete optimistic-concurrency guard here because the transition is one-way and terminal:**

1. The only transition is `confirmed → cancelled`. **No code path anywhere sets `status` back to `'confirmed'`** — `insertConfirmedBooking` (`bookings.repository.ts:227`) *inserts* a new row and the `status` column takes its default; no `UPDATE` in this codebase writes `'confirmed'`. BR-001.2's cancel-then-rebook creates a **new booking**, which is exactly why both unique indexes are partial on `status = 'confirmed'`.
2. Therefore the predicate cannot suffer the ABA problem a version column exists to solve. A row that reads `confirmed` at statement time cannot have been `confirmed`, then something else, then `confirmed` again.
3. Of two concurrent `UPDATE`s, Postgres serialises them: the first matches one row and commits; the second re-evaluates its `WHERE` against the committed row, finds `status = 'cancelled'`, and matches zero. **Exactly one returns an id. The database arbitrates, exactly as the unique indexes arbitrate the insert** — which is `api-standards.md`'s Concurrency section (*"Where a unique index arbitrates, let it"*) applied to a `WHERE` clause.
4. **Cross-actor, the same predicate protects the attribution.** An owner's cancel cannot overwrite `cancellation_source = 'admin'` and an admin's cannot overwrite `'owner'`, because whichever loses matches zero rows. US-011 §1.5 already stated this from the other side and called it *"load-bearing for a story that does not exist yet"* — this is that story, and the property now has two writers instead of one.

**The one change that would invalidate all of it**, and therefore the one line a reviewer must refuse: **any future feature that restores a cancelled booking to `confirmed`**. That would make ABA reachable and would need a real version column or an explicit `cancelled_at IS NULL` guard. Put that sentence in the repository docblock, because it is the kind of assumption that is invisible until it is wrong.

**AC-07 is proven by two mechanisms that prove different things, and conflating them is the mistake to avoid:**

| Mechanism | What it actually guarantees |
| --- | --- |
| `inFlight` ref + `Button busy` (§5.2) | **No second request is issued.** A UX guarantee. It is what a person experiences |
| The atomic `UPDATE` above | **At most one cancellation exists**, however many requests arrive, from however many tabs or actors |

`use-cancel-dialog.ts:39,46-47` already says this for US-011 — *"the UI's disabled/busy button is what a person experiences, this ref is what actually makes 'one cancellation request exists' true"* — and the admin hook should mirror it verbatim. The second mechanism is the one that makes AC-07 true; the first is the one that makes it pleasant.

### 3.5 AC-05 and AC-06 — exactly two column writes, and no send

**Confirmed: this story writes attribution data and sends nothing.** The human's decision is correct and it has a precedent in this repository that is precise rather than approximate.

**The facts, verified:**

- `apps/api/src/infra/mailer/README.md` and `apps/api/src/infra/webpush/README.md` are both stubs — *"Provider not yet chosen"*. `grep -rl "nodemailer\|sendMail\|web-push"` over `apps/` and `libs/` returns **nothing**. There is no dispatch code, no `notification_deliveries` write, no template, no provider, no configuration.
- US-029 (cancellation email, REQ-024) and US-032 (push alerts, REQ-027) both carry `"tests": []` in `knowledge/traceability/manifest.json` — unbuilt.

**The precedent is US-007's, restated by US-011, and it is about copy, not about sending.** `bookingSchema.confirmationEmail`'s own docblock (`libs/contracts/src/bookings.ts:36-42`) says it in the contract itself:

> *"The address the confirmation **will** go to (AC-04's on-screen copy) … **not evidence that a mail was actually dispatched.** US-028 is the story that sends it; if the two ever disagree, the screen is wrong, not this field."*

US-011 shipped `cancelledToast(…)` — *"Cancellation emailed to {email}"* (`my-bookings/copy.ts:104-106`) — with no mail dispatched. US-015's ST-08 body (*"…and Priya is emailed"*) and ST-11 toast (*"Priya has been emailed"*) are the identical pattern, and they are **approved copy on approved frames**. Ship the copy.

**What this story writes, and it is the whole of AC-05 and AC-06:**

| Column | Value | Why |
| --- | --- | --- |
| `cancellation_source` | `'admin'` | **BR-001.20's key.** `0003_bookings.sql:18-21` is explicit that `cancelled_by` alone cannot separate an admin cancel from US-025's deactivation cascade, *"and the two produce different copy"* |
| `cancelled_by` | the acting admin's `user_profiles.id` | So a future composer can name the actor if the wording ever needs to, without a second source |

**Three forward constraints on the stories that will consume this.** They are not code in this PR; they are the sentences that make AC-05, AC-06 and AC-07 true by construction rather than by hoping, and they belong in `decisions.md` and the module README:

1. **US-029 must send to `bookings.user_id`'s address, never to `cancelled_by`'s.** AC-05 is *"the cancellation email goes to the booking owner, not to the administrator"*, and BRD-001 §10 forbids admin copies.
2. **US-029/US-032 must key their wording on `cancellation_source`, never on `cancelled_by !== user_id`.** The migration says so at `:18-21`; comparing ids cannot tell `'admin'` from `'deactivation_cascade'`.
3. **The send must be triggered by the returned row of §3.2's `UPDATE`, never by the router's `200` and never on the `409` branch.** This is US-011 §1.5's constraint, and it is what makes AC-07's *"exactly one email"* and AC-09's *"no second email"* structural. US-011 recorded it against itself; **US-015 is the second writer and must record it again**, because a composer wired to the router would double-send the moment two actors race.

**What must not appear in this PR:** any import from `infra/mailer` or `infra/webpush`, any `notification_deliveries` write, any provider dependency, any `notifications` module. **A dependency added for this story is an escalation to the human (`task-surfaces.md`'s "Escalate, don't decide"), not a delivery decision.**

---

## 4. The router

**`createAdminRouter` is already the factory US-013 made it** (`admin.router.ts:29`), takes `{ bookings, desks }`, and needs **no new dependency** — the cancel lives on the `AdminBookingsService` it already holds. **`composition.ts` and `http/app.ts` are therefore both unmodified**, which is worth stating in the PR: a story that adds the system's first cross-employee write without touching the composition root or the mount table is the shape to aim for.

```ts
/**
 * US-015/AC-02, AC-04, AC-09. `POST`, not `DELETE` — the row survives the transition (AC-04).
 *
 * `req.user.id` is read here for ATTRIBUTION (cancelled_by, §3.5), NOT for authorization: there
 * is still no role check in this file, and adding one would be a second, forgettable copy of
 * `requireAdmin`. The mount (app.ts:78) decides who reaches this handler; this line only records
 * WHO it was. `requireActingAdmin` refuses rather than asserting `req.user!` — reaching here
 * without a user means the guard was mounted wrong, and that must fail loudly (the shape
 * `bookings.router.ts:46-52` and `require-admin.ts:24-29` both already use).
 */
router.post('/bookings/:id/cancel', async (req, res, next) => {
  try {
    const parsed = cancelBookingParamsSchema.safeParse(req.params);
    if (!parsed.success) throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');

    const admin = requireActingAdmin(req);
    const outcome = await bookings.cancelAnyBooking(admin.id, parsed.data.id);

    if (outcome.kind === 'already_cancelled') {
      // AC-09, ST-10's non-retryable branch. The browser renders its OWN copy keyed on the
      // `code`; this message is for logs and non-browser consumers.
      throw conflict(ERROR_CODES.booking_already_cancelled, 'That booking has already been cancelled.');
    }
    if (outcome.kind === 'not_found') {
      throw notFound(ERROR_CODES.booking_not_found, 'That booking could not be found.');
    }

    res.status(200).end();
  } catch (error) {
    next(error);
  }
});
```

**Two notes for DEV, and the first one will trip somebody.**

1. **The file's docblock at `admin.router.ts:33-39` says *"No `requireUser`/role check here … reading `req.user` again would be a second, forgettable copy of `requireAdmin`."* That sentence is now half-false and must be amended rather than deleted.** Its *authorization* half survives intact and is still the reason there is no role check; its *"never read `req.user`"* half does not, because attribution genuinely needs the id. Amend it to draw the line explicitly — **read the user to record who acted; never to decide whether they may.** A DEV who reads the current sentence literally will either assert `req.user!` (a crash waiting for a misconfigured mount) or add a redundant role check (a second copy of the guard). Both are review findings.

2. **`requireActingAdmin` is the second consumer of a six-line helper.** `bookings.router.ts:46-52`'s `requireUser` is module-private. Extracting it to a shared place now meets US-011's own *"two real consumers in front of it"* bar (`cancel-booking.ts:4-6`), so extraction is defensible; so is a local copy with a docblock that says why it exists. **This is a test-factoring-grade decision, not a design one — DEV's call.** What is *not* optional is that it refuses rather than asserts.

3. **A repository failure propagates to `next(error)`**, never caught into a success. AC-08's *"the booking is still Confirmed"* is only honest if a failed write surfaces as a failure.

---

## 5. The browser

DEV's Figma reading is confirmed against the code, component by component: **no new shared component, and no new prop on an existing one.** Everything below is composition of primitives that already exist, exactly as US-011 did for the employee-side flow.

### 5.1 The fetcher — a sibling in the same file, not a parameterized URL

`lib/cancel-booking.ts:37` hardcodes `/api/bookings/${bookingId}/cancel`. DEV asked whether to parameterize it or add a sibling.

**Recommended: a sibling factory in the same file, with the outcome mapping extracted to one private function both use.**

```ts
// lib/cancel-booking.ts — US-015 adds the admin half beside the employee half

/** Shared by both factories below: the response shape is identical because the two endpoints
 *  answer with the same codes (`booking_already_cancelled`, `booking_not_found`). */
function mapCancelResult(result: ApiResult<void>): CancelBookingOutcome { /* today's lines 39-44 */ }

/** US-007/US-011 — the EMPLOYEE's own cancel. Unchanged. */
export function createCancelBooking(api: ApiClient): CancelBookingFetcher { … }

/**
 * US-015 — the ADMIN cancel, `POST /api/admin/bookings/:id/cancel`. A separate function rather
 * than a path parameter on the one above, and deliberately so: these two endpoints sit behind
 * DIFFERENT guards, and one function with a variable path invites a future caller to pass the
 * admin path from an employee screen. Same outcome type — the codes are the same — and the
 * mapping is shared, so there is no second copy of the logic.
 */
export function createAdminCancelBooking(api: ApiClient): CancelBookingFetcher { … }
```

*Rejected: parameterizing `createCancelBooking(api, pathFor)`.* It changes a function two existing screens consume (`ExistingBookingState`, `MyBookings`) to carry a string it had no reason to carry, and it turns a typed seam that names one endpoint into a string-building seam that names none. The two endpoints' only difference is which authority they sit behind; a variable path erases exactly that difference at the call site. Same species of argument as US-013 §4.2 and US-014 §3.2 — make the guarantee structural rather than remembered.

*The honest counter:* the two factories are near-identical, and someone will eventually propose merging them. The shared `mapCancelResult` removes the duplication that would actually matter, and the docblock records why the last three lines stay apart.

**One tier note.** `apps/ui/src/lib/**` is not `components/**`, so this is not the Complex shared-component surface — `components/README.md:3` makes *component props* a contract, not every shared module. Adding an export beside an existing one, with no existing signature changed, is Medium. **A diff that changes `createCancelBooking`'s signature is a different matter and should be refused.**

### 5.2 `use-admin-cancel-dialog.ts` — mirror `use-cancel-dialog.ts`, with one deliberate divergence

Screen-private to `all-bookings/`, mirroring `my-bookings/use-cancel-dialog.ts` almost line for line:

- `inFlight` ref **checked and set synchronously before any state read** (`use-cancel-dialog.ts:46-47`) — AC-07's client half. Do not replace it with a `busy` state check: a second `confirm()` in the same tick lands before React re-renders.
- `busy` drives `ConfirmDialog`'s existing `busy` prop, which disables both actions (`ConfirmDialog.tsx:143,147`), swaps the confirm label for a spinner (`Button.tsx:62,68`), and suppresses Escape (`ConfirmDialog.tsx:77-80`). **ST-09 is entirely existing behaviour.**
- `outcome: 'already_cancelled' | 'retryable'`, driving `error` and `singleAction` — **ST-10 is entirely existing behaviour** (`ConfirmDialog.tsx:136-140,146-150`).
- **No optimistic update.** The row is touched only after `kind === 'ok'`, which is ST-09's *"table untouched behind it"* and the story's own design commitment.

**The one divergence, and it is §5.3's whole subject.** `use-cancel-dialog.ts:63` calls `onRefresh()` — `bookings.retry` — when an `already_cancelled` dialog is dismissed. **The admin hook must not.** Its third argument becomes `onAlreadyCancelled(item)`, not `onRefresh()`.

The item type is `AllBookingsListItem`, not `MyBookingListItem`. **Do not generalize `use-cancel-dialog.ts` over both** — different item type, different dismissal behaviour, different screen, and `components/README.md:6` puts a one-screen module in that screen's folder. US-013 §6.1 declined the analogous `BookingRow` extraction; nothing has changed.

### 5.3 AC-04 forbids a refetch — and under US-014's filter, a refetch actively breaks it

**This is the finding I would most want a reviewer to hold onto.**

`useAllBookings` has no `markCancelled` today. The obvious move — call `retry()` after a successful cancel, as `MyBookings` does for its `already_cancelled` dismissal — is **wrong here, twice over:**

1. **Under a `status=confirmed` filter, the cancelled row stops matching the query and disappears from the refetched page.** AC-04 says in as many words: *"the row stays in place showing its new status rather than disappearing"*, and SCR-005 ST-11 gives the reason — *"Marcus's next question is usually 'did that work?' and a vanished row answers it ambiguously."* A refetch produces exactly the vanishing the AC forbids, and it does it **only when a filter is active**, which means it passes every unfiltered test. US-014/AC-08's own arrival path (`?deskId=…&status=confirmed`) is the case this is most likely to hit in real use.
2. **`retry()` drops every accumulated page** (`use-all-bookings.ts:41` — *"Re-fetches page 1 and drops any accumulated later pages"*). An administrator who pressed **Show more** three times loses pages 2–4 on every cancellation.

**Recommended: `useAllBookings` gains `markCancelled(bookingId)`, mirroring `useMyBookings`'s (`use-my-bookings.ts:127-135`) exactly:**

```ts
const markCancelled = useCallback((bookingId: string) => {
  setState((current) => {
    if (current.status !== 'ready') return current;
    return {
      ...current,
      items: current.items.map((item) =>
        item.id === bookingId ? { ...item, status: 'cancelled' } : item),
    };
  });
}, []);
```

**Two properties to state in its docblock, because both look like oversights:**

- **`total` is not decremented.** It counts bookings matching the view, and the row is still in the view — AC-04 keeps it there. Decrementing would make the count line disagree with the visible list, which is the one thing that line exists to prevent (US-013/D-01).
- **It is called on `already_cancelled` too, not only on success.** A `409` from this endpoint means the row exists and its status *is* `cancelled` (§3.3) — the browser is not guessing, it is applying a fact the server just asserted. That satisfies AC-09's *"the row updates"* with no refetch and no page loss. This is the same "a server answer means our view is provably wrong" reasoning `lib/cancel-booking.ts:26-29` already records for `refused` vs `failed`; it just reaches a better conclusion here than a full refetch.

**It is not called on `failed` or `refused`.** AC-08: *"the booking is still Confirmed"*. A transport failure taught us nothing.

### 5.4 The action column — AC-01, AC-02 and ST-07

`AdminBookingRow.tsx:12-14`'s docblock states the invitation this story accepts: *"**No action/cancel column, in either layout** (`decisions.md` D-06) … AC-03 lists exactly four fields; **US-015 owns the fifth.**"* Take it.

**Cancellability is `item.status === 'confirmed'`, and nothing else.** Not a date comparison. ADR-007's wire invariant — a `confirmed` item's date is never before the response's `today` — is what makes one field sufficient, and it is the same rule `MyBookings.tsx:249-251` relies on. US-011 §8.3 lists *"deriving cancellability from the date in the browser"* as a named mistake; it is a worse one here, because `AllBookings` holds `office.today` from the auth context (`auth.ts:17-18`), which goes stale across an office midnight with the tab open. **A `formatOfficeDate`/date comparison in this story's cancellability logic is a review finding.**

**ST-07's reason, derived from the same one field:**

| `item.status` | Reason |
| --- | --- |
| `completed` | *"Past bookings can't be cancelled"* |
| `cancelled` | *"Already cancelled"* |

**Table layout** — a fifth `<td>`: the em dash visible and `aria-hidden`, the reason in a visually-hidden span, and the reason also as `title` for the mouse tooltip SCR-005 asks for. `title` alone is not an accessible name in practice, which is why both are needed; SCR-005's own note (*"the reason … is an accessible label and tooltip, so it has no visible form at 1280"*) is satisfied by the pair, not by `title` alone.

**Card layouts** — AC-02 requires the reason *"stated in words in the card layouts"*, so it renders visibly there.

**Three concrete edits that are easy to miss:**

- **`AdminBookingsTableHead` (`AdminBookingRow.tsx:23-34`) gains a fifth `<th scope="col">`.** It must carry an accessible name — a visually-hidden *"Action"* — not be empty.
- **`AdminSkeletonRow`'s table variant uses `colSpan={4}`** (`AdminSkeletonRow.tsx:22`). It becomes `5`, or the skeleton stops spanning the header.
- **`AllBookings.spec.tsx` already asserts the four `<th>`s in order, citing `US-013/AC-11`. Extend that assertion; do not replace or delete it.** Losing it would silently drop another story's coverage — the exact hazard US-013 §6.4 named about the US-004 toasts.

**There is no global visually-hidden utility in this codebase** — each surface defines its own (`availability-count.css:27`, `policy-checklist.css:46`, `my-bookings.css:47`). Add `.all-bookings__visually-hidden` to `all-bookings.css`; do not introduce a global `sr-only`, which would be a new cross-cutting convention this story has no mandate for.

### 5.5 Copy — and one real problem US-013/D-04 left behind

Everything goes in `screens/all-bookings/copy.ts`, beside US-013/US-014's strings, per the file's own stated convention. From the frames DEV confirmed:

```ts
export const CANCEL_DIALOG_TITLE = (employeeName: string) => `Cancel ${employeeName}'s desk?`;
export function cancelDialogBody(deskNumber: string, dateLabel: string, employeeName: string): string {
  return `${deskNumber} · ${dateLabel}. The desk goes back into the pool and ${employeeName} is emailed.`;
}
export const CANCEL_CONFIRM_LABEL = 'Cancel this booking';   // NOT 'Cancel booking' — SCR-005 ST-08
export const CANCEL_KEEP_LABEL = 'Keep it';
export const CANCEL_RETRY_LABEL = 'Try again';               // the confirm button's label after a failure
export const CANCEL_FAILED_RETRYABLE = "We couldn't cancel that just now. Try again.";
export const CANCEL_ALREADY_CANCELLED = /* resolved below */;
export const CANCEL_CLOSE_LABEL = 'Close';
export function cancelledToast(deskNumber: string, dateLabel: string, employeeName: string): string {
  return `${deskNumber} released for ${dateLabel}. ${employeeName} has been emailed.`;
}
```

> **Resolved 2026-09-19 (Joy Joshua):** `CANCEL_ALREADY_CANCELLED = (employeeName: string) => \`${employeeName} has already cancelled this booking.\`` — the approved copy, kept as-is (see §3.3's resolution, `decisions.md` D-08).

- **`'Cancel this booking'`, not US-011's `'Cancel booking'`.** SCR-005 ST-08 is explicit — *"Actions are **Cancel this booking** and **Keep it** — never Yes/No on a screen about cancelling"* — and the difference is deliberate: on a screen full of other people's bookings, *this* one is the word doing the work. A copy-paste from `my-bookings/copy.ts:83` loses it.
- **Use `item.employeeName` verbatim everywhere, full name.** SCR-005 mixes forms — *"Cancel **Priya Raman's** desk?"* in the title, *"Priya is emailed"* in the body, *"Priya Raman has been emailed"* in ST-11, and the frames DEV read show *"Priya"* in two of those places. **Deriving a first name from `full_name` means assuming the first whitespace-delimited token is the given name, which is false for a large fraction of real names** and is not a rule this product has anywhere. Full name throughout is correct and boring; the frames' *"Priya"* reads naturally because the example's short form happens to match. **Open item 4** for UX, along with the possessive for a name ending in *s* (*"Cancel James's desk?"*), which `${name}'s` renders as-is and which nobody has ruled on.

> **Adopted 2026-09-19 (DEV default, per `ai/context/guided-interaction.md`'s "offer a default, confirm later"):** full name throughout, and the plain `${name}'s` possessive with no special-casing for a trailing "s". Recorded as `decisions.md` D-05; cheap to revise if UX rules otherwise.

**The skeleton height problem, which is new and which US-015 creates.** US-013/D-04 sized `AdminSkeletonRow`'s 360px card at **160px** on an explicit premise: *"US-013 never renders a Cancel control … so every real 360px row in this story is the 160px shape"* (`all-bookings.css:128`, `:134`, `:189`; the Figma measurements are in D-04 — node `176:485` = 160px without an action, node `176:427` = 188px with one). **US-015 makes that premise false.** A mixed list now has 188px cancellable cards and 160px non-cancellable ones, and the skeleton matches only the latter, so the list visibly jumps on load — which is precisely what US-013/AC-09's *"skeleton at real row height"* exists to prevent.

The skeleton cannot know which rows will be cancellable, so there is no purely-correct answer. **AC-09 belongs to US-013, not to this story, so US-015 is not obliged to fix it — but shipping a known layout shift silently is worse than naming it.** **Open item 3**, for UX: keep 160, move to 188, or take a middle value. My weak preference is 188, because PRIN-1 says this screen *"arrives showing today"* and today's rows are the cancellable ones, so the common case is the taller shape.

> **Adopted 2026-09-19 (DEV default):** 188px, per the Architect's stated preference. Recorded as `decisions.md` D-04; cheap to revise if UX rules otherwise.

### 5.6 Focus after a successful cancel — ST-11 says something the shared dialog cannot deliver

`ConfirmDialog` restores focus to whatever had it before the dialog opened (`ConfirmDialog.tsx:61,64,68`). SCR-005 ST-08 wants exactly that on dismissal, and gets it.

**ST-11 wants something else, and states it plainly: *"Focus returns to the row, which still exists."*** After a successful cancel the row's Cancel button is replaced by an em dash, so the element `previouslyFocusedRef` points at is gone from the DOM and `.focus()` on it is a no-op — **focus falls to `<body>`**, and a keyboard user is dumped at the top of the page. (US-011 has the same shape of gap when a row moves to Past; that is not this story's to fix, and this note is not proposing to.)

**Recommended, and it needs no change to `ConfirmDialog`:** the screen keeps a `justCancelledId`, `AdminBookingRow` takes `tabIndex={-1}` on its row element, and an effect focuses that row when `item.id === justCancelledId` after the dialog unmounts. That is ST-11 rendered literally.

**One ordering fact that will otherwise produce a flaky test:** React runs a child's cleanup before a parent's effects in the same commit, so `ConfirmDialog`'s unmount restore fires *first* and the row focus fires *second*. The row wins. Written down because getting the belief backwards produces a test that passes locally and fails under a different React scheduling path.

> **Adopted 2026-09-19 (DEV default):** build the `justCancelledId` focus-return fix as recommended. Recorded as `decisions.md` D-06.

### 5.7 AC-10 — a structural absence with a test that can fail

**No code.** There is no multi-select state, no checkbox column, no bulk action, and none is added. AC-10 protects a decision already taken; it does not commission work.

**But it needs a test that can genuinely fail**, not a comment. In `AllBookings.spec.tsx`, over a rendered list of several cancellable rows:

- `queryAllByRole('checkbox')` is empty — in the table tree and the card tree alike;
- there is no *Select all* / *Cancel selected* control;
- **the number of Cancel controls equals the number of cancellable rows** — i.e. the affordance is per-row, not global.

The third assertion is the one that would actually catch a regression: a future "Cancel selected" button would add one global control and leave the checkbox assertion green if it used a different role.

---

## 6. What this story deliberately does not touch

Each absence is argued above; collected here because the list is the review instruction.

- **`supabase/migrations/**`** — §0. Every column, enum value, constraint and index already exists, placed by US-006 with `0003_bookings.sql:18-21` naming BR-001.20 explicitly. **A migration in this PR is a review finding.**
- **`apps/api/src/http/middleware/**` and `apps/api/src/http/app.ts`** — §0. The guard predates the route.
- **`apps/api/src/composition.ts`** — §4. The `adminBookings` seam (`composition.ts:61-62`) already exists and the service already holds every dependency the cancel needs.
- **`libs/contracts/src/error.ts`** — §2.4. Nine reachable codes, all existing.
- **`libs/contracts/src/bookings.ts`** — §2.2, §2.3. `cancelBookingParamsSchema` reused; no response schema; **no `employeeEmail`**.
- **`apps/api/src/modules/bookings/bookings.{repository,service,router}.ts`** — §3.1. The employee-scoped objects keep their invariant; `findMyBookingState` keeps its `.eq('user_id', …)`.
- **`apps/api/src/domain/**`** — no new rule and no changed one. BR-001.6 is `bookingDisplayStatus(...) === 'confirmed'` (ADR-007), expressed at the write as a predicate, exactly as US-011 expressed it. **Changing an existing rule is Complex (`task-surfaces.md`'s `domain/` case) and nothing here asks for it.**
- **`apps/ui/src/components/**`** — §0. `ConfirmDialog`, `Button`, `Alert`, `StatusChip`, `Toast` all fit as they are. **A new prop on `ConfirmDialog` is a review finding.**
- **`apps/ui/src/lib/data-refresh.ts`** — §0. REQ-036's behaviour is set once.
- **`apps/ui/src/lib/cancel-booking.ts`'s existing `createCancelBooking` signature** — §5.1. Added beside, never changed.
- **`apps/ui/src/routes.tsx`, `eslint.config.mjs`** — no new address, no new module boundary.
- **`infra/mailer/**`, `infra/webpush/**`, any new dependency** — §3.5.

**Six of those are protected paths.** A story that adds the system's first cross-employee *write* without touching the schema, the auth chain, the mount table, the composition root, the error contract or a shared component's props is the shape to aim for, and it is worth stating in the PR description the way US-013's and US-014's were.

---

## 7. No new ADR — three consequential edits instead

**Recommendation: no ADR.** DEV's instinct is right, and here is the test applied candidate by candidate — the same one US-002 §8, US-011 §7, US-013 §8 and US-014 §8 applied: *does the decision bind work beyond this story, with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **Write-first-then-explain, with an unscoped classification read** | **No ADR.** US-011 §1.4's primitive at its second call site, and US-011 §7 already recorded "no ADR" for the primitive itself. The four lines of service code are self-explaining |
| **`status = 'confirmed'` as the optimistic-concurrency guard (§3.4)** | **No ADR.** DEV is right that ADR-007 is about derived status, not concurrency — but the absence of a concurrency ADR is not a gap. `api-standards.md`'s own Concurrency section already states the rule (*"Where a unique index arbitrates, let it"*), and this is that rule applied to a `WHERE` clause. **What it does need is the one-way-transition proof written in the repository docblock**, because that is the assumption a future "restore a cancelled booking" feature would silently break. In Construction the executable contract *is* the design |
| **The admin write's placement (§3.1)** | **No ADR.** US-013 §4.1's rule applied exactly as its own text anticipated, by name. A story that consumes a rule does not need one |
| **The attribution columns (§3.5)** | **No ADR.** `0003_bookings.sql:18-21` already carries the decision and its rationale, written before this story existed |
| **The disclosure rule's second half (§2.4)** | **No ADR — but it is a standard, and it is still not written down.** US-011 §1.2 stated it, US-011 open item 4 routed it to `ai/standards/api-standards.md`, and **I verified it never landed** (`grep -n "ownership boundary\|oracle\|disclos" ai/standards/api-standards.md` returns nothing). US-015 is the first story to sit on the *permissive* side of it, which makes now the moment |

**Three consequential edits, US-013's device, each required by something that already exists:**

1. **`ai/standards/api-standards.md` §Errors** — add the disclosure rule as a row, in US-011 §1.2's own words, plus one sentence recording that a cancel's V-06 refusal folds into `404` rather than `422` on **both** cancel endpoints and why the reasons differ (anti-enumeration for the employee route; approved-copy scope for the admin route, §2.4). This closes US-011 open item 4 and is where an author of US-019 or US-025 will actually look.
2. **`apps/api/src/modules/bookings/README.md`** — ADR-004 requires each module README to state what it owns and writes. Add US-015's paragraph: the module now writes `bookings` from a **second** object; `AdminBookingsRepository` is no longer read-only; the `UPDATE`'s missing `user_id` predicate is REQ-014 and not an oversight; `cancellation_source`/`cancelled_by` attribution and §3.5's three forward constraints. **While there, fix a stale line the Ownership section already carries**: it still names `listBookingsFromDate`, which US-014 renamed to `listBookings` (`admin-bookings.repository.ts:83`).
3. **`apps/api/src/modules/bookings/admin-bookings.repository.ts` and `apps/api/src/modules/admin/admin.router.ts` docblocks** — §3.1 and §4. Both currently assert something this story falsifies (*"The one cross-employee read"*; *"No `requireUser`"*). Both must be amended rather than deleted, because in each case the surviving half is the property a future reader needs.

**The honest counter-argument, so you can overrule me cheaply:** the one decision here with any reach is §3.4's "the status column is the version column". If you expect other terminal-state transitions in this system (a desk retirement, an account deactivation) and want that reasoning held by a document with a rejected-alternatives table rather than by a repository docblock, an ADR is cheap and I would not argue hard. I do not think so — the proof depends on a property of *this* table's state machine, and it belongs where someone about to change that state machine will read it.

> **Resolved 2026-09-19 (Joy Joshua):** land edit 1 (the disclosure rule in `ai/standards/api-standards.md`) now, in this PR. See `decisions.md` D-09.

---

## 8. File placement

**New — `apps/api`**

```
(none)
```

Everything server-side is an addition to files that already exist. Worth stating: it is the payoff of US-013 §4.1 having put the admin read where the admin write would need to live.

**New — `apps/ui`** (all screen-private; the pixel truth is in the frames)

```
apps/ui/src/screens/all-bookings/use-admin-cancel-dialog.ts      (+ .spec.ts)   AC-07, AC-08, AC-09 (§5.2)
```

**Modified — `apps/api`**

```
apps/api/src/modules/bookings/admin-bookings.repository.ts       + cancelAnyBooking, findBookingState; docblock (§3.1, §3.2)
apps/api/src/modules/bookings/admin-bookings.repository.spec.ts  the recording fake gains `update`/`maybeSingle` (§9)
apps/api/src/modules/bookings/admin-bookings.service.ts          + cancelAnyBooking; one clock reading (§3.3)
apps/api/src/modules/bookings/admin-bookings.service.spec.ts     AC-02, AC-07's single write, AC-09
apps/api/src/modules/admin/admin.router.ts                       + POST /bookings/:id/cancel; docblock (§4)
apps/api/src/modules/admin/admin.routes.spec.ts                  the stub repository gains the two methods; AC-02, AC-09, admin_only
apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts   the two-actor race (§9) — gated
apps/api/src/modules/bookings/README.md                          ADR-004 requires it; stale name fixed (§7)
```

**Modified — `apps/ui`**

```
apps/ui/src/lib/cancel-booking.ts          (+ .spec.ts)  + createAdminCancelBooking; mapping extracted (§5.1)
apps/ui/src/screens/all-bookings/AdminBookingRow.tsx     (+ .spec.tsx)  the fifth column, both layouts (§5.4)
apps/ui/src/screens/all-bookings/AdminSkeletonRow.tsx                   colSpan 4 -> 5; height, open item 3 (§5.5)
apps/ui/src/screens/all-bookings/AllBookings.tsx                        the dialog, the toast, the focus return (§5.2, §5.6)
apps/ui/src/screens/all-bookings/AllBookings.spec.tsx                   AC-01..AC-04, AC-08..AC-10; EXTEND the US-013/AC-11 <th> assertion
apps/ui/src/screens/all-bookings/use-all-bookings.ts     (+ .spec.ts)   + markCancelled (§5.3)
apps/ui/src/screens/all-bookings/copy.ts                 (+ .spec.ts)   ST-07..ST-11 strings (§5.5)
apps/ui/src/screens/all-bookings/all-bookings.css                       action column; .all-bookings__visually-hidden
```

**Modified — framework**

```
ai/standards/api-standards.md §Errors      the disclosure rule (§7) — closes US-011 open item 4
inception/specs/index.md                   the US-015 row
knowledge/traceability/manifest.json       US-015 tests[]
```

---

## 9. Test placement per AC

QA's own flags are the organising constraints: **AC-05/AC-06 are the pair most likely to be got wrong together**, **AC-09 needs the two-actor test from the other side**, and **AC-02 needs a server-side attempt with a past booking's identifier.**

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `AdminBookingRow.spec.tsx` — a `confirmed` item renders a **Cancel** `Button variant="secondary"` in both layouts | component |
| **AC-02** | `admin-bookings.repository.spec.ts` — the recorded update carries `eq('status','confirmed')` **and** `gte('booking_date', today)`; `admin.routes.spec.ts` — **a past-dated Confirmed booking's id gets `404 booking_not_found`**; `AdminBookingRow.spec.tsx` — a `completed` and a `cancelled` item render **no** Cancel control, an em dash, and the right reason string | **repository + route** + component |
| AC-03 | `AllBookings.spec.tsx` — opening the dialog on a row renders a title naming **that row's** `employeeName` and a body naming that row's desk and date, never a fixture constant | component |
| **AC-04** | `admin-bookings.service.spec.ts` — a successful write returns `ok` and performs **exactly one** repository write; `use-all-bookings.spec.ts` — `markCancelled` flips one item's status and **leaves `total` and every other item untouched**; `AllBookings.spec.tsx` — **with `status=confirmed` in the filter state, the cancelled row is still present and reads Cancelled after success** | service + hook + **component** |
| **AC-05** | `admin-bookings.repository.spec.ts` — the recorded update payload is exactly `{status:'cancelled', cancelled_at, cancelled_by:<adminId>, cancellation_source:'admin'}`; `admin.routes.spec.ts` — the `cancelled_by` reaching the repository is the **session's** id, not a body or query value. **No mail assertion exists, and must not** (§3.5) | **repository + route** |
| **AC-06** | Same repository assertion, pointed at `cancellation_source === 'admin'` specifically — **the field US-032 keys its wording on**, distinct from US-011's `'owner'`. A test that asserts only `cancelled_by` passes while BR-001.20 fails, which is exactly the QA note's warning | **repository** |
| **AC-07** | `use-admin-cancel-dialog.spec.ts` — **two `confirm()` calls in the same tick issue exactly one fetch**, and the second is refused before any state read; `admin-bookings.service.spec.ts` — the success path performs exactly one write. *Plus* the gated race below | **hook + service** |
| AC-08 | `use-admin-cancel-dialog.spec.ts` — a `failed` outcome leaves `busy: false`, `outcome: 'retryable'`, the dialog **open**, and calls neither `onCancelled` nor `markCancelled`; `AllBookings.spec.tsx` — the `Alert tone="danger"` renders inside the dialog, the confirm button reads **Try again**, and the row still reads Confirmed | hook + component |
| **AC-09** | `admin-bookings.service.spec.ts` — write returns `undefined`, state read returns `cancelled` → `already_cancelled`; `admin.routes.spec.ts` — **`409 booking_already_cancelled`**; `AllBookings.spec.tsx` — `singleAction` with a **Close** button, no destructive action, and the row updates to Cancelled **without a refetch** (assert the fetcher is not called again — §5.3). *Plus* the gated race below | **service + route + component** |
| AC-10 | `AllBookings.spec.tsx` — no `checkbox` role in either tree, no bulk control, and **one Cancel control per cancellable row** (§5.7) | component |
| §3.4 | `bookings.repository.concurrency.spec.ts` — **gated**, no AC citation (US-013 §10's convention) | **real Postgres** |

**Two assertions that can only be made against real Postgres**, and they go in the existing `RUN_BOOKINGS_CONCURRENCY_TEST=1` harness, which already imports `adminBookingsRepository` (`bookings.repository.concurrency.spec.ts:40`):

1. **The two-actor race (AC-09's substance).** Seed one confirmed booking; run `cancelOwnedBooking(owner, …)` and `cancelAnyBooking(bookingId, admin, …)` concurrently under `Promise.all`; assert **exactly one returns a row and the other returns `undefined`**, and that the stored `cancellation_source` matches the winner. This is the QA note's *"same two-actor test from the other side"*, and it is the only place the arbitration in §3.4 is actually exercised rather than assumed.
2. **Two concurrent admin cancels (AC-07's server half).** Same shape, one actor: exactly one row updated, exactly one `cancelled_at`, and a database-side count of `1`.

**These are additional evidence, not the ACs' citations.** Gated tests **skip** without the flag, and `aidlc-check` needs a *passing* test per AC — so the AC-citing tests must be the ungated ones in the table above, exactly as US-013 §10 handled its own gated rows. **Paste the harness run's real output in the PR.**

**Data setup**, the story's QA note with one addition: bookings for several employees today, future and past; one booking already cancelled by its owner; **and one Confirmed booking dated yesterday** — the row that separates a correct AC-02 from a plausible one, and the one no fixture produces naturally.

---

## 10. Open items carried out of this note — resolution status

| # | Item | Owner | Blocks | Status |
| --- | --- | --- | --- | --- |
| 1 | §2.4 — a past-dated cancel attempt: fold into `404` (recommended) or add a new code + third message | Joy Joshua + `/ux` | ST-10's message set, one error code | **Resolved** — fold into `404` (`decisions.md` D-07) |
| 2 | §3.3 — ST-10's non-retryable copy names an actor the endpoint can't verify. Reword, or accept the rare inaccuracy? | `/ux` + PO | one string | **Resolved** — keep approved copy as-is (`decisions.md` D-08) |
| 3 | §5.5 — `AdminSkeletonRow`'s 360px height: 160, 188, or a middle value? | `/ux` + DEV | US-013/AC-09 staying true | **Adopted (DEV default)** — 188px (`decisions.md` D-04) |
| 4 | §5.5 — full name vs first name in the dialog/toast; the possessive for a name ending in *s* | `/ux` + PO | `copy.ts` | **Adopted (DEV default)** — full name, plain `${name}'s` (`decisions.md` D-05) |
| 5 | §3.5 — the three forward constraints on US-029/US-032 | Manager → US-029, US-032 | nothing in this story | **Recorded, not blocking** — carried in `decisions.md` D-03 and the `modules/bookings/README.md` edit |
| 6 | §7 — land the disclosure-rule doc edit now, or keep carrying it | Joy Joshua | nothing | **Resolved** — land it now (`decisions.md` D-09) |
| 7 | §5.6 — is the focus-return fix worth ~10 lines, or accept focus falling to `<body>`? | `/ux` + DEV | an accessibility behaviour ST-11 names but no AC does | **Adopted (DEV default)** — build it (`decisions.md` D-06) |

No open item remains blocking. Gate D1 may proceed.

---

## Notes outside the design note

Three things worth your attention separately from the note DEV will paste:

1. **Everything DEV asserted, I checked against the code, and it all held** — the schema already carrying `cancellation_source`/`cancelled_by`, the mount-level guard, `createAdminRouter` still being a factory, `ConfirmDialog`'s full prop set, and the absence of any mail or push code anywhere in the tree. **Two corrections, both additive:** DEV's "Contract" tier signal is weaker than stated — `libs/contracts` is genuinely untouched (§0), which sharpens the review rather than softening the tier — and the write belongs on `AdminBookingsRepository` for a reason DEV did not give, namely that the *classification read* is the dangerous half (§3.1).

2. **The thing most likely to ship broken is §5.3, and it produces green tests.** Calling `retry()` after a successful cancel is the obvious move, mirrors `MyBookings`, and breaks AC-04 **only when a filter is active** — so every unfiltered test passes while US-014/AC-08's own arrival path (`?deskId=…&status=confirmed`) makes the row vanish in exactly the way AC-04 forbids. If you spot-check one finding in this note, make it that one.

3. **The two runtime-only assumptions are both in §3.4**, and neither can fail in the unit suite: that concurrent `UPDATE`s with a `status` predicate really do arbitrate to exactly one winner, and that they do so **across two different writers** (owner and admin) rather than only between two copies of the same one. The harness for both already exists, is gated, and costs one run against a disposable Supabase project. Green unit tests plus an unrun harness is the combination that ships a double cancellation — and, once US-029 exists, a double email.

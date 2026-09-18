# US-010 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-010 — View my own bookings, past and upcoming](../../stories/user-stories/US-010-view-my-bookings.md) |
| **Screen**   | [SCR-002](../../design/screens/SCR-002-my-bookings.md) **ST-01 – ST-06**. ST-07 – ST-10 are US-011's (cancellation) and are not touched |
| **Tier**     | Complex — a new route, a new slice of `libs/contracts`, and a shared component's props (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md) — **one new ADR recommended: [ADR-007](../../../knowledge/decisions/ADR-007-derived-booking-status.md)** (§6) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is argued
before the code, not in a review thread. `decisions.md` in this package stays DEV's.

The story hands `/architect` two questions and says so twice — line 105 (*"Shape is `/architect`'s
to settle"*) and line 98 (*"Whether **Completed** is stored or computed at read time is
`/architect`'s call"*). They are not independent. **The answer to the second one collapses most of
the first**: once the server derives Completed, `status === 'confirmed'` becomes exactly
"belongs in the Upcoming section", the wire needs no second date comparison, and the browser
stops needing a notion of "today" for anything except the one word in the page header.

**The verdict, in one line each:**

- `GET /api/bookings`, one flat array newest-first, `?before=<date>` as the only paging control,
  one `nextBefore` cursor that is `null` when there is nothing older (§1).
- **Completed is derived server-side**, in `domain/`, and reaches the wire as a **response-only
  three-value enum** that is a *different schema* from the stored two-value one (§2, §3).
- `StatusChip` gains booking variants behind an **optional** `kind` discriminator — not a sibling
  component, not a widened flat union (§4).
- One new ADR, for the derivation only (§6). The paging shape does not earn one and §6 says why.

§7 is the list of things a DEV building this gets wrong without reading further. Two of them
(§7.1, §7.2) produce green tests and a wrong screen.

---

## 0. The tiering

**Complex**, on three of the five surfaces in [`task-classification.md`](../../../ai/context/task-classification.md),
as [`task-surfaces.md`](../../../ai/standards/task-surfaces.md) names them here:

| Surface | What it is here |
| --- | --- |
| **Contract** | `libs/contracts/src/bookings.ts` gains a query schema, an item schema, a response envelope and a second status enum. A **protected path** — *"the wire contract itself … changing one changes both sides at once"* |
| **Server** | A **new route**, `GET /api/bookings`. Complex by the rule as written, regardless of diff size |
| **Contract (UI)** | `StatusChip`'s public props — a **shared** component, the same surface US-009 §0 marked for `EmptyState` |

**Not Persistence.** No migration, no column, no index. `bookings_user_id_booking_date_idx`
(`supabase/migrations/0003_bookings.sql:77`) was created for this read and its comment says so
(*"REQ-009, REQ-034"*). **A migration appearing in this PR is a review finding.**

**Not Trust.** No new authz surface: `/api/bookings` is already mounted behind `requireSession`
(`apps/api/src/http/app.ts:84`) and this route inherits it by existing. The scope is the session's,
structurally — see §1.1.

**Not Dependency, not Operational.** Nothing new, nothing scheduled.

A Complex change carries a design note written *before* the code
([`ai/gates/delivery.md`](../../../ai/gates/delivery.md)). This is it.

One tier this note deliberately **keeps down**: `BookingRow` stays **private to the screen**
(§4.4). `task-surfaces.md` makes *"a new component private to one screen"* Medium and *"the props
or events of a shared component"* Complex. SCR-002's components table lists `booking-row`, but a
design-system row and a shared React component are not the same claim, and US-013's admin list
shows a *different* row (it carries the employee's name). Extraction is US-013's call, with two
real consumers in front of it.

---

## 1. The API

### 1.1 `GET /api/bookings` — not `/api/bookings/mine`

```
GET /api/bookings                      <- the default page (§1.2)
GET /api/bookings?before=YYYY-MM-DD    <- one older page (§1.3)
```

**The scope is the mount, never a path word and never a parameter.** `POST /api/bookings` already
means "create a booking, mine"; `GET` on the same collection is its pair, and both take their user
from `req.user.id` threaded by the router, exactly as `GET /availability` does for `myBooking`
(`bookings.router.ts:65-66`). The query schema is `.strict()`, so `?userId=…` is a **`400` at the
route edge before the service is reached** — the same structural guarantee US-007's note argued for
`myBooking` and the reason there is nothing here to forget in a later refactor.

**Why not `/api/bookings/mine`.** It reads safer and is not. A `/mine` segment implies a sibling
`/all` on the same mount — a route whose scope is a *path word* rather than a *guard*. The admin's
cross-employee list (US-013, REQ-011) is a different resource with a different authz surface and
belongs at `GET /api/admin/bookings`, behind the `requireAdmin` mount that
`apps/api/src/modules/admin/admin.router.ts` already exists to hold. That file's own docblock makes
the point: *"Every admin route added later inherits the guard before it is written."* Putting the
employee list at `/api/bookings` keeps that boundary a mount, which is where it can be enforced,
rather than a naming convention, which is where it cannot.

**Why not a second endpoint for history** (`/api/bookings/history`). AC-07's whole content is that
"nothing upcoming" and "never booked" are different states, and §1.4 shows a single response
distinguishes them in one call. Two endpoints means two loading states and two failure modes on a
screen where ST-06 says *"We couldn't load your bookings"* — one sentence that would become a lie
the moment one of two calls succeeded. US-009 §2.1 rejected a second endpoint for the same reason
and this is the stronger case.

### 1.2 The default page: a **date floor**, not a row count

No `before` → every booking of the caller's with `booking_date >= today − 30`, **unbounded above**.
The forward half is AC-01's upcoming list; the backward half is AC-03's thirty days. One window,
one query.

**AC-03's boundary, stated so the QA note's two tests have a number to assert** (story line 99):

```
from = addDays(today, −HISTORY_WINDOW_DAYS)   // today − 30, INCLUSIVE
```

A booking whose `booking_date` **is** `today − 30` is **in** the default page. One dated
`today − 31` is **out**, and reachable only through "load older". The floor is inclusive to mirror
`lastBookableDate` (`libs/contracts/src/booking-window.ts:80-82`), which makes REQ-006's forward
edge inclusive at `today + 30`. Symmetric edges are one rule to remember instead of two.

**`HISTORY_WINDOW_DAYS` is a new constant and must NOT be `BOOKING_WINDOW_DAYS`.** They are both
30 and they are not the same 30: one is REQ-006's booking window (how far ahead an employee may
book), the other is REQ-009's history floor (how far back the list shows), resolved separately by
the PO on 2026-09-07 (SCR-002 conflict row 1). Reusing the contracts constant would couple two
requirements that happen to share a number today, and the coupling would be invisible until
somebody changed one of them. Declare it in `domain/booking-history.ts` (§3).

**Why the default page is not also row-capped.** AC-03 defines the first page by a date, so a row
cap could truncate it and break the criterion. The row count is bounded anyway:
`bookings_one_confirmed_per_user_per_day` (`0003_bookings.sql:67`) allows the caller at most one
**Confirmed** row per day, so confirmed rows on this page are ≤ 31 past + ≤ 31 future = **≤ 62**.
Cancelled rows are the only unbounded term — each cancel-then-rebook (BR-001.2) leaves one behind.
Bounded in practice, unbounded in principle; open item 5.

### 1.3 "Load older": `?before=<date>`, and every page is a whole window of days

```
GET /api/bookings?before=2026-08-19
```

`before` is the `nextBefore` the previous response handed the browser, unmodified. The browser
never computes a cursor and never does date arithmetic. The server:

1. **Anchors.** `D` = the newest `booking_date` of the caller's **strictly before** `before`.
   None → `{ items: [], nextBefore: null }` (the control should not have been there; answering
   emptily is cheaper than a new error).
2. **Pages.** Every booking in the inclusive window `[historyFloor(D), D]` — the same
   30-day rule the default page uses, anchored on `D` instead of `today`.
3. **Probes.** `nextBefore = historyFloor(D)` if anything exists strictly before it, else `null`.

Three indexed reads, all on `bookings_user_id_booking_date_idx`, two of them `limit 1`.

**Why this and not the three obvious alternatives:**

| Shape | Why not |
| --- | --- |
| **`page` & `limit`** | Offset paging over a list the caller mutates: book a desk and every older page shifts by one, so "load older" silently skips a row. And the first page is defined by a *date*, not a count, so "page 2" has no meaning relative to it. REQ-011's 50 is the **admin** list's number over everybody's bookings; the story's own edge case (line 85) says it is *"not automatically this list's number"* |
| **A fixed row count with a `before=<date>` cursor** | The one shape I started with and rejected on a detail that matters: a date can hold **more than one row** (the story's first edge case — a Cancelled and a later Confirmed on the same date). Cutting a page at row *N* splits a day, and then `booking_date < lastEmittedDate` **hides the rest of that day permanently** — against AC-03's *"nothing is hidden, only paged"*. Fixing it needs a composite `(booking_date, created_at)` cursor on the wire, which puts an internal timestamp in a query string to solve a problem the window shape does not have |
| **A fixed 30 days per press, anchored on the previous floor** | Correct, and unusable: an employee whose next-oldest booking is 200 days back presses "Show older" seven times through empty pages. Anchoring on `D` — the newest row that actually exists below the cursor — means **every press returns something**, which is what the story's edge case ("pressed repeatedly back to the employee's first booking") assumes |

**One statement of the whole rule, for the PR description:** *every page is thirty days of history,
inclusive at both ends; the first page's window ends at today and carries the future too, and each
later page's window ends at the newest booking older than the previous page.*

### 1.4 The response

```ts
// libs/contracts/src/bookings.ts

/** `GET /api/bookings`. `.strict()` — an unknown field is rejected, not ignored, matching every
 *  other request schema in this package. There is deliberately no `userId` and no `limit`:
 *  the caller is the session's (§1.1) and the page size is the server's (§1.3). */
export const myBookingsQuerySchema = z.object({ before: officeDateSchema.optional() }).strict();

export const myBookingListItemSchema = z.object({
  id: z.string().uuid(),
  /** Read through the join, so a desk renamed since (BR-001.19, US-018) shows its CURRENT
   *  number — the story's accepted consequence (RISK-012), not a defect. */
  deskNumber: z.string().min(1),
  date: officeDateSchema,
  /** DERIVED, and the reason this is `bookingDisplayStatusSchema` and not the two-value
   *  `bookingStatusSchema` the database stores — §2, ADR-007. */
  status: bookingDisplayStatusSchema,
});

/** Not `.strict()`, per `auth.ts`'s stated rule for every response in this package. */
export const myBookingsResponseSchema = z.object({
  /**
   * The office's today that the server used to derive every `status` below, echoed so the
   * payload is self-describing — the same reason `availabilityResponseSchema.date` is echoed
   * (`availability.ts:56-58`).
   *
   * The browser uses it for exactly ONE thing: AC-02's TODAY emphasis (`item.date === today`).
   * It must NOT use `office.today` from the auth context for that — see §7.2.
   */
  today: officeDateSchema,
  /**
   * ONE flat array, ordered `date` DESC then insertion DESC. Sectioning is the browser's
   * (§4.1), exactly as zone grouping was left to the browser in US-006 (`availability.ts:60-66`).
   *
   * **Wire invariant, guaranteed by the derivation and worth a route test (§8):** an item with
   * `status === 'confirmed'` always has `date >= today`. A confirmed booking whose date has
   * passed is `'completed'` by construction, so the browser never needs a date comparison to
   * decide what belongs in Upcoming.
   */
  items: z.array(myBookingListItemSchema),
  /**
   * AC-03's "load older" control, and its disappearance. The value to send back as `?before=`,
   * or `null` when the caller has nothing older — the story's own edge case.
   *
   * ONE field, not `hasMore` + `nextCursor`: two fields answering one question eventually
   * disagree in front of a user (US-006 §2.6, US-009 §2.3). The browser renders the control iff
   * this is non-null and sends it back unchanged; it never derives a cursor from `items`.
   */
  nextBefore: officeDateSchema.nullable().default(null),
});
```

**What it deliberately does not carry:**

| Not carried | Why |
| --- | --- |
| `deskId` | Nothing on SCR-002 uses it — the row renders a number and US-011 cancels by **booking** id. `bookingSchema` carries one because `POST` creates a desk-date pair; a history row does not. Additive later if a story needs it |
| The stored `status` alongside the derived one | Two fields, one question. And there is no third consumer: "is this cancellable" (BR-001.6, US-011) is exactly `status === 'confirmed'`, because a passed confirmed booking is already `'completed'` |
| `upcoming` / `past` as two arrays | §4.1. Sectioning is presentation, the browser's since US-006, and an older page's response would carry a vestigially empty `upcoming` |
| A total count, or a count per section | Nothing renders one. SCR-002's *"3 upcoming bookings"* announcement is a count of what is on screen, which the browser has |
| Anything about another employee | The two reads (§5) are filtered to `user_id`. No `user_id` column is ever selected — US-006 §2.5's structural guarantee, preserved |

### 1.5 Errors

| Status | `code` | When | Where it is decided |
| --- | --- | --- | --- |
| `400` | `invalid_request` | `before` is not a real calendar date, or an unknown query field | the route edge, via `.strict()` |
| `401` / `403` | unchanged | the mount's chain (`app.ts:84`) | not this route |
| `503` | `service_unavailable` | Supabase unreachable | the service |
| `500` | `internal_error` | a defect | `errorHandler` |

**No new error code, and no `422`.** There is no refusal here: `before` in the future is legal and
simply returns everything, and `refusalFor` has no business on a *read of history* — it refuses
dates for **booking**, and a past date is the whole point of this endpoint. Calling it here would
`422` the only interesting case.

`res.setHeader('Cache-Control', 'private, no-store')`, as `bookings.router.ts:77` already does. More
obviously required here than there: the entire body is one caller's.

**Do not swallow a failed read** into an empty page. `items: []` is a legitimate answer (AC-06), so
a swallowed failure is indistinguishable from "never booked" — the same argument US-009 §2.5 made,
and here it would show a first-time-user empty state to somebody with a year of history. Let it
throw; the browser renders ST-06 and offers **Try again** (AC-09).

---

## 2. How **Completed** reaches the wire

### 2.1 Recommendation: **derived on the server, and only there**

Not client-side. Not both.

**First, a correction to the question as the story poses it.** AC-04 read together with NFR-001
suggests the risk is a wrong *device* clock, and that this argues for the server. It does not,
because the browser does not use the device clock for this either: `office.today` is already in the
auth context, sent by the server (`libs/contracts/src/auth.ts:11-23` — *"the server's answer, not
the device's"*). A client-side derivation from `status`, `date` and `office.today` would satisfy
NFR-001 exactly as well. **The device clock is not the discriminator.** Three other things are:

1. **`office.today` goes stale and this screen is where it shows.** `auth.ts:17-18` states the
   limitation plainly: *"stale only across an office midnight with the tab left open, which US-005's
   edge cases explicitly do not require re-deriving."* US-005 could accept that. **US-010 cannot**,
   because US-012 (REQ-036) refreshes *this list* on window focus without refreshing the session.
   The failure is concrete: Priya leaves the tab open overnight, returns at 09:00, the list
   re-fetches, and yesterday's booking still says **Confirmed** — a freshly-fetched payload rendered
   wrong, which is the hardest kind of bug to believe. A server derivation reads
   `officeToday(nowMs(), officeTimezone)` on that very request and cannot be stale.
2. **BR-001.5 is a business rule, and ADR-002 says where those live.** Its table is explicit — the
   contract carries *shape*, `domain/` carries *rules*, and *"the browser may not evaluate business
   rules."* `bookingDate < office.today` in a `.tsx` file is the browser evaluating BR-001.5.
3. **US-013 needs the same rule.** REQ-013 filters the admin list by Completed. A rule in
   `domain/` is reused; a rule in `MyBookings.tsx` is re-implemented. `modules/bookings/README.md`
   already calls a second implementation *"drift, not defence in depth"*, and US-009 §3 applied it
   to `refusalFor`.

**And explicitly: the browser must not derive it as well, "to be safe."** Belt-and-braces here is
two implementations of one rule that disagree on exactly the night the server is right. The browser
renders what it is given (US-009 §2.2's wording).

### 2.2 A **second schema**, not a widened one

```ts
// libs/contracts/src/bookings.ts — beside the existing two-value enum, NOT replacing it

/** What the DATABASE stores, and what `POST /api/bookings` returns: `booking_status` in
 *  `0003_bookings.sql:16`. Two values, and it stays two. */
export const bookingStatusSchema = z.enum(['confirmed', 'cancelled']);   // unchanged

/**
 * What an employee READS (REQ-028, BR-001.5, US-010/AC-04). Response-only, and never the shape of
 * anything written. `completed` exists on no table and in no enum: it is
 * `confirmed` + a date that has passed in the office's timezone, derived per request in
 * `apps/api/src/domain/booking-history.ts` — ADR-007.
 */
export const bookingDisplayStatusSchema = z.enum(['confirmed', 'completed', 'cancelled']);
export type BookingDisplayStatus = z.infer<typeof bookingDisplayStatusSchema>;
```

**Why not widen `bookingStatusSchema` to three values:**

- It types `bookingSchema`, the `POST /api/bookings` `201` body. A create can never produce
  `completed` — `refusalFor` returns `'past'` before the insert (`bookings.service.ts:159-160`) —
  so widening would make the create response admit a value it can never carry, and would weaken the
  exhaustiveness check the browser gets from the union. `CreatedBooking.status` is even declared as
  the literal `'confirmed'` (`bookings.service.ts:45`).
- A wire enum named `bookingStatus` with three values, while `booking_status` in Postgres has two,
  is a name that lies at exactly the point a reader goes looking. `0003_bookings.sql:14-16` spends
  a comment on *"Two values, not three"*; two schemas keep that visible.

**Why not a separate `displayStatus` field beside a raw `status`.** There is only one status on this
item and nothing needs the stored one (§1.4). `displayStatus` would answer a question nobody asked
and invite "which do I render?" in review.

**One contract test worth having:** assert the two enums are distinct objects and that
`bookingStatusSchema.safeParse('completed')` **fails**. It is a one-liner and it is the guard against
somebody "tidying up" the duplication in six months.

### 2.3 What is deliberately not done in the contract

A `superRefine` on `myBookingsResponseSchema` enforcing the §1.4 invariant (`confirmed ⟹ date >=
today`) is tempting and I recommend **against** it. ADR-002's table puts rules in `domain/`, not in
the package; and a failing refine blanks the whole screen through `api-client.ts:108-127`'s
`unavailable` path over a single status word being wrong. Assert the invariant in the **server's
route test** (§8), where a violation is a red test rather than a user staring at ST-06.

---

## 3. Where the rule lives: `apps/api/src/domain/booking-history.ts`

One new file. `task-surfaces.md`'s domain carve-out makes a new pure rule function **Medium** on its
own — *"it has no contract, no persistence and no trust surface until something calls it, and the
call site is where the tier is set"* — so this file adds nothing to §0's tier; the route and the
contract already set it.

```ts
/**
 * US-010/REQ-009, REQ-028, BR-001.5. Two rules the employee's booking history needs, and both are
 * pure decisions rather than mappings — the test `app-architecture.md` §2 sets and the one US-009
 * §3 applied.
 *
 * Pure: no clock, no config, no I/O (eslint Boundary 2). `today` arrives as an argument, from the
 * service's `officeToday(nowMs(), officeTimezone)`, exactly as `refusalFor` receives it.
 */
import { addDays, type BookingDisplayStatus, type BookingStatus, type OfficeDate } from '@desk-booking/contracts';

/**
 * REQ-009, resolved by the PO on 2026-09-07 (SCR-002 conflict row 1): the list shows the last
 * thirty days, then an explicit control for older.
 *
 * **Deliberately NOT `BOOKING_WINDOW_DAYS`.** That is REQ-006's forward booking window. These are
 * two requirements that happen to share the number 30 today, and coupling them would make a change
 * to one silently change the other (§1.2).
 */
export const HISTORY_WINDOW_DAYS = 30;

/** The INCLUSIVE oldest date a page anchored on `anchor` shows. `anchor` is `today` for the
 *  default page and the page's own newest booking for an older one (§1.3). AC-03's boundary:
 *  a booking dated exactly `historyFloor(today)` is shown; one day older is not. */
export function historyFloor(anchor: OfficeDate): OfficeDate {
  return addDays(anchor, -HISTORY_WINDOW_DAYS);
}

/**
 * BR-001.5, REQ-028, AC-04. The status an employee READS, from the status the database STORES.
 *
 * A Confirmed booking whose date has passed in the office's timezone reads as **Completed**,
 * never as Confirmed. A Cancelled booking stays Cancelled whatever its date — cancelling next
 * Wednesday's desk does not make it "completed", and SCR-002 ST-10 puts that row in Past
 * bookings regardless (§4.1). Nothing is stored and nothing drifts: ADR-007.
 */
export function bookingDisplayStatus(
  stored: BookingStatus,
  date: OfficeDate,
  today: OfficeDate,
): BookingDisplayStatus {
  if (stored === 'confirmed' && date < today) return 'completed';
  return stored;
}
```

Both comparisons are plain string comparison — zero-padded `YYYY-MM-DD` sorts chronologically
(`booking-window.ts:88-92`). No `Date`, no zone, and `addDays` already handles a negative delta
(`booking-window.ts:64-71` — `Date.UTC(…, day + days)`).

The other candidates, measured as US-006 §3.1 and US-009 §3 measured theirs:

| Candidate | Where it goes | Why not `domain/` |
| --- | --- | --- |
| Mapping a row to a wire item | `bookings.service.ts` | A projection over a query result, not a decision |
| Splitting `items` into Upcoming and Past | `MyBookings.tsx` | Presentation, and it is one `filter` on a field the server already decided (§4.1) |
| The page-size / cursor arithmetic | `bookings.service.ts`, using `historyFloor` | Orchestration of two reads. The only *rule* in it is the window, which is here |
| Formatting a date label | `apps/ui/src/lib/format-office-date.ts` — **exists** | Presentation |

---

## 4. The browser side

### 4.1 Sectioning is `status`, **not** a date comparison

This is the paragraph that saves a defect. Reading SCR-002 quickly gives *"Upcoming = dated today
or later"*. That is wrong, and ST-10 says so: after a cancellation *"the row leaves the Upcoming
list and appears in Past bookings as **Cancelled**"* — including when the cancelled booking is
dated **next week**. A DEV who writes `date >= today` puts a cancelled future booking in Upcoming,
with a **Cancel** button on a booking that is already cancelled.

With §2's derivation, the correct rule is one word:

```tsx
const todayRow  = items.find(i => i.status === 'confirmed' && i.date === data.today);     // ST-05
const upcoming  = items.filter(i => i.status === 'confirmed' && i.date > data.today)
                       .reverse();                                                        // ascending
const past      = items.filter(i => i.status !== 'confirmed');                            // stays DESC
```

- **`status === 'confirmed'` ⟺ Upcoming**, because the wire invariant (§1.4) makes a confirmed item's
  date necessarily today-or-later. No date comparison decides the section.
- **`.reverse()` is AC-01's order.** The wire is DESC throughout (one order, matching the index and
  matching `nextBefore`'s "older than" semantics); SCR-002's frame shows Upcoming ascending — TODAY,
  Wed 9, Thu 10 — and Past descending — Fri 4, Thu 3. So exactly one slice is reversed, in the
  browser, and the wire stays monotonic. Pin both orders with a test.
- **`data.today`, from the payload** (§7.2).

### 4.2 The three empty-ish states, which are three and not two

AC-06 and AC-07 are the pair the story's QA note (line 100) says is most likely to collapse. With
`nextBefore` there are **three** cases, and the third is the one nobody plans for:

| Screen state | Condition | Why |
| --- | --- | --- |
| **ST-03** never booked | `items.length === 0 && nextBefore === null` | Both halves. Empty alone is not "never booked" |
| **ST-04** nothing upcoming | `!items.some(i => i.status === 'confirmed')` and (`items.length > 0 || nextBefore !== null`) | The Friday-afternoon state |
| **ST-04**, past section empty | `items.length === 0 && nextBefore !== null` | **An employee whose only bookings are older than 30 days.** Falls under ST-04, but SCR-002 draws no frame for a Past section whose only content is the "Show older" control — open item 2 |

**AC-07 needs no second call, and the client must not make one.** The default page already carries
both halves of the answer, which is the whole reason §1.2 leaves it unbounded above.

### 4.3 The fetch seam

Follow `book-a-desk`'s split exactly — it is this codebase's only precedent and it works:

- `fetch-my-bookings.ts` — the real call, adapting `ApiResult` (mirrors `fetch-availability.ts`).
- `use-my-bookings.ts` — the screen's state, **including accumulation**: the default page plus every
  older page appended in order, and a separate `loadingOlder` flag so pressing "Show older" does not
  re-render the whole list as ST-02 (AC-08 is about the *initial* load).
- `retry()` (AC-09) resets to the default page and drops accumulated pages. Anything else re-plays a
  cursor chain against data that may have changed.

Latest-wins (`use-availability.ts`'s request-id counter) is **not** needed here: there is no
rapidly-changing input. Do not copy it in; copy the failure-path discipline instead — a superseded
request's own `abort()` resolves as a failure through `api-client`'s catch, so guard the error path
with the same condition as the success path.

US-012 (REQ-036) will refresh this on focus. Not this story — but keep the state shape such that
"re-fetch page 1 and drop the rest" is expressible, because that is the only refresh semantics that
cannot show a stale older page above a fresh newer one.

### 4.4 `StatusChip`: extend the shared component, behind an **optional** discriminator

`StatusChip` today is `status: 'available' | 'taken' | 'selected'`, with
`LABEL: Record<DeskStatus, string>` exported for `DeskRow`'s composed `aria-label`
(`StatusChip.tsx:18-26`). SCR-002's components table wants one `status-chip` showing
Confirmed / Completed / Cancelled, and the designer handoff records that the Figma component
*"`Status chip` gained the three booking statuses"* — **one component, more variants**, which is the
answer the design system has already given.

```ts
export type DeskStatus = 'available' | 'taken' | 'selected';                  // unchanged
export type BookingLifecycleStatus = 'confirmed' | 'completed' | 'cancelled'; // new

export type StatusChipProps =
  | { kind?: 'desk';    status: DeskStatus }
  | { kind:  'booking'; status: BookingLifecycleStatus };

export const LABEL: Record<DeskStatus, string> = { … };                       // unchanged
export const BOOKING_LABEL: Record<BookingLifecycleStatus, string> =
  { confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };
```

- **`kind` optional, defaulting to `'desk'`** — the shape US-009 §4.4 chose for `EmptyState.actions`,
  for the same reason: every existing call site compiles untouched, so the Complex surface is
  **purely additive**, and `DeskRow`'s `LABEL` stays `Record<DeskStatus, string>` and cannot be
  handed `'cancelled'`. TypeScript narrows this correctly on `props.kind === 'booking'`.
- **Not a widened flat six-value union.** `LABEL` would become a six-entry map, three of whose
  entries are meaningless to `DeskRow`, and nothing would stop a desk row rendering *Completed*.
- **Not a sibling `BookingStatusChip`.** A new file under `components/` is the same Complex surface
  with none of the benefit, and it duplicates NFR-008's icon-and-word discipline in a second place
  where it can drift. The CSS, the tokens, the pill geometry and the accessible-name convention are
  identical.

**CSS.** Three classes in `status-chip.css`, on tokens that already exist
(`inception/design/tokens.css:240-248`, both themes at `:420-427`) — no token change, so **no
protected-path diff**:

```css
.status-chip--confirmed { background: var(--c-state-confirmed-fill); border-color: var(--c-state-confirmed-border); color: var(--c-state-confirmed-ink); }
.status-chip--completed { background: var(--c-state-completed-fill); border-color: var(--c-state-completed-border); color: var(--c-state-completed-ink); }
.status-chip--cancelled { background: var(--c-state-cancelled-fill); border-color: var(--c-state-cancelled-border); color: var(--c-state-cancelled-ink); }
```

Note `--c-state-completed-border` is `transparent` with a comment saying so
(`tokens.css:244`) — the same deliberate "absence of an edge is the cue" treatment `Taken` has.
That is a reason the icons must be right, not a reason to add a border.

**Icons** (SCR-002's structural-decisions row: *"check-circle / clock / close"*):

- **Confirmed** → the existing inline `CheckCircleIcon` in this very file. Reuse it.
- **Completed** → `apps/ui/src/assets/icon-clock.svg` — **already exists**, already imported by
  `NavIcon.tsx:12` and `DeskRow.tsx:19`. Load it `?raw`, as `PersonIcon` does.
- **Cancelled** → **no close/X asset exists**. One must be added from the Figma `Icon / close`.
  Open item 7 — a small thing that is nobody's job until it is named.

### 4.5 The page header and AC-10

SCR-002's components table names `page-header`. **Do not build a shared one in this story.** No such
component exists; `BookADesk.tsx:203` renders its own —
`<p className="book-a-desk__timezone">Office time ({office.timezone})</p>` — and extracting it now
would be a new shared component (Complex) that changes `BookADesk`'s markup under a story that is
not about it, with two consumers. Render the same line screen-locally in `my-bookings.css`. When a
third screen needs it, that story extracts it with three real consumers in front of it.

AC-10's timezone string is **`office.timezone` from the auth context**, not from the payload. It is
a configuration value that never goes stale, unlike `office.today` (§7.2).

### 4.6 Announcements and keyboard

- **One announcement, not a stream** (AC-08). One `role="status"` node whose text is `"Loading your
  bookings"` while loading and `"3 upcoming bookings"` when ready — a single live node whose *content*
  changes, which is US-006 §4.3's design and the reason `AvailabilityCount` works. Two live regions
  produce two readings of one event.
- **Skeletons hidden from assistive technology** (`aria-hidden`), at real row height, per SCR-002 and
  AC-08. `SkeletonRow` exists (`apps/ui/src/components/skeleton-row/`) and needs no prop change.
- **"Show older"** is an ordinary `<button>` after the past list in DOM order. Accessible name in the
  long form (*"Show bookings older than 19 August"*) following `AvailabilityCount`'s split of short
  visible label / long accessible name; 48px tall (SCR-002's own "every control on this screen is
  48px" decision).
- **The chip's word is the accessible signal** — `BOOKING_LABEL` is exported precisely so a composed
  `aria-label` on the row and the visible chip never say different things, the reason `LABEL` was
  exported in US-008.

### 4.7 The frames are the visual authority, not this note

The hi-fi frames exist at 360/768/1280 for all ten states in *Employee Desk Booking — Design System
& Mockups* (Figma `xjFVgBbMrJUl7Ys3EX3Cbn`), named `HF / SCR-002 · My bookings / ST-## <state> ·
<width>`, with `Booking row`, `Today booking`, `Accordion header` and `Skeleton booking row` built
for this screen. **DEV must open them before building any of it** and cite node ids the way
`BookADesk.tsx:209-210` does.

This is not boilerplate. SCR-002's own layout section carries a correction dated 2026-09-08 — the
spec used to say rows become full-width cards at 360px and *"They do not"* — and US-008 found the
ASCII wireframe and the hi-fi frame disagreeing about wording, with the frame winning. **I did not
open the file.** Open item 4.

---

## 5. The repository

Two new methods on `AvailabilityRepository`. Both read `bookings`, the table this module **owns**,
and embed `desks(desk_number)` with an explicit column — the join `findMyConfirmedBooking`
(`bookings.repository.ts:131-151`) already established. **ADR-004 is applied and not widened:** no
new table, no new cross-module read, one more use of a read this module already performs.

```ts
/** US-010/AC-01, AC-03, AC-04. The caller's own bookings in an INCLUSIVE date window, newest
 *  first. `to === undefined` means unbounded above — the default page carries future bookings
 *  (§1.2). ALL statuses: a Cancelled row is history and SCR-002 renders it (ST-10).
 *
 *  Filtered to `user_id`, never a parameter. `desk_number` travels through the embed so a desk
 *  renamed since shows its CURRENT number (BR-001.19, RISK-012 — the story's accepted consequence). */
listMyBookingsInWindow(
  userId: string, from: OfficeDate, to?: OfficeDate,
): Promise<MyBookingRow[]>;

/** US-010/AC-03. The single newest booking of the caller's STRICTLY before a date, or undefined.
 *  Two uses, one shape (§1.3): the "is there anything older" probe that decides whether the
 *  Show-older control exists at all, and the anchor for the next page's window. `booking_date`
 *  ONLY — nothing else is needed and nothing else is read. */
findMyNewestBookingBefore(
  userId: string, before: OfficeDate,
): Promise<{ booking_date: OfficeDate } | undefined>;
```

```ts
export interface MyBookingRow {
  id: string;
  booking_date: OfficeDate;
  status: BookingStatus;     // STORED. The derivation happens in the service (§3).
  desk_number: string;
}
```

Implementation notes, each of which is a place this goes wrong:

```ts
async listMyBookingsInWindow(userId, from, to) {
  let query = supabase()
    .from('bookings')
    .select('id, booking_date, status, desks(desk_number)')
    .eq('user_id', userId)
    .gte('booking_date', from)
    .order('booking_date', { ascending: false })
    .order('created_at',  { ascending: false });
  if (to !== undefined) query = query.lte('booking_date', to);
  …
}
```

- **`.order('created_at', …)` is the tiebreak and it is load-bearing**, not belt-and-braces —
  US-008's design note §5 established it: cancel-then-rebook (BR-001.2) leaves two rows sharing one
  `booking_date` for one user (the story's first edge case), and only `created_at desc` gives a
  stable order rather than whichever row Postgres hands back first. An unstable order here means
  two rows swapping places between the default page and a re-fetch.
- **A plain embed, never `desks!inner`.** `desk_id` is `not null references desks (id) on delete
  restrict` (`0003_bookings.sql:27`), so every booking has a desk and the plain embed is total.
  US-006 §2.8 rejected `!inner` because it silently inverts the read's meaning; nothing here makes
  it safer.
- **The `unknown` cast is required and the reason is already written down**
  (`bookings.repository.ts:142-149`): supabase-js types a relationship embed as an *array* with no
  generated `Database` type, while PostgREST returns a single object for a many-to-one. Copy the
  comment, not just the cast.
- **Do NOT copy `row.desks?.desk_number ?? ''`.** `findMyConfirmedBooking:150` has it, and here it
  would manufacture a value that `deskNumber: z.string().min(1)` rejects — turning an impossible
  missing join into a browser parse failure and a blank ST-06, instead of a loud server error. If
  the embed is missing, **throw**. (The existing line is unreachable for the same FK reason; worth
  a one-line nit on the PR, not a change in this story.)
- **No `status` filter anywhere.** AC-04 and AC-05 both need Cancelled rows.
- Both methods are served by `bookings_user_id_booking_date_idx (user_id, booking_date desc)`,
  `0003_bookings.sql:77`, whose comment already names REQ-009. **No migration.**

The service then, for the default page:

```ts
const today = officeToday(nowMs(), officeTimezone);
const from  = before ? historyFloor(anchorDate) : historyFloor(today);
const [rows, older] = await Promise.all([
  repo.listMyBookingsInWindow(userId, from, to),
  repo.findMyNewestBookingBefore(userId, from),
]);
return {
  today,
  items: rows.map(r => ({
    id: r.id,
    deskNumber: r.desk_number,
    date: r.booking_date,
    status: bookingDisplayStatus(r.status, r.booking_date, today),   // §3 — the one rule
  })),
  nextBefore: older ? from : null,
};
```

`nextBefore` is **`from`, not the last item's date** — the floor is what the next page must go
strictly below, and the two differ whenever the oldest row on the page is not on the floor exactly.
Getting this wrong skips every booking between the oldest visible row and the floor.

**Wiring: nothing new.** `createBookingsService` already receives `nowMs` and `officeTimezone`
(`bookings.service.ts:24-30`), and `buildApp` already exposes `options.availability` as the test
seam (`composition.ts:56`). No new module, no new mount, no new dependency, no `composition.ts`
diff beyond nothing at all.

---

## 6. ADR judgement — **one**, for the derivation

The test the last six notes applied: *does the decision bind work beyond the story that made it,
with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **Completed is derived in `domain/` at read time; `bookings_with_status` is retired** | **ADR-007.** It passes every part of the test. It binds US-011, US-013 (REQ-013 filters by Completed), US-014 and the notification composer. Its rejected alternative is not hypothetical — it is **written into an approved Gate-1 document**: `db-design.md:153` says the derivation is *"exposed as a view, `bookings_with_status`, that every read goes through"*. A US-013 author reading Gate 1 will go looking for that view. US-006's note flagged it as not expressible and routed the question here (its open item 5, owner *"the story that renders a booking's status"*), and ADR-004 already cites it in its own rejected-alternatives table. This needs a durable, findable record that supersedes a documented mechanism, which is exactly what the charter means by *"never contradict silently — supersede explicitly"* |
| **The paging shape (§1.2, §1.3)** | **No ADR.** It looked like one — it decides that this codebase has *two* paging idioms — until you notice **that fact is already approved elsewhere**: REQ-011 sets the admin list at 50 and `db-design.md:346-347` already lists the two lists as separate index consumers, one *"30-day window and load older"*, one *"paged by 50"*. An ADR would be a second copy of a decision REQ-011 already made. It governs one endpoint's query string, is reversible, and has no consumer outside this endpoint. US-009 §5's phrasing applies verbatim: *"If it is ever revisited, the revisiting story will be looking straight at the code that implements it."* Its home is this note, `decisions.md`, and the PR description |
| **`GET /api/bookings` rather than `/mine` (§1.1)** | **No ADR.** It applies ADR-001's and the existing mount structure's boundary as written; `admin.router.ts`'s own docblock already states the rule this follows |
| **A second status enum rather than a widened one (§2.2)** | **No ADR** — it is a *consequence* of ADR-007, recorded there, not a separate decision |
| **`StatusChip` gains variants rather than a sibling (§4.4)** | **No ADR.** The design system already decided it; this note is agreeing with an approved handoff |
| **A new `domain/` module (§3)** | **No ADR.** It applies `app-architecture.md` §2 as written, and §3's table says why the other candidates stayed out |

**No accepted ADR is bent.** ADR-001 is applied — the read is server-mediated and the browser
never touches Supabase. ADR-002 is applied — one shared schema, request `.strict()`, response not,
and §2.3 keeps the *rule* out of the package on ADR-002's own stated line. ADR-004 is applied and
**not widened** (§5). ADR-007 supersedes no ADR; it supersedes a paragraph of a Gate-1 design
document, which the charter says is history once the code exists.

**Numbering: ADR-007, not ADR-005.** `knowledge/decisions/` holds 001–004, but `ADR-005` and
`ADR-006` are already referenced by name and title in six places under `ai/`
(`AI-DLC.md:65,101,126`, `gates/delivery.md:37`, `integrations.md:83,91`, `roles/qa.md:35`) as
*multi-tool-persona-surfaces* and *e2e-testing-layer*. **Neither file exists** — six dangling links,
open item 6. Taking 005 would silently re-point them at this document.

---

## 7. What a DEV gets wrong without this note

Four, in the order they will bite. The first two produce green tests.

### 7.1 `date >= today` for the Upcoming section

§4.1. It puts a **cancelled future booking** in Upcoming, with a Cancel control on a booking that is
already cancelled — against ST-10, which says an ordinary cancellation moves the row to Past
*whatever its date*. Every happy-path test passes, because the fixture everyone writes has no
future-dated cancelled row. **Use `status === 'confirmed'`**, and put a future-dated Cancelled row in
the fixture.

### 7.2 Deriving anything from `office.today` in the auth context

§2.1. It compiles, it is right all day, and it is wrong for the first employee who left the tab open
overnight — precisely after US-012's focus refresh hands the screen fresh data. **The screen must use
`data.today` from the payload**, which is the same today the statuses were derived from, per
response. `office.timezone` is fine and is what AC-10's header line uses; `office.today` has no
business on this screen at all. Worth a lint-level habit, not just a test.

### 7.3 `items: []` read as "never booked"

§4.2. An employee whose bookings are all older than 30 days gets an empty default page with a
**non-null** `nextBefore`. Showing them *"You haven't booked a desk yet"* is a lie to the person who
has used the tool longest. **ST-03 needs both halves: `items.length === 0 && nextBefore === null`.**

### 7.4 `nextBefore` taken from the last item

§5. The next page must go strictly below the **floor**, not below the oldest row that happened to
exist. Taking it from `items[items.length - 1].date` skips every booking between the two. The server
computes it; the browser echoes it back unchanged and never constructs one.

**And one that is only a smell:** `refusalFor` has no place in this endpoint (§1.5). It refuses
dates for *booking*; a past date is this endpoint's subject matter.

---

## 8. File placement

**New**

```
apps/api/src/domain/booking-history.ts (+ .spec.ts)        <- §3. The rule and the window
knowledge/decisions/ADR-007-derived-booking-status.md      <- §6
inception/specs/US-010-view-my-bookings/                   <- the spec package (DEV's)

apps/ui/src/screens/my-bookings/BookingRow.tsx (+ .spec.tsx)   screen-private (§0)
apps/ui/src/screens/my-bookings/use-my-bookings.ts (+ .spec.ts)
apps/ui/src/screens/my-bookings/fetch-my-bookings.ts (+ .spec.ts)
apps/ui/src/screens/my-bookings/copy.ts (+ .spec.ts)
apps/ui/src/screens/my-bookings/my-bookings.css
apps/ui/src/assets/icon-close.svg                          <- §4.4, open item 7
```

**Modified**

```
libs/contracts/src/bookings.ts (+ .spec.ts)     the query, item, envelope, and
                                                bookingDisplayStatusSchema (§1.4, §2.2)  <- protected
libs/contracts/src/index.ts                     the new exports

apps/api/src/modules/bookings/bookings.repository.ts       + the two reads (§5)
apps/api/src/modules/bookings/bookings.service.ts          + listMyBookings (§5)
apps/api/src/modules/bookings/bookings.router.ts           + GET / (§1.1)
apps/api/src/modules/bookings/bookings.repository.spec.ts  select lists, ordering, predicates
apps/api/src/modules/bookings/bookings.service.spec.ts     the derivation and the cursor arithmetic
apps/api/src/modules/bookings/bookings.routes.spec.ts      the route over a stub repository
apps/api/src/modules/bookings/bookings.fixtures.ts         QA's dataset (story line 101) + §7.1's row
apps/api/src/modules/bookings/README.md                    what US-010 added, and that it adds NO
                                                           new cross-table read (§5)

apps/ui/src/components/status-chip/StatusChip.tsx (+ .spec.tsx, .css)   §4.4
                                                        ^ shared component props: a Complex surface
apps/ui/src/screens/my-bookings/MyBookings.tsx (+ .spec.tsx)   the list, replacing the stub

knowledge/traceability/manifest.json    US-010 tests[]
inception/specs/index.md                the US-010 row
```

**Not modified, and worth saying so in the PR:**

- **`supabase/migrations/**`** — §0. `bookings_user_id_booking_date_idx` exists and its comment
  already names REQ-009. **A migration in this PR is a finding.** In particular, ADR-007 means
  `bookings_with_status` is *never* created.
- **`inception/design/tokens.css`** — §4.4. All three booking-state token families exist in both
  themes. A protected path with no diff.
- **`libs/contracts/src/booking-window.ts`** — `addDays` is used as-is; `BOOKING_WINDOW_DAYS` is
  deliberately **not** reused (§1.2). No new export.
- **`libs/contracts/src/error.ts`** — §1.5. No new code.
- **`apps/api/src/composition.ts`, `apps/api/src/http/app.ts`** — §5. The mount and both injected
  dependencies already exist.
- **`apps/ui/src/lib/api-client.ts`** — one more `request(path, schema)` call. No new seam.
- **`apps/ui/src/components/**` other than `status-chip/`** — `SkeletonRow`, `Alert`, `EmptyState`,
  `Button`, `Toast` are all used as they are. No prop changes, so no further Complex surface.
- **`inception/design/screens/SCR-002-my-bookings.md`** and **`inception/architecture/db-design.md`**
  — both approved. `db-design.md:143-164`'s view paragraph becomes history when ADR-007 lands; the
  Gate-1 document is not edited (charter: it is a starting shape, not a standing contract). The
  ADR is where the supersession is recorded.

---

## 9. Test placement

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `MyBookings.spec.tsx` — a payload with two future confirmed rows and two past rows renders the future ones **first and ascending**, the past ones after and descending | component |
| AC-01 | `bookings.routes.spec.ts` — `items` comes back `booking_date` DESC, and **no item has `status: 'confirmed'` with `date < today`** (§1.4's invariant) | API |
| AC-02 | `MyBookings.spec.tsx` — an item whose `date === data.today` renders under **TODAY**, with the emphasis cue asserted as **text or an attribute, never a class name or a colour** (NFR-008) | component |
| **AC-03** | `booking-history.spec.ts` — `historyFloor('2026-09-18') === '2026-08-19'`, written as a **literal**, never computed by calling the function under test | unit — the boundary |
| **AC-03** | `bookings.routes.spec.ts` — a booking dated exactly `today − 30` is in the default page; one dated `today − 31` is **not**, and `nextBefore` is non-null because of it (the QA note's two fixtures, story line 99) | API |
| AC-03 | `bookings.routes.spec.ts` — `?before=<nextBefore>` returns the older rows, and the response whose page reaches the caller's first booking has **`nextBefore: null`** (the story's edge case) | API |
| AC-03 | `MyBookings.spec.tsx` — the control is absent when `nextBefore` is null; pressing it requests `?before=<that value>` **unchanged** and **appends** rather than replacing | component |
| **AC-04** | `booking-history.spec.ts` — `confirmed` + yesterday → `completed`; `confirmed` + **today** → `confirmed` (the off-by-one: today has *not* passed, and BR-001.6 still allows cancelling it); `cancelled` + yesterday → `cancelled`; `cancelled` + **next week** → `cancelled` (§4.1's row) | unit — **the row that proves AC-04** |
| AC-04 | `bookings.routes.spec.ts` — over a `fixedClock`, a stored `confirmed` row dated before the fixed today comes back as `completed`. **The clock is injected, per the story's QA note** — `buildApp({ nowMs })` already supports it | API |
| AC-05 | `StatusChip.spec.tsx` — each of the three booking variants renders its **word** and an `aria-hidden` icon; asserted on text, not on a class | component |
| AC-06 | `MyBookings.spec.tsx` — `{ items: [], nextBefore: null }` renders ST-03's copy and the **Book a desk** action, with no Upcoming or Past heading | component |
| **AC-07** | `MyBookings.spec.tsx` — past rows with no confirmed row renders **ST-04's** copy, and `copy.spec.ts` asserts ST-03's and ST-04's messages **differ** (the story's QA note, line 100) | component + unit |
| **AC-07** | `MyBookings.spec.tsx` — `{ items: [], nextBefore: '2026-08-19' }` renders **ST-04, not ST-03** (§7.3) | component |
| AC-08 | `MyBookings.spec.tsx` — while loading, skeleton rows are present and `aria-hidden`, and exactly **one** live region announces once | component |
| AC-09 | `MyBookings.spec.tsx` — a failed fetch renders the alert with **Try again**, hides **Book a desk** (SCR-002 ST-06), and the shell stays rendered | component |
| AC-10 | `MyBookings.spec.tsx` — the header states the timezone **once**, and every date label is rendered through `format-office-date.ts` with the test's device zone set to something other than `Asia/Kolkata` | component |
| — | `bookings.repository.spec.ts` — both methods are filtered to `user_id`, select **no** `user_id` column, order `booking_date desc, created_at desc`, and use a **plain** embed | unit (recording fake) |
| — | `bookings.spec.ts` (contract) — `bookingStatusSchema.safeParse('completed')` **fails**; a response with no `nextBefore` key parses to `null` (§2.2) | unit (contract) |

**Five things that produce a green test proving nothing:**

1. **Do not prove AC-04 through the route test alone.** A route test over a stub repository asserts
   the plumbing. `bookingDisplayStatus` is where BR-001.5 lives and where an off-by-one on *today* is
   visible.
2. **Do not compute expected dates by calling `historyFloor`.** Literals, as US-005's note required
   for its date boundaries and US-009 §8 repeated.
3. **Do not let the ST-03 fixture double as the ST-04 fixture.** AC-06 vs AC-07 is the pair the
   story says will collapse; one shared fixture makes the difference untestable.
4. **Do not assert AC-02's emphasis or AC-05's status on a CSS class.** NFR-008 is about what a
   person perceives; a class name is neither a word nor an icon, and asserting one passes on a
   stylesheet that renders nothing.
5. **Do not use the real clock anywhere.** The story's QA note asks for an injectable clock so a
   booking can pass its date inside a test run. `fixedClock` (`apps/api/src/infra/clock/`) and
   `buildApp({ nowMs })` already exist; a test that computes "yesterday" from `Date.now()` is a test
   that fails once a year at an office midnight.

---

## 10. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§1 and §2 — the two shape verdicts themselves.** `GET /api/bookings` with a `before` cursor and a 30-day window per page; Completed derived server-side onto a response-only enum. Two sentences at D1 settle both | Joy Joshua, **at D1** | the story's whole shape |
| 2 | **§4.2 — the third empty case has no frame.** An employee whose only bookings are older than 30 days gets ST-04 with a Past section containing nothing but the "Show older" control. SCR-002 does not draw it. I recommend **against** a fallback that loads the most recent N bookings whatever their age — it makes the first page's meaning conditional and AC-03's boundary untestable — but it needs a designer's eye on what that state looks like | Designer / PO | ST-04's build |
| 3 | **§4.6 — the "Show older" control's copy is not approved.** SCR-002 conflict row 1 says *"Show more"*; the story says *"an explicit control"*. Confirm the wording, and the Past accordion's own label | PO/BA (`/ba`), before the UI lands | `copy.spec.ts` |
| 4 | **§4.7 — the `HF / SCR-002` frames are the visual authority and I did not open them.** DEV must, and must cite node ids. SCR-002's own layout section carries a correction from the frames, and US-008 found a wireframe and a frame disagreeing | DEV, in this PR | the whole screen's build |
| 5 | **§1.2 — the per-page row bound is arithmetic, not a measurement.** Confirmed rows are capped at one per user per day by `bookings_one_confirmed_per_user_per_day`; **cancelled rows are not capped by anything.** A pathological cancel-then-rebook history could make one page large. Nobody has run `EXPLAIN` and at this volume nobody needs to — but this is the paragraph to re-read if a page ever feels slow | Manager → whichever story first sees it | nothing |
| 6 | **§6 — six dangling ADR links.** `ai/AI-DLC.md:65,101,126`, `ai/gates/delivery.md:37`, `ai/integrations.md:83,91` and `ai/roles/qa.md:35` all link to `knowledge/decisions/ADR-005-multi-tool-persona-surfaces.md` and `ADR-006-e2e-testing-layer.md`, **neither of which exists**. Unrelated to this story; it is why this note's ADR is numbered 007 | Manager / DevOps | nothing (but numbering) |
| 7 | **§4.4 — there is no close/X icon asset.** `icon-clock.svg` exists for Completed; Cancelled needs one exported from Figma `Icon / close` | DEV, in this PR | the Cancelled chip |
| 8 | **§4.3 — US-012's refresh semantics over accumulated older pages.** Not this story, but the state shape decided here constrains it. Flagged so US-012 does not discover it | DEV, at US-012 | nothing |

---

**Four limits on what I did**, stated so you do not over-trust it:

- **I ran nothing.** No tests, no lint, no query, no `EXPLAIN`. Every claim is from reading the
  files named — `bookings.router.ts`, `bookings.service.ts`, `bookings.repository.ts`,
  `0003_bookings.sql`, `bookings.ts`, `availability.ts`, `auth.ts`, `booking-window.ts` (both
  copies), `app.ts`, `composition.ts`, `admin.router.ts`, `StatusChip.tsx`, `status-chip.css`,
  `MyBookings.tsx`, `AllBookings.tsx`, `api-client.ts`, `use-availability.ts`,
  `format-office-date.ts`, `tokens.css`, `db-design.md`, `task-surfaces.md`, SCR-002, and US-006's
  and US-009's design notes — at `843b36a` on `main`.
- **I did not open the Figma file** (open item 4). The frames are DEV's verification, not mine.
- **I did not decide the admin list's shape.** §6 says why: REQ-011 and `db-design.md:347` already
  did, and this note deliberately does not pre-empt US-013.
- **I wrote no code and landed nothing.** This note is advisory; `decisions.md`,
  `impact-analysis.md` and `implementation-plan.md` in this package are DEV's, and the GitHub
  review on the story PR is the authority.

**Single next action:** answer open item 1 — two sentences — and open item 2 if you already know
your mind. Then DEV writes the spec package and presents Gate D1, with ADR-007 in the same PR. The
Architect's review of the resulting diff comes after.

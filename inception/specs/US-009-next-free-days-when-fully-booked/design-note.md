# US-009 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-009 — Be offered the next free days when everything is taken](../../stories/user-stories/US-009-next-free-days-when-fully-booked.md) |
| **Screen**   | [SCR-003](../../design/screens/SCR-003-book-a-desk.md) **ST-04** — the fully-booked empty state. ST-05 is US-006's and is not touched; ST-10 still outranks both |
| **Tier**     | Complex — a changed response shape on a protected path, plus a shared component's props (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md) — **no new ADR recommended** (§5) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is argued
before the code, not in a review thread. `decisions.md` in this package stays DEV's.

This story hands `/architect` exactly one question, and it has been waiting since 2026-09-07:
SCR-003 conflict row 3 says *"Feasibility is now an `/architect` question, not a design one"*, and
REQ-035 carries a pre-approved fallback — *"Try another day"*, no suggestions, no other state
change — precisely because the lookahead might be refused.

**The verdict: build it. The lookahead is not expensive, and the reason is not an estimate — it is
two queries that the existing availability call already proves are cheap, run only on the one
screen state where nobody is looking at a desk list anyway.** The fallback stays on the shelf. §1
is the whole argument; §6's off-ramp says what the fallback would reduce the story to if you
disagree at D1.

---

## 0. The tiering

**Complex**, on two of the five surfaces in [`task-classification.md`](../../../ai/context/task-classification.md):

| Surface | What it is here |
| --- | --- |
| **Contract** | `availabilityResponseSchema` gains a field (`libs/contracts/src/availability.ts`, a protected path). Additive and non-breaking (§2.1), but a changed response shape is Complex by the rule as written |
| **Contract (UI)** | `EmptyState`'s public props gain `actions` — a **shared** component, the same reason US-006 marked `components/empty-state/` Complex in its §8 |

**Not** Persistence: no migration, no new column, no new index. **Not** Trust: no new authz surface,
and the lookahead reads no column US-006 did not already establish as safe (§2.4). **Not**
Dependency or Operational: nothing new, nothing scheduled.

One more reason the tier matters: a Complex change carries a design note written *before* the code
([`ai/gates/delivery.md`](../../../ai/gates/delivery.md)). This is it.

---

## 1. The feasibility verdict: **build the lookahead**

### 1.1 What "expensive" would have to mean

REQ-035's escape hatch is conditional — *if the multi-day availability lookahead proves
expensive*. So the honest thing is to say what would have made it expensive, then measure against
the merged code rather than against a feeling:

1. **A query whose cost grows with the window** — a per-date round trip, 22 of them for a full
   month.
2. **A new index, a new table, or a materialised count** — persistence surface, migration, drift.
3. **A cost paid on every availability request**, including the ~99% that are not fully booked.
4. **Rules re-implemented in a second place** — the weekend rule, the 30-day window, BR-001.1 —
   so that AC-06 becomes a correctness risk in two codebases at once.

A shape that avoided all four would not be expensive. §1.2 is that shape.

### 1.2 The measured cost: **two extra queries, and no extra `desks` read at all**

`getAvailability` today issues **four** reads in one `Promise.all`
(`bookings.service.ts:71-76`): active desks, confirmed desk ids for the date, the caller's own
booking, the caller's last-booked desk. The lookahead adds two more, and only in the fully-booked
branch:

| # | Read | Rows it can return | Index that serves it |
| --- | --- | --- | --- |
| 5 | `booking_date, desk_id` from `bookings` where `booking_date` between `selected+1` and `today+30` and `status = 'confirmed'` | ≤ desks × working days remaining in the window = **≤ 100 × 22 ≈ 2 200** two-column rows, and in a real office far fewer | `bookings_booking_date_status_idx (booking_date desc, status)` — `0003_bookings.sql:78`, already there, already the index that serves US-006's single-date read |
| 6 | `booking_date` from `bookings` where `user_id = <caller>` and the same range and `status = 'confirmed'` | **≤ 22 rows** — BR-001.1 allows the caller at most one confirmed booking per day | `bookings_user_id_booking_date_idx (user_id, booking_date desc)` — `0003_bookings.sql:77` |

**The `desks` table is not read again.** The active desk list is already in hand from read #1, and
"does date *d* have a free desk?" is `activeDesks.some(desk => !takenOn(d).has(desk.id))` — a set
intersection over ≤100 ids, in memory, in the service. That is the single fact that decides this
question: the expensive-looking half of a multi-date availability lookahead (the inventory) is
**date-independent**, so it is fetched once no matter how many days are examined.

A note for whoever is tempted by the shorter version: because
`bookings_one_confirmed_per_desk_per_day` permits at most one confirmed row per desk per day, a
plain `count(*) group by booking_date` equals the number of taken desks, and comparing it to
`activeDesks.length` looks equivalent. **It is not.** A confirmed booking can reference a desk that
was deactivated afterwards, and then the count exceeds the active desks actually taken, and a
genuinely free day reads as full. Intersect the ids; do not count the rows.

### 1.3 The shapes that were rejected

| Shape | Why not |
| --- | --- |
| **N single-date requests from the browser** (`GET /availability?date=` in a loop until two free days are found) | The story names this as the thing to avoid, and it is right. N HTTP round trips and 4N queries — and worse, the **browser** would have to decide which dates are candidates, which means re-implementing BR-001.3 (weekends), V-02 (the 30-day edge) and BR-001.1 (skip my own booked dates) client-side. AC-06 is the criterion most likely to go quietly wrong — the story's own QA note says so — and putting it in a second implementation is how it does |
| **A parallel fan-out of N single-date reads server-side** | Cheaper than the above and still wrong-shaped: 2N queries where 2 will do, and N is unbounded in exactly the AC-05 case (a month with nothing free) |
| **A `date, free_count` view or a materialised per-date count** | Persistence surface, a migration, and a derived number that can drift from the desks table. US-006 §1.3 already found that a "simple" view here is not simple. Rejected for the same reason the wire contract carries no `freeCount` (US-006 §2.4): a second source of truth for something derivable in memory over ≤100 rows |
| **A PostgREST embed** (`desks?select=…,bookings(…)` over a range) | US-006 §2.8 rejected the embed for the single-date read because `!inner` silently inverts its meaning. Nothing about a date range makes that subtlety safer |

### 1.4 When the cost is paid, and why that is the crux

Reads #5 and #6 run **only when the selected date is fully booked** — `desks.length > 0` and no
desk `available`. Every other request pays nothing: the branch is not taken and the field comes
back `[]`.

That is what makes this affordable rather than merely small. The state that pays for the lookahead
is the one state where the screen has **nothing else to render** — no zone list, no desk rows, no
confirm bar. Spending two indexed queries on a bounded range to turn a dead end into a next step is
the best trade this screen has on offer.

**Verdict: the lookahead is not expensive. REQ-035's fallback condition is not met, and I do not
recommend taking it.**

---

## 2. The contract

### 2.1 An additive field on the existing response — **not** a second endpoint

```
GET /api/bookings/availability?date=YYYY-MM-DD     <- unchanged route, unchanged query
```

The query schema stays `.strict()` and gains nothing. The response gains one field.

**Why not `GET /api/bookings/availability/next-free?after=&limit=2`.** It is the shape the story's
own API-impacts line hints at, and it costs more for less:

- A second round trip, issued after the first resolves — so ST-04 renders, *then* suggestions
  appear underneath it. That is a layout shift on an empty state and a second loading state to
  design, on a screen SCR-003 already gives twelve states.
- A second failure mode with no designed state: availability succeeded, the lookahead failed. ST-06
  says *"We couldn't load desk availability"*, which would now be a lie.
- A second route, a second contract file, a second set of route tests — for a payload the first
  request already knew it needed, because **the server is the one that discovered the date was
  full**.

Against that, one benefit: the common-path payload stays untouched. It already is — the field is
`[]` and costs zero queries when the date is not full.

**The precedent is unanimous.** `myBooking` (US-007) and `usualDeskId` (US-008) both arrived as
additive fields on this exact response rather than as endpoints of their own, and US-006's note
anticipated this story by name: *"REQ-035's multi-day lookahead (US-009) will need dates on
availability payloads whatever shape it takes"* (§2.4). Responses in this package are deliberately
not `.strict()` (`availability.ts:53-54`), so a tab loaded before the deploy survives the new field
— ADR-002's asymmetry, applied a third time.

### 2.2 The schema

```ts
// libs/contracts/src/availability.ts — added to availabilityResponseSchema
/**
 * US-009/REQ-035, AC-02. The next working days with at least one free desk, ascending, **at most
 * two** — as dates, which is all AC-03 needs in order to jump to one.
 *
 * Populated only when the browser would render ST-04: `desks` is non-empty, none of it is
 * `available`, AND `myBooking` is `null` (ST-10 outranks ST-04 in the render, so suggestions there
 * would be computed and discarded). `[]` in every other case — including "fully booked and nothing
 * free in the rest of the window", which AC-05 requires to render as no suggestions at all rather
 * than as a placeholder.
 *
 * Every entry is guaranteed Monday–Friday, strictly after the requested `date`, no later than
 * today + 30 (BR-001.3, V-02), and not a date on which the caller holds a Confirmed booking
 * (BR-001.1) — AC-06, decided in `domain/next-free-days.ts` and nowhere else. The browser
 * re-derives none of it; it renders what it is given.
 *
 * Advisory, like the rest of this payload: a suggested day can be taken before it is chosen, and
 * the employee then lands in ST-04 for the new date (story Edge cases — accepted, self-correcting).
 */
nextFreeDays: z.array(officeDateSchema).max(2).default([]),
```

`.default([])` for the same reason `myBooking` and `usualDeskId` carry `.default(null)`: an old
fixture with no key still parses, and a present-but-empty array is the honest encoding of "none",
which is a real answer here (AC-05) rather than an absence.

### 2.3 What it deliberately does not carry

| Not carried | Why |
| --- | --- |
| A free **count** per suggested day (`{ date, freeCount }`) | Nothing in AC-02–AC-05 renders it, and it would be a staleness claim the story has already accepted it cannot make (a day free when suggested can be full when chosen). A number on screen that is wrong by the time it is read is worse than no number |
| Desk numbers, or anything about *which* desk is free | The employee is choosing a **day** here. The desk choice is the next screen render, from a fresh request for that day |
| A `state` / `fullyBooked` discriminator | US-006 §2.6 refused one and the reasoning is unchanged: the array already answers it, and two sources of truth for one question eventually disagree in front of a user |
| More than two entries, or a client-supplied `limit` | AC-02 says two. A `limit` parameter is a generality no requirement asks for, and it would make the `.max(2)` guarantee the client's to choose |
| Anything about another employee | Reads #5 and #6 select `booking_date, desk_id` and `booking_date`. No `user_id` is read except filtered to the caller's own — US-006 §2.5's structural guarantee is preserved exactly, not merely re-promised |

### 2.4 The two reads, and the boundary they stay inside

```ts
// apps/api/src/modules/bookings/bookings.repository.ts — two new methods
/** US-009/AC-02. Confirmed bookings across a date RANGE, for the free-day scan. The select list is
 *  `booking_date, desk_id` — no `user_id`, exactly as `listConfirmedDeskIds` (US-006/AC-06). */
listConfirmedDeskIdsInRange(from: OfficeDate, to: OfficeDate):
  Promise<Array<{ booking_date: OfficeDate; desk_id: string }>>;

/** US-009/AC-06, BR-001.1. The caller's OWN confirmed dates in the range — `booking_date` only,
 *  filtered to `user_id`, the shape `findMyConfirmedBooking` established (US-007 design note §2.2). */
listMyConfirmedDatesInRange(userId: string, from: OfficeDate, to: OfficeDate): Promise<OfficeDate[]>;
```

Both read `bookings`, the table this module **owns**. ADR-004's cross-table read is not widened by
one column: the `desks` read is unchanged and there is no new join. Worth saying in the PR, because
"a multi-day lookahead" sounds like it should need one.

The service then:

```ts
const fullyBooked = projected.length > 0 && !projected.some((d) => d.status === 'available');
// ST-10 outranks ST-04 in the render (§4.1), so do not pay for suggestions nobody will see.
if (!fullyBooked || myBooking) return { …, nextFreeDays: [] };

const from = addDays(date, 1);
const to = lastBookableDate(today);
if (from > to) return { …, nextFreeDays: [] };        // the selected date IS the window's edge

const [rows, myDates] = await Promise.all([
  availability.listConfirmedDeskIdsInRange(from, to),
  availability.listMyConfirmedDatesInRange(userId, from, to),
]);
const takenByDate = new Map<OfficeDate, Set<string>>();   // built once from `rows`
const mine = new Set(myDates);

const nextFreeDays = pickNextFreeDays({
  after: date,
  today,
  limit: 2,
  hasFreeDesk: (d) => desks.some((desk) => !takenByDate.get(d)?.has(desk.id)),
  alreadyBooked: (d) => mine.has(d),
});
```

`desks` is read #1's result, already in hand (§1.2). The `from > to` guard is not theoretical: the
selected date can legitimately be `today + 30`, and without it the range query asks Postgres for an
inverted range and gets an empty answer that is right for the wrong reason.

### 2.5 Failure semantics: **do not swallow a failed lookahead**

If either read throws, let it. The whole request becomes a 500/503 and the browser renders ST-06,
exactly as it would if the desks read had failed.

The tempting alternative — `catch` and fall back to `nextFreeDays: []` — is wrong here, for the
reason US-007's finding F-1 gave about unrecognised unique violations: `[]` is a **legitimate
answer** (AC-05), so a swallowed failure is indistinguishable from "no free days in the window". A
wrong answer nobody notices is worse than an honest error. Nothing in AC-01–AC-07 asks for a
partial render, and the fully-booked state without suggestions is the *fallback*, not a degraded
success.

### 2.6 Errors

| Status | `code` | When | Where it is decided |
| --- | --- | --- | --- |
| `400` | `invalid_request` | unchanged — the query schema is untouched | the route edge |
| `401` / `403` | unchanged | the mount's chain | not this route |
| `422` | `date_not_bookable` | unchanged — refused before any query runs | the service, via `refusalFor` |
| `503` | `service_unavailable` | Supabase unreachable, **including on either lookahead read** (§2.5) | the service |
| `500` | `internal_error` | a defect | `errorHandler` |

**No new error code, and that is the point.** This story adds no refusal, no new failure a user can
cause, and no new status. `Cache-Control: private, no-store` is already set on this route
(`bookings.router.ts:77`) and already correct — `nextFreeDays` is per-caller, since it depends on
the caller's own bookings.

---

## 3. `domain/` — **one** new function, and why this one earns it

US-006 and US-007 each added nothing to `apps/api/src/domain/`, and both notes argued it: a
projection is a mapping, not a decision. This story is different, measured by the same test
`app-architecture.md` sets — *rules that are pure decisions*, findable in one place.

```ts
// apps/api/src/domain/next-free-days.ts
/**
 * US-009/AC-02, AC-05, AC-06. Which working days may be offered when a date is fully booked.
 *
 * Pure: no clock, no config, no I/O (eslint Boundary 2). The data arrives as two predicates, so
 * the whole of AC-06 is provable with no database and no HTTP.
 */
export function pickNextFreeDays(args: {
  after: OfficeDate;                            // the fully-booked date; candidates start at +1
  today: OfficeDate;                            // the window's origin — NOT `after`
  limit: number;                                // 2 (AC-02)
  hasFreeDesk: (date: OfficeDate) => boolean;
  alreadyBooked: (date: OfficeDate) => boolean; // BR-001.1
}): OfficeDate[];
```

The implementation, in full, because its termination is this story's sharpest edge:

```ts
const out: OfficeDate[] = [];
const end = lastBookableDate(today);             // V-02's inclusive right edge
let candidate = addDays(after, 1);
while (candidate <= end && out.length < limit) { // BOTH conditions — see below
  if (!refusalFor(candidate, today) && !alreadyBooked(candidate) && hasFreeDesk(candidate)) {
    out.push(candidate);
  }
  candidate = addDays(candidate, 1);
}
return out;
```

- **`refusalFor` is reused, never re-derived.** The weekend rule and the window edge are US-005's
  (`libs/contracts/src/booking-window.ts:94`), and `modules/bookings/README.md:17-21` already says
  a second implementation here is drift, not defence in depth. `refusalFor` also makes the past
  case impossible by construction, since candidates start after a date that is itself bookable.
- **The `candidate <= end` half of the loop guard is the single most likely defect in this story.**
  A loop written to stop only when two days are found never terminates in exactly the case AC-05
  describes — a window with fewer than two free days — and it passes every happy-path test. Pin it
  with a dataset that is full to the window's edge, and assert the function *returns*.
- Both bounds are string comparisons: zero-padded `YYYY-MM-DD` sorts chronologically
  (`booking-window.ts:88-92`). No `Date` parsing, no zone.

The other candidates, measured as US-006 §3.1 measured its four:

| Candidate | Where it goes | Why not `domain/` |
| --- | --- | --- |
| Building `takenByDate` from the range rows | `bookings.service.ts` | A mapping over a query result, not a decision |
| The fully-booked predicate | `bookings.service.ts` (server) and the render precedence (browser) | One boolean over an array the caller already holds. A `domain/` function for it would be called once and would not make §4.1's precedence any harder to get wrong |
| Formatting a suggested day's label | `apps/ui/src/lib/format-office-date.ts` — **exists** | Presentation |

---

## 4. The browser side

### 4.1 The render precedence, extended to four branches

`BookADesk.tsx:241-256` currently reads: `myBooking` → `desks.length === 0` → the list. US-009
inserts **one** branch, and its position is not negotiable — US-006 §2.6 wrote the comment that
reserves the slot (`BookADesk.tsx:253-254`):

```tsx
availability.data.myBooking            ? <ExistingBookingState … />        // ST-10, US-007
: availability.data.desks.length === 0 ? <EmptyState … NO_DESKS_EXIST />   // ST-05, US-006/AC-09
: fullyBooked                          ? <>…ST-04…</>                      // US-009 — HERE
:                                        <>…count + zones + confirm…</>    // ST-01/ST-07
```

**AC-07 is this line of code.** An office with no desks satisfies "no desk is available" too, so a
fully-booked branch placed one position earlier renders *"Every desk is taken"* to an office that
has never had a desk. Two tests pin it: `desks: []` renders ST-05 (US-006/AC-09 — do not let it
regress), and `desks: []` **with a non-empty `nextFreeDays`** still renders ST-05 with no
suggestion button.

### 4.2 AC-04 is structural, not a prop

The confirm action must be **absent**, not disabled. It already is: `ConfirmBookingBar` lives inside
the final branch (`BookADesk.tsx:305-310`), so an ST-04 branch beside that one renders no confirm
bar by construction. Do not add a `hidden` prop to `ConfirmBookingBar`, and assert absence with a
`queryBy…` returning null — never `toBeDisabled()`, which passes on the implementation AC-04
forbids.

The count line, by contrast, **stays** (AC-01): `AvailabilityCount` with `status="ready"`,
`freeCount={0}` and `totalCount={desks.length}` renders *"0 of 40 desks free · Wed 9 Sep"* with no
change to that component — `freeCount` is already a plain number and zero needs no special case.

### 4.3 Copy, in the file US-006 built for it

```ts
// apps/ui/src/screens/book-a-desk/copy.ts — beside NO_DESKS_EXIST, where line 42 reserves the slot
/** SCR-003 ST-04 — US-009/AC-01. Names the date, unlike NO_DESKS_EXIST, because this date is the
 *  problem and another date is the fix. */
export const FULLY_BOOKED = (label: string): string => `Every desk is taken on ${label}.`;

/** SCR-003 ST-04's "one line of recovery". Rendered ONLY when there is at least one suggestion —
 *  AC-05 forbids a lead-in above an empty slot. */
export const FULLY_BOOKED_SUGGESTIONS_LEAD = 'These days still have a desk free:';
```

`copy.spec.ts` gets the assertion US-006 promised: `FULLY_BOOKED(…)` and `NO_DESKS_EXIST` differ,
and `NO_DESKS_EXIST` still offers nothing. The label comes from `formatOfficeDateLabel(date)`,
never from `new Date(…).toLocaleDateString()` — `format-office-date.ts` exists to close that trap.

**`FULLY_BOOKED_SUGGESTIONS_LEAD` is not approved copy.** SCR-003:97 says *"plus one line of
recovery"* without quoting it, exactly as ST-10's explanation was left to the BA. It is the PO/BA's
to confirm — open item 2.

### 4.4 `EmptyState` gains `actions` — the props it was designed for

```ts
export interface EmptyStateProps { title: string; body: string; actions?: ReactNode }
```

US-006 built this component with a docblock naming its other two contexts as US-009's and US-007's,
and deliberately shipped no `actions` so ST-05 could not grow them. An **optional** prop keeps that
promise: ST-05's call site passes none, and its test asserts no button renders.

Suggestion buttons call **`selectDate(date)`**, the existing handler (`BookADesk.tsx:131-137`) — not
`setSelectedDate`. It already closes the picker, clears any desk selection (FR-09) and respects the
busy guard, and `useAvailability` refetches on the date change. That is the whole of AC-03: no
calendar step, no new fetch path, no new state.

### 4.5 Announcement and keyboard

- **No new live region.** `AvailabilityCount`'s `role="status"` is still mounted and still announces
  *"0 of 40 desks free, Wednesday 9 September"* on the date change. The empty state arriving
  underneath needs no second announcement; adding one produces two readings of one event — the
  defect US-006 §4.3's single-node design exists to avoid.
- Suggestion buttons are ordinary buttons in DOM order after the message. Follow
  `AvailabilityCount`'s split: visible short label (*"Thu 10 Sep"*), accessible name in the long
  form (*"Book a desk on Thursday 10 September"*), so the reading is unambiguous out of context.
- 44px minimum target height (SCR-003:172). They are `Button`s, so NFR-008's icon-and-word rule
  needs no new styling.

### 4.6 The frames are the visual authority, not this note

The hi-fi frames for ST-04 exist at 360/768/1280 in *Employee Desk Booking — Design System &
Mockups* (Figma file `xjFVgBbMrJUl7Ys3EX3Cbn`), named `HF / SCR-003 · Book a desk / ST-04 fully
booked · <width>`. **DEV must open them before building the empty state** and cite node ids the way
`BookADesk.tsx:209-210` and `copy.ts:35-40` already do.

This is not boilerplate: US-008 found the ASCII wireframe and the hi-fi frame *disagreeing* about
the "your usual" wording, and the frame won (`copy.ts:38-39`). ST-04's suggestion buttons — one row
or two, the label wording, whether the lead-in line exists at all — are the same kind of question,
and this note cannot answer them. I did not open the file.

---

## 5. ADR judgement

The test the last five notes applied: *does the decision bind work beyond the story that made it,
with a rejected alternative a future author would otherwise re-litigate?*

**Nothing here passes. No new ADR — this design note plus DEV's `decisions.md` is enough.** Naming
why is cheaper than an argument later:

| Candidate | Verdict |
| --- | --- |
| **Build the lookahead rather than take REQ-035's fallback** | **No ADR.** It is a *feasibility finding about one Could-priority story*, not a rule that binds later work. It has a rejected alternative, but that alternative is the product's own pre-approved fallback, already written down in three approved places (REQ-035, the story's Edge cases, SCR-003 conflict row 3). An ADR would be a fourth copy of a decision whose real record is a working endpoint. It belongs in `decisions.md` and in the PR description, stated plainly enough that nobody re-opens it |
| **An additive field rather than a second endpoint (§2.1)** | **No ADR.** `libs/contracts/src/availability.ts` *is* the contract — the Architect charter's own sentence. It is also the third application of an established pattern (`myBooking`, `usualDeskId`), not a new one |
| **The lookahead's query shape (§1.2)** | **No ADR.** One story's shape, reversible, with no consumer outside this endpoint |
| **The ST-05 → ST-04 precedence (§4.1)** | **No ADR.** A precedence order pinned by a test, exactly as US-006 §2.6 and US-005 §2.4 were |
| **A new `domain/` function (§3)** | **No ADR.** It applies `app-architecture.md` §2 as written, and the table in §3 says why the other candidates stayed out |

Contrast with ADR-004, which this story leans on and which US-006's note argued for at its §3.3:
that decision governed **every** module's SQL for the rest of the build, and had a plausible
rejected alternative — cross-module read ports — that a later "consolidation" PR would have
re-litigated. This one governs one field on one endpoint. If it is ever revisited, the revisiting
story will be looking straight at the code that implements it.

**No accepted ADR is bent.** ADR-001 is applied — the lookahead is server-side by construction,
which is the shape ADR-001 mandates and is also why the browser never learns about a booking it
does not own. ADR-002 is applied — one additive field, parsed on both sides, requests strict and
responses not. ADR-004 is applied and **not widened**: no new cross-module read (§2.4).

---

## 6. If you refuse the contract change: what the fallback costs

Stated so the call at D1 is a real choice and not a rubber stamp. Taking REQ-035's fallback means
**no endpoint change, no contract change, no repository change, no `domain/` function.** What
remains is one UI branch:

- `copy.ts` gains `FULLY_BOOKED` and a fixed recovery line — *"Try another day."*
- `BookADesk.tsx` gains the §4.1 branch, rendering the count line plus `EmptyState` with **no**
  `actions` — so `EmptyState`'s props do not change either, and the story drops out of Complex.
- AC-01, AC-04 and AC-07 are proven as written. **AC-02, AC-03, AC-05 and AC-06 are replaced** by
  one test asserting the *"Try another day"* message and that no other state changed — the story's
  own QA note prescribes exactly this, and requires the decision recorded in the story PR.

That is a genuinely small story, and shipping it satisfies REQ-035 as written. I recommend against
it because §1.2's cost is two indexed queries over a bounded range, paid only in the one state that
has nothing else to show — not because the fallback would be dishonest.

---

## 7. File placement

**New**

```
apps/api/src/domain/next-free-days.ts (+ .spec.ts)        <- §3. The ONE new rule
inception/specs/US-009-next-free-days-when-fully-booked/  <- the spec package (DEV's)
```

**Modified**

```
libs/contracts/src/availability.ts (+ .spec.ts)   + nextFreeDays (§2.2)        <- protected path

apps/api/src/modules/bookings/bookings.repository.ts        + the two range reads (§2.4)
apps/api/src/modules/bookings/bookings.service.ts           + the fully-booked branch (§2.4)
apps/api/src/modules/bookings/bookings.repository.spec.ts   select lists + range predicates
apps/api/src/modules/bookings/bookings.service.spec.ts      the branch and its skip conditions
apps/api/src/modules/bookings/bookings.routes.spec.ts       the field, over a stub repository
apps/api/src/modules/bookings/bookings.fixtures.ts          a fully-booked dataset with controlled
                                                            free/full days after it (QA's data note)
apps/api/src/modules/bookings/README.md                     what US-009 added, and that it adds NO
                                                            new cross-table read (§2.4)

apps/ui/src/components/empty-state/EmptyState.tsx (+ .spec.tsx, .css)   optional `actions` (§4.4)
                                                        ^ shared component props: a Complex surface
apps/ui/src/screens/book-a-desk/copy.ts (+ .spec.ts)    FULLY_BOOKED + the lead line (§4.3)
apps/ui/src/screens/book-a-desk/BookADesk.tsx (+ .spec.tsx, .css)   the ST-04 branch (§4.1)

knowledge/traceability/manifest.json    US-009 tests[] — currently empty (manifest.json:694)
inception/specs/index.md                the US-009 row
```

**Not modified, and worth saying so:**

- **`supabase/migrations/**`** — §1.2. No new table, column or index; both indexes this story needs
  were created by `0003_bookings.sql:77-78`. A reviewer should expect **no diff here**, and a
  migration appearing in this PR is a finding.
- **`libs/contracts/src/booking-window.ts`** — `refusalFor`, `addDays` and `lastBookableDate` are
  used as they are (§3). No new export, no new constant.
- **`libs/contracts/src/error.ts`** — §2.6. No new code.
- **`apps/api/src/http/**`, `composition.ts`** — no new route, no new mount, no new seam.
- **`apps/ui/src/components/availability-count/**`** — §4.2. `freeCount={0}` needs nothing.
- **`apps/ui/src/screens/book-a-desk/use-availability.ts`** — the field arrives inside the response
  it already parses. No new state, no second fetcher, no second loading path.
- **`inception/design/screens/SCR-003-book-a-desk.md`** — approved and merged. Its conflict row 3
  says the feasibility call is `/architect`'s; recording the *answer* there is an edit to an
  approved artifact and belongs to a `change-request` issue, not to this PR. The verdict's home is
  this note, `decisions.md`, and the PR description.

---

## 8. Test placement

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `BookADesk.spec.tsx` — a payload where every desk is `taken` renders *"0 of 40 desks free · …"* **and** the empty-state title naming the date, and renders no `zone-group` | component |
| AC-02 | `next-free-days.spec.ts` — two free days after a full one, ascending | unit |
| AC-02 | `bookings.routes.spec.ts` — a fully-booked date returns exactly the two expected dates in `nextFreeDays`; a partially-booked date returns `[]` **and the range reads are never issued** | API |
| AC-03 | `BookADesk.spec.tsx` — activating a suggestion issues a new availability request **for that date** and clears any prior desk selection; the date picker never opens | component |
| **AC-04** | `BookADesk.spec.tsx` — in ST-04 the confirm control is **absent** (`queryBy…` is null), not disabled (§4.2) | component |
| AC-05 | `next-free-days.spec.ts` — a window with one free day returns one; a window with none **returns `[]` and terminates** (§3's loop guard) | unit — the termination test |
| AC-05 | `BookADesk.spec.tsx` — `nextFreeDays: []` renders the message with no lead-in line, no button and no placeholder element | component |
| **AC-06** | `next-free-days.spec.ts` — weekends skipped; a candidate at `today + 30` **included** and `today + 31` excluded; a date the caller has booked skipped even when it is free; nothing at or before the selected date. Literal expected dates, never computed by calling the function under test | unit — **the row that actually proves AC-06** |
| AC-06 | `bookings.repository.spec.ts` — `listConfirmedDeskIdsInRange` selects `booking_date, desk_id` and names **no** user column; `listMyConfirmedDatesInRange` is filtered to `user_id` and `status = 'confirmed'` (§2.4) | unit (recording fake) |
| AC-07 | `BookADesk.spec.tsx` — `desks: []` renders ST-05's copy, **and** does so even when `nextFreeDays` is non-empty, with no suggestion button (§4.1) | component |
| AC-07 | `copy.spec.ts` — `FULLY_BOOKED(…)` and `NO_DESKS_EXIST` differ in title and body (the assertion `copy.ts:42` was written to receive) | unit |
| — | `bookings.service.spec.ts` — the range reads are skipped when `myBooking` is set, and when `date === lastBookableDate(today)` (the `from > to` guard, §2.4) | unit |
| — | `availability.spec.ts` — a payload with no `nextFreeDays` key parses to `[]`; three entries are rejected by `.max(2)` | unit (contract) |

**Four things not to do**, each of which produces a green test that proves nothing:

1. **Do not prove AC-06 through the API test alone.** A route test over a stub repository asserts
   the plumbing, not the rule. `pickNextFreeDays` is where the criterion lives and where a
   weekend-skipping bug is visible.
2. **Do not compute the expected dates by calling `pickNextFreeDays`** — write them out as
   literals, the way US-005's note required for its date boundaries.
3. **Do not assert AC-04 with `toBeDisabled()`.** §4.2 — it passes on the implementation the
   criterion forbids.
4. **Do not let the fully-booked fixture double as the no-desks fixture.** AC-07's whole content is
   that the two differ; one shared fixture makes the precedence untestable.

---

## 9. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§1 — the feasibility verdict itself.** I recommend building the lookahead and **not** taking REQ-035's fallback. §6 prices the fallback if you disagree. One sentence at D1 settles it | Joy Joshua, **at D1** | the whole story's shape |
| 2 | **§4.3 — `FULLY_BOOKED_SUGGESTIONS_LEAD` is copy nobody has approved.** SCR-003:97 says "one line of recovery" without quoting it. Confirm the wording, or drop the lead-in and let the buttons stand alone | PO/BA (`/ba`), before the UI lands | ST-04's copy test |
| 3 | **§4.6 — the `HF / SCR-003 · ST-04` frames are the visual authority and I did not open them.** DEV must, and must cite node ids. US-008 found a wireframe and a frame disagreeing; assume nothing | DEV, in this PR | the empty state's build |
| 4 | **§7 — SCR-003 conflict row 3 still reads "Feasibility is now an `/architect` question".** Once this lands, that row is stale. Updating an approved screen spec is a `change-request` issue, not an edit in this PR | Manager / PO, after merge | nothing |
| 5 | **§2.2 — `nextFreeDays` is suppressed when `myBooking` is set.** Deliberate (ST-10 outranks ST-04), and it makes one field's presence depend on another's. If you would rather the field were unconditional whenever the date is fully booked, say so — it costs two queries in a state nobody renders | Joy Joshua, at D1 | the service test |
| 6 | **§1.2 — the row bound is arithmetic, not a measurement.** ≤100 desks × ≤22 working days, over an index that already exists. Nobody has run `EXPLAIN` against a seeded database, and at this volume nobody needs to — but if desk inventory ever leaves the 30–100 range BR-001.4 assumes, this is the paragraph to re-read | Manager → whichever story raises the inventory ceiling | nothing |

---

**Three limits on what I did**, stated so you do not over-trust it:

- **I ran nothing.** No tests, no lint, no query, no `EXPLAIN`. Every claim here is from reading the
  files named — `bookings.service.ts`, `bookings.repository.ts`, `bookings.router.ts`,
  `availability.ts`, `booking-window.ts` (both copies), `0003_bookings.sql`, `BookADesk.tsx`,
  `copy.ts`, `EmptyState.tsx`, `AvailabilityCount.tsx`, `use-availability.ts` — at the merge commit
  on `main`.
- **I did not open the Figma file** (open item 3). The frames are DEV's verification, not mine.
- **I wrote no code and landed nothing.** This note is advisory; `decisions.md`,
  `impact-analysis.md` and `implementation-plan.md` in this package are DEV's, and the GitHub
  review on the story PR is the authority.

**Single next action:** answer open item 1 — one sentence, build or fallback — and open item 5 if
you already know your mind. Then DEV writes the spec package and presents Gate D1. The Architect's
review of the resulting diff comes after.

# US-013 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-013 — See every booking in the office](../../stories/user-stories/US-013-see-every-booking.md) |
| **Screen**   | [SCR-005](../../design/screens/SCR-005-all-bookings.md) **ST-01, ST-02, ST-03, ST-05**. ST-04 and ST-06 are US-014's (filters); ST-07 – ST-11 are US-015's (cancellation); ST-12 is US-014's. None are touched |
| **Tier**     | Complex — a new route **and** a new slice of `libs/contracts` (§0)       |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), [ADR-007](../../../knowledge/decisions/ADR-007-derived-booking-status.md) — **no new ADR** (§8) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is argued before the code, not in a review thread. `decisions.md` in this package stays DEV's.

The story hands `/architect` one question and says so plainly (line 112): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §2 is the answer.

**The verdict, in one line each:**

- `GET /api/admin/bookings`, **page-based** (`?page=`), 50 rows fixed server-side, `total` + `nextPage` in the envelope (§2). Offset here and keyset in US-010 is not an inconsistency — §2.4 gives the criterion that separates them.
- `user_profiles!user_id(full_name)` is the right hint, and it is the **second** of two runtime behaviours the recording fake cannot prove (§3). Both go through the existing real-Postgres harness.
- A **separate** `AdminBookingsRepository`/service inside `modules/bookings`, not a twelfth method on `AvailabilityRepository` (§4). `admin.router.ts` becomes a factory (§5).
- **Both of DEV's scope calls are correct** (§6), and §6.1 also closes an invitation `BookingRow.tsx` left open to this story by name.
- No ADR; two consequential edits instead (§8).

§9's "not modified" list is as load-bearing as the modified one: this story touches **no migration, no middleware, no shared component's props, and no mount point.**

---

## 0. The tiering — confirmed, and one correction to the reasoning

**Complex.** DEV's classification is right, and it is right for **two independent reasons**, not one:

| Surface | What it is here |
| --- | --- |
| **Server** | A **new route**, `GET /api/admin/bookings`. `task-surfaces.md:39` — Complex outright, regardless of diff size |
| **Contract** | `libs/contracts/src/bookings.ts` gains a query schema, an item schema and a response envelope. A **protected path** (`task-surfaces.md:25-27`) — *"changing one changes both sides at once, which is the definition of Complex"* |

**DEV's Medium-carve-out reasoning is correct and worth keeping in the record.** `task-surfaces.md:91-92`'s carve-out is *"a new `GET` lookup endpoint following an existing read-only pattern, reusing the table **and an existing response shape**"*. §7 walks `myBookingsResponseSchema` field by field and shows no existing shape fits. The carve-out does not apply, and the contract change is a second Complex surface in its own right — so even if someone argued the route into Medium, the tier would not move.

**What it is *not*, and each absence is a decision defended below:**

- **Not Persistence.** No migration, no column, no index. `bookings_booking_date_status_idx` already exists (§3.3). **A migration appearing in this PR is a review finding.**
- **Not a trust boundary.** DEV's claim 1 verified: `app.ts:78` mounts `/api/admin` behind `requireSession` + `requireAdmin`, and `require-admin.ts`'s own docblock states the property this story consumes — *"every future admin route inherits the guard before it is written"*. **AC-10 is satisfied by existing, tested machinery; no new authz surface is created.** `apps/api/src/http/middleware/**` is untouched.
- **Not a shared-component change.** `StatusChip` already carries `kind="booking"` with `confirmed`/`completed`/`cancelled` variants (US-010). `EmptyState`, `Alert`, `Button` need nothing. **`SkeletonRow` must not be widened** — §6.3.
- **Not Dependency, not Operational, not Config.**

**The browser half of this story is Medium on its own** (`task-surfaces.md:66-67` — *"a change inside one screen's folder that keeps its props and events"*, plus screen-private components). The Complex tier is carried entirely by the two server-side surfaces. That matters for review focus: the risk in this story is in the query and the envelope, not in the screen.

---

## 1. What this story actually is

One read, four states, and one number that is easy to get subtly wrong.

| AC | Where it is answered |
| --- | --- |
| AC-01 lands here | **Already built.** `landing.ts:14` and `routes.tsx`'s `RequireRole role="admin"` (US-001/US-004). §6.4 |
| AC-02 today onward, all statuses | The default query — one predicate, `booking_date >= today`, and **no** `.eq('status', …)` (§3.2) |
| AC-03 four fields | The item schema (§2.2) — and **four fields exactly**, no employee id (§2.3) |
| AC-04 paged at 50 | `?page=` + `nextPage` (§2) |
| AC-05 no date floor | Provable **today**, at the repository, without building US-014 (§7.1) |
| AC-06 passed Confirmed reads Completed | `bookingDisplayStatus`, reused verbatim (ADR-007 follow-up 1) |
| AC-07 the count line | `total` — and the decision about *what it counts* is §2.5 |
| AC-08 empty system | `total === 0` is unambiguous in this story, and stops being so in US-014 (§6.2) |
| AC-09 loading / failure | Existing `Alert`, a new screen-private skeleton row (§6.3) |
| AC-10 admin-only | Inherited from the mount (§0), proven by a route test with an Employee session |
| AC-11 table ≥1024, cards below | The one AC whose *proof mechanism* is not obvious — §6.5 and open item 5 |

---

## 2. The endpoint contract

### 2.1 `GET /api/admin/bookings`

```
GET /api/admin/bookings           <- page 1 (ST-01)
GET /api/admin/bookings?page=2    <- AC-04's Show more
```

**The path is already settled and written down.** US-010's design note §1.1 named it while arguing why the employee list is not `/api/bookings/mine`:

> *"The admin's cross-employee list (US-013, REQ-011) is a different resource with a different authz surface and belongs at `GET /api/admin/bookings`, behind the `requireAdmin` mount that `apps/api/src/modules/admin/admin.router.ts` already exists to hold."*

`api-standards.md:10` says the same as a rule — *"Admin-only surfaces live under `/api/admin/*` and carry the `requireAdmin` middleware"*. There is nothing to decide; there is a commitment to honour.

**The scope is the mount, never a path word and never a parameter.** Exactly as US-010's list takes its user from `req.user.id`, this list takes its *authority* from the mount. No `?all=true`, no role check in the handler.

### 2.2 The request schema

```ts
// libs/contracts/src/bookings.ts — US-013's slice

/**
 * `GET /api/admin/bookings`. `.strict()` — an unknown field is rejected, not ignored, matching
 * every other request schema in this package. There is deliberately no `limit` and no `userId`:
 * the page size is the server's (§2.4) and the scope is the mount's (§2.1). US-014 adds `from`,
 * `to`, `status` and `deskId` here; this story adds nothing else.
 */
export const allBookingsQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(MAX_PAGE).optional() })
  .strict();
export type AllBookingsQuery = z.infer<typeof allBookingsQuerySchema>;
```

- **`z.coerce`** is needed and `myBookingsQuerySchema` did not need it: `before` is a date *string*, `page` is a number arriving as a string on `req.query`. `"abc"` → `NaN` → fails `.int()` → `400 invalid_request` at the route edge. `?page=1&page=2` arrives as an array → `Number([…])` → `NaN` → `400`. Both are the right answer.
- **`.max(MAX_PAGE)`** (suggest `1_000_000`, declared beside the schema) is a bound on *the arithmetic*, not on the data. `(page − 1) * 50` for `page = 1e18` leaves the safe-integer range and produces a garbage range header. It is **not** a performance guard — see §3.4, where the cost of a large offset turns out to be bounded by the result set rather than by the offset. **This is the one line in §2 I would happily lose if you think a bound with no requirement behind it is worse than the overflow it prevents.**

### 2.3 The response schema

```ts
/** One row of `GET /api/admin/bookings`'s `items` (US-013/AC-03, AC-06). */
export const allBookingsListItemSchema = z.object({
  id: z.string().uuid(),
  date: officeDateSchema,
  /** Read through the `desks` embed, so a desk renamed since (BR-001.19, US-018) shows its
   *  CURRENT number — the same accepted consequence `myBookingListItemSchema` records. */
  deskNumber: z.string().min(1),
  /** AC-03's "the employee who holds it". `user_profiles.full_name`, read through the
   *  DISAMBIGUATED embed — §3.1. The name and nothing else: §2.3's note below. */
  employeeName: z.string().min(1),
  /** DERIVED — `bookingDisplayStatusSchema`, never the stored two-value enum (ADR-007). */
  status: bookingDisplayStatusSchema,
});
export type AllBookingsListItem = z.infer<typeof allBookingsListItemSchema>;

/** Not `.strict()`, per `auth.ts`'s stated rule for every response in this package. */
export const allBookingsResponseSchema = z.object({
  /** The office's today the server used to derive every `status` below, echoed so the payload is
   *  self-describing — the same reason `myBookingsResponseSchema.today` is echoed. In this story
   *  it is also AC-07's "from {date}", because the default view starts at today. */
  today: officeDateSchema,
  /** AC-07. The number of bookings MATCHING THE VIEW, not the number on this page — §2.5. */
  total: z.number().int().nonnegative(),
  /** Ordered `date` ASC, then `created_at` ASC, then `id` ASC — a TOTAL order, and the third key
   *  is load-bearing rather than belt-and-braces (§3.2). */
  items: z.array(allBookingsListItemSchema),
  /** AC-04. The value to send back as `?page=`, or `null` when this is the last page. ONE field
   *  answering "is there more", the shape `nextBefore` established in US-010. */
  nextPage: z.number().int().min(2).nullable().default(null),
});
export type AllBookingsResponse = z.infer<typeof allBookingsResponseSchema>;
```

**Four fields on the item, and the absences are deliberate:**

- **No `employeeId`, no `employeeEmail`.** AC-10's *"no other employee's booking data is returned"* is a constraint on this payload, not only on who may call it. The screen needs a name; the dialog US-015 opens needs a name (*"Cancel **Priya Raman's** desk?"*); the cancellation targets a **booking** id. Nothing in SCR-005 ST-01 – ST-11 needs an employee identifier, so none crosses. This is the same structural discipline `listConfirmedDeskIds` used for US-006/AC-06 — *"the occupant is never read, not merely never sent"* — one level up.
- **No `deskId`.** US-014's desk filter needs a desk list, which needs a desks endpoint that does not exist. Adding the id now is building US-014's parameter inside US-013.
- **No `from` field on the envelope.** In this story `from` *is* `today`, and `today` is already there. US-014 adds whatever its filters need to restate. Named here so a reviewer reads it as a decision rather than an oversight.

**Two fields, one source, so they cannot disagree.** `total` and `nextPage` look like the *"two fields answering one question"* pattern this codebase refuses three times (US-006 §2.6's `fullyBooked`, US-009 §2.3, ADR-007's rejected "carry the stored status too"). They are not: they answer different questions — *how many match* (AC-07) and *is there more* (AC-04) — and both are computed from **one count, in one response, on the server**. The failure mode that rule guards against is two fields from two *sources* drifting. `nextPage` could be derived by the browser from `total` and a page size it does not know; handing it back keeps US-010's property that *"the browser never computes a cursor"*.

### 2.4 Offset, not keyset — and why that is not inconsistent with US-010

**This is the core question, so here is the decisive fact first: AC-04 pins the page at exactly 50 rows, and the sort key is not unique.** Everything follows from that pair.

US-010 chose a date cursor, and its note rejected *"a fixed row count with a `before=<date>` cursor"* in these words:

> *"a date can hold more than one row … Cutting a page at row N splits a day, and then `booking_date < lastEmittedDate` hides the rest of that day permanently … Fixing it needs a composite `(booking_date, created_at)` cursor on the wire, which puts an internal timestamp in a query string to solve a problem the window shape does not have."*

US-010 escaped that by making each page **a whole window of days** rather than a row count. **US-013 cannot take that escape**, because AC-04 fixes the count at 50 and the QA note asserts the boundary exactly (*"exactly 50 matching rows should show no Show more; 51 should show it"*). A whole-day page is not 50 rows. And the collision is not incidental here, it is the norm: forty desks on one date means one `booking_date` routinely holds dozens of rows.

So keyset for US-013 means a composite `(booking_date, created_at, id)` cursor on the wire — the exact shape US-010 already rejected, with a third component added because `created_at` is a `timestamptz` with no uniqueness guarantee.

**Three further points, weighed honestly:**

1. **The standing standard already says offset, and already names this endpoint.** `api-standards.md:100-103`:
   > *"Unbounded collections take `?page&limit` with a documented maximum. 'All bookings' (REQ-012) is the one that will grow."*

   This was written before either list existed. US-010 departed from it for a reason it wrote down; US-013 does not need to.

2. **Offset drift is real, and in this view it is the benign direction.** The classic objection to offset paging is that a mutating list makes "next page" skip rows. Work it through for AC-02's default view — `booking_date >= today`, all statuses, ascending:
   - Rows can **enter** (any employee books a future date).
   - Rows cannot **leave**. There is no reschedule in this release, `booking_date` is never updated, and a cancel moves `confirmed → cancelled` — both of which this view shows.

   An insert before the page boundary therefore pushes a row *down*, which produces a **duplicate** on the next page, never a skip. A duplicate in a 50-row admin list is a cosmetic fault; a silently skipped booking on the screen that answers *"who is in?"* is not. **The one case that does skip** is office midnight advancing `today` under an open tab, which drops rows off the front — and that is a stale-tab condition this product already accepts everywhere except the my-bookings list (ADR-007's discussion of `office.today`). Named, not hidden.

3. **The count line wants it.** §2.5. A page query whose predicate is the filter alone lets one round trip return both the page and the total. With a keyset cursor the predicate *contains* the cursor, so the same count answers "rows from here on", and AC-07 needs a second query.

**So: offset, and the general rule is a criterion rather than a preference.** I recommend one sentence in `api-standards.md` §Pagination (§8) rather than a project-wide "always offset", because "always offset" would be *wrong for US-010*:

> A paged collection whose page is defined by a **row count** takes `?page`; one whose page is defined by a **date window** takes a date cursor. The first needs a total order and tolerates an offset; the second cannot fix a page size without putting a composite cursor on the wire.

**`?page`, not `?offset`.** DEV proposed `?offset=`. Three reasons for `page`, none of them decisive alone:
- The standard says `page`.
- `?offset=50` encodes the page size in the client's arithmetic. If 50 ever changes, an `offset` bookmark silently lands mid-page; a `page` bookmark stays correct. AC-04's 50 is a *product* number (REQ-011) that a PO could revisit.
- It keeps US-010's property that the browser echoes a server-supplied value and never computes one.

**No client `limit`, deliberately — and this is a departure from the standard's literal words.** `api-standards.md` says `?page&limit with a documented maximum`. US-010 established the opposite and stated it in the schema's own docblock: *"the page size is the server's"*. I side with US-010 here, on a security argument specific to this endpoint: this is **the one route in the system that returns everybody's whereabouts**, and a client-supplied `limit` is a bulk-extraction dial that then needs a clamp, a clamp test, and a reviewer who remembers why the clamp is there. AC-04 fixes 50. A parameter that may take exactly one value is not a parameter. The standard gets the edit in §8 rather than a silent divergence.

### 2.5 What the count line counts — a decision the spec does not make

AC-07: *"a count line states the query in prose"*. SCR-005's example: *"24 bookings · from Mon 7 Sep · all statuses"*, and ST-04's is *"0 bookings"*.

**Neither the story nor the screen says whether the number is the total matching the view or the number currently loaded.** They differ the moment **Show more** is pressed.

**Recommendation: the total matching the view.** The line's stated job is *"restating the active filter in words"* so that an occasional administrator *"knows what he is looking at before he trusts it"*. A number that changes from 50 to 100 when you press a button is describing the *page*, not the query, and would read as the filter having changed. ST-04's *"0 bookings"* is plainly about matches.

Consequence: `total` is the full filtered count, and page 1 of 137 bookings reads *"137 bookings · from Mon 7 Sep · all statuses"* above 50 rows. That is the behaviour to build, and it is **open item 1** for UX/PO to confirm, because it is a copy decision on SCR-005's own line and I am reading intent from two sentences.

### 2.6 Cache-Control

```ts
res.setHeader('Cache-Control', 'private, no-store');
```

Same as `GET /api/bookings` and `GET /availability`. This response is one caller's, and it is the most sensitive read in the system. **This closes US-002 design note open item 8** — *"`Cache-Control: no-store` … with the first story that renders real data (US-010 / US-013)"* — for the admin half; US-010 already closed the employee half.

### 2.7 Errors — nothing new in the contract

Walking `error.ts`'s list, the reachable codes are `invalid_request` (a bad `page`), `no_session` / `session_expired` / `session_invalid` / `account_inactive` (the chain), `admin_only` (the guard — **AC-10**), `password_change_required` (the enforced chain), and `internal_error`. **All seven already exist.** `libs/contracts/src/error.ts` is not modified, and a new code appearing in this PR is a review finding.

---

## 3. The query

### 3.1 The `user_profiles` join — DEV's claim 4 confirmed, with a caution

DEV is right on all three counts, and the recommended fix is the right one.

**The ambiguity is real.** `0003_bookings.sql:26` and `:36` give `bookings` two foreign keys into `user_profiles` (`user_id`, `cancelled_by`). A bare `user_profiles(full_name)` embed is ambiguous and PostgREST refuses it at runtime. `desks(desk_number)` has never hit this because `desk_id` is the only FK to `desks` — DEV's reading of why the existing embeds are safe is correct.

**`user_profiles!user_id(full_name)` is the right hint.** PostgREST's disambiguation accepts the foreign-key constraint name **or** the joining column name. Prefer the column, exactly as DEV argues: the constraint name is Postgres-generated and appears nowhere in this repository, so depending on it makes the query depend on a string nobody wrote down; `user_id` is written at `0003_bookings.sql:26` and is stable under this project's own rules (changing it is a migration, which is Complex).

```ts
.select('id, booking_date, status, desks(desk_number), user_profiles!user_id(full_name)', { count: 'exact' })
```

**The caution, and it is the same species as US-002 §5.** This is a **runtime-only** property. `bookings.repository.spec.ts`'s recording fake records the select *string*; it cannot tell a hint PostgREST accepts from one it rejects, so a wrong hint produces a green suite and a `500` in front of an administrator. That is precisely the combination this repository already has a mechanism for: `bookings.repository.concurrency.spec.ts`, gated on `RUN_BOOKINGS_CONCURRENCY_TEST=1`, established for exactly this class of assumption (*"it cannot prove the assumption that logic depends on"*).

**Recommended: add one test to that gated file** — seed two profiles, a desk and a booking, run the real `listAllBookings`, assert `employeeName` is the **holder's** name and not the canceller's (seed a cancelled booking whose `cancelled_by` differs from `user_id`, so a hint pointing at the wrong FK fails loudly rather than coincidentally passing). Paste the run's real output in the PR.

*Rejected: naming the constraint explicitly in a migration.* It would make the hint self-documenting and it is a `supabase/migrations/**` change — a protected path — for a query-string convenience. DEV's instinct to avoid it is right.

*Rejected: two round trips (page the bookings, then fetch profiles by id set).* It sidesteps the embed entirely and is a genuine fallback if the hint cannot be verified. It costs a second query and re-solves a problem PostgREST solves, so it is **plan B**, recorded here so it does not have to be re-invented under pressure.

### 3.2 The predicate and the order

```
from bookings
where booking_date >= <office today>
order by booking_date asc, created_at asc, id asc
range(offset, offset + 49)
count: exact
```

- **`>= today` and no status filter.** AC-02 is exactly these two facts, and the *absence* of `.eq('status', …)` is half of it — *"a cancellation made minutes ago is visible rather than filtered away"*. Worth a comment in the repository saying so, the way `listMyBookingsInWindow` already does.
- **Ascending**, per ST-01's *"soonest first"*. This is the opposite of US-010's DESC list; do not copy that ordering across.
- **`today` is passed in, never read here.** `officeToday(nowMs(), officeTimezone)` in the service, exactly as `cancelOwnedBooking` receives its `today`. This repository reads no clock.
- **The third sort key is load-bearing.** Offset paging over a non-unique sort key is *unstable*: two rows sharing `booking_date` may come back in either order on two requests, so page 2 can legitimately repeat or omit a row with no data having changed. `created_at` narrows it; only `id` (a primary key) makes the order **total**. US-010 already learned the "second sort key is not belt-and-braces" lesson twice (`listMyBookingsInWindow`, `findMyLastBookedDeskId`); this is that lesson plus the uniqueness requirement offset paging adds. **A reviewer should refuse a two-key order here.**

### 3.3 The index — DEV's claim 2, confirmed with one correction

No migration. `bookings_booking_date_status_idx on bookings (booking_date desc, status)` exists at `0003_bookings.sql:78`, and its comment does name `REQ-011-013`.

**The correction:** it serves the **range predicate** (`booking_date >= today`), scanned backwards for the ASC order. It does **not** cover `created_at` or `id`, so Postgres sorts the matching set rather than reading it pre-sorted. At the story's own stated scale — *"thousands of rows after a year in service"* — that is unremarkable. Say it accurately in the PR so that if this list is ever slow, the next person looks at the right thing rather than trusting a comment that overclaims.

### 3.4 The count, and the large-offset question

`{ count: 'exact' }` returns the count **after filters and before the range** — the full matching total, which is what §2.5 needs, in the same round trip as the page.

- **Exact is right at this scale**, and its escape hatch is named rather than built: if the office ever reaches a size where an exact count over the filtered set is measurable, PostgREST's `planned`/`estimated` count modes are the next step. Not now — *"thousands of rows … AC-04's paging is the whole answer"*.
- **A large offset does not amplify cost.** `OFFSET 5_000_000` over a 3,000-row matching set costs the same as `OFFSET 3_000`: the scan is bounded by the result set, not by the offset value. So `?page=99999` is not a denial-of-service lever, and the `MAX_PAGE` bound in §2.2 exists only to keep the arithmetic inside a safe integer.

**One behaviour that must be verified, not assumed** — the second half of §3.1's caution. PostgREST has historically answered a `Range` entirely beyond the result set with **416 Range Not Satisfiable**, which supabase-js surfaces as an error, not as an empty page. That condition is reachable legitimately: a tab left open across office midnight, or a page number a human typed. **If it is a 416, the repository must map it to an empty page** (`items: [], nextPage: null`) rather than letting it throw into a `500` — and that mapping needs the same discipline `insertConfirmedBooking` uses: recognise the one expected shape, throw on anything else. Verify it in the gated harness alongside the embed. **Open item 2.**

---

## 4. Where the code goes — reuse `modules/bookings`, but not `AvailabilityRepository`

DEV proposed a twelfth method on `AvailabilityRepository`, and invited disagreement. **I half agree: right module, wrong object.**

### 4.1 Right module

ADR-004 follow-up 3 anticipated this story by name:

> *"REQ-011's admin bookings list (a later story) inherits this rule rather than re-deciding it: it reads `bookings`, `user_profiles` and `desks` from its own repository, writing none of them."*

Read literally, *"its own repository"* could mean one inside `modules/admin`. **It should not, for two reasons that only become visible looking forward:**

1. **US-015 will WRITE `bookings`.** ADR-004's one hard rule is that only the owning module writes a table, and `modules/bookings/README.md` declares `bookings` owned there. An admin-cancel implemented inside `modules/admin` would either violate that rule or need a port back into `modules/bookings` — the *"declared cross-module read port"* shape ADR-004 explicitly rejected. **Put the admin read where the admin write will have to live.**
2. **ADR-007's threading risk doubles otherwise.** ADR-007's own "Harder" section: *"Every response that carries a booking's status must pass the office today into its mapper."* A second service in a second module means a second `nowMs`/`officeTimezone` wiring, and a second place to forget it.

### 4.2 Wrong object — and this is a security-shaped argument, not a tidiness one

**Every method on `AvailabilityRepository` today is either desk-scoped or filtered to `user_id`.** That invariant is what keeps US-006/AC-06 and US-007/D-03 honest, and the file's docblocks lean on it repeatedly — *"`.eq('user_id', userId)` is what keeps US-007/D-03's anti-enumeration guarantee structural"*, *"Never widen the select list"*.

`listAllBookings` is the first method in this codebase that reads **across employees**. Putting it as a twelfth method on that object destroys a cheap, checkable invariant ("if it is in this file, it is scoped to the caller") and leaves an unscoped cross-employee query sitting one line away from `listMyBookingsInWindow`, which is a copy-paste hazard on the exact surface AC-10 protects.

**Recommended:**

```
apps/api/src/modules/bookings/admin-bookings.repository.ts   AdminBookingsRepository / adminBookingsRepository
apps/api/src/modules/bookings/admin-bookings.service.ts      createAdminBookingsService({ bookings, nowMs, officeTimezone })
```

The interface name and its docblock state what the object is: **cross-employee, reachable only behind `requireAdmin`, and never to be called from a route outside `/api/admin/*`.** Same device as US-002 §2.2 — make the guarantee structural rather than remembered. It is one extra file, and it carries a rule.

The service is thin and has exactly one job beyond mapping: obtain `today` once via `officeToday(nowMs(), officeTimezone)` and pass it both to the repository (the predicate) and to `bookingDisplayStatus` (AC-06) — **one clock reading for both**, the discipline `cancelBooking` already states for `cancelledAt`/`today`.

**`bookings.repository.ts`, `bookings.service.ts` and `bookings.router.ts` are not modified.**

### 4.3 The recording fake needs two new verbs

`bookings.repository.spec.ts`'s fake records `select/eq/gte/lte/lt/order/limit/insert/update/single/maybeSingle`. It has **no `.range()` and no `count` option**. `admin-bookings.repository.spec.ts` should extend the same pattern (record `range` and the `select`'s second argument, and return `{ data, count }`), not introduce a mocking library — the existing fake's stated virtue is that *"what is pinned is visible in the test itself"*. Whether that lives as a shared helper or a second fake is DEV's call; it is a test-factoring decision, not a design one.

---

## 5. `admin.router.ts` and the wiring

**It becomes a factory.** `createAdminRouter(deps)`, mirroring `createAuthRouter` and `createBookingsRouter`. The current bare `export const adminRouter = Router()` has no seam for a service, and its docblock's own sentence — *"Adding one here is a new contract and belongs to the story that needs it"* — is an invitation this story accepts.

```ts
// apps/api/src/modules/admin/admin.router.ts
export interface AdminRouterDeps { bookings: AdminBookingsService; }

export function createAdminRouter({ bookings }: AdminRouterDeps): Router {
  const router = Router();

  router.get('/bookings', async (req, res, next) => {
    try {
      const parsed = allBookingsQuerySchema.safeParse(req.query);
      if (!parsed.success) throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');

      const result = await bookings.listAllBookings(parsed.data.page ?? 1);

      res.setHeader('Cache-Control', 'private, no-store');
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

- **No `requireUser`, and no role check.** `bookings.router.ts` needs `requireUser` because it threads `req.user.id`; this route does not read the user at all. The authority is the mount (§0). A role check here would be a second, forgettable copy of `requireAdmin`.
- **A repository failure propagates to `next(error)`**, never caught into an empty page. That is what keeps AC-08's `total: 0` (a real empty system, ST-03) distinguishable from ST-05's load error — the same reasoning `bookings.router.ts:60-63` states for US-010.

**Update the docblock.** Its current text — *"empty in US-001 … adminRouter is EMPTY"* — becomes false. Rewrite it to keep the US-001/AC-03 property *stated* rather than implied, because the property survives and a future reader needs to know why: the guard still precedes routing, so an Employee token still gets `403` on any `/api/admin/*` path, and an Admin token on an unknown one still gets `404`. **US-001's own tests are unaffected** — they request `/api/admin/anything`, not `/api/admin/bookings`, and that path still 404s.

**`composition.ts`:**

```ts
export interface BuildAppOptions {
  // …
  /** US-013 test seam — overrides the real cross-employee `bookings`/`desks`/`user_profiles` read. */
  adminBookings?: AdminBookingsRepository;
}

const adminBookingsService = createAdminBookingsService({
  bookings: options.adminBookings ?? adminBookingsRepository,
  nowMs,
  officeTimezone,
});

return createApp({
  authRouter: …,
  adminRouter: createAdminRouter({ bookings: adminBookingsService }),
  bookingsRouter: …,
  requireSession: session,
});
```

Same shape as the `availability` seam, same reason (`buildApp` stays the one test seam). `http/app.ts` is **not modified**: `AppDeps.adminRouter` is already typed `Router`, and the mount at line 78 already carries both guards.

---

## 6. The two scope calls — both confirmed — and three more

### 6.1 No action column (DEV's item 8) — **confirmed**, and it closes an open invitation

DEV's precedent is exact, and the code says it in the file itself. `BookingRow.tsx:7-10`:

> *"**`onCancel` (US-011/AC-01, design note §5.4)** replaces the deliberate absence `decisions.md` D-05 recorded: cancellation's behaviour was explicitly deferred to this story."*

US-010 shipped a row with no action affordance at all; US-011 added the prop. **US-013 should do the same and let US-015 add the slot.** Three supports:

1. **AC-03 enumerates four fields.** Date, desk, employee, status. There is no fifth.
2. **The story assigns the column's content elsewhere.** The UI section: *"US-015 [builds] the cancellation"*. SCR-005's ST-07 — the non-cancellable row and its reason — is not in this story's state list.
3. **PRIN-2 makes a half-built column worse than none.** A column containing only em dashes, for every row, because nothing is ever cancellable yet, is a column that communicates a falsehood.

**On the edge-case bullet DEV asked about** — *"A row that is not cancellable states its reason in words in the card layouts … US-015 owns the reason itself"* — it does **not** oblige building the column's structure now. It is a constraint on how US-015 renders, placed in this story's file because the edge case belongs to the list. The sentence's own second half assigns it. Building the structure now would mean shipping an empty region in three layouts with no content and no test that can fail.

**And this closes something.** `BookingRow.tsx:2-5` left a question open to this story by name:

> *"US-013's admin list shows a different row (it carries the employee's name) — extraction is that story's call, with two real consumers in front of it."*

**My answer: do not extract. `BookingRow.tsx` is not modified.** Not because two consumers are too few, but because there is **no shared DOM to extract**. SCR-002's row is a flex `<div>`; SCR-005's is a real `<table>` at ≥1024px, and its accessibility section makes that load-bearing — *"a screen reader announces column headers per cell, which is why this is not a list of divs"*. A `<div>` row cannot be a `<tr>`. A shared component serving both would be a props union over two unrelated markup trees, and it would move a screen-private component onto a **Complex** shared surface to do it. `AdminBookingRow` is screen-private to `all-bookings/`, exactly as `BookingRow` is to `my-bookings/`.

### 6.2 The ST-03 empty state (DEV's item 9) — **confirmed**

Ship *"Nobody has booked a desk yet."* alone. Omit *"Add desks so people can book."* and the SCR-006 link.

The project already has this rule, written for the same situation. `routes.tsx`'s docblock: *"a route with no screen behind it is a 404 that looks like a bug"*, and US-002 §6.1 applied it to keep a **Settings** row out of the account menu until `/settings` existed. SCR-006 does not exist, `modules/desks/` is a README stub, and there is no way to ask whether the desk inventory is empty without inventing the endpoint that would answer it.

**AC-08 is fully met** — it asks only that *"an empty state says exactly that"*. The conditional branch is SCR-005's refinement, not an AC. Carry it as a follow-up for whichever story builds desk administration (**open item 4**).

**One forward note that will save US-014 a wrong turn.** In US-013, `total === 0` unambiguously means ST-03, because there are no filters. In US-014 it becomes ambiguous between ST-03 and ST-04, and the distinguishing fact — *"is any filter off its default?"* — is **browser state**, not a wire field. Do not add an `isFiltered` or `hasBookingsAtAll` field to this envelope in anticipation; US-014 will have the answer in its own component.

### 6.3 Do not widen `SkeletonRow` — add a screen-private one

ST-02 requires skeletons *"at real row height"*, and AC-09 repeats it. `SkeletonRow` is sized to `--desk-row-height` and is shared by SCR-003 and SCR-002. **Changing its geometry is a shared-component change — a Complex surface — and it would move two other screens.**

SCR-005's own handoff already names the component that should exist: *"Also built here and reusable: … `Admin skeleton row`"*. Build `AdminSkeletonRow` inside `screens/all-bookings/`, on the same column grid as the table row so nothing moves when data lands. `components/skeleton-row/**` is not modified.

### 6.4 AC-01 — DEV's item 10 confirmed

`landing.ts:14` returns `/admin/bookings` for an admin, and `routes.tsx` already guards that address with `RequireRole role="admin"` inside the `RequireSession` shell. **AC-01 is substantially pre-proven, and no routing machinery should be added.**

One added assertion in `landing.spec.ts` citing `US-013/AC-01` is the right amount: it can fail (someone changing the landing path breaks it), which is what makes it a test rather than a citation. The `RequireRole` half is US-001's and already covered — do not duplicate it.

DEV's plan to rewrite `AllBookings.spec.tsx` around `AuthProvider` + `MemoryRouter`, mirroring `MyBookings.spec.tsx`, is correct and necessary: the real screen calls `useAuth()` for `api` and `office`. **Keep both existing US-004/AC-07 toast tests passing** — they cite `US-004/AC-07` in the manifest, and losing them would silently drop coverage for a different story.

### 6.5 AC-11's proof mechanism is the one genuinely unresolved thing

Not a scope question, but the one place where I cannot hand DEV a settled answer, so it is named rather than glossed.

**Fact:** there is **no `matchMedia` anywhere in `apps/ui/src`.** Every responsive switch in this codebase — the shell at 1024, the dialog at 768, the account menu's 768–1023 band — is pure CSS. **jsdom evaluates no media queries and performs no layout**, so a CSS-only table↔card switch is **unprovable at the component level**, and AC-11 needs a passing test citing `US-013/AC-11` for `aidlc-check` to go green.

**Recommendation: render both trees, and let CSS show exactly one**, switching at 1024px.

- The `<table>` tree keeps the real table semantics SCR-005 requires at ≥1024.
- The card list is free to be the 3-line stack the 360 frame draws, which four `<td>`s cannot become.
- `display: none` removes a subtree from the accessibility tree, so only one is ever announced.
- **Both are assertable in jsdom**: a component test can assert the table has `<th>`s in the order Date · Desk · Employee · Status, and the card carries the same fields in the same order — which is literally AC-11's *"the same fields stack in the same order"*.
- The cost is a duplicated DOM subtree for ≤50 rows, and one CSS assertion for the 1024 boundary that the QA note names (1023 vs 1024).

*Rejected: `display: block` overrides on one `<table>`.* Changing `display` on table elements drops their implicit ARIA roles in every major browser, so the semantics SCR-005 argues for would silently vanish at exactly the width where the table exists.

*Rejected: a `useMediaQuery` hook.* Directly testable, and it introduces the first JS breakpoint in a codebase with zero, so the next author has two patterns to choose between wrongly.

**Open item 5**, for UX and DEV — I am recommending a mechanism, not settling a layout, and the pixel truth is in the frames DEV has.

---

## 7. `libs/contracts` — why nothing existing fits

DEV's item 6, verified field by field, because *"no existing shape is close enough"* is the load-bearing claim under the tier (§0) and a reviewer will check it.

| `myBookingsResponseSchema` | US-013 |
| --- | --- |
| `myBookingListItem` has **no employee** | AC-03 requires one |
| `nextBefore: OfficeDate \| null` — a **date** cursor | AC-04 needs a **page**, and §2.4 shows the date cursor cannot hold a 50-row page |
| **no total** | AC-07 needs one |
| ordered **DESC**, 30-day floor | ST-01 is **ASC** with no floor (AC-05) |

Four mismatches, three of them structural. **A genuinely new set of schemas, in the same file** (`libs/contracts/src/bookings.ts`), under a section comment naming US-013 — the convention US-010's section already set in that file. `bookingDisplayStatusSchema` and `officeDateSchema` are reused verbatim.

### 7.1 AC-05 is provable today, without building any of US-014

AC-05's *Given/When* point at US-014 (*"When the date filter reaches back to them"*), which looks like it cannot be proven here. It can, one level down.

**`listAllBookings` must take `from` as a parameter** regardless — a repository in this codebase never reads a clock (`cancelOwnedBooking`'s docblock states the rule). In US-013 the service always passes `officeToday(...)`. So a **repository** test may pass `from` = 500 days ago and assert a booking from well over a year back comes back, which is AC-05's substance: *there is no archive cut-off in this query*. No wire field, no `from` query parameter, no US-014 machinery.

That is also the test the QA note asks for (*"AC-05 needs a booking seeded well over a year back — easy to miss because no fixture naturally produces one"*) at the level where it can actually fail.

### 7.2 What US-014 inherits (forward notes only — build none of it)

- Its filters extend `allBookingsQuerySchema` with `from`, `to`, `status`, `deskId`. The envelope may need a `from` echo for the count line (§2.3).
- **REQ-013's Completed filter is a compound predicate**, not an equality: `status = 'confirmed' AND booking_date < today`. ADR-007's "Harder" section and follow-up 1 both say so, addressed to US-013/US-014 by name. US-013 writes no status predicate at all, so this lands squarely on US-014.
- ST-04 vs ST-03 is browser state, not a wire field (§6.2).

---

## 8. No new ADR — and the honest counter-argument

**Recommendation: no ADR.** The test, the same one US-002 §8 applied: does the decision bind work beyond this story, with a rejected alternative a future author would otherwise re-litigate?

- **The route's placement** is not a decision — it is a commitment already made in `api-standards.md:10` and US-010's note §1.1, and honoured here.
- **The cross-module read** is ADR-004, applied exactly as its own follow-up 3 anticipated. A story that consumes an ADR is not a story that needs one.
- **The derived status** is ADR-007, applied exactly as its own follow-up 1 instructs.
- **The paging shape** is the one real trade-off, and it is the one DEV rightly flagged. It **does** reach beyond this story: future admin lists (Desks, People) will copy it, and a future author comparing `GET /api/bookings` (keyset) with `GET /api/admin/bookings` (offset) will absolutely ask why.

**But what settles that question is a criterion, not an architecture decision, and it belongs in the document that already covers pagination and already names this endpoint.** An ADR saying "admin lists use offset" would be *wrong for US-010* and would immediately need the same qualifier. Two consequential edits instead — the same treatment US-001 gave the `503` row and US-002 gave the `204` row:

1. **`ai/standards/api-standards.md` §Pagination.** Replace *"Unbounded collections take `?page&limit` with a documented maximum"* with the criterion in §2.4, plus the rule that **the page size is the server's, never a client parameter**, citing both endpoints as the two worked examples. This is where a developer building the Desks list will actually look.
2. **`apps/api/src/modules/bookings/README.md`.** ADR-004 requires each module's README to state which tables it **owns** and which it **reads**. It currently says *"Reads: `desks`"*. This story makes it read **`user_profiles`** as well. Leaving that unstated breaks the one declaration ADR-004 relies on a reviewer checking.

**The honest counter-argument, so you can overrule me cheaply:** if you expect four or more admin list endpoints in this release and want their shape held by a document with a rejected-alternatives table rather than by two sentences in a standard, an ADR is cheap and I would not argue hard. I do not expect that — this BRD has three admin lists, the standard already names this one, and §2.4's criterion fits in two sentences. **It is your call, and it is the one place in this note where both answers are defensible.**

---

## 9. File placement

**New — `apps/api`**

```
apps/api/src/modules/bookings/admin-bookings.repository.ts      AdminBookingsRepository (§4.2)
apps/api/src/modules/bookings/admin-bookings.repository.spec.ts recording fake + range/count (§4.3)
apps/api/src/modules/bookings/admin-bookings.service.ts         one clock reading, ADR-007's mapper
apps/api/src/modules/bookings/admin-bookings.service.spec.ts    AC-06, AC-07's total
apps/api/src/modules/admin/admin.routes.spec.ts                 AC-04's boundary, AC-10, AC-02
```

**New — `apps/ui`** (layout only; the pixel truth is in DEV's frames)

```
apps/ui/src/screens/all-bookings/fetch-all-bookings.ts   (+ .spec.ts)   mirrors fetch-my-bookings.ts
apps/ui/src/screens/all-bookings/use-all-bookings.ts     (+ .spec.ts)   loading/ready/error + page accumulation
apps/ui/src/screens/all-bookings/AdminBookingRow.tsx     (+ .spec.tsx)  screen-private (§6.1)
apps/ui/src/screens/all-bookings/AdminSkeletonRow.tsx                   screen-private (§6.3)
apps/ui/src/screens/all-bookings/ResultSummary.tsx       (+ .spec.tsx)  AC-07; screen-private until SCR-006/008 need it
apps/ui/src/screens/all-bookings/copy.ts                 (+ .spec.ts)   exact strings, per my-bookings/copy.ts
apps/ui/src/screens/all-bookings/all-bookings.css
```

**Modified**

```
libs/contracts/src/bookings.ts                  + US-013's query/item/response schemas (§2.2, §2.3)
apps/api/src/modules/admin/admin.router.ts      bare Router -> createAdminRouter; docblock (§5)
apps/api/src/composition.ts                     + adminBookings seam; wire createAdminRouter (§5)
apps/api/src/modules/bookings/README.md         now READS user_profiles — ADR-004 requires it (§8)

apps/ui/src/screens/all-bookings/AllBookings.tsx       the real screen; both toasts preserved
apps/ui/src/screens/all-bookings/AllBookings.spec.tsx  AuthProvider + MemoryRouter (§6.4)
apps/ui/src/lib/auth/landing.spec.ts                   + one assertion citing US-013/AC-01

ai/standards/api-standards.md §Pagination       the criterion + "page size is the server's" (§8)
inception/specs/index.md                        the US-013 row
knowledge/traceability/manifest.json            US-013 tests[]
```

**Not modified, and worth saying so:**

- **`supabase/migrations/**`** — §3.3. A migration in this PR is a review finding.
- **`apps/api/src/http/app.ts`** — the mount and both guards already exist. **AC-10 is inherited, not built** (§0).
- **`apps/api/src/http/middleware/**`** — nothing in the auth chain changes.
- **`apps/api/src/modules/bookings/bookings.{repository,service,router}.ts`** — §4.2. The employee-scoped objects keep their invariant.
- **`libs/contracts/src/error.ts`** — §2.7. Seven reachable codes, all existing.
- **`apps/ui/src/components/**`** — `StatusChip` already carries the booking variants; `EmptyState`, `Alert`, `Button` fit as they are; `SkeletonRow` must not be widened (§6.3).
- **`apps/ui/src/screens/my-bookings/BookingRow.tsx`** — §6.1. The extraction US-010 invited is declined, with a reason.
- **`apps/ui/src/routes.tsx`** — the address and its guard exist (§6.4).

Four of those are protected paths. **A story that adds the system's most sensitive read without touching the schema, the auth chain, the error contract or a shared component's props is the shape to aim for**, and it is the payoff of §0 and §4.2.

---

## 10. Test placement per AC

QA's two flags are the organising constraints: **AC-10 must be a server-side test with an Employee session**, and **AC-04's boundary is 50 vs 51**.

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `landing.spec.ts` — an admin with no password mark lands on `/admin/bookings`. The `RequireRole` half is US-001's, already covered | component |
| AC-02 | `admin-bookings.repository.spec.ts` — the recorded query carries `gte('booking_date', today)` and **no status filter**; `admin.routes.spec.ts` — a cancelled row dated tomorrow is in the body | repository + route |
| AC-03 | `admin.routes.spec.ts` — the body parses against `allBookingsResponseSchema` and each item carries all four fields; `AdminBookingRow.spec.tsx` — all four render | route + component |
| **AC-04** | `admin.routes.spec.ts` — **exactly 50 matching → 50 items, `nextPage: null`; 51 → 50 items, `nextPage: 2`; `?page=2` → the 51st.** `AllBookings.spec.tsx` — **Show more** present iff `nextPage !== null`, and a press appends rather than replaces | **route** + component |
| AC-05 | `admin-bookings.repository.spec.ts` — `from` = today − 500 days returns a booking from well over a year back; no floor in the query (§7.1) | repository |
| AC-06 | `admin-bookings.service.spec.ts` — a stored `confirmed` row dated before `today` arrives as `completed`; a `cancelled` row dated next week stays `cancelled`. The rule's own unit proof is `booking-history.spec.ts` (US-010) — **do not re-test the rule, test that this endpoint applies it** | service |
| AC-07 | `admin.routes.spec.ts` — with 137 matching rows, page 1 carries `total: 137` and 50 items (§2.5); `ResultSummary.spec.tsx` — the exact sentence | route + component |
| AC-08 | `admin.routes.spec.ts` — an empty system gives `total: 0, items: [], nextPage: null`; `AllBookings.spec.tsx` — the ST-03 copy, and **no** Add-desks action (§6.2) | route + component |
| AC-09 | `AllBookings.spec.tsx` — skeleton rows while in flight (ST-02); `Alert tone="danger"` with **Try again** replacing the table on failure, shell intact (ST-05) | component |
| **AC-10** | `admin.routes.spec.ts` — **an Employee session against `GET /api/admin/bookings` gets `403 admin_only` and a body containing no booking data**; no token → `401`; an Admin → `200` | **API — a UI test is not the proof** |
| AC-11 | `AllBookings.spec.tsx` — the table tree has `<th>`s in order Date · Desk · Employee · Status, and the card tree carries the same fields in the same order; plus the 1024 boundary assertion (§6.5) | component — **mechanism is open item 5** |
| §3.1 / §3.2 | `bookings.repository.concurrency.spec.ts` — the FK hint returns the **holder's** name, and an out-of-range page (§3.4) | real Postgres, gated |

**Two assertions that must not be written against the fake.** `testing-standards.md` bans asserting the mock, and both of this story's real risks (§3.1's hint, §3.4's out-of-range range) are invisible to a recording fake by construction. The gated harness is where they live, and the PR carries its pasted output. **Green unit tests plus an unrun harness is the exact combination that ships a `500` on the administrator's landing screen.**

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§2.5** — does AC-07's count line state the **total matching the view** (my recommendation) or the number loaded so far? Neither the story nor SCR-005 says, and they diverge the moment **Show more** is pressed | `/ux` + PO | `total`'s meaning, and the copy |
| 2 | **§3.1, §3.4** — verify against real Postgres, in the existing `RUN_BOOKINGS_CONCURRENCY_TEST` harness: (a) `user_profiles!user_id(full_name)` returns the **holder**, not the canceller; (b) a page beyond the result set yields an empty `200`, not a `416`. Paste the output in the PR | DEV | **AC-03 and AC-04 being true in production** — no unit test can catch either |
| 3 | **§8** — offset here vs keyset in US-010: standards edit (my recommendation) or an ADR for future admin lists. Both defensible | Joy Joshua | nothing |
| 4 | **§6.2** — ST-03's *"Add desks so people can book"* branch and its SCR-006 link, deferred to whichever story builds desk administration | Manager → desks story | nothing |
| 5 | **§6.5** — AC-11's switch mechanism: two DOM trees with a CSS switch (my recommendation) is the only option that is both CSS-only, per this codebase's zero-`matchMedia` precedent, and provable in jsdom | `/ux` + DEV | **AC-11 having a test that can fail** |
| 6 | **§2.2** — `MAX_PAGE` is a bound on arithmetic with no requirement behind it. Keep or drop | Joy Joshua | nothing |
| 7 | SCR-005's component table gives the stacked skeleton **188px**; DEV's frame reading gives **160px** for the no-action variant and 188 for the cancellable one. Since §6.1 removes the action, 160 is likely right — confirm against the frame | `/ux` + DEV | nothing |
| 8 | The manifest's `US-013` node has no `decisions[]`, though ADR-007 names US-013 in its own **Serves** line. Only `US-012` carries the key today, so this is a convention gap rather than a defect — add `ADR-004`, `ADR-007` if you want it consistent | DEV | nothing |

---

## Notes outside the design note

Three things worth your attention separately:

1. **Everything DEV asserted, I verified against the code, and it all held.** Claims 1–6, 8 and 10 are accurate down to the line numbers. My corrections are additive: the index serves the *predicate* but not the *ordering* (§3.3), and the repository *object* should be new even though the *module* should be reused (§4.2).

2. **The two things most likely to ship broken are both runtime-only**: the FK embed hint and PostgREST's out-of-range behaviour. Neither can fail in the unit suite. Open item 2 routes both through the harness US-007 already built for exactly this class of problem — it exists, it's gated, and it costs one `npm test` run against a disposable Supabase project.

3. **On Figma** — DEV says they pulled the real hi-fi frames rather than working from the markdown spec, and the measurements they quoted are internally consistent with SCR-005's own text (the 1024 breakpoint, the 80px card minimum, the `--c-text-on-fill` header fix). I did not open the file myself; open items 5 and 7 are the two places where the frames, not this note, are the authority.

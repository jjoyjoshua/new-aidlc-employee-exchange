# US-014 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-014 — Filter all bookings by date, status and desk](../../stories/user-stories/US-014-filter-all-bookings.md) |
| **Screen**   | [SCR-005](../../design/screens/SCR-005-all-bookings.md) **ST-02, ST-04, ST-06, ST-12**. ST-01/ST-03/ST-05 are US-013's and are preserved; ST-07 – ST-11 are US-015's and are not touched |
| **Tier**     | Complex — a new route **and** `libs/contracts` (§0)                      |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), [ADR-007](../../../knowledge/decisions/ADR-007-derived-booking-status.md), and the [US-013 design note](../US-013-see-every-booking/design-note.md) — **no new ADR** (§8) |

**Advisory.** The human's GitHub review is the authority. `decisions.md` in this package stays DEV's.

The story hands `/architect` one question and says so plainly (line 106): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §4 and §3 are the answer. US-013's note settled most of this story's ground already; this note is deliberately shorter, and **every section that just applies a US-013 decision says so instead of re-arguing it.**

**The verdict, in one line each:**

- **AC-08 stays in this story, and this story builds the receiving half only** — the screen reads its filters from its own query string on mount; the link *out of* US-019's blocked dialog is US-019's, and §2 writes the URL it must construct (§2).
- **The desk list is its own admin resource, `GET /api/admin/desks`, read from `modules/desks`** — not embedded in the bookings envelope, and not a second desk read inside `modules/bookings` (§3).
- `allBookingsQuerySchema` gains four **optional** fields and one cross-field refinement; an absent `from` means *the server's today*, never "no floor" (§4).
- **`allBookingsResponseSchema` does not change.** §7.2's "may need a `from` echo" resolves to no, and §5 gives the criterion that settles it.
- **Both `completed` AND `confirmed` are compound predicates** over the two-valued stored enum. The inverse of `bookingDisplayStatus` becomes a second pure function beside it in `domain/`, with a round-trip property test (§6). **This is the single highest-risk line in the story.**
- **No migration, no middleware, no shared-component change, no `data-refresh.ts` change** (§9). `bookings_desk_id_booking_date_idx` was placed for this story in 2026-09 by US-006.

---

## 0. The tiering — confirmed, for two independent reasons

**Complex.** DEV's classification is right, and as with US-013 it is right twice over:

| Surface | What it is here |
| --- | --- |
| **Contract** | `libs/contracts/src/bookings.ts` gains four query fields and a refinement; a new desk-list schema pair joins it. A **protected path** (`task-surfaces.md:25-27`) |
| **Server** | A **new route**, `GET /api/admin/desks`. `task-surfaces.md:39` — Complex outright, regardless of diff size |

**The Medium carve-out does not apply to the new route.** `task-surfaces.md:89-90` carves out *"a new `GET` lookup endpoint following an existing read-only pattern, reusing the table **and an existing response shape**"*. The table is reused; **no existing response shape fits.** The only desk shape in the contract is `deskAvailabilitySchema` (`availability.ts:23-35`): `{ id, deskNumber, status: 'available' | 'taken' }`. Its `status` is a per-date occupancy fact, not `is_active`, and its docblock says an inactive desk *"is absent entirely"* — the exact opposite of what the filter needs (story Edge cases: *"A desk that is **Inactive** still appears in the desk filter"*). Reusing it would mean overloading a two-value enum whose comment says it exists so *"there is no third value"*. The carve-out fails on its second clause.

**What the filter half is, on its own:** the four query fields are Medium server-side (`task-surfaces.md:47` — *"a new **optional** request field where the column already exists"*; `booking_date`, `status` and `desk_id` all exist). The browser half is Medium (`task-surfaces.md:66-67` — *"a change inside one screen's folder that keeps its props and events"*, plus screen-private components), **provided the new `Select` stays screen-private** — §7.3.

**What it is *not*, and each absence is defended below:**

- **Not Persistence.** `bookings_desk_id_booking_date_idx on bookings (desk_id, booking_date)` exists at `0003_bookings.sql:79`, with the comment `-- REQ-031, BR-001.9`. **REQ-031 is this story's desk filter.** The index was placed by US-006 for exactly this read. `bookings_booking_date_status_idx` (`:78`) serves the range and the status. **A migration appearing in this PR is a review finding.**
- **Not a trust boundary.** Both new surfaces sit under the `/api/admin` mount that `app.ts` already guards with `requireSession` + `requireAdmin` (US-013 §0 verified it). US-014 has **no admin-only AC of its own** — the guard is inherited, not built, and `apps/api/src/http/middleware/**` is untouched.
- **Not a shared-component change.** `EmptyState` already carries the two contexts SCR-005 names. `Button`, `Alert`, `StatusChip` need nothing. **`DatePicker` must not be reused** — §7.4, and it is the most likely wrong turn in this story.
- **Not a data-fetching-layer change.** `apps/ui/src/lib/data-refresh.ts` is `task-surfaces.md:63`'s Complex surface, set once for the whole app (REQ-036/ADR-008). `AllBookings` does not subscribe to it today and **must not start** — no AC asks, and US-016's own edge case records the same restraint.

---

## 1. What this story actually is

One query gains four parameters, one screen gains a control cluster, and one rule gets inverted.

| AC | Where it is answered |
| --- | --- |
| AC-01 date range | `from`/`to` on the query (§4), `.gte`/`.lte` at the repository |
| AC-02 status | **The compound-predicate section, §6.** The one that ships broken if skimmed |
| AC-03 desk | `deskId` on the query, `.eq('desk_id', …)`, served by an index that already exists |
| AC-04 they combine | Four independent `where` clauses ANDed by Postgres. Nothing structural — but **the most under-tested AC**, §10 |
| AC-05 Clear | A pure default object in `filters.ts` (§7.1). Clearing sends no parameters, and the server's default *is* US-013/AC-02's view (§4.2) |
| AC-06 ST-04 vs ST-03 | Browser state, exactly as US-013 §6.2 instructed. `isFiltered(filters)`, a pure function (§7.1) — **and one honest problem with ST-03's existing copy, open item 2** |
| AC-07 the count line | The browser builds it from its own filter state plus `total` and `today`. **The envelope does not change** (§5) |
| AC-08 arriving pre-filtered | §2 — the half this story builds, and the half it does not |
| AC-09 re-query without losing controls | `useAllBookings`'s existing `generationRef` (`use-all-bookings.ts:45`) is already the machine for this (§7.2) |
| AC-10 three widths | The same CSS-only, `matchMedia`-free device US-013 §6.5 chose, applied to the filter bar (§7.5) |

---

## 2. AC-08 — build the receiving half, and only the receiving half

**Recommendation: option (a).** Build the filter mechanics so the arrival works, and build **no link from the blocked-deactivation dialog**, which does not exist. Do not drop AC-08.

### 2.1 Why not drop it

Three facts, and the first is decisive.

1. **US-019 already names US-014 as its supplier.** `US-019-take-a-desk-out-of-service.md`'s AC-06: *"they arrive at **All bookings** pre-filtered to that desk, from today, status **Confirmed** (SCR-006 structural decisions; **served by US-014/AC-08**)"*. The two halves are already assigned, in writing, in both directions. Dropping AC-08 leaves US-019/AC-06 pointing at nothing.
2. **Dropping it is a Gate 1 change**, not a delivery decision. US-014 is an approved story; removing an AC means a `change-request` issue routed to `/ba` and a second approval round, to remove work this story can do cheaply and correctly.
3. **The `Then` is entirely this story's.** AC-08's *Given* and *When* are US-019's and are unbuildable; its **Then** — *"they arrive here pre-filtered to that desk, from today, status Confirmed"* — is a property of this screen, and §2.2 makes it a test that can genuinely fail.

**This is the same shape the project has used three times**: US-007/D-03 built a deliberately narrow cancel endpoint *"only so SCR-003 ST-10 has something to call"*, and US-011 widened it; US-012's note deferred half of SCR-005 to US-013; US-013 §6.2 declined to build the *"Add desks"* branch because SCR-006 does not exist, on the rule *"a route with no screen behind it is a 404 that looks like a bug"*. **Building the destination and deferring the door is the established pattern. Building the door to a destination that does not exist is the thing that rule forbids — and that is not what this is.**

### 2.2 The mechanism: the screen's own query string, read on mount

`/admin/bookings?deskId=<uuid>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>&status=<confirmed|completed|cancelled>`

- **The browser's URL parameter names are the API's parameter names**, so `filters.ts` has one parse function and one serialize function serving both (§7.1). One vocabulary, not two.
- **`page` is never in the URL.** Paging is not a filter; a bookmark carrying `page=3` would restore a view whose first 100 rows are missing, which is a worse bug than the convenience is worth.
- **Read on mount; not written back on change.** The URL seeds the initial filter state and nothing more. Writing every filter change into history makes the back button undo filters one at a time — a behaviour no AC asks for, that interacts confusingly with **Show more**'s accumulated pages, and that would be speculative generality. `useSearchParams` with `replace: true` is the escape hatch if a later story wants shareable filtered URLs; it is not this story's.
  - *Accepted consequence, stated so it is not rediscovered as a defect:* an administrator who arrives pre-filtered, changes a filter, then reloads, gets the **original** pre-filter back. That is the honest reading of an address that was never updated.
- **A malformed parameter falls back to the default, it does not error.** A URL is user-editable input, and a hand-mangled bookmark must not produce ST-05. `parseFilters` returns the default for any field it cannot parse. A *well-formed but unknown* `deskId` is different: it is sent, the server filters on it honestly, and the result is ST-04. See §7.1 for what the desk **control** does with an id it cannot display.

**Rejected: React Router `location.state`.** It is the precedent this screen already uses for US-004/AC-07's toast (`AllBookings.tsx:55`), so it is a fair question. Against it: `state` does not survive a reload, so the filtered view evaporates on refresh on the one screen whose stated job is *"know what he is looking at before he trusts it"*; and a test would have to fabricate a navigation rather than simply rendering at an address. The toast is genuinely transient; a filter is not.

### 2.3 The URL US-019 must construct — and it is shorter than you expect

```ts
navigate(`/admin/bookings?deskId=${desk.id}&status=confirmed`);
```

**No `from` parameter.** AC-08 says *"from today"*, and that comes out right twice over without anyone sending a date:

- an absent `from` means *the server's own today* (§4.2), so the default already starts at today; **and**
- `status=confirmed` is itself the compound predicate `status = 'confirmed' AND booking_date >= today` (§6), so "from today" is enforced by the status filter regardless.

This is strictly better than sending a date, because SCR-006's screen would have to source "today" from `office.today` in the auth context — which `auth.ts:17-18` states goes stale across an office midnight with the tab open, and which ADR-007's alternatives table rejects for exactly this species of use. **US-019 never touches a clock.** Carried as open item 3 so US-019's author reads this as a contract rather than an omission.

The count line still reads *"… from Mon 7 Sep …"*, because with `from` absent the browser renders `today` from the response — which is always fresh for the request that produced it (§5).

---

## 3. The desk list — a separate resource, read from `modules/desks`

**Recommendation: `GET /api/admin/desks`, served by a new read-only repository and service in `apps/api/src/modules/desks/`, wired into `admin.router.ts`.** Not embedded in the all-bookings envelope, and not a second desk read inside `modules/bookings`.

### 3.1 Why not embed it in `GET /api/admin/bookings`

Four reasons; the third is the one that decides it.

1. **It is not a property of a page of bookings.** The envelope's job is one page and its count. Shipping 30–100 desks (BR-001.4) with every page means re-sending an unchanging list on every **Show more** and every keystroke-level filter change, on the most sensitive and most frequently re-queried read in the system. Sending it on page 1 only makes the envelope conditionally shaped — the species of drift this codebase has refused three times (US-006 §2.6, US-009 §2.3, ADR-007's rejected *"carry the stored status too"*).
2. **It couples two different lifetimes behind one `Cache-Control`.** `private, no-store` is correct for cross-employee bookings and needlessly strict for an inventory list. Embedded, they share one header forever.
3. **US-016 is the next story in this epic and needs this list anyway.** Its AC-01 wants every desk, *"**Active** and **Inactive** alike — in desk-number order"*; its AC-04 adds a per-desk count of upcoming Confirmed bookings. That is `GET /api/admin/desks`. If US-014 embeds the list in the bookings envelope, US-016 builds the endpoint regardless and the embed becomes **a second source for the same fact**. Building the endpoint now with the subset US-014 needs, and letting US-016 add `bookedAhead` **additively** (ADR-002's stated asymmetry), is one source growing rather than two sources coexisting.
4. **Adding the route costs nothing in tier.** It is Complex, and this story is already Complex for the contract change (§0). US-013 §0 established that a second Complex surface does not move anything.

*The honest point for embedding:* one round trip instead of two on first paint. It does not buy interactivity — the desk select is empty until its data lands either way (§7.6) — so it buys latency on a screen whose own spec prices a page at 50 rows. Not enough.

### 3.2 Why the read lives in `modules/desks`, not `modules/bookings`

ADR-004 permits the read anywhere (*"a module's repository may `SELECT` from another module's tables"*), so this is a placement question, not a permission one. **US-013 §4.1 already gave the rule, and applying it symmetrically gives the answer:**

> *"US-015 will WRITE `bookings`… **Put the admin read where the admin write will have to live.**"*

Desk writes will live in `modules/desks` — its own `README.md` says so (*"Owns (may write): `desks` — once US-015/US-017 build this module"*), ADR-004 follow-up 2 says so, and US-019 will add the deactivate path there. So the desk **read** belongs there too.

The alternative — a `listAllDesks` method on `admin-bookings.repository.ts` — is lint-clean and ADR-004-legal, and it is still wrong, for the reason ADR-004's own Context names: US-016 will build the desks module's read, and two modules would then select `desks` with two column lists and two orderings. That is *"the first inconsistency surfac[ing] as a 'consolidation' PR arguing after the fact over code nobody meant as a decision"*, which is the sentence ADR-004 exists because of.

**It is emphatically not `AvailabilityRepository`.** `bookings.repository.ts:152-161`'s `listActiveDesks` filters `is_active = true`, and US-006/AC-04 depends on that filter absolutely — an inactive desk must appear **nowhere** in availability (`0002_desks.sql:16-18`). A sibling method that deliberately drops the filter, sitting three lines away, is a copy-paste hazard on a requirement whose whole content is that `WHERE` clause. This is the same argument US-013 §4.2 made about cross-employee scope, on a different invariant, and it is stronger here because the two methods would differ by one omitted predicate.

**No `eslint.config.mjs` change is needed, and that matters** — it is a protected path. `eslint.config.mjs:15` lists `['auth','users','desks','bookings','notifications']`; **`admin` is not among them**, so `modules/admin` carries no import restriction and already imports `AdminBookingsService` from `modules/bookings`. Wiring a desks service alongside it is the identical, established shape. `modules/desks` itself may import nothing (`MAY_IMPORT.desks: []`), which a read-only repository over `infra/supabase` and `@desk-booking/contracts` satisfies.

### 3.3 The contract

```ts
// libs/contracts/src/desks.ts — NEW FILE, US-014's slice

/** One desk in the administrator's desk vocabulary (US-014/AC-03, story Edge cases). Every
 *  desk, ACTIVE AND INACTIVE — an inactive desk's historic bookings must stay findable, and
 *  US-019's own edge case states the same requirement from the other side. This is deliberately
 *  NOT `deskAvailabilitySchema` (`availability.ts`): that shape's `status` is a per-date
 *  occupancy fact and its docblock records that an inactive desk is absent from it entirely. */
export const adminDeskSchema = z.object({
  id: z.string().uuid(),
  /** `A-01` (BR-001.4). `z.string().min(1)`, not the format regex — strictness belongs on
   *  requests, exactly as `deskAvailabilitySchema.deskNumber` records. */
  deskNumber: z.string().min(1),
  /** `desks.is_active` (REQ-017, BR-001.7). Carried so the filter can mark an inactive desk in
   *  its own list rather than hiding it. US-016/AC-02 renders the same fact as a chip. */
  isActive: z.boolean(),
});

/** `GET /api/admin/desks`'s `200` body. An OBJECT, not a bare array, so a later story can add a
 *  field without changing the body's type — US-016 is expected to add `bookedAhead` to
 *  `adminDeskSchema` additively (ADR-002's asymmetry), and this story must NOT add it. Not
 *  `.strict()`, per `auth.ts`'s stated rule for every response in this package. */
export const adminDesksResponseSchema = z.object({
  /** Ordered `desk_number` ASC — `desks_desk_number_key` (`0002_desks.sql:35`) already serves
   *  the ORDER BY, so no index is needed and none is added. */
  desks: z.array(adminDeskSchema),
});
```

The query is `.strict()` with **no fields at all** — no `activeOnly`, no `q`. US-016/AC-09 refuses search on 30–100 desks; a filter parameter here would be inventing one.

The repository method is four lines, in `apps/api/src/modules/desks/desks.repository.ts`:

```ts
.from('desks').select('id, desk_number, is_active').order('desk_number')
```

Explicit column list, per ADR-004. No `.eq('is_active', …)` — **the absence is the requirement**, and it deserves the same kind of comment `listBookingsFromDate` carries for its own missing status filter.

`Cache-Control: private, no-store`, matching every other authenticated read in the system. Nothing here is personal data, but one rule for `/api/admin/*` is worth more than a per-route judgement.

**What this story must not build:** US-016's `bookedAhead` count. It is that story's AC-04, it needs a `bookings` aggregate this module may read but has no reason to yet, and building it here is US-016 inside US-014 — the exact move US-013 §2.3 refused when it declined to add `deskId` in anticipation of this story.

---

## 4. The query contract

### 4.1 The schema

```ts
// libs/contracts/src/bookings.ts — US-014 extends US-013's slice

/**
 * `GET /api/admin/bookings`. `.strict()`, matching every other request schema in this package.
 * Still deliberately no `limit`: the page size is the server's (US-013 design note §2.4).
 *
 * All four filters are OPTIONAL, and their absence is US-013/AC-02's default view — today
 * onward, all statuses — never "no floor" (§4.2). AC-05's Clear therefore sends NOTHING.
 */
export const allBookingsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),
    /** AC-01, inclusive. Absent = the office's today, resolved server-side (§4.2). */
    from: officeDateSchema.optional(),
    /** AC-01, inclusive. Absent = no ceiling. */
    to: officeDateSchema.optional(),
    /**
     * AC-02, and it filters the PRESENTED status, not the stored one — `bookingDisplayStatus`'s
     * own three-value vocabulary, reused rather than copied (ADR-007; §6). Two of these three
     * values are COMPOUND predicates over the two-valued stored enum, which is §6's whole
     * subject and the highest-risk line in this story.
     */
    status: bookingDisplayStatusSchema.optional(),
    /**
     * AC-03. The desk's ID, never its NUMBER: a desk can be renamed (BR-001.19, US-018), and a
     * filter keyed on the number would silently change meaning the moment one is. Matches
     * `bookingCreateSchema.deskId`. The vocabulary comes from `GET /api/admin/desks` (§3).
     */
    deskId: z.string().uuid().optional(),
  })
  .strict()
  /**
   * The story's edge case refuses an inverted range IN THE CONTROL. This refuses it at the route
   * edge as well, and that is not redundant: without it an inverted range returns an empty page,
   * which is indistinguishable from "nothing matches" (ST-04) on a screen whose whole job is
   * telling those two apart. A field-shape rule, not a business rule — `api-standards.md`'s
   * Validation section puts exactly this class at the edge with a `400`, and leaves
   * requirement-level rules in `domain/`.
   */
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: 'The end of the range cannot precede its start.',
    path: ['to'],
  });
```

Three mechanical notes for DEV:

- **`officeDateSchema` already refuses `2026-02-30`** (`booking-window.ts:10-32`), so the date fields need nothing further. Dates compare lexicographically, so `from <= to` is a string comparison — no arithmetic, no zone.
- **`.refine()` must come last**, and it makes the export a `ZodEffects` rather than a `ZodObject`. Consequence: `.extend()` no longer works on it. Nothing extends it; the router's `safeParse` and `z.infer` are unaffected. Say so in a comment so a future author is not surprised.
- **`bookingDisplayStatusSchema`'s docblock needs one honest edit.** It currently says *"Response-only"* (`bookings.ts:63-71`). US-014 makes it the vocabulary of the status **filter** too — which is the same vocabulary by construction, since you filter on what you see. Reusing it is right; **adding a third status enum to this file would be the drift ADR-007's own Consequences section warns about** (*"Two status enums exist in one contract file and will look like duplication"* — a third makes that warning come true). Edit the docblock, keep one enum. §8.

**No new error code.** `invalid_request` covers a bad date, a bad uuid, an unknown status word, an unknown field and an inverted range. `libs/contracts/src/error.ts` is **not modified**, and a new code in this PR is a review finding — the same line US-013 §2.7 drew.

### 4.2 An absent `from` means *the server's today*, and that is a decision

It could equally have meant "no floor", since US-013/AC-05 established there is no archive cut-off. **Today is right**, for two reasons:

1. **AC-05 requires it.** *"Clearing returns to today onward at all statuses (US-013/AC-02)."* If absence meant "no floor", Clear would have to send `from=<today>` explicitly, and the browser would need a today to send — the stale-clock problem §2.3 avoids.
2. **It keeps one definition of "the default view", on the server.** A bookmark with no parameters means "today onward" *tomorrow as well*, not "7 Sep onward" forever. `admin-bookings.service.ts:31` already derives `today` exactly once per request and threads it to both the predicate and the status derivation; that single reading now serves the filter default as well. **One clock reading, three uses.**

The wire-level effect is that AC-01's "reach back" is expressed by *sending* a `from`, which is precisely what US-013 §7.1 anticipated when it proved AC-05 at the repository by passing `from` = today − 500 days. That repository test keeps working unchanged and is now also this story's proof that a past `from` is honoured.

---

## 5. The envelope does not change — and the criterion that settles it

US-013 §7.2 left a forward note: *"The envelope may need a `from` echo for the count line."* **Worked through, it does not.** `allBookingsResponseSchema` (`bookings.ts:160-175`) is untouched.

AC-07's line — SCR-005's example, *"3 bookings · desk B-03 · from Mon 7 Sep · Confirmed"* — needs five facts. The browser has all five:

| Fact | Source |
| --- | --- |
| the count | `total`, already in the envelope |
| the date it starts from | the filter state when `from` is set; **`today` from the envelope when it is not** — and `today` is already there |
| the date it ends at | the filter state |
| the status word | the filter state |
| the desk *number* | the desk list from `GET /api/admin/desks`, keyed by the `deskId` in the filter state (§3) |

**`today` is already the echo of the default**, which is why no `from` echo is needed. And the general criterion, worth stating because it will come up again:

> **Echo a request value back only when the server may have changed it.** `today` is echoed because the server computed it. The four filters are applied verbatim — `.strict()` rejects unknowns, `.refine` rejects an inverted range, nothing is clamped or ignored — so echoing them would be echoing the browser's own state back to itself.

This also honours US-013 §6.2's instruction directly: **no `isFiltered`, no `hasBookingsAtAll`, no `appliedFilters`.** The ST-03/ST-04 discriminator is browser state, and §7.1 is where it lives.

---

## 6. "Completed" is a compound predicate — and so is "Confirmed"

**This is the section to read twice.** ADR-007's "Harder" section and follow-up 1, and US-013 §7.2, all flag Completed. **They under-state the problem: `confirmed` is compound too**, and it is the one a developer skips, because `.eq('status','confirmed')` looks obviously right.

Over the two-valued stored enum (`0003_bookings.sql:16`), with `today` from the service's single reading:

| Filter value (presented) | Predicate |
| --- | --- |
| `confirmed` | `status = 'confirmed'` **AND** `booking_date >= today` |
| `completed`  | `status = 'confirmed'` **AND** `booking_date <  today` |
| `cancelled`  | `status = 'cancelled'` — **any date.** ADR-007: *"A Cancelled booking stays Cancelled whatever its date"* |

The story's own QA note states the failure precisely: *"a passed **Confirmed** booking must appear under **Completed** and must not appear under **Confirmed**."* A naive equality passes the first half and fails the second, silently, on live data only.

### 6.1 The rule goes in `domain/`, as the inverse of the rule that already lives there

Do **not** write these predicates inline in the repository. That would put a second implementation of BR-001.5 in SQL, which is the thing ADR-007 exists to prevent (*"A rule implemented twice is drift"*) and which `modules/bookings/README.md` already names as the reason `refusalFor` is never re-derived.

Add one pure function beside `bookingDisplayStatus`, in `apps/api/src/domain/booking-history.ts`:

```ts
/** The date bounds and stored value a PRESENTED status resolves to — the exact inverse of
 *  `bookingDisplayStatus` below, and the reason US-014's status filter cannot be an equality
 *  test (ADR-007's "Harder" section, addressed to this story by name). Pure: `today` arrives as
 *  an argument, never read here. */
export interface DisplayStatusPredicate {
  stored: BookingStatus;
  /** Inclusive lower bound this status contributes, if any. */
  from?: OfficeDate;
  /** EXCLUSIVE upper bound this status contributes, if any — `booking_date < today`, stated
   *  exactly as ADR-007 states it, so no date arithmetic is needed anywhere. */
  before?: OfficeDate;
}

export function displayStatusPredicate(
  status: BookingDisplayStatus,
  today: OfficeDate,
): DisplayStatusPredicate;
```

**`task-surfaces.md:52-57` prices this correctly:** *"A **new** pure rule function is **Medium**, not Complex… But **changing an existing rule is Complex**."* We add one and change none. **`bookingDisplayStatus` must not be edited in this PR** — a reviewer should refuse any diff touching `booking-history.ts:40-47`.

### 6.2 The property test that makes the two rules unable to disagree

This is the strongest guarantee available and it costs about fifteen lines in `booking-history.spec.ts`:

> For every `(stored, date)` pair over a small grid — `{confirmed, cancelled}` × `{today − 1, today, today + 1}` — and every `s` in `{confirmed, completed, cancelled}`:
> `bookingDisplayStatus(stored, date, today) === s` **if and only if** the row satisfies `displayStatusPredicate(s, today)`.

Eighteen cases, exhaustive over the interesting space, no database. It closes ADR-007's stated residual risk — that the filter and the label drift apart — structurally rather than by remembering. **Name it in the PR evidence.**

### 6.3 The service intersects; the repository stays dumb

The repository must not know what a presented status is. The service already derives `today` once (`admin-bookings.service.ts:31`); it now also resolves the filter, and hands the repository four plain bounds:

```ts
export interface AdminBookingsFilter {
  /** inclusive. The query's `from`, or the office's today when absent (§4.2), raised to the
   *  status predicate's own floor when it has one. Lexicographic max — dates are strings. */
  from: OfficeDate;
  /** inclusive. The query's `to`, absent when unbounded. */
  to?: OfficeDate;
  /** EXCLUSIVE. Contributed only by `status: 'completed'`. Kept separate from `to` so no date
   *  arithmetic is needed: Postgres ANDs `<= to` and `< before` for free. */
  before?: OfficeDate;
  /** The STORED value, never the presented one (§6.1). Absent = all statuses, which is the
   *  ABSENCE of a predicate, not a predicate matching everything — US-013/AC-02's rule. */
  status?: BookingStatus;
  deskId?: string;
}
```

Two points a reviewer should check:

- **The intersection is Postgres's job, not the service's.** Applying `.gte(from)`, `.lte(to)` and `.lt(before)` independently gives the intersection for free. The only place the service compares dates is raising `from` to the status floor, which is one lexicographic `max` — *a mapping, not a decision*, exactly the split US-006 §3.1 drew.
- **An empty intersection is a legitimate empty result, not a `400`.** `status=completed` with `from=<today>` matches nothing, correctly, and lands in ST-04. That is a different thing from the user sending `from > to`, which §4.1 refuses at the edge. **Conflating the two is the likely bug here** — one is a malformed request, the other is a true answer.

`listBookingsFromDate` becomes `listBookings(filter, offset, limit)`; the old name is now a lie about a method that takes four bounds. The `.select()` string, the three-key ordering, the `{ count: 'exact' }` and the `PGRST103` mapping (`admin-bookings.repository.ts:61-76`) are **unchanged** — see §10's note on why that matters for the gated harness.

---

## 7. The browser

### 7.1 `filters.ts` — where four ACs become pure functions

A screen-private module holding the filter state type, its default, and four functions. Everything in it is testable with no DOM, which is why AC-05, AC-06 and half of AC-08 get tests that can genuinely fail:

```ts
export interface AllBookingsFilters {
  from?: OfficeDate; to?: OfficeDate; status?: BookingDisplayStatus; deskId?: string;
}
export const NO_FILTERS: AllBookingsFilters = {};
export function isFiltered(f: AllBookingsFilters): boolean;          // AC-05, AC-06
export function parseFilters(search: string): AllBookingsFilters;    // AC-08 (§2.2)
export function toQueryString(f: AllBookingsFilters, page: number): string;  // one vocabulary
```

- **`isFiltered` is AC-06's whole discriminator**, per US-013 §6.2's instruction that this is browser state and not a wire field. `items.length === 0 && isFiltered(f)` → ST-04; `items.length === 0 && !isFiltered(f)` → ST-03, US-013's existing copy unchanged.
- **A `deskId` the desk list does not contain is dropped from the control, not from the query.** The select can only display an option it has; SCR-005's principle is *"Marcus must be able to see **what he asked for**"*. In practice this is near-unreachable — there is no delete (US-016/AC-09), so a desk id is permanent — and the rule exists so DEV does not have to invent one under pressure.

### 7.2 `use-all-bookings.ts` — the machine already exists

AC-09 asks for three things, and the hook built for US-013 already has two of them:

- **A later change supersedes an earlier one.** `generationRef` (`use-all-bookings.ts:45`, guard at `:88`) was built for retry-versus-in-flight-page and is exactly this. Add `filters` to the effect's dependency array (`:74`) and the existing bump/abort path does the rest.
- **A filter change resets to page 1** (story Edge cases). Falls out of the same effect: it always fetches page 1 and replaces state.
- **`loadMore` pages within the active filter** (story Edge cases). `fetch-all-bookings.ts:17` currently builds `?page=` alone; it now builds the filters too, from the same `toQueryString`. The stale-page guard at `:88` already drops a `loadMore` whose filters were superseded mid-flight.

**The signature changes** — `AllBookingsFetcher` becomes `(filters, page, signal)`. It is screen-private, so this is `task-surfaces.md:66-67` Medium, not a props contract.

### 7.3 `Select` stays screen-private

SCR-005's handoff names `Select` and `Filter bar` as *"Also built here and reusable"*. Build them in `screens/all-bookings/`, not `components/`.

`apps/ui/src/components/README.md` states the rule: *"A component private to one screen belongs in that screen's folder, not here"*, and *"The props and events of anything in here are a contract"*. Today there is exactly one consumer, and the nearest candidate for a second — US-016's desk inventory — **explicitly has no filters** (AC-09: *"no search field, filter bar or delete action exists"*). US-013 §6.1 declined the `BookingRow` extraction with two plausible consumers; this has fewer. Extraction is the second consumer's call.

The designer's *"literally the same object"* is satisfied without sharing a file: `Select` consumes the same tokens `text-field.css` does, which is how the components README says visual identity travels (*"Components consume design tokens, never literals"*). Carried as open item 6 for UX, since the handoff's wording points the other way.

### 7.4 `DatePicker` must not be reused — and this is the trap

`apps/ui/src/components/date-picker/DatePicker.tsx` clamps navigation to `[monthOf(today), monthOf(lastBookableDate(today))]` (`:56`) and strikes through every date `refusalFor` rejects (`:111`). Those are **REQ-006's forward booking window and the weekend rule** — a *booking* control.

An admin date filter must reach back over a year (US-013/AC-05 proved there is no floor) and forward past 30 days. Reusing `DatePicker` would silently cap the filter at the booking window — AC-01 failing on data nobody thinks to seed, in a component that looks obviously right because it exists and is about dates. **A reviewer should treat a `DatePicker` import in this story's diff as a blocker.**

**Recommended: a native `<input type="date">` inside a screen-private field component.** Free keyboard entry, free platform picker, free locale formatting, accessible by default, and settable in jsdom. **But it renders per-locale (`07/09/2026`), not `Mon 7 Sep` as the hi-fi frames draw** — that divergence is UX's call, not mine, and it is **open item 1**. I am recommending a mechanism, not settling a control; the frames are the authority.

### 7.5 AC-10's three widths — the same device US-013 §6.5 chose

There is still **no `matchMedia` anywhere in `apps/ui/src`**, and jsdom performs no layout. US-013 §6.5 solved the table/card switch by rendering both trees and letting CSS show one. Apply the same device rather than re-deriving it:

- **One `FilterBar`** renders the `Filters` toggle (`aria-expanded`, chevron — SCR-005's shape-not-colour requirement) *and* the panel, always both in the DOM.
- The panel carries a `--collapsed` class driven by JS state; **the CSS applies `display: none` to that class only inside the narrow media query.** Above it the panel is visible regardless of the JS state, which is exactly SCR-005's *"the panel stays open at 768 and 1280"* — and means collapsing at 360 then widening reveals the panel, correctly.
- `display: none` removes a subtree from the accessibility tree, so the toggle is never announced at widths where it does not apply, and no duplicate tab stops exist.
- **Assertable in jsdom**: the toggle's `aria-expanded` flips on click, the panel's collapsed class tracks it, and the one-row/two-row split at 768 is a CSS assertion on the stylesheet — the same single boundary assertion US-013 made for 1024.

*Rejected: a `useMediaQuery` hook.* Directly testable, and it introduces the first JS breakpoint into a codebase with zero, leaving the next author two patterns to choose between wrongly. US-013 rejected it for the same reason; nothing has changed.

**The exact breakpoint between the 360 and 768 treatments is UX's** — SCR-005 says "at 360" and "at 768 and 1280" without naming the boundary. **Open item 5.**

### 7.6 The two fetches

`GET /api/admin/desks` fires once on mount, in its own `use-desks.ts`/`fetch-desks.ts` pair mirroring the existing seam. It is **not** re-fetched on filter change, and **not** wired to `data-refresh.ts` (§0).

The date and status controls are interactive from first paint. **The desk select is empty until its list lands**, which is a small divergence from ST-02's *"the filter controls fully interactive"*. It is one control, briefly, on first load only. Flagged as **open item 4** rather than decided, because it is a UX judgement about a state UX wrote.

A desk-list failure must not take the screen to ST-05: bookings are the screen, desks are its vocabulary. Recommended: on a desk-list failure the desk select renders disabled with an accessible explanation, and the rest of the screen behaves normally. **Open item 4** covers the copy.

---

## 8. No new ADR — three consequential edits instead

**Recommendation: no ADR.** The test, the same one US-013 §8 and US-002 §8 applied: *does the decision bind work beyond this story, with a rejected alternative a future author would otherwise re-litigate?*

- **The compound status predicate** is ADR-007, applied exactly as its own "Harder" section and follow-up 1 instruct, *by name*, to this story. A story that consumes an ADR does not need one.
- **The cross-module desk read** is ADR-004, applied exactly as its follow-up 2 anticipates. §3.2's placement argument is US-013 §4.1's rule applied symmetrically, not a new rule.
- **The filter state's home** (query string on mount, not written back) is screen-local and binds nothing outside `all-bookings/`.
- **`GET /api/admin/desks`' shape** is the one decision that genuinely reaches beyond this story: US-016 will extend it, and "why is the desk list not in the bookings envelope?" is a question a future author could ask. **But the answer belongs in the schema's own docblock** — in Construction the executable contract *is* the design — plus one line in the module README. An ADR titled "the desk list is its own resource" would be an ADR for a REST truism with no rejected alternative worth a table.

**The honest counter-argument, so you can overrule me cheaply:** if you expect `/api/admin/*` to grow four or more resources this release and want their relationship held by a document rather than by docblocks, the moment to write that ADR is now rather than at the fourth one. I do not think so — §3.1's reasoning is three sentences and lives where the next author will actually look.

**Three consequential edits** (US-013's device, and each is required by something that already exists):

1. **`apps/api/src/modules/desks/README.md`** — ADR-004 requires each module's README to state what it owns and what it reads. It currently says the module is *"empty until US-015/US-017 fill it"*, which US-014 makes false. Record: it now holds a **read-only** repository over `desks` (`id, desk_number, is_active`), still writes nothing, and `modules/bookings`'s `listActiveDesks` continues to exist and continues to filter `is_active = true` for availability. **Naming both reads and why they differ is the point of the edit.**
2. **`apps/api/src/modules/bookings/README.md`** — US-014's paragraph: the four filters, the compound status predicate and its `domain/` inverse, `listBookingsFromDate` → `listBookings`, and the fact that `bookings_desk_id_booking_date_idx` was placed for this read in 2026-09.
3. **`libs/contracts/src/bookings.ts`** — `bookingDisplayStatusSchema`'s docblock (`:63-71`) no longer says *"Response-only"*; it is now also the status filter's vocabulary (§4.1). One sentence, and it prevents a third enum.

`ai/standards/api-standards.md` needs **no** edit — its Pagination section already carries US-013's criterion, and filtering adds nothing to it. `apps/api/src/modules/README.md` needs none either: its `desks` row already reads *"Desk inventory, number validation and normalization, activate/deactivate and its block"*, which covers a read of the inventory.

---

## 9. File placement

**New — `apps/api`**

```
apps/api/src/modules/desks/desks.repository.ts          read-only over `desks` (§3.2, §3.3)
apps/api/src/modules/desks/desks.repository.spec.ts     recording fake; asserts NO is_active filter
apps/api/src/modules/desks/desks.service.ts             createDesksService — mapping only, no clock
apps/api/src/modules/desks/desks.service.spec.ts        row -> adminDeskSchema shape
```

**New — `libs/contracts`**

```
libs/contracts/src/desks.ts                             adminDeskSchema, adminDesksResponseSchema (§3.3)
```

**New — `apps/ui`** (all screen-private; the pixel truth is in the frames)

```
apps/ui/src/screens/all-bookings/filters.ts        (+ .spec.ts)  AC-05, AC-06, AC-08's parse (§7.1)
apps/ui/src/screens/all-bookings/FilterBar.tsx     (+ .spec.tsx) the four controls, Clear, ST-12 (§7.5)
apps/ui/src/screens/all-bookings/Select.tsx        (+ .spec.tsx) screen-private (§7.3)
apps/ui/src/screens/all-bookings/DateField.tsx     (+ .spec.tsx) native input; NOT DatePicker (§7.4)
apps/ui/src/screens/all-bookings/fetch-desks.ts    (+ .spec.ts)  mirrors fetch-all-bookings.ts
apps/ui/src/screens/all-bookings/use-desks.ts      (+ .spec.ts)  loading/ready/error, once on mount
```

**Modified**

```
libs/contracts/src/bookings.ts            + 4 query fields + .refine; docblock edit (§4.1, §8)
libs/contracts/src/index.ts               export ./desks.js

apps/api/src/domain/booking-history.ts    + displayStatusPredicate (§6.1). bookingDisplayStatus UNCHANGED
apps/api/src/domain/booking-history.spec.ts  + the round-trip property test (§6.2)
apps/api/src/modules/bookings/admin-bookings.repository.ts   listBookingsFromDate -> listBookings(filter,…)
apps/api/src/modules/bookings/admin-bookings.service.ts      resolves the filter; same single clock read
apps/api/src/modules/admin/admin.router.ts                   + GET /desks; the filter parse on /bookings
apps/api/src/composition.ts                                  + desks seam; wire createDesksService
apps/api/src/modules/desks/README.md                         ADR-004 requires it (§8)
apps/api/src/modules/bookings/README.md                      US-014's paragraph (§8)

apps/ui/src/screens/all-bookings/AllBookings.tsx        FilterBar, ST-04 vs ST-03, the count line
apps/ui/src/screens/all-bookings/AllBookings.spec.tsx   AC-06, AC-08, AC-09, AC-10
apps/ui/src/screens/all-bookings/use-all-bookings.ts    filters in the deps; reset to page 1 (§7.2)
apps/ui/src/screens/all-bookings/fetch-all-bookings.ts  builds the full query string
apps/ui/src/screens/all-bookings/copy.ts (+ .spec.ts)   countLine becomes filter-aware; ST-04 copy
apps/ui/src/screens/all-bookings/all-bookings.css       filter-bar densities (§7.5)

inception/specs/index.md                  the US-014 row
knowledge/traceability/manifest.json      US-014 tests[]
```

**Not modified, and worth saying so:**

- **`supabase/migrations/**`** — §0. Both indexes this story needs already exist, one of them commented `REQ-031`. **A migration in this PR is a review finding.**
- **`apps/api/src/http/middleware/**` and `http/app.ts`** — the mount and both guards exist; US-014 has no admin-only AC of its own.
- **`libs/contracts/src/error.ts`** — §4.1. No new code.
- **`libs/contracts/src/availability.ts`** — §0. `deskAvailabilitySchema` is a different fact and must not be widened to carry `isActive`.
- **`apps/api/src/domain/booking-history.ts`'s `bookingDisplayStatus`** — added beside, never edited (§6.1).
- **`apps/api/src/modules/bookings/bookings.repository.ts`** — `listActiveDesks` keeps its `is_active` filter, which is the whole of US-006/AC-04 (§3.2).
- **`apps/ui/src/components/**`** — §7.3, §7.4. No shared component gains a prop; `DatePicker` is not reused.
- **`apps/ui/src/lib/data-refresh.ts`** — §0. The data-fetching layer's behaviour is REQ-036's, set once.
- **`apps/ui/src/routes.tsx`** — a query string needs no route declaration (§2.2).
- **`eslint.config.mjs`** — §3.2. `modules/admin` carries no boundary rule, and `modules/desks` imports nothing.

Five of those are protected paths.

---

## 10. Test placement per AC

QA's own flags are the organising constraints: **AC-04 is the combination case a single-filter implementation quietly passes**, and **AC-02's Completed must match the derived status**.

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `admin-bookings.repository.spec.ts` — the recorded query carries `gte('booking_date', from)` and `lte(…, to)`; `admin.routes.spec.ts` — rows outside the range are absent from the body | repository + route |
| **AC-02** | `booking-history.spec.ts` — `displayStatusPredicate` per value **and §6.2's round-trip property test**; `admin-bookings.service.spec.ts` — a passed `confirmed` row appears under `status=completed` and **is absent under `status=confirmed`**; a `cancelled` row dated next week appears under `cancelled` | **domain + service** |
| AC-03 | `admin-bookings.repository.spec.ts` — `eq('desk_id', deskId)`; `admin.routes.spec.ts` — only that desk's rows | repository + route |
| **AC-04** | `admin.routes.spec.ts` — **date+status, date+desk, status+desk, and all three**, each against a seed where a single-filter implementation would return extra rows | **route** |
| AC-05 | `filters.spec.ts` — `NO_FILTERS` and `isFiltered(NO_FILTERS) === false`; `AllBookings.spec.tsx` — **Clear** re-fetches with no filter arguments and the count line returns to US-013's sentence | component |
| AC-06 | `filters.spec.ts` — `isFiltered` per field; `AllBookings.spec.tsx` — **`items: []` renders ST-03 with no filters and ST-04 with a filter**, distinct copy, ST-04 offering **Clear filters** | component |
| AC-07 | `copy.spec.ts` — the sentence for each clause combination, including the absent-`from` case that renders `today`; `AllBookings.spec.tsx` — the line is a live region | component |
| **AC-08** | `filters.spec.ts` — `parseFilters` over the real URL, and over a malformed one; `AllBookings.spec.tsx` — rendered under `MemoryRouter initialEntries={['/admin/bookings?deskId=<uuid>&status=confirmed']}`, **the fetcher receives those filters and the count line restates them**. The link *from* SCR-006 is US-019's (§2) | **component** |
| AC-09 | `use-all-bookings.spec.ts` — a second filter change supersedes the first and no stale page grafts on; a filter change resets to page 1; `AllBookings.spec.tsx` — controls stay enabled while skeletons render | hook + component |
| AC-10 | `FilterBar.spec.tsx` — the toggle's `aria-expanded` flips and the panel's collapsed class tracks it; plus the one CSS assertion for the narrow/wide boundary (§7.5) | component — **mechanism is open item 5** |
| §3 | `desks.repository.spec.ts` — the recorded query has **no `is_active` filter** and orders by `desk_number`; `admin.routes.spec.ts` — an Employee session gets `403 admin_only` on `GET /api/admin/desks` | repository + route |
| §4.1 | `admin.routes.spec.ts` — `?to=<before from>` → `400 invalid_request`; an unknown `status` word → `400`; an unknown field → `400` | route |

**No new gated real-Postgres test.** US-013 open item 2 exists because the `user_profiles!user_id` embed hint and PostgREST's out-of-range behaviour are runtime-only. **US-014 adds no new runtime-only assumption**: `.eq`, `.lte` and `.lt` are ordinary filters, `{ count: 'exact' }` still counts after filters and before the range, and **the `.select()` string does not change** — which is precisely why it must not. A diff that alters `admin-bookings.repository.ts:61` invalidates the existing gated coverage and would need its own harness run.

**Data setup** (the story's QA note, with one addition): bookings spread across dates, desks and all three presented statuses, **including a `confirmed` row dated yesterday** — the row that separates a correct status filter from a plausible one — and **one inactive desk with history**, which is the only proof the desk list is unfiltered.

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§7.4** — the date controls. A native `<input type="date">` is accessible, keyboard-friendly and free, but renders per-locale (`07/09/2026`) rather than the `Mon 7 Sep` the hi-fi frames draw. Native (my recommendation) or a custom control matching the frames? | `/ux` + DEV | AC-01's control, and AC-10's widths |
| 2 | **§7.1** — **ST-03's copy claims more than the query proves.** *"Nobody has booked a desk yet"* renders whenever the default view returns nothing — but the default view has a floor at today, so past bookings may exist. US-013 already ships this; US-014 makes it easy to reach. Reword, or add a condition? My interim recommendation is **keep US-013's behaviour unchanged** so this story introduces no regression | `/ux` + PO | ST-03's copy only |
| 3 | **§2.3** — US-019's link is `/admin/bookings?deskId=<id>&status=confirmed`, **with no `from`** (the server's default and the status predicate each supply "from today", and US-019 then never touches a clock). Record it against US-019 so its author reads it as a contract | Manager → US-019 | nothing in this story |
| 4 | **§7.6** — the desk select is briefly non-interactive on first load, and ST-02 says the filter controls are *"fully interactive"*. Accept, or render it enabled-but-empty? Plus the copy for a desk-list failure that must not take the screen to ST-05 | `/ux` | ST-02's wording, and one string |
| 5 | **§7.5** — SCR-005 names "360" and "768 and 1280" but not the boundary between the collapsed and always-open filter panel. The CSS needs one number | `/ux` | **AC-10 having a test that can fail** |
| 6 | **§7.3** — SCR-005's handoff calls `Select` and `Filter bar` *"reusable"*; the components README says a one-screen component stays in that screen's folder. I recommend screen-private, with extraction as the second consumer's call (US-016/AC-09 says that consumer is not US-016) | `/ux` + DEV | nothing |
| 7 | **§4.1** — AC-07's exact count-line wording once a `to` is set. SCR-005's only example (*"3 bookings · desk B-03 · from Mon 7 Sep · Confirmed"*) has no `to` clause | `/ux` + PO | `copy.ts` |
| 8 | US-013 open item 3 — offset-vs-keyset as an ADR for future admin lists — is still yours and **still not this story's**. Noted so it is not lost | Joy Joshua | nothing |

---

## Notes outside the design note

1. **The two things most likely to ship broken are both in §6.** A `.eq('status','confirmed')` for the Confirmed filter looks obviously right and fails the QA note's exact assertion on live data only; and an inverted intersection (`status=completed` with `from=today`) is a *correct empty result* that is one careless line away from being treated as a `400`. §6.2's property test is cheap and closes the first permanently.
2. **The one import that should stop a review** is `DatePicker` in this story's diff (§7.4). It is about dates, it exists, it is in the shared components folder, and it carries REQ-006's booking window inside it.
3. **This story touches no migration, no middleware, no error code, no shared component and no mount point**, while adding a route and four contract fields. That shape is the payoff of §3 and §6.3, and it is worth stating in the PR description the way US-013's was.

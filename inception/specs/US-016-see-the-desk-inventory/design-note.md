# US-016 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-016 — See the desk inventory and how many people hold each desk](../../stories/user-stories/US-016-see-the-desk-inventory.md) |
| **Screen**   | [SCR-006](../../design/screens/SCR-006-desks.md) **ST-01, ST-02, ST-03, ST-04**. ST-05 – ST-10 are US-019's (deactivate confirm, blocked, in-flight, failed, and the two outcomes) — **none are designed here**, and §6 is the whole of what this story does about their controls |
| **Tier**     | Complex — a new **client route**, a **changed response shape**, **and** a shared component's props (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), [ADR-007](../../../knowledge/decisions/ADR-007-derived-booking-status.md), and the [US-013](../US-013-see-every-booking/design-note.md) and [US-014](../US-014-filter-all-bookings/design-note.md) design notes — **no new ADR** (§8), though §6 is the one candidate I would not argue hard about |

**Advisory.** The human's GitHub review is the authority. `decisions.md` in this package stays DEV's.

The story hands `/architect` one question and says so plainly (line 108): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §2 and §3 are the answer. US-014 built the endpoint this story extends and said in writing that it was doing so for US-016, so much of this note **collects a decision already taken** rather than taking one.

**The verdict, in one line each:**

- **Complex, three times over** — and one of the three is a surface US-013, US-014 and US-015 each deliberately avoided: this story genuinely changes a **shared component's props** (§0, §4). Say so in the PR rather than letting a reviewer discover it.
- **Extend `GET /api/admin/desks`; do not add a second endpoint.** `adminDeskSchema` gains **one required field, `bookedAhead: number`** — required and `0`, never optional, because AC-05's whole content is that zero must not look like missing data (§3).
- **The count lives in `modules/desks`, reading `bookings`** — ADR-004's own Context names this exact read as the case it was written for (§2.1). **One extra query, not N+1 and not a PostgREST aggregate** (§2.2), and the predicate comes from `displayStatusPredicate('confirmed', today)`, the function US-014 already built, so **US-019's block and this count cannot disagree** (§2.4). That last point is the story's own QA note made structural.
- **`StatusChip` gains a third `kind`, `'inventory'`** (`'active' | 'inactive'`) — not a reuse of `kind: 'desk'`, whose exported `LABEL` would render the word *"Available"* where AC-02 requires *"Active"* (§4).
- **No token change.** The Figma Active chip binds `--c-state-available-*` and Inactive binds `--c-state-inactive-*`; both exist, in both themes. `inception/design/tokens.css` is **not** modified and a diff there is a review finding (§0.2, §4.3).
- **No migration.** `bookings_desk_id_booking_date_idx` (`0003_bookings.sql:79`) carries the comment `-- REQ-031, BR-001.9`. **BR-001.9 is this story's count**, and US-006 placed the index for it.
- **AC-06 and AC-08's controls ship *visible and disabled*, each carrying its reason and each with a test US-017/US-018/US-019 must edit to ship** (§6). This is the note's hardest call and the one place where US-013 §6.2's precedent points the opposite way from the story's own AC.
- **`AppShell.tsx` is not modified** — `ADMIN_NAV` already carries `/admin/desks` (`AppShell.tsx:33`) and that link currently falls through to `routes.tsx:65`. This story is what makes it resolve (§9.1).

§9.1's "not modified" list is as load-bearing as the modified one. The two things most likely to ship broken are both in §2, and §2.2's rejected option produces a screen that passes every unit test.

---

## 0. The tiering — confirmed, for three independent reasons, and the third is new

**Complex.** DEV's classification is right, and it is right three times over rather than twice:

| Surface | What it is here |
| --- | --- |
| **Browser — contract** | A **new client route**, `/admin/desks`. `task-surfaces.md:61-62` — *"a new route"* — Complex outright, regardless of diff size. `routes.tsx` gains its fourth authenticated address |
| **Server — contract** | `adminDeskSchema` gains a field, so `GET /api/admin/desks` 200 body changes shape. `task-surfaces.md:39-41` names *"a changed response shape"*, and `libs/contracts/**` is a **protected path** (`task-surfaces.md:26-27`) |
| **Browser — shared component** | `StatusChip`'s props gain a third discriminant member (§4). `task-surfaces.md:61` and `components/README.md:3-4` — *"the props and events of anything in here are a contract"* |

### 0.1 The Medium carve-outs, worked through — two come close, neither survives

`task-surfaces.md` names four carve-outs. Two are genuinely close here, and both fail on a second clause, exactly as US-014 §0's did.

**Carve-out `:94` — *"a new screen folder under `apps/ui` that only composes existing shared components and tokens — Medium"*.** This is the nearest miss in the whole file, and it fails twice:

1. **It does not carve out the route.** A screen folder and an address are different surfaces; `task-surfaces.md:61` lists *"a new route"* separately from anything about folders, and `routes.tsx`'s own docblock (`:1-11`) treats the address table as a decision of its own. A new folder nothing can navigate to would be Medium; this one is navigable.
2. **It does not *only* compose existing components.** §4 changes `StatusChip`'s props. The carve-out's words are *"only composes existing shared components"*, and a story that widens one has left it.

**Carve-out `:89-90` — *"a new `GET` lookup endpoint following an existing read-only pattern, reusing the table and an existing response shape"*.** It does not apply at all, for a reason worth naming because it reads backwards: **this story adds no endpoint.** It changes an existing one's shape, which the Complex list names directly at `:39-41`. There is no carve-out anywhere in the framework or the project file for *"an additive field on a response envelope built to receive it"*, and **none should be written into this PR**: ADR-002's asymmetry makes an additive response field *safe for consumers*, which is a compatibility property, not a tiering one. A field added to the wrong place is still a wire change both sides parse.

**The one honest argument for Medium, and why nothing turns on it.** `libs/contracts/src/desks.ts:24-29` was written by US-014 specifically so this change would be additive — *"An OBJECT, not a bare array, so a later story (US-016) can add a field to `adminDeskSchema` additively"*. The change is pre-authorised in design. It is still a protected-path diff on a shape both sides parse, and **the new client route carries the tier alone regardless**. Recorded so a reviewer does not re-derive it.

### 0.2 What it is *not*, and each absence is defended below

- **Not Persistence.** `bookings_desk_id_booking_date_idx on bookings (desk_id, booking_date)` exists at `0003_bookings.sql:79` with the comment `-- REQ-031, BR-001.9`. **BR-001.9 is this story's `Booked ahead` count** — the story's own Traceability note says so — so US-006 placed that index for this exact read. `bookings_booking_date_status_idx` (`:78`, `booking_date desc, status`) serves the `>= today` plus status predicate §2.2 issues, and `desks_desk_number_key` (`0002_desks.sql`) already serves AC-01's `ORDER BY`. **A migration appearing in this PR is a review finding.**
- **Not a trust boundary — but AC-10 is still this story's own AC, and that distinction matters for tests.** No guard code is written: `require-admin.ts` is mounted once at `/api/admin` (`http/app.ts:78`), and its own docblock states the property this story consumes — *"every future admin route inherits the guard before it is written"*. On the client, `RequireRole role="admin"` (`lib/auth/require-role.tsx:22-32`) is used exactly as `/admin/bookings` uses it at `routes.tsx:55-62`. **`apps/api/src/http/middleware/**` and `http/app.ts` are untouched, and a diff to either is a review finding.** Unlike US-014, this story *has* an admin-only AC, so AC-10 needs a test reaching the real mount with a real Employee session — `admin.routes.spec.ts:456-460` already has one for this endpoint and is extended, not replaced (§10).
- **Not a design-token change, and this is worth stating because it is easy to believe otherwise.** SCR-006's components table (`:150`) asks for *"**Active** (check-circle, green) / **Inactive** (block icon, quiet neutral)"*, and `tokens.css` has a `--c-state-inactive-*` role (`:225-227`, dark theme `:418-419`) but **no `--c-state-active-*`**. The asymmetry invites inventing one. **Do not.** The hi-fi component resolves it: Figma `Desk row` (node `201:236`) binds the Active chip to `--c-state-available-fill` / `-border` / `-ink` and the Inactive chip to `--c-state-inactive-*`. Both roles exist in both themes. **`inception/design/tokens.css` is a protected path (`task-surfaces.md:32`) and is not modified; a diff there is a review finding.** The naming asymmetry is real and is **open item 4**, for UX, as a naming question and nothing more.
- **Not a data-fetching-layer change.** The story's own edge case is explicit: *"REQ-036's focus refresh covers booking lists, not this screen; not extended here."* `apps/ui/src/lib/data-refresh.ts` is `task-surfaces.md:62-63`'s Complex surface, set once for the whole app (REQ-036/ADR-008). This screen **must not** subscribe to it — the restraint US-014 §0 recorded for `AllBookings`.
- **Not an `eslint.config.mjs` change.** `MAY_IMPORT.desks` is `[]` (`eslint.config.mjs:19`), and §2's repository imports only `infra/supabase` and `@desk-booking/contracts`. Reading the `bookings` **table** is not importing the `bookings` **module** — the distinction ADR-004 exists to draw, already encoded in the lint rule. A protected path stays untouched.
- **Not Dependency, not Operational, not Config.** Two new SVG assets are files, not dependencies (§4.3).

---

## 1. What this story actually is

One response field, one screen, and three buttons that lead nowhere yet.

| AC | Where it is answered |
| --- | --- |
| AC-01 every desk, number order | Already built. `desksRepository.listAllDesks()` (`desks.repository.ts:28-36`) has no `is_active` filter and orders by `desk_number`; `desks.repository.spec.ts:52-70` already asserts both. **This AC ships green on existing code** — which is §10's point about not writing a test that proves nothing new |
| AC-02 icon plus word | §4 — `StatusChip`'s third `kind`. The **word** is the load-bearing half, and it is why reuse fails |
| AC-03 quiet neutral, not danger | `--c-state-inactive-*` (`tokens.css:225-227`), re-pointed on 2026-09-10 and **used by no code at all today** — this story is its first consumer (§4.3) |
| **AC-04** the count | **§2**, the section to read twice: where it lives, how it is queried, and why its predicate is borrowed rather than written |
| **AC-05** zero, not blank | **§3.1** at the wire (required field, `0`) and §7.2 at the pixel (the em dash). Two halves, and the wire half is the one a reviewer should check |
| AC-06 empty state plus **Add desk** | `EmptyState` as-is (§7.3) plus §6's disabled treatment for the action |
| AC-07 loading and failure | `DeskSkeletonRow` screen-private (§5.2, §7.1), `Alert tone="danger"` as-is (§7.3), and the **hidden Add desk on failure** the QA note calls easy to miss |
| **AC-08** both row actions at every width | **§6** for what the controls do, §7.1 for the widths. A negative assertion protecting a 2026-09-10 decision, which needs a test that can genuinely fail |
| AC-09 no search, no filter, no delete | A structural absence with a test (§10). The endpoint takes **no query parameters** and must not gain any (§3.3) |
| AC-10 admin only | Inherited on both sides (§0.2), proven at the route and at the client guard |

---

## 2. The count — where it lives, how it is read, and why its predicate is borrowed

### 2.1 It belongs in `modules/desks`, and ADR-004 says so by name

**Recommendation: a second method on `DesksRepository`, reading `bookings`, tallied in `DesksService`.**

This is not a judgement call. **ADR-004's own Context names this exact read as one of the four cases it was written to settle** (`ADR-004-table-ownership.md:23-24`):

> *"BR-001.9's blocking count is a `bookings` aggregate read from inside the `desks` module's deactivation check."*

The Decision then permits it outright (`:32-33`): *"A module's repository may `SELECT` from another module's tables, using an explicit column list. Only the table's owning module may `INSERT`, `UPDATE` or `DELETE` it."* This story writes nothing.

The mirror image is already in the tree and is the second half of the argument: `modules/bookings` reads `desks` (`bookings.repository.ts:152-161`'s `listActiveDesks`), declared in both READMEs. US-016 makes the traffic symmetrical, which is what ADR-004's *"five tables and five modules, with no one-to-one mapping between them"* predicted.

**Rejected: putting the count on `AdminBookingsRepository` and having `modules/admin` merge two services' answers.** It is lint-clean and ADR-004-legal, and it is wrong for the reason US-014 §3.2 gave in the opposite direction: US-019's deactivation **block** is a desks-module write path needing this same count, and ADR-004 follow-up 2 (`:72-73`) says desk writes live in `modules/desks`. Putting the count on the bookings side means US-019 either reaches across a module boundary the lint rule forbids (`MAY_IMPORT.desks: []`) or re-implements it. **Put the read where the write will have to live** — US-013 §4.1's rule, third application.

**The explicit column list is the protection, not a style preference.** ADR-004's Consequences call it *"load-bearing, not a style preference — a reviewer refuses a cross-module `select *`"*. It matters more in this direction than in the other: `bookings` carries `user_id`, and a `select *` would put occupant identity inside a module with no business holding it. `listConfirmedDeskIds` already states the standard for this table (`bookings.repository.ts:58-60`): *"The select list is `desk_id` ONLY — no `user_id`, no `*`. The occupant is never read, not merely never sent … there is no column here to forget to strip in a later refactor."* **Copy that sentence into the new method's docblock.** It is the same guarantee for the same table from a different module.

### 2.2 One extra query, tallied in the service — not N+1, and emphatically not a PostgREST aggregate

```ts
// apps/api/src/modules/desks/desks.repository.ts — the second method

/** US-016/AC-04, AC-05 (BR-001.9). The desk id of every CONFIRMED booking dated `today` or
 *  later — one row per booking, NOT a count: the tally is the service's (§2.3), and this
 *  repository holds no rule.
 *
 *  Reads `bookings`, a table `modules/desks` does NOT own (ADR-004: read across, write within).
 *  The select list is `desk_id` ONLY — no `user_id`, no `*` — exactly as `modules/bookings`'s
 *  own `listConfirmedDeskIds` states for this table: the occupant is never read, not merely
 *  never sent, so there is no column here to forget to strip in a refactor.
 *
 *  `today` is the service's single `officeToday(nowMs(), officeTimezone)` reading; this
 *  repository reads no clock, the rule every repository docblock in this codebase states.
 *  `status` and the `>= from` bound BOTH arrive from `displayStatusPredicate('confirmed',
 *  today)` (§2.4) — neither is written literally here, and that is the whole of why this count
 *  and US-019's block cannot drift apart.
 *
 *  Bounded by requirement, not by hope: REQ-006 caps a bookable date at today + 30
 *  (`BOOKING_WINDOW_DAYS`, `libs/contracts/src/booking-window.ts:43`) and
 *  `bookings_one_confirmed_per_desk_per_day` (`0003_bookings.sql:64`) allows one confirmed row
 *  per desk per day, so this returns at most `desks x 31` uuids — about 3,100 at BR-001.4's
 *  100-desk ceiling. Served by `bookings_booking_date_status_idx` (`0003_bookings.sql:78`). */
listUpcomingConfirmedDeskIds(status: BookingStatus, from: OfficeDate): Promise<string[]>;
```

```ts
.from('bookings').select('desk_id').eq('status', status).gte('booking_date', from)
```

**Rejected, and this is the highest-risk wrong turn in the story: the PostgREST embedded aggregate**, `.from('desks').select('id, desk_number, is_active, bookings(count)')` with filters on the embedded resource. It looks like one round trip and the right answer. Three objections, and the second is fatal to an AC:

1. **It is a runtime-only assumption a recording fake cannot prove.** PostgREST's aggregate functions sit behind a server setting and are off by default on recent versions; on Supabase that is a project-level flag this repository does not control. This is precisely the class US-013 §3 put in the gated harness, and it would cost this story a real-Postgres run to be honest about. The chosen option costs none (§10).
2. **Filtering an embedded resource while keeping parents that have no children is the case it silently gets wrong, and that case is AC-05.** A plain embed with a filter on the child's `status` and an `!inner` embed differ in exactly what happens to a desk holding no matching bookings — and *"a desk holding no upcoming Confirmed bookings"* is the whole of AC-05. **A mistake here deletes rows from the inventory rather than showing a zero**, which is worse than the failure AC-05 names, and it will not reproduce on seeded data where every desk has a booking.
3. **It would be the second embed-shaped read in the codebase, of a different kind.** `admin-bookings.repository.ts`'s `user_profiles!user_id` is the first, and US-013 open item 2 exists because nobody could prove its behaviour without Postgres. Buying a second gated assumption for a screen that does not need it is a bad trade.

**Rejected: N+1 — one count query per desk.** 30 to 100 desks (BR-001.4) means 30 to 100 round trips on a screen's first paint. Nothing to say for it.

**Rejected: a database view or an RPC.** A migration for a two-line query. ADR-004's own alternatives table already rejected views for this class of read — *"Migration churn per screen … adds schema surface for what is often a two-line query"* — and §0.2 says no migration.

**Why the in-memory tally is safe, said once so nobody "optimises" it later:** the bound in the docblock above is derived from an approved requirement, so it is checkable rather than assumed. Put it in the code, not only here.

### 2.3 The service tallies, and takes a clock for the first time

`createDesksService` currently takes only the repository (`desks.service.ts:7-11`) and its docblock says *"A pure mapping, no clock read"*. **That sentence stops being true and must be rewritten, not deleted.** The deps gain `nowMs` and `officeTimezone`, mirroring `AdminBookingsServiceDeps` (`admin-bookings.service.ts:16-20`) field for field:

```ts
export interface DesksServiceDeps {
  desks: DesksRepository;
  nowMs: () => number;
  officeTimezone: string;
}
```

```ts
async listAllDesks(): Promise<AdminDesk[]> {
  // ONE clock reading, threaded to the predicate and nothing else — the discipline
  // `listAllBookings` states for its own (`admin-bookings.service.ts:45-51`). Two `officeToday`
  // calls in one request could straddle an office midnight and produce a count that disagrees
  // with the list it annotates.
  const today = officeToday(nowMs(), officeTimezone);
  const predicate = displayStatusPredicate('confirmed', today);

  const [rows, deskIds] = await Promise.all([
    desks.listAllDesks(),
    desks.listUpcomingConfirmedDeskIds(predicate.stored, predicate.from),
  ]);

  const counts = new Map<string, number>();
  for (const id of deskIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  return rows.map((row) => ({
    id: row.id,
    deskNumber: row.desk_number,
    isActive: row.is_active,
    // AC-05. `?? 0`, never `?? undefined` — a desk with no upcoming bookings reports ZERO, and
    // the em dash SCR-006 draws is a RENDERING of 0, not a second wire value (§3.1).
    bookedAhead: counts.get(row.id) ?? 0,
  }));
}
```

Three notes for DEV, each with a real failure behind it:

- **`Promise.all`, not two sequential awaits.** They are independent reads and the screen waits on both. Nothing turns on it for correctness; stated so nobody serialises them by habit and then wonders about first paint.
- **`DisplayStatusPredicate.from` is optional, and a `!` assertion here is a smell that should not survive.** It is optional because `completed` and `cancelled` contribute no floor; for `'confirmed'` it is always present. Prefer a narrow local guard that **throws** — reaching this line with no floor means `bookingDisplayStatus` changed underneath, which must fail loudly rather than silently counting every booking in history. **A silent `?? today` fallback is a review finding**: it would re-implement the rule the call exists to borrow.
- **`composition.ts:108` gains the two dependencies**, mirroring `adminBookingsService` at `:102-106`. The `desks` test seam at `:63-64` keeps its shape.

### 2.4 Borrowing the predicate is what makes the QA note's constraint structural

The story's edge case and its QA note both say the same thing, and it is the one requirement here that cannot be met by careful reading alone:

> *"It must agree exactly with what US-019's block tests, or the screen will promise a block that does not fire, or vice versa."*

**The predicate already exists as a pure function.** US-014 added `displayStatusPredicate(status, today)` to `apps/api/src/domain/booking-history.ts` as the exact inverse of `bookingDisplayStatus`, with a round-trip property test, precisely because *"`confirmed` and `completed` are both compound predicates over the two-valued stored enum"* (its own docblock). `displayStatusPredicate('confirmed', today)` returns `{ stored: 'confirmed', from: today }` — which **is** *"Confirmed bookings dated today or later"*, word for word, and `admin-bookings.service.ts:68` already consumes it.

So the recommendation is not "be careful", it is: **neither `'confirmed'` nor `>= today` is ever written literally in `modules/desks`.** Both arrive from the one function, and US-019's block is required to call the same one. That turns the QA note's warning from something a reviewer must remember into something one import enforces.

`task-surfaces.md:52-57` prices this in the story's favour: *"A **new** pure rule function is **Medium** … But **changing an existing rule is Complex**."* **This story adds none and changes none.** `booking-history.ts` is **not modified**, and a diff to it is a review finding — the line US-014 §6.1 drew for `bookingDisplayStatus`.

**Carry it forward explicitly.** US-019's author must read *"call `displayStatusPredicate('confirmed', today)`"* as a contract, not a suggestion — **open item 2**, routed the way US-014 §2.3 routed US-019's filter URL.

---

## 3. The contract

### 3.1 One field, on the schema built to receive it

```ts
// libs/contracts/src/desks.ts — US-016 extends US-014's slice

export const adminDeskSchema = z.object({
  id: z.string().uuid(),
  deskNumber: z.string().min(1),
  isActive: z.boolean(),
  /**
   * US-016/AC-04, AC-05 (BR-001.9). How many CONFIRMED bookings this desk holds dated the
   * office's today or later — the exact quantity US-019's hard block tests, which is why
   * SCR-006 shows it: the block becomes predictable instead of discovered.
   *
   * "Today" is the OFFICE's today, resolved server-side from one clock reading per request
   * (NFR-001) — never the browser's. A count computed against a device date would disagree
   * with the block that refuses the deactivation.
   *
   * REQUIRED, and 0 rather than absent. AC-05's whole content is that none must not look like
   * missing data; an optional field makes "no upcoming bookings" and "this server did not tell
   * you" the same value on the wire, and no amount of rendering recovers that. The em dash
   * SCR-006 draws is a RENDERING of 0 (§7.2), not a second wire value.
   *
   * Cancelled bookings, Completed ones and past Confirmed ones are all excluded — see
   * `domain/booking-history.ts`'s `displayStatusPredicate`, which is where the predicate lives
   * and the only place it may be written (design note §2.4).
   */
  bookedAhead: z.number().int().nonnegative(),
});
```

- **The name is `bookedAhead`.** It is SCR-006's own column header (*"Booked ahead"*), it is the name US-014 wrote into this file's docblock in advance (`desks.ts:25` — *"US-016 is expected to add `bookedAhead`"*), and it names the fact rather than the rule. `upcomingConfirmedCount` would restate the predicate in the field name, which is a second place for it to disagree with §2.4.
- **`adminDesksResponseSchema` (`desks.ts:30-34`) does not change.** Its docblock's forward-looking sentence becomes history and should be edited to say so (§8) — it is now a worked example rather than a prediction.
- **`libs/contracts/src/error.ts` is not modified.** Every reachable code on this endpoint already exists: the session chain's 401s, `admin_only` 403 from the mount, `internal_error`. There is no request to malform — the endpoint takes no parameters (§3.3) — so not even `invalid_request` is newly reachable. **A new error code in this PR is a review finding.**

### 3.2 The envelope needs nothing for the summary line — and here is the criterion

SCR-006 ST-01 draws a summary line above the table, and the Figma `Result summary` instance (node `202:65`) carries the literal string **`40 desks · 38 active, 2 inactive`**. The obvious question is whether the server should compute and echo those three numbers.

**Recommendation: no. The browser derives all three from the array it already holds** — `desks.length`, and one pass counting `isActive`. Nothing is added to the envelope.

The criterion, stated because it will come up again and because it is *not* the same one US-013 used:

> **A derived total belongs on the wire only when the client does not hold the whole set.** US-013 put `total` in the all-bookings envelope because that response is **one page of fifty** and the browser genuinely cannot count what it was not sent. `GET /api/admin/desks` returns **every desk** — AC-01 requires it and AC-09 forbids the search or paging that would make it otherwise. A `counts` object here would be the server telling the browser the length of an array the browser is holding.

Same shape as US-014 §5's rule (*"echo a request value back only when the server may have changed it"*), applied to a derived value rather than a request value, and it lands in the same place: a second field able to disagree with the first is worse than one field.

**The consequence, stated so it is not rediscovered as a defect:** the summary line's numbers and the table's rows are by construction the same data and cannot disagree. That is strictly better than an echo, and worth one sentence in the PR.

### 3.3 The endpoint still takes no query parameters, and that is AC-09

`admin.router.ts:86` parses nothing off `req.query`, and its docblock (`:81-85`) already says why: *"No query parameters: the desk count this release targets (30–100, BR-001.4) does not need search, and inventing one here would be building US-016 inside US-014."*

**US-016 does not reach back and add them.** AC-09 refuses search and filtering outright, and SCR-006 open question 2 resolved the threshold at *roughly 100 desks*, at which point it becomes *"a filter bar above the table with no state changes"*. **A query field on this endpoint in this PR is a review finding**, and the docblock should be amended to record that the story it was protecting has arrived and confirmed the absence (§8), rather than left pointing forward at a story that shipped.

`Cache-Control: private, no-store` (`admin.router.ts:89`) is unchanged. Desk numbers and a booking count are not personal data, but one rule for `/api/admin/*` is worth more than a per-route judgement — US-014 §3.3's reasoning, unchanged.

---

## 4. `StatusChip` gains a third `kind` — the story's one shared-component change

### 4.1 Reuse fails on the word, not on the colour

`StatusChipProps` today (`StatusChip.tsx:31-33`):

```ts
export type StatusChipProps =
  | { kind?: 'desk'; status: DeskStatus }          // 'available' | 'taken' | 'selected'
  | { kind: 'booking'; status: BookingLifecycleStatus };
```

**Recommendation: add `| { kind: 'inventory'; status: 'active' | 'inactive' }`, with an exported `INVENTORY_LABEL` beside the two existing label maps.**

The tempting reuse — render an active desk as `kind="desk" status="available"` — fails on a requirement, not on taste. `LABEL` is **exported** (`StatusChip.tsx:37`) with a stated reason: *"the composed `aria-label` needs the same word this chip renders, so the accessible name and the visible chip never say different things"* (US-008/FR-06). `LABEL.available` is the string `'Available'`. **AC-02 requires the word "Active"**, and NFR-008 makes the word the primary cue rather than decoration. Reuse would therefore either render the wrong word or fork the map away from the chip — and forking the map is the exact failure the export exists to prevent.

The two facts are genuinely different, and the design system has said so twice already: *"a desk is not a booking, and the two must be able to diverge again without one edit changing the other"* (`tokens.css:220-222`, about the inactive role), and SCR-006's own structural decision that a desk is inactive because *"an administrator chose that"*. `DeskStatus` is a **per-date occupancy** vocabulary; `is_active` is a **lifecycle** one — the same distinction `availability.ts`'s `deskAvailabilitySchema` and `desks.ts`'s `adminDeskSchema` already draw on the server.

### 4.2 One component, not a sibling — third application of a policy already written down

`StatusChip.tsx:19-21` states the policy and its rejected alternative:

> *"One component, not a sibling `BookingStatusChip`: the CSS, the tokens, the pill geometry and the icon-and-word discipline are identical, and duplicating them is exactly the kind of drift `modules/bookings/README.md` warns against for a second rule."*

US-010 wrote it, US-016 is its second application, and Figma built the chip the same way — `Status chip` (node `20:17`) gained `Active` and `Inactive` as **variants of the existing set**, not a new set (SCR-006's designer handoff).

**On the discriminant's name: `'inventory'`, not `'desk'` (taken) and not `'admin'` (a role, not a subject).** And one deliberate constraint on its values: SCR-008 will need `Active` / **`Deactivated`** for *people* — the same quiet-neutral treatment with a different word — and SCR-008:212 records that Figma solved it by **cloning a new variant**, because *"the set has no text property, so its words live in the variants and a new word needs a new variant"*. So SCR-008's story adds `| { kind: 'account'; status: 'active' | 'deactivated' }` when it arrives. **Do not generalise now** — the charter's *"no speculative generality; design for the approved stories only"*. A premature `kind: 'lifecycle'` taking a free-text label would delete the very property that makes this component NFR-008-safe.

**The CSS classes are `.status-chip--active` and `.status-chip--inactive`.** Both names are free today (`status-chip.css:23-61` defines available / taken / selected / confirmed / completed / cancelled). One comment is warranted: the class is keyed on `status` alone, not on `kind`, so a future `kind: 'account'` with `status: 'active'` lands on the same class — which is correct, because it wants the same treatment, but it is the kind of coincidence better written down than discovered.

### 4.3 Two new icon assets, and no token change

- **`icon-block.svg`** — Figma `Icon / block` (node `11:43`). `apps/ui/src/assets/` holds calendar, clock, close, grid and person only; there is no block icon in this codebase and nothing renders one today (`DatePicker` does not). Download from the node, add beside the others, import `?raw` and render through a `dangerouslySetInnerHTML` span exactly as `CloseIcon` does (`StatusChip.tsx:69-72`). The icon's Figma description names a different original use (*"a date the rules forbid"*); reusing one mark for both is what the design system intends — SCR-008:212 says the `Deactivated` chip is *"cloned from `Inactive`, so the fill, border and **block icon** are the same tokens"*.
- **`icon-plus.svg`** — Figma `Icon / plus` (node `192:40`), *"Leading icon for the Add desk / Add person actions (SCR-006, SCR-008). Geometry only; colour comes from the stroke token."* Needed by §6's **Add desk** button.
- **The Active chip reuses the inline `CheckCircleIcon`** already in `StatusChip.tsx:46-56` — this codebase's check-circle, and the one Figma binds.
- **`Button` does not gain an icon prop, and a diff adding one is a review finding.** `ButtonProps` (`Button.tsx:20-34`) is a Complex surface by `components/README.md:3-4`, and it needs nothing: `children: ReactNode` plus `button.css:16`'s `gap: var(--s-8)` — the same 8px Figma draws — means the caller passes `<><PlusIcon />Add desk</>`. The icon inherits `currentColor`, which on a primary button is `--c-action-label`, which is exactly the fix SCR-006's handoff reports from the Figma build (*"An icon swapped into a button keeps its own master's stroke colour… Now bound to `--c-action-label`"*). **Getting that for free is the argument against the prop**, and it is worth one line in the PR.

---

## 5. The browser — where the screen's parts live

### 5.1 Screen-private under `apps/ui/src/screens/desks/`

**Recommendation: `Desks.tsx`, `DeskRow.tsx`, `DeskSkeletonRow.tsx`, `copy.ts`, `desks.css` — all screen-private, none shared.** This is US-013 §6.1 and §6.3's answer applied to the second admin table, and **the Figma component's own documentation makes the argument before anyone asks** (`Desk skeleton row`, node `208:232`):

> *"Deliberately separate from `Admin skeleton row`: a skeleton only stops the table jumping if it matches that table's columns, and the two admin tables do not share them."*

That is `AdminSkeletonRow.tsx:1-13`'s own reasoning, arrived at independently by the designer, about a different pair of tables. The measurements confirm it: the desk table is **140 / 160 / 240** plus two action buttons on a 1104 column (`Desk table header`, node `201:238`); SCR-005's admin table is four columns plus one action. **Nothing is shared but the idea.**

**The "two tables now justify extraction" argument, considered and rejected.** It is the natural objection, and the same one US-013 §6.1 faced about `BookingRow` and declined *"with two plausible consumers"*. Three reasons it still loses:

1. **The DOM differs at every width.** `AdminBookingRow` is a `<tr>` of five cells at 1024 and above and one `<li>` below; `DeskRow` is a `<tr>` of four cells on a different grid whose card-compact form stacks desk, then meta (chip plus count), then two equal-half buttons (node `201:236`). A shared component would need a `layout` prop plus a `columns` prop plus a `renderCell` — which is a table library, not an extraction.
2. **The row heights differ and are the point.** 64 / 80 / **156** here (verified against the skeleton variants, node `208:232`) against 64 / 80 / **188** there.
3. **`components/README.md:6` is the standing rule** — *"A component private to one screen belongs in that screen's folder, not here"* — and SCR-008's People table will be a third shape. **Extraction is the third consumer's call, if it is ever anyone's.**

### 5.2 One shape per width — the problem US-015 had here does not exist

Worth stating because a reviewer who read US-015's note will look for it. `AdminSkeletonRow` carries a known, accepted mismatch: a mixed SCR-005 list holds 188px cancellable cards and 160px non-cancellable ones, and the skeleton can only match one (`AdminSkeletonRow.tsx:8-12`, `decisions.md` D-04).

**SCR-006 has no such mixture.** Every desk row carries exactly two actions at every width — that is AC-08's content — so `Desk row` (node `201:236`) has one height per layout regardless of `status`, and `Desk skeleton row` (node `208:232`) matches it exactly: **64px table, 80px card, 156px card compact**. AC-07's *"skeleton rows at real row height"* is therefore satisfiable precisely, with no trade-off and no open item. §6's disabled treatment does not move it — `Button`'s own Figma description records that the disabled variant keeps its box (*"Geometry is unchanged"*).

One fidelity note: the existing `AdminSkeletonRow` bars use `--c-fill-subtle` (`all-bookings.css:168`); the Figma desk skeleton bars are `--c-fill-muted`. Follow the frame for the new component and leave SCR-005's alone.

### 5.3 The desk fetch now has two consumers — move it to `lib/`, and the cost is one manifest line

`use-desks.ts` and `fetch-desks.ts` exist today **inside `screens/all-bookings/`**, built by US-014 for the filter's desk dropdown. US-016 is the second consumer of the same endpoint, and the two hooks would be identical: one fetch on mount, `loading | ready | error`, with each screen deciding what `error` means (`use-desks.ts:17-20, 22-43`).

**Recommendation: move `fetch-desks.ts`, `use-desks.ts` and `use-desks.spec.ts` to `apps/ui/src/lib/`, and have both screens import from there.**

- **The bar this project uses for extraction is two real consumers**, stated at `lib/cancel-booking.ts:4-6` and applied by US-015 §5.1. This is the second, and it is a *real* one rather than a plausible one.
- **`apps/ui/src/lib/**` is not `components/**`.** `components/README.md:3-4` makes *component props* a contract; `lib/` already holds `cancel-booking.ts` serving two screens. Per US-015 §5.1's tier note, this is Medium, not the Complex shared-component surface.
- **Copying instead means two parsers for one response**, and `bookedAhead` would land in both from day one while only one uses it. That is *"a second source for the same fact"* — US-014 §3.1's phrase — and ADR-004's own Context warns that the first inconsistency then *"surfaces as a 'consolidation' PR arguing after the fact over code nobody meant as a decision"*.

**The honest cost, stated because a reviewer will hit it:** `knowledge/traceability/manifest.json` lists US-014's tests by **path**, and `apps/ui/src/screens/all-bookings/use-desks.spec.ts` is one of them. Moving the file means **editing another story's `tests[]` entry inside this story's PR — one string.** Nothing else about US-014's coverage changes: the spec file moves with its `(US-014/AC-03)` citations intact, so the manifest stays consistent and both `aidlc-check`'s AC rule and check 16 still pass. If the human would rather US-016's PR not touch US-014's manifest node, the fallback is a copy under `screens/desks/`, and I would then want a comment in each file naming the other. **Open item 3.**

**Either way, `AllBookings.tsx`'s behaviour does not change.** Its import paths move (`:32-33`) and nothing else; `desksState.status !== 'ready'` still disables the desk `Select` (`:183`), which is US-014's own non-fatal-failure decision (its §7.6) and emphatically *not* this screen's, where a desk-list failure **is** ST-04.

---

## 6. The controls whose destinations do not exist yet — the story's hardest call

**This is the section to read twice.** Everything else in this note applies a decision something in the tree already made. This one is genuinely open, it sits against a precedent that points the other way, and it is the only part of the screen a person will actually interact with.

### 6.1 The precedent, and why it cannot be applied as written

`routes.tsx:10-11` states the project's rule:

> *"Addresses reserved but not built by US-001 are listed in the design note rather than stubbed here — **a route with no screen behind it is a 404 that looks like a bug**."*

US-002 §6.1 applied it to keep a **Settings** row out of the account menu until `/settings` existed. **US-013 §6.2 applied it to this very screen**, declining to build the *"Add desks so people can book"* branch of its own empty state *"because SCR-006 does not exist"*, and carried it as its open item 4 — *"deferred to whichever story builds desk administration"*. **That story is this one.**

The rule's remedy is always the same: **omit the control.** Here it is unavailable, because **US-016's own acceptance criteria make the controls their subject:**

- **AC-06**: *"an empty state says so and **offers Add desk**, and the header keeps its own **Add desk** action alongside it"*.
- **AC-08**: *"**Edit** and the activate/deactivate action are **both directly visible** — no overflow menu at any width"*, and the QA note classifies AC-08 and AC-09 as *"negative assertions protecting decisions taken on 2026-09-10"*.

US-013's AC-08 asked only that *"an empty state says exactly that"* — the link was a refinement of SCR-005, not an AC, which is why omission satisfied it. **US-016's ACs name the controls.** Omitting them fails two ACs, and dropping an AC is a Gate 1 change routed through a `change-request` issue, not a delivery decision — US-014 §2.1's point 2, unchanged.

### 6.2 Recommendation: visible, `disabled`, each with an accessible reason, each with a test the next story must edit

**Recommendation.** Render **Add desk** (header and empty state), **Edit**, and **Deactivate** / **Activate** as real `Button`s that are **present, correctly labelled, correctly placed at all three widths, and `disabled`**, each carrying an accessible explanation.

The alternatives, walked honestly:

| Option | Verdict |
| --- | --- |
| **Omit them** | **Fails AC-06 and AC-08.** A Gate 1 change, not a delivery decision (§6.1) |
| **Enabled, navigating to `/admin/desks/new` and friends** | **Rejected.** Those addresses have no screen; `routes.tsx:65`'s catch-all would send the click to `/sign-in`. This is literally the failure `routes.tsx:10-11` forbids, and it is worse than a 404 |
| **Enabled, no-op on click** | **Rejected.** A control that accepts a click and does nothing is indistinguishable from a broken one, and it gives a screen-reader user no way to learn otherwise. PRIN-2's *"a half-built control communicates a falsehood"* — US-013 §6.2's own third reason |
| **Enabled, opening a "coming soon" dialog** | **Rejected.** Ships copy nobody approved and invents a numbered state SCR-006 does not have |
| **Disabled, with a reason** (recommended) | Satisfies AC-08's *"directly visible"* and AC-06's *"offers"* literally, keeps the geometry AC-08's three widths are about, is honest about what the build can do today, and is **one attribute for US-017/US-018/US-019 to delete** |

**Three things make the recommendation work rather than merely defensible:**

1. **The reason is exposed, not implied.** Use the pair `AdminBookingRow` already established for its non-cancellable rows (`AdminBookingRow.tsx:12-18`, and SCR-005's own accessibility note): the reason in a **visually-hidden span** plus the same string as `title` for the mouse tooltip, because `title` alone is not an accessible name in practice. `.desks__visually-hidden` goes in `desks.css` — there is still **no global `sr-only` utility in this codebase** and this story must not introduce one (`all-bookings.css:203-207` records the same restraint; each surface defines its own).
2. **The gap is one story wide, and that is checkable.** `US-017-add-a-desk.md`, `US-018-correct-a-desk-number.md` and `US-019-take-a-desk-out-of-service.md` each carry **`Depends on: US-016`**. They are the next three stories in EPIC-003, not a someday. That is what separates this from US-002's **Settings** row, where nothing was scheduled.
3. **The forcing function is a test, not a comment.** `Desks.spec.tsx` asserts, per control, that it is **present, named, `disabled`, and carrying its reason in the accessibility tree** — a positive assertion, not a negative one. **US-017 cannot ship its Add-desk flow without editing this test**, which is exactly the visibility a `// TODO` does not give. Name the story that deletes each assertion in the assertion's own title.

**What this story must NOT build, and the list is the review instruction:** no confirm dialog, no `Dialog State=Blocked`, no deactivate or activate endpoint, no `PATCH /api/admin/desks/:id`, no `/admin/desks/new` route, no SCR-007 form, no toast. **ST-05 through ST-10 are US-019's**, and the story's UI section says so (*"States exercised: ST-01 · ST-02 · ST-03 · ST-04"*). A diff here adding any of them is building US-019 inside US-016 — the move US-014 §3.3 refused from the other end of the same pair of stories.

### 6.3 The escape hatch, stated so it can be taken cheaply

**If the PO's view is that an inventory whose only two row actions are dead is not shippable value, the answer is to merge US-016 and US-017 into one delivery, not to soften this section.** That is a Gate 1 conversation and belongs to `/ba` and the PO. I recommend **against** it — US-016 alone delivers AC-04's count, which is the information PRIN-3 exists for and which US-019 needs on screen before its block can be predictable. But the option is real, it is cheap now and expensive once the PR is open, and pretending it does not exist would be the dishonest version of this section. **Open item 1.**

---

## 7. The rest of the screen

### 7.1 Three widths — the same CSS-only device, and the two boundaries already exist

There is still **no `matchMedia` anywhere in `apps/ui/src`**, and jsdom performs no layout. US-013 §6.5 solved the table/card switch by rendering **both trees** and letting CSS show one; `AdminBookingRow`'s docblock (`:7-10`) and `all-bookings.css:137, :152` are the worked example. **Apply it; do not re-derive it.**

**And the two numbers are already settled, which removes what would otherwise be an open item.** SCR-006 requires the table to become cards **below 1024, not below 768** — its Layout section measures it (*"This table needs 672px; at 768 it has 648"*) and the Figma `Desk row` description repeats it. The three variants map onto the two boundaries `all-bookings.css` already uses:

| Width | `Desk row` variant | CSS |
| --- | --- | --- |
| 1024 and above | `Layout=Table` | `@media (min-width: 1024px)` — table shown, card list `display: none` (`all-bookings.css:152-160`'s shape) |
| 768 to 1023 | `Layout=Card` | the card tree's default: one line, 80px, actions right-aligned |
| 767.98 and below | `Layout=Card compact` | `@media (max-width: 767.98px)` — stacked, 156px, the two actions as **equal halves** (`flex: 1 0 0`), never full-width stacked buttons (SCR-006's accessibility section is explicit) |

`display: none` removes a subtree from the accessibility tree, so no duplicate tab stops exist and the hidden tree is never announced. **Assertable in jsdom**: both trees render, and the boundary is a CSS assertion on the stylesheet — the single-boundary assertion US-013 made for 1024, made twice.

**AC-08 is a negative assertion and needs a test that can fail** (§10): over a rendered list, `queryAllByRole('button', { name: /more|options/i })` is empty in **both** trees, and the number of **Edit** controls equals the number of rows in each tree. Asserting "no overflow menu" by asserting an absent component proves nothing when the component does not exist.

### 7.2 AC-05 at the pixel — the em dash is a rendering of 0

`Desk row` (node `201:236`) has a single `booked` string slot; the Figma default is `"3 upcoming"` and SCR-006's ST-01 draws `—` on the rows with none. So one function in `copy.ts`:

```ts
/** US-016/AC-04, AC-05. 0 renders as an EM DASH — not the word "zero", not blank. SCR-006 draws
 *  it, and AC-05 requires none to be unmistakable for missing data. The dash is `aria-hidden`;
 *  the cell's accessible text is words, exactly as `AdminBookingRow` handles its own em dash
 *  (`AdminBookingRow.tsx:66`). */
export function bookedAheadLabel(count: number): string;   // 0 -> em dash,  n -> `${n} upcoming`
```

**Two things a reviewer should check, because a visible dash alone fails the AC it is drawn for:**

- **A bare em dash is silent or gibberish to a screen reader.** Pair it the way `AdminBookingRow` does — the dash `aria-hidden`, the words (*"No upcoming bookings"*) in a visually-hidden span. SCR-006's accessibility section demands the column header travel with the value (*"'Booked ahead, 3 upcoming' is meaningless without its header"*), which the `<table>` gives free at 1024 and above and which the card layouts must supply in text.
- **The exact strings are UX's.** *"3 upcoming"* is on the frame; the singular (*"1 upcoming"*) and the accessible text behind the dash are not. **Open item 5.**

### 7.3 ST-03, ST-04 and the summary line — three existing components and one screen-private paragraph

- **ST-03 uses `EmptyState` unchanged** (`EmptyState.tsx:15-22`): `title` = *"No desks yet. Nobody can book until you add one."*, a `body`, and `actions` = §6's disabled **Add desk**. Its `actions` prop already exists and its grid icon is already this screen's own nav icon (`EmptyState.tsx:27-30`). **The table and its headers are not rendered in ST-03** — SCR-006 is explicit (*"headers over nothing are furniture"*), which is a different choice from ST-04 and deserves its own assertion.
- **ST-04 uses `Alert` unchanged** (`Alert.tsx:19-28`): `tone="danger"`, `live="assertive"`, `actions` = **Try again**, message *"We couldn't load the desk list."* — the composition `AllBookings.tsx:219-231` already uses. **And Add desk is hidden here, not disabled**, which is AC-07's deliberate half and the QA note's *"easy to miss"*: BR-001.8 means adding a desk against a list nobody can see risks a duplicate-number refusal. **State the asymmetry with §6 in the code**: in ST-04 the control is *absent because the data is unknown*; elsewhere it is *present but disabled because the destination is unbuilt*. Two reasons, two renderings, and conflating them is the likely slip.
- **The summary line is screen-private markup, not a component.** SCR-006's components table names `result-summary`, and **no such shared component exists** — US-013's own file-placement list proposed `ResultSummary.tsx` *"screen-private until SCR-006/008 need it"*, and it was ultimately inlined as `AllBookings.tsx:192-199`'s `<p className="all-bookings__count" role="status">`. Do the same: a `<p role="status">` in `Desks.tsx` and one pure `summaryLine(desks)` in `copy.ts`. SCR-006 requires a **live region** (*"so an activation or deactivation announces the new counts"*); `role="status"` gives that, and the announcement only becomes useful in US-019. The **ST-02 skeleton variant** is the same one-line device `AllBookings.tsx:187-189` uses.

---

## 8. No new ADR — four consequential edits instead

**Recommendation: no ADR.** The test US-013 §8, US-014 §8 and US-015 §7 applied: *does the decision bind work beyond this story, with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **The count read in `modules/desks` over `bookings` (§2.1)** | **No ADR.** ADR-004's own Context names this read, by rule name, as a case it was written for. A story that consumes an ADR does not need one |
| **One extra query and a tally, not an aggregate (§2.2)** | **No ADR.** A query-shape choice with a bound derived from an approved requirement. It belongs in the repository docblock, where the person about to "optimise" it will read it. In Construction the executable contract *is* the design |
| **`bookedAhead` on the existing envelope (§3.1)** | **No ADR.** The decision was taken and written down by US-014, in this schema's own docblock (`desks.ts:24-29`), before this story existed. This PR turns a prediction into a worked example |
| **`StatusChip`'s third `kind` (§4)** | **No ADR.** `StatusChip.tsx:19-21` already carries the policy **and** its rejected alternative. Third application |
| **§6 — a control whose destination is unbuilt** | **The one real candidate, and my answer is still no — but this is where I would not argue hard.** It binds three named stories, SCR-007 and SCR-008 will face it again, and the rejected alternative (omit it: `routes.tsx:10-11`, US-013 §6.2) is one a future author would absolutely re-litigate. Against: the decision's actual content is a *rendering* plus a *copy string*, and UX owns the second; an ADR whose Decision reads "render it disabled and say why" is a paragraph wearing a table. **If you expect this three more times this release and want it held by a document rather than by §6 plus a test, write it now rather than at the third one.** **Open item 6** |

**Four consequential edits, US-013's device, each required by something that already exists:**

1. **`apps/api/src/modules/desks/README.md`** — ADR-004 requires each module README to state what it owns and what it **reads** (follow-up 1, `:70-71`), and this module reads a table it does not own for the first time. Record: the `bookings` read, its `desk_id`-only select list and why, the predicate borrowed from `domain/`, and **the forward constraint that US-019's block must borrow the same one** (§2.4). **While there, fix a stale cross-reference the file already carries**: `:5` and `:24` say desk writes arrive *"once US-015/US-017 build this module"*, and US-015 is now *Cancel a booking on behalf* — desk writes are US-017 (add), US-018 (edit) and US-019 (activate/deactivate). The numbering moved underneath it.
2. **`libs/contracts/src/desks.ts:24-29`** — the envelope's docblock predicts this story in the future tense. Rewrite the prediction as the record: `bookedAhead` arrived additively in US-016, the object shape is why it could, and **`adminDeskSchema` is now a shape two screens parse**, not one.
3. **`apps/api/src/modules/admin/admin.router.ts:81-85`** — the docblock's *"inventing [search] here would be building US-016 inside US-014"* now points at a shipped story. Amend it: US-016 arrived, confirmed the absence (AC-09), and the endpoint still takes **no** query parameters by requirement rather than by omission.
4. **`apps/ui/src/components/status-chip/StatusChip.tsx`'s docblock** — it enumerates two families today. Add the third, name SCR-006's frames, and **state the SCR-008 constraint** (§4.2): a `Deactivated` account chip is a fourth variant with its own word, never `inactive` relabelled.

**`ADR-004-table-ownership.md` itself is not edited**, although `:41` and follow-up 2 (`:72-73`) carry the same stale `US-015/US-017` reference. A story PR is the wrong vehicle for editing an accepted decision's text, even factually — **open item 7**, for the human.

`ai/standards/api-standards.md` needs no edit: nothing here adds an error code, a status or a pagination rule. `apps/api/src/modules/README.md`'s `desks` row already reads *"Desk inventory, number validation and normalization, activate/deactivate and its block"*, which covers this read.

---

## 9. File placement

**New — `apps/ui`** (all screen-private; the pixel truth is in the frames)

```
apps/ui/src/screens/desks/Desks.tsx            (+ .spec.tsx)  the screen: ST-01..ST-04, §6, §7.3
apps/ui/src/screens/desks/DeskRow.tsx          (+ .spec.tsx)  table + card trees; AC-02, AC-05, AC-08 (§5.1)
apps/ui/src/screens/desks/DeskSkeletonRow.tsx                 64 / 80 / 156, this table's grid (§5.2)
apps/ui/src/screens/desks/copy.ts              (+ .spec.ts)   bookedAheadLabel, summaryLine, §6's reasons
apps/ui/src/screens/desks/desks.css                           three widths; .desks__visually-hidden (§6.2, §7.1)
apps/ui/src/assets/icon-block.svg                             Figma `Icon / block` (node 11:43) (§4.3)
apps/ui/src/assets/icon-plus.svg                              Figma `Icon / plus`  (node 192:40) (§4.3)
```

**Moved — `apps/ui`** (§5.3; subject to open item 3)

```
apps/ui/src/screens/all-bookings/fetch-desks.ts    -> apps/ui/src/lib/fetch-desks.ts
apps/ui/src/screens/all-bookings/use-desks.ts      -> apps/ui/src/lib/use-desks.ts
apps/ui/src/screens/all-bookings/use-desks.spec.ts -> apps/ui/src/lib/use-desks.spec.ts   (citations unchanged)
```

**Modified — `apps/api` and `libs/contracts`**

```
libs/contracts/src/desks.ts                          + bookedAhead; envelope docblock (§3.1, §8)
libs/contracts/src/desks.spec.ts                     the new field's parse cases (§10)
apps/api/src/modules/desks/desks.repository.ts       + listUpcomingConfirmedDeskIds (§2.2)
apps/api/src/modules/desks/desks.repository.spec.ts  recording fake gains `gte`; the select-list assertion
apps/api/src/modules/desks/desks.service.ts          + nowMs/officeTimezone; the tally; docblock (§2.3)
apps/api/src/modules/desks/desks.service.spec.ts     AC-04, AC-05, the single clock reading
apps/api/src/modules/admin/admin.router.ts           docblock ONLY — no handler change (§3.3, §8)
apps/api/src/modules/admin/admin.routes.spec.ts      EXTEND the US-014 block at :455-491; AC-10, AC-04, AC-05
apps/api/src/composition.ts                          + nowMs/officeTimezone on createDesksService (:108)
apps/api/src/modules/desks/README.md                 ADR-004 requires it; stale story numbers (§8)
```

**Modified — `apps/ui`**

```
apps/ui/src/components/status-chip/StatusChip.tsx       + kind 'inventory'; INVENTORY_LABEL; docblock (§4)
apps/ui/src/components/status-chip/StatusChip.spec.tsx  AC-02, AC-03 — word AND icon, per variant
apps/ui/src/components/status-chip/status-chip.css      .status-chip--active / --inactive (§4.2)
apps/ui/src/routes.tsx                                  + /admin/desks under RequireRole (§0, §9.1)
apps/ui/src/screens/all-bookings/AllBookings.tsx        import paths only, if open item 3 says move (§5.3)
```

**Modified — framework**

```
inception/specs/index.md                   the US-016 row
knowledge/traceability/manifest.json       US-016 tests[]; US-014's use-desks.spec.ts path if moved (§5.3)
```

### 9.1 Not modified, and worth saying so

- **`supabase/migrations/**`** — §0.2. The index this count needs is at `0003_bookings.sql:79` and its own comment names `BR-001.9`. **A migration in this PR is a review finding.**
- **`inception/design/tokens.css`** — §0.2, §4.3. Both roles exist in both themes and the Figma component binds them. **A protected-path diff here is a review finding.**
- **`apps/api/src/http/middleware/**` and `http/app.ts`** — §0.2. The mount and both guards predate the route.
- **`apps/api/src/domain/booking-history.ts`** — §2.4. The predicate is **borrowed**, never rewritten and never edited. *"Changing an existing rule is Complex"* (`task-surfaces.md:52-57`) and nothing here asks for it.
- **`apps/api/src/modules/bookings/**`** — the bookings module neither gains a method nor loses one. `listConfirmedDeskIds` keeps its shape; this story's read is a *different module's* read of the same table, deliberately (§2.1).
- **`libs/contracts/src/error.ts` and `libs/contracts/src/availability.ts`** — §3.1. No new code, and `deskAvailabilitySchema` must not be widened to carry `bookedAhead`: that is a per-inventory fact, not a per-date one.
- **`apps/ui/src/components/app-shell/AppShell.tsx`** — **checked, and it needs nothing.** `ADMIN_NAV` already contains `{ to: '/admin/desks', label: 'Desks', icon: 'grid' }` (`:33`), with no disabled state, no "coming soon" marker and no conditional. Today that link falls through to `routes.tsx:65`'s catch-all; **this story is what makes it resolve**, and it does so by adding the route, not by touching the shell. Worth one line in the PR — it is a live wrong behaviour fixed as a side effect, and a reviewer who does not know that may look for a separate fix.
- **`apps/ui/src/lib/data-refresh.ts`** — §0.2, and the story's own edge case.
- **`apps/ui/src/components/button/Button.tsx`, `empty-state/EmptyState.tsx`, `alert/Alert.tsx`** — §4.3, §7.3. Composed as they are. **A new prop on any of them is a review finding.**
- **`eslint.config.mjs`** — §0.2. `MAY_IMPORT.desks` stays `[]`.
- **`apps/ui/src/screens/all-bookings/**` beyond import lines** — this story is not about that screen.

**Four of those are protected paths.** A story that adds a client route, changes a response shape and widens a shared component while touching no migration, no middleware, no token and no error code is the shape to aim for, and it is worth stating in the PR the way US-013's, US-014's and US-015's were.

---

## 10. Test placement per AC

QA's own flags are the organising constraints: **AC-04 and AC-05 are the load-bearing pair**, **AC-07's hidden Add desk is easy to miss**, and **AC-08 and AC-09 are negative assertions needing tests that can fail.**

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `desks.repository.spec.ts` — the existing assertion at `:52-70` (no `is_active` filter, ordered `desk_number`) **re-titled to cite US-016/AC-01 alongside US-014/AC-03, not replaced**; `Desks.spec.tsx` — an active and an inactive desk both render, in the fetcher's order | repository + component |
| AC-02 | `StatusChip.spec.tsx` — `kind="inventory"` renders the **word** *Active* / *Inactive* **and** an icon; `DeskRow.spec.tsx` — the chip's word tracks `isActive` in both trees | component |
| AC-03 | `StatusChip.spec.tsx` — the inactive chip carries `.status-chip--inactive` and **no danger-family class**. A colour cannot be asserted in jsdom; the class is the honest proxy, and the token behind it is `tokens.css:225-227`'s, unchanged | component |
| **AC-04** | `desks.repository.spec.ts` — the recorded query is `from('bookings').select('desk_id').eq('status','confirmed').gte('booking_date', today)` and **nothing wider**; `desks.service.spec.ts` — **three bookings on one desk yield `bookedAhead: 3`**, a second desk's bookings do not leak into the first, and `officeToday` is read **exactly once**; `admin.routes.spec.ts` — the field reaches the body | **repository + service + route** |
| **AC-05** | `desks.service.spec.ts` — **a desk with only a PAST Confirmed booking reports 0**, and a desk with only a *future Cancelled* booking reports 0. These are the QA note's exact cases, and the two that a `.eq('status','confirmed')` without the date bound, or a date bound without the status, each pass half of; `libs/contracts/src/desks.spec.ts` — `bookedAhead: 0` parses and **an absent `bookedAhead` fails**, which is the wire half of the AC; `DeskRow.spec.tsx` — 0 renders an em dash **plus accessible words**, never a blank cell | **service + contract + component** |
| AC-06 | `Desks.spec.tsx` — an empty array renders `EmptyState` with SCR-006's title, **no `<table>` and no column headers**, and an **Add desk** control in both the empty state and the header | component |
| **AC-07** | `Desks.spec.tsx` — loading renders skeleton rows in **both** trees with **Add desk enabled**; an error renders `Alert tone="danger"` with **Try again**, no table, and **no Add desk control at all** (`queryByRole('button', { name: /add desk/i })` is null). **The hidden-versus-disabled distinction is the assertion QA flagged**, and asserting "disabled" here would pass a screen that fails the AC | **component** |
| **AC-08** | `DeskRow.spec.tsx` — **Edit** and the activate/deactivate control are both present in the table tree and in the card tree, and the action's label is *Deactivate* on an active desk and *Activate* on an inactive one; `Desks.spec.tsx` — **no overflow or "more" control in either tree**, and the count of Edit controls equals the count of rows in each. Plus the CSS assertions for the 1024 and 768 boundaries (§7.1) | **component** |
| AC-09 | `Desks.spec.tsx` — no `textbox`, no `combobox`, no control named /search|filter/i, and **no control named /delete|remove/i** in either tree; `admin.routes.spec.ts` — the route parses no query parameters | component + route |
| AC-10 | `admin.routes.spec.ts:456-460` — the existing Employee-session 403 on this endpoint, re-titled to cite US-016/AC-10; plus `Desks.spec.tsx` rendered under `RequireRole role="admin"` with an Employee session, asserting the redirect to `/bookings` (`require-role.tsx:29`) | **route** + component |
| §6 | `Desks.spec.tsx` — each unbuilt control is present, correctly named, **disabled**, and carries its reason in the accessibility tree. **Title each assertion with the story that deletes it** (US-017 / US-018 / US-019) | component |

**Three mechanical notes that cost time if they are discovered in CI instead of here:**

1. **`admin.routes.spec.ts`'s body assertion at `:480-483` uses `toEqual` on the exact object** `{ id, deskNumber, isActive }`. Adding a required field **breaks it**. **Extend it; do not delete or loosen it** — it cites US-014/AC-03, and losing it would silently drop another story's coverage, the hazard US-015 §5.4 named about the US-013 `<th>` assertion.
2. **Every `DesksRepository` stub in `admin.routes.spec.ts` is a partial object literal** (`appWith({ desks: { async listAllDesks() { … } } })`, four call sites inside `:455-491`). Adding a second interface method makes all four fail to typecheck. Expected, mechanical, and better known in advance.
3. **`desks.repository.spec.ts`'s recording fake (`:19-46`) records `select`, `eq` and `order` only.** It needs a `gte` recorder for the new query. Keep the fake's discipline: it exists to prove *"the query we issue"*, and `testing-standards.md` bans asserting the mock for anything else.

**No new gated real-Postgres test, and the reason is worth stating.** US-013 needed one because `user_profiles!user_id` and PostgREST's out-of-range paging are runtime-only. **§2.2's chosen query introduces no runtime-only assumption**: `.eq` and `.gte` are ordinary filters over an ordinary select, with no embed, no aggregate and no count hint. **That is the strongest practical argument for §2.2's recommendation over the aggregate**, which would have needed one.

**Data setup**, the story's QA note taken literally, because each row separates a correct implementation from a plausible one: about 40 desks over three zones; **one inactive**; **one with 3 upcoming Confirmed bookings**; **one with past Confirmed bookings only** (the AC-05 case, and the one no fixture produces naturally); **one with a future Cancelled booking only** (the second AC-05 case, which the story's edge case names and the QA note does not); and **an empty office** for AC-06.

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| **1** | **§6.3** — is an inventory whose only two row actions are disabled shippable on its own, or should US-016 and US-017 merge into one delivery? My recommendation is **ship US-016 alone** (the AC-04 count is the value, and US-019 needs it on screen), but this is a scope call, not mine, and it is far cheaper before the PR exists | **PO + `/ba`** | **whether §6 is built at all** |
| **2** | **§2.4** — US-019's deactivation block must call **`displayStatusPredicate('confirmed', today)`**, the same function this count uses, and must not re-write `status = 'confirmed' AND booking_date >= today` by hand. Record it against US-019 so its author reads it as a contract rather than an omission | Manager → US-019 | nothing in this story |
| **3** | **§5.3** — move `fetch-desks.ts` / `use-desks.ts` / `use-desks.spec.ts` to `apps/ui/src/lib/` (my recommendation; the cost is **one path string in US-014's manifest `tests[]`**), or copy them into `screens/desks/` and accept two parsers for one response? | DEV + Joy Joshua | one manifest line; nothing functional |
| **4** | **§0.2, §4** — `tokens.css` has `--c-state-inactive-*` but no `--c-state-active-*`; the Figma Active chip binds `--c-state-available-*`. **I recommend changing nothing** (the frames are the authority and `tokens.css` is a protected path). Is the asymmetry intended, or does the palette want an `active` alias in a later pass? | `/ux` | nothing — naming only |
| **5** | **§7.2** — the **Booked ahead** strings. The frame gives *"3 upcoming"* and the em dash. Not given: the singular (*"1 upcoming"*) and **the accessible text behind the dash** (my placeholder: *"No upcoming bookings"*). The second is what makes AC-05 true for a screen-reader user | `/ux` + PO | `copy.ts`, and AC-05's accessible half |
| **6** | **§8** — §6's "unbuilt destination" policy: keep it as a design-note section plus a forcing test (my recommendation), or promote it to an ADR now, since SCR-007 and SCR-008 will each face it again? This is the one I would not argue hard about | Joy Joshua | nothing |
| **7** | **§8** — `ADR-004:41` and its follow-up 2 still say desk writes arrive with *"US-015/US-017"*; the numbering moved and US-015 is now the admin cancel. A story PR is the wrong vehicle for editing an accepted ADR's text | Joy Joshua | nothing |
| 8 | **§6.2** — the exact reason string on each disabled control. My placeholder names no future release; anything that promises one is a commitment UX and the PO own, not a component | `/ux` + PO | three strings |
| 9 | US-013 open item 3 — offset-versus-keyset as an ADR for future admin lists — is still yours and **still not this story's** (this endpoint does not page: AC-01 returns every desk). Noted so it is not lost | Joy Joshua | nothing |

---

## Notes outside the design note

Four things worth your attention separately from the note DEV will paste.

1. **"No token change is needed" is right, but not for the reason it looks like.** `--c-state-inactive-*` exists (and is used by **no code at all** today — this story is its first consumer), while `--c-state-active-*` does **not**. The asymmetry makes inventing one look obviously correct. The hi-fi component settles it the other way: Figma binds the Active chip to `--c-state-available-*`. **Without checking the frame, this story would very plausibly have shipped a protected-path diff to `tokens.css` that nothing asked for** (open item 4).

2. **The thing most likely to ship broken is §2.2's rejected option, and it deletes rows rather than miscounting them.** A PostgREST embedded aggregate with a filter on the embedded resource is the natural-looking one-query answer, and the case it silently gets wrong — a parent with no matching children — **is AC-05**. On seeded data where every desk has a booking it passes; in an office where two desks are quiet it drops them from the inventory. If you spot-check one finding in this note, make it that one.

3. **This story touches a shared component's props, and the previous three deliberately did not.** US-013, US-014 and US-015 each argued at length that no shared component needed changing, so a reviewer who has internalised that will read §4 as a finding. It is not — `StatusChip` genuinely cannot render AC-02's word without it, and the component's own docblock already licenses the shape. **Say so in the PR description rather than in a review thread.**

4. **`/admin/desks` is in the sidebar today and resolves to nothing.** `AppShell.tsx:33` has carried the nav item since US-001's hi-fi pass, and `routes.tsx` has no such route, so the catch-all at `:65` takes the click. That is a live wrong behaviour in `main`, fixed by this story as a consequence rather than as an AC. It does not need a separate `bug` issue — but it is worth one line in the PR, because "the Desks link now works" is not something any AC claims, and a reviewer should not have to wonder whether it was intentional.

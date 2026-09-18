# US-006 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-006 — See desk availability for the chosen date](../../stories/user-stories/US-006-see-desk-availability.md) |
| **Screen**   | [SCR-003](../../design/screens/SCR-003-book-a-desk.md) **ST-01, ST-02, ST-05, ST-06** — the availability list. The date controls are US-005's (merged); the confirm action, selection and ST-04/ST-07–ST-12 are US-007's and US-009's |
| **Tier**     | Complex — four surfaces, three of them protected paths (see §0)          |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md) — **one new ADR recommended** (§3.3, §7) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is argued
before the code, not in a review thread. `decisions.md` in this package stays DEV's.

This is the first story in the project that persists nothing and yet needs two new tables, and the
first whose highest-consequence acceptance criterion lives inside a `WHERE` clause. Those two
sentences are most of the note. The story hands `/architect` one thing by name — *"Needs per-date
availability returning every active desk with its number and taken/free state, and deliberately
**not** returning occupant identity (AC-06). Shape is `/architect`'s to settle"* — and US-005's note
hands over a second (`§3`, lines 367–370): the endpoint must re-derive `today` server-side and refuse
an out-of-window date itself.

Both are settled here. §6 is the one place this note stops and asks you.

---

## 0. The tiering

**Complex, and for four reasons.** Worth listing, because three of them are protected paths and a
reviewer should expect a diff in each:

- **`supabase/migrations/**`** — schema history, a protected path
  (`ai/standards/task-surfaces.md:28`). Two new tables, three new enums, six constraints, five
  indexes. §1.
- **`libs/contracts/**`** — a protected path (`task-surfaces.md:26-27`). A new response shape, a new
  request shape, one new error code, and one **tightening** of an existing schema (§2.2).
- **A new route and a new module mount** — `app.use('/api/bookings', …)` in `apps/api/src/http/app.ts`,
  where line 79 has been holding the comment `// app.use('/api/bookings', bookingsRouter);` since
  US-001. A new module mounted on the app is Complex by `task-surfaces.md:42`.
- **Browser: the props of shared components.** Six new components under
  `apps/ui/src/components/**` (§4.4), whose props are a Complex surface
  (`task-surfaces.md:61-62`).

**What it is not**, and each row is a section the implementation plan does not need:

| Not this | Why |
| --- | --- |
| **No new `domain/` function** | §3. Every rule this story needs already exists — US-005 built `refusalFor` and `officeToday` so US-006 and US-007 would not have to (`modules/bookings/README.md:10-14`) |
| **No desk-number validation, no normalization** | §3.1. US-006 accepts no desk number as *input*. BR-001.4/BR-001.8 are the write path's, and they belong to US-015/US-017 |
| **No `POST`, no write of any kind** | US-007's. The two partial unique indexes land here (§1.2) but nothing exercises them until then, and that is deliberate |
| **No `bookings_with_status` view** | §1.3 — and as `db-design.md:146-152` writes it, that view is not expressible as a plain view at all. Whoever needs it inherits a problem, not a line of SQL |
| **No new config value** | `OFFICE_TIMEZONE` already exists, is already required, and `buildApp({ officeTimezone })` is already the test seam (`composition.ts:50-51`, `:86`) |
| **No middleware change** | §2.1. The session chain mounts in front of this router unchanged; `requireSession` is not touched |
| **No new dependency** | Nothing here needs one. §6 names the only decision that could, and it is yours, not DEV's |
| **No `?date=` deep link** | SCR-003's Surface line permits `/book?date=YYYY-MM-DD`, and nothing implements it: `BookADesk.tsx:42` always preselects `nextBookableDate(office.today)`. Out of scope, and §2.7 says what the story that adds it must do first |
| **No ST-04 (fully booked)** | US-009's, and its absence is not a gap — §4.6 |
| **No REQ-034 "your usual" hint, no selection, no confirm** | §4.4. A component's interaction API is not knowable before the interaction exists |

**US-017 is a listed dependency and is not implemented.** The human has decided desks are seeded
straight into the database for now. That is sound and it costs this story nothing at the contract
level — US-006 reads `desks`, it does not create them — but it does mean the story's own QA dataset
has no product path to exist through. §5 is how it gets there without inventing an admin UI.

---

## 1. Migration scope — **both tables, whole, in two files**

### 1.1 The precedent already answers this, in writing

`supabase/migrations/0001_user_profiles.sql:5-7`, landed by US-001:

> This table only, plus its enum and its RLS. A migration for a table no code reads is untested
> schema, and every migration is Complex (`ai/standards/task-surfaces.md`), so each of the other
> four tables arrives **with the story that reads it**, under that story's review.

The test is *reads*, not *writes*. US-006 reads both: `desks` for AC-02/AC-04/AC-05, and `bookings`
for AC-03 — a desk is Taken precisely because a confirmed booking exists for it on that date, and
with no `bookings` table AC-03 is not merely untested, it is unimplementable. So both tables arrive
here, and `supabase/migrations/README.md:7` says the same thing in its own words: *"the first story
that needs a table writes the first migration."*

**Two files, not one**: `0002_desks.sql` and `0003_bookings.sql`, both in this PR. 0001's own header
established one table per migration, `bookings` depends on `desks` existing, and numbered files apply
in order. Keep the repo's `NNNN_name.sql` numbering rather than the Supabase CLI's timestamp
convention — 0001 set it and consistency in a four-file directory is worth more than the CLI default.

**The trade-off, stated plainly.** Creating `bookings` now means shipping a table with two partial
unique indexes, four check constraints and three foreign keys that **no code exercises until US-007**.
That is real: it is schema whose behaviour is unproven at merge, which is exactly what 0001's header
warns against. Against it:

- US-006 *does* read the table. Not creating it means US-006 cannot answer its own question.
- A table created without its constraints is a **different table**. If `bookings` arrives now with
  only what a read needs — `desk_id`, `booking_date`, `status` — then US-007 must add the two partial
  unique indexes to a table that already holds rows, and RISK-004's entire answer
  (`db-design.md:268-276`) becomes a retrofit onto data that was never constrained. Any seeded or
  hand-written row that violates the invariant then fails the `CREATE UNIQUE INDEX` in US-007's
  migration, in US-007's CI, for a reason that belongs to this story. **Create it whole or not at all.**
- The weekend `CHECK` has the same property: `db-design.md:286-289` is explicit that it is at the
  database *because* "the admin paths, the seed data and any future import all write through it".
  Seed data is precisely what §5 is about to add.

**Recommendation: create both, whole.** Then say in the PR that `bookings`'s constraints are unproven
until US-007, and name US-007 as where each one gets its test. An honest stated gap beats a silent
half-table.

### 1.2 What the two migrations contain

`0002_desks.sql` — `db-design.md` §1.2 (lines 81–100), §3 (line 262, line 281):

```sql
-- 0002 — desks
--
-- US-006 (see desk availability). The bookable inventory, 30-100 rows in practice (BR-001.4).
--
-- Arrives with the story that READS it, which is 0001's stated rule. US-015/US-017 (admin adds
-- and renames a desk) are what will write it; nothing in US-006 does.
--
-- Spec: inception/architecture/db-design.md §1.2, §3, §4.
-- Design note: inception/specs/US-006-see-desk-availability/design-note.md §1.2.

create table desks (
  -- gen_random_uuid() is built into Postgres 13+, so no extension is needed here. 0001's
  -- user_profiles.id has no default because it IS the auth.users id; this one is ours.
  id           uuid        primary key default gen_random_uuid(),
  desk_number  text        not null,
  -- REQ-017, BR-001.7. The whole of US-006/AC-04 is this column and the WHERE clause that
  -- reads it: an inactive desk must appear NOWHERE in availability, not as taken and not as
  -- free. Deactivating is reversible and never deletes (db-design.md §4).
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  -- REQ-016 — when the desk was last renamed. Application-maintained: this schema has exactly
  -- one trigger (db-design.md §3, "The one rule that needs a trigger") and it is not this.
  updated_at   timestamptz not null default now(),

  -- BR-001.4, V-16 (db-design.md:281) — one upper-case letter, a hyphen, two digits. The CHECK
  -- is what makes US-006/AC-05's zone grouping total: the letter exists by construction, so the
  -- grouping cannot be broken by an oddly-named desk (SCR-003 structural decisions, line 181).
  -- It also means a normalization bug surfaces as a rejected write rather than as a desk nobody
  -- can book (db-design.md:92-96).
  constraint desks_desk_number_format check (desk_number ~ '^[A-Z]-[0-9]{2}$')
);

-- BR-001.4, BR-001.8, V-08 (db-design.md:262) — desks must be unambiguous. This index also
-- serves US-006's ORDER BY desk_number, so no second index is needed for the read.
create unique index desks_desk_number_key on desks (desk_number);

-- Defence in depth, not the rule book (ADR-001, 0001's own comment). Deny-all: no policies.
alter table desks enable row level security;
alter table desks force row level security;
```

There is deliberately **no `zone` column**. `db-design.md:98-100`: the zone is the first character of
`desk_number`, and a separate column would be a second place for the same fact to disagree with
itself. SCR-003 open question 2 (line 200) resolved real area names out of scope — they would need a
new field per desk, an admin control and a requirement.

`0003_bookings.sql` — `db-design.md` §1.3 (lines 102–166), §3 (lines 264–265, 282–284, 292–296), §5
(lines 344–349):

```sql
-- 0003 — bookings
--
-- US-006 (see desk availability) READS this table: a desk is Taken on a date because a
-- confirmed booking exists for it (AC-03). US-007 is what first WRITES it.
--
-- It is created WHOLE — every constraint and both partial unique indexes — although nothing
-- exercises the write-side invariants until US-007. A table created without its constraints is
-- a different table: adding the two partial unique indexes later would retrofit RISK-004's
-- entire answer onto rows that were never constrained, and would fail US-007's migration for a
-- reason belonging to this story. Design note §1.1.
--
-- Spec: inception/architecture/db-design.md §1.3, §3, §5.

-- Two values, not three. Completed is DERIVED from booking_date and status, never stored
-- (db-design.md:144-164) — there is no nightly job and nothing to drift.
create type booking_status as enum ('confirmed', 'cancelled');

-- BR-001.20, US-029/AC-04-06. cancelled_by alone cannot distinguish an admin cancel from the
-- deactivation cascade — both are an admin acting on somebody else's booking — and the two
-- produce different copy. Key the notification composer on THIS, never on comparing ids
-- (db-design.md:128-141).
create type cancellation_source as enum ('owner', 'admin', 'deactivation_cascade');

create table bookings (
  id                   uuid                primary key default gen_random_uuid(),
  user_id              uuid                not null references user_profiles (id) on delete restrict,
  desk_id              uuid                not null references desks (id)         on delete restrict,
  -- A `date`, NEVER a timestamptz (db-design.md §1.3, lines 121-126). A timestamptz would store
  -- an instant and re-derive the calendar day from whoever is reading, which is the exact bug
  -- NFR-001 exists to prevent. The office's own "today" is computed once on the server, from
  -- the configured zone — apps/api/src/domain/booking-window.ts:officeToday, built by US-005.
  booking_date         date                not null,
  status               booking_status      not null default 'confirmed',
  created_at           timestamptz         not null default now(),
  cancelled_at         timestamptz,
  cancelled_by         uuid                references user_profiles (id) on delete restrict,
  cancellation_source  cancellation_source,

  -- BR-001.3, V-03 (db-design.md:282). At the database and not only in validation: the rule has
  -- no exceptions in this release, and the admin paths, the seed data (design note §5) and any
  -- future import all write through it.
  --
  -- `extract` over a `date` is immutable, so it is legal in a CHECK. Over a `timestamptz` it is
  -- only stable and this constraint could not exist — one more consequence of the column type.
  constraint bookings_weekday_only check (extract(isodow from booking_date) between 1 and 5),

  -- db-design.md:283 — a cancelled booking always records when; a confirmed one never does.
  constraint bookings_cancelled_at_matches_status
    check ((status = 'cancelled') = (cancelled_at is not null)),

  -- db-design.md:284, BR-001.20 — the composer can always tell who cancelled.
  constraint bookings_cancelled_has_source
    check (status <> 'cancelled' or cancellation_source is not null)
);

-- **The answer to RISK-004** (db-design.md:264-265, :268-276). An application check cannot solve
-- double-booking: two requests that both read "A-01 is free" and then both insert will both
-- succeed, whatever the code between them looks like. The index makes the second insert fail at
-- the database, which is the only thing that sees both requests. PARTIAL, so cancelling frees
-- the slot immediately (BR-001.2's cancel-then-book).
--
-- Unexercised until US-007, by design: US-006 issues no INSERT. app-architecture.md §4.1 step 4
-- is where these get their test.
create unique index bookings_one_confirmed_per_desk_per_day
  on bookings (desk_id, booking_date) where status = 'confirmed';   -- V-04

create unique index bookings_one_confirmed_per_user_per_day
  on bookings (user_id, booking_date) where status = 'confirmed';   -- BR-001.1, V-05

-- db-design.md §5. All three now: an index is performance, not behaviour, so the "untested
-- schema" argument in §1.1 does not apply to it, and splitting them across three later
-- migrations buys nothing.
create index bookings_user_id_booking_date_idx on bookings (user_id, booking_date desc); -- REQ-009, REQ-034
create index bookings_booking_date_status_idx  on bookings (booking_date desc, status);  -- REQ-011-013, and US-006's read
create index bookings_desk_id_booking_date_idx on bookings (desk_id, booking_date);      -- REQ-031, BR-001.9

alter table bookings enable row level security;
alter table bookings force row level security;
```

### 1.3 Three things the migrations deliberately do **not** contain

- **`bookings_with_status`.** `db-design.md:146-152` specifies a view exposing the derived
  **Completed** status, "that every read goes through". US-006 does not need it: availability asks
  whether a *confirmed* booking exists on a date inside the window (`today … today+30`), so
  `booking_date < today` — the only input to the Completed derivation — never occurs. Leave it to the
  story that renders a booking's status *label* (REQ-009, REQ-028).
  **And warn that story:** as written, it is not expressible as a plain view. The `CASE` needs
  `<office today>`, which is neither `current_date` (that is the database server's UTC day, which
  NFR-001 forbids) nor available as a view parameter. It has to be a set-returning function taking
  the date, or the derivation has to move into `domain/` over rows the server already holds. That is
  a real design question, it is not US-006's, and it should not be discovered by someone trying to
  paste four lines of SQL out of the Gate 1 document.
- **Seed rows.** Not in a migration, ever. §5.
- **An `updated_at` trigger.** `db-design.md:308` — the admin-count constraint trigger is the only
  trigger in the design, and 0001 set the precedent of an application-maintained `updated_at`.

### 1.4 What was rejected

- **`desks` only, and derive Taken some other way.** There is no other way. AC-03 requires taken
  desks to be *shown as Taken*; without `bookings` every desk reads Available and a busy Tuesday
  looks like an empty office — the precise failure SCR-003:182 built AC-03 to prevent.
- **`bookings` with only the columns a read needs.** §1.1. It makes RISK-004's answer a retrofit.
- **Defer both to US-007 and stub availability in US-006.** It would make US-006 a UI-only story with
  a fake, and would move a schema review into the PR that also carries the concurrency design. Two
  Complex surfaces in one review is how one of them gets skimmed.
- **One combined `0002_desks_and_bookings.sql`.** Against 0001's stated one-table-per-migration
  discipline, for no gain.

### 1.5 One correction to the Gate 1 document, for the migration's comments

`db-design.md:348` labels `bookings (desk_id, booking_date)` as *"REQ-007 availability for a date"*.
It is not the index that serves this story's read. US-006 asks for **all** confirmed bookings on
**one** date, with no desk in the predicate, so the useful index is the one on line 347,
`(booking_date DESC, status)`. `(desk_id, booking_date)` serves the per-desk lookups — REQ-031's desk
filter and BR-001.9's blocking count.

Nothing needs to change: both indexes are in §5 and both are in `0003` above. But **do not copy that
label into the migration's comment**, because migrations become the source of truth
(`ai/roles/architect.md` Outputs) and a wrong comment outlives a correct design document. At this
data volume — hundreds of rows per month — the choice is immaterial to performance and material only
to whether the next reader is misled. The Gate 1 doc is history and stays as it is.

---

## 2. `GET /api/bookings/availability?date=` — the contract

### 2.1 Route, module and mount

`GET /api/bookings/availability?date=YYYY-MM-DD`, in a new `bookings` router, mounted behind the
session chain:

```ts
// apps/api/src/http/app.ts — replacing the placeholder comment on line 79
app.use('/api/bookings', deps.requireSession, deps.bookingsRouter);
```

Four decisions in that one line:

- **`bookings`, not `desks`.** `app-architecture.md:88` gives the `bookings` module *"availability for
  a date"* by name, and US-005's note and `modules/bookings/README.md:10` both already call the
  endpoint `GET /api/bookings/availability?date=`. Availability is a question about bookings that
  happens to enumerate desks. §3.3 is the consequence and the one ADR this note recommends.
- **The guard mounts on the mount point, never per route** — `app.ts:72-77` argues this for
  `/api/admin` and the reason holds here: every future `bookings` route, US-007's `POST` included,
  inherits it before it is written.
- **The `session` instance, not `sessionForPasswordChange`.** A user with `must_change_password` set
  must not browse availability; `composition.ts:78-79` keeps the two instances visible in one file,
  and this mount takes the enforced one.
- **No `requireAdmin`.** REQ-007 is an Employee capability.

Wiring, following the auth module exactly:

```
createBookingsRouter({ service })                     // validates the query, delegates, shapes
createBookingsService({ availability, nowMs, officeTimezone })   // the rule + the projection
availabilityRepository                                 // two reads, no rule
```

`BuildAppOptions` (`composition.ts:40-52`) gains `availability?: AvailabilityRepository`.
`officeTimezone` and `nowMs` are already there — **no new test seam is created**, and a reviewer
should expect no diff in `config/`.

### 2.2 The query — and a hole in an already-merged schema

```ts
// libs/contracts/src/availability.ts
export const availabilityQuerySchema = z.object({ date: officeDateSchema }).strict();
```

`.strict()` because `app-architecture.md:265-267` requires unknown fields rejected rather than
ignored, and both existing request schemas are strict (`auth.ts` `signInRequestSchema`,
`setPasswordRequestSchema`). Express gives `req.query.date` as an array for `?date=a&date=b`, which
`z.string()` rejects — no special handling needed, and worth one test.

**Now the hole.** `officeDateSchema` (`libs/contracts/src/booking-window.ts:8`) is
`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` — a *shape*, not a date. `?date=2026-02-30` passes it. Then:

- `refusalFor` compares strings, so `2026-02-30` sits between `today` and `today+30` and is not
  refused;
- `isWeekend` calls `Date.UTC(2026, 1, 30)`, which **rolls forward to 2 March** and answers for a
  different day than the one asked about;
- and `booking_date = '2026-02-30'` reaches Postgres, which errors, the repository throws a plain
  `Error`, and `errorHandler` turns it into **`500 internal_error`**.

A client-supplied string producing a 5xx. US-005 never had this problem because nothing untrusted
reached `officeDateSchema` — every value was server-generated (`office.today`) or derived from one.
US-006 is the first story where an attacker-controlled date crosses the wire, so it is US-006's to
close.

**Recommendation: tighten `officeDateSchema` itself**, in `libs/contracts/src/booking-window.ts`:

```ts
/**
 * A real calendar date, not merely a `YYYY-MM-DD`-shaped string. `2026-02-30` matches the regex,
 * and every downstream consumer then misbehaves differently: `isWeekend` answers for 2 March
 * (Date.UTC rolls over), and `booking_date = '2026-02-30'` makes Postgres error, which reaches
 * the client as a 500. US-006 design note §2.2.
 */
function isRealCalendarDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}

export const officeDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealCalendarDate, 'Not a real calendar date');
```

The inferred type stays `string`, so `OfficeDate` is unchanged and nothing downstream moves.

**The counter-argument, because it is real.** `officeDateSchema` is also used in *responses*
(`officeSchema.today`), and `auth.ts`'s own docblock argues that strictness belongs on requests, not
responses — a response that fails to parse takes the screen to `unavailable`. Tightening it means a
server bug that emitted an impossible date would blank a screen instead of rendering nonsense. I think
that is the right failure: nothing legitimate produces 30 February, `officeToday` cannot, and one
definition of "an office date" is worth more than two. **If you disagree**, the alternative is a
separate `officeDateRequestSchema = officeDateSchema.refine(isRealCalendarDate)` used only at route
edges — same protection, one more name, and a rule that each future route must remember to apply.
Record whichever you pick in `decisions.md`; do not leave it unstated.

### 2.3 The response

```ts
// libs/contracts/src/availability.ts
//
// US-006. Per-date desk availability (REQ-007). What it deliberately does NOT carry is as much
// of the contract as what it does — see the design note §2.4 and §2.5.

/** AC-02's vocabulary, which is also the screen's: icon AND word, never colour alone (NFR-008). */
export const deskAvailabilityStatusSchema = z.enum(['available', 'taken']);
export type DeskAvailabilityStatus = z.infer<typeof deskAvailabilityStatusSchema>;

export const deskAvailabilitySchema = z.object({
  /** US-007 posts this. Carried now so a later story does not have to change a response shape
   *  (the reasoning US-001/D-08 applied to `mustChangePassword`). */
  id: z.string().uuid(),
  /**
   * `A-01` (BR-001.4). Deliberately `z.string()` and NOT the format regex: strictness belongs on
   * requests, and a response schema that pinned the format would take the whole screen to
   * `unavailable` over one unexpected row. The CHECK constraint in 0002 is where the format is
   * guaranteed; this is where it is merely carried.
   */
  deskNumber: z.string().min(1),
  status: deskAvailabilityStatusSchema,
});
export type DeskAvailability = z.infer<typeof deskAvailabilitySchema>;

export const availabilityResponseSchema = z.object({
  /** Echoed so the payload is self-describing. Design note §2.4. */
  date: officeDateSchema,
  /**
   * **Every ACTIVE desk**, taken and free alike (AC-03), ordered by `deskNumber` ascending.
   * An inactive desk is absent entirely — not as taken, not as free (AC-04, BR-001.7).
   * An EMPTY array means the office has no active desks at all (AC-09), which is a different
   * fact from every desk being taken. Design note §2.6.
   */
  desks: z.array(deskAvailabilitySchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
```

Not `.strict()`, per `auth.ts`'s stated rule for all forty endpoints.

`status` as a two-value enum rather than `isTaken: boolean`: it is the word the AC, the screen and the
`status-chip` component all use, so a boolean would be renamed at the render site; and a closed
two-value enum makes it explicit in the contract that there is no third value in which a person's
name could ever appear.

### 2.4 What the response deliberately does not carry

| Not carried | Why |
| --- | --- |
| `freeCount`, `activeDeskCount` | AC-01's *"12 of 40"* is `desks.filter(d => d.status === 'available').length` of `desks.length`. Sending them makes a second source of truth for a number derivable from the array, and the visible failure is "12 of 40" printed above a list of 39. The list is never paged — BRD-001 §10 puts search and paging out of scope below ~100 desks — so the array is always complete. **If paging ever arrives, the counts must move server-side in the same change.** |
| `zones: [{ zone, desks }]` | §4.2. Grouping by prefix is a *presentation* decision made by SCR-003 and still carrying research assumption A-4 (SCR-003:200 — whether the letters mean anything physically is an open research question). Baking it into a shared wire contract would make a UI experiment a contract change, and it makes the count derivation a sum over groups for no gain |
| Anything about the occupant | §2.5 |
| Anything about the viewer's own booking | ST-10 is US-007's, and it needs *"which desk do **I** hold on this date"* — a per-viewer fact. When it arrives it is an additive optional top-level field (responses are not `.strict()`, so a tab loaded before the deploy survives), **not** a third value of `status`. Keep viewer-specific facts out of the desk's status |
| `isActive` | Every desk in the array is active by construction. A flag that is always `true` is an invitation to render "Inactive", which AC-04 forbids |

**`date` is echoed**, and that is the one addition here rather than a subtraction. It costs ten bytes
and it makes the payload self-describing: a test can assert the count line matches the response it
came from rather than the state it was rendered beside, and REQ-035's multi-day lookahead (US-009)
will need dates on availability payloads whatever shape it takes. It is *not* a staleness guard — the
request-id guard in `use-availability.ts` already owns that (§4.1), and the UI must not start
comparing dates to decide what paints.

### 2.5 AC-06 is structural: the occupant is never *read*, not merely never sent

The strongest possible form of the criterion, and it costs nothing:

```
select desk_id from bookings where booking_date = eq.<date> and status = eq.confirmed
```

`user_id` is not in the select list. It never enters the server process, so there is no field to
forget to strip, no log line that could carry it, and no future refactor that could widen a `select *`
into a privacy incident. Write the column list explicitly in the repository and never use `*` —
`auth.repository.ts:24` already set that convention with its `COLUMNS` constant.

**And a trap worth stating, because the instinct is wrong:** you cannot enforce AC-06 with the Zod
response schema. Responses are deliberately not `.strict()` (`auth.ts`), Zod's default `.strip()` is
silent, and — more fundamentally — **nothing on the server validates its own responses**.
`auth.router.ts:99`, `:180` and `:206` all call `res.json(...)` directly. The response schema is a
browser-side artifact. So AC-06's proof is a server-side assertion on the real body through
supertest (§9), plus the select list above. Do not add `.strict()` to the response schema to get it —
that breaks the house rule in `auth.ts` and still would not run on the server.

### 2.6 AC-09 versus ST-04 — the emptiness *is* the distinction, and the precedence is load-bearing

Your QA note flags this pair as the easiest to collapse. It is, and there is one line where it happens.

The two facts are already distinguishable from the payload with no discriminator field:

| Fact | Payload | State | Story |
| --- | --- | --- | --- |
| The office has **no active desks at all** | `desks.length === 0` | **ST-05** — *"There are no desks set up yet. Your office admin adds desks before anyone can book."* | **US-006, AC-09** |
| Every active desk is **taken** for this date | `desks.length > 0` and no `available` | ST-04 — *"Every desk is taken on Wed 9 Sep."* plus the next two working days with desks free | US-009 (REQ-035) |

**No `state` discriminator on the wire.** A server-sent state field would move a presentation
decision into the shared contract and create two sources of truth for a question the array already
answers — and the first time they disagree, the screen renders an empty state over a list of desks.

**The precedence, which is the actual defect risk.** When `desks` is empty, "no desk is available" is
*also* true. A render written in the natural order —

```tsx
if (freeCount === 0) return <FullyBooked … />;   // WRONG FIRST
if (desks.length === 0) return <NoDesksExist … />;
```

— shows the fully-booked state to an office that has never had a desk: exactly the collapse the QA
note predicts, and it passes any test that only exercises the partial-booking dataset. The order is
fixed and it is not negotiable:

```tsx
if (desks.length === 0) return <NoDesksExist … />;   // AC-09, FIRST
// US-009 adds its ST-04 branch HERE, after this one, never before it.
```

This is the same class of decision as US-005's refusal precedence (that note's §2.4): it costs
nothing, it is only ever noticed by the test that pins it, so pin it. §4.5 makes it additionally hard
to get wrong by putting the two strings in one file.

### 2.7 Errors

| Status | `code` | When | Where it is decided |
| --- | --- | --- | --- |
| `400` | `invalid_request` | `date` missing, not `YYYY-MM-DD`, **not a real calendar date** (§2.2), repeated, or an unknown query param | the route edge, `availabilityQuerySchema` |
| `401` | `no_session` · `session_invalid` · `session_expired` · `account_inactive` | no/expired/inactive session | the mount's chain — **not this route** |
| `403` | `password_change_required` | the gate, enforced | the mount's chain |
| `422` | **`date_not_bookable`** *(new)* | a well-formed real date the rules refuse: before today, beyond `today + 30`, or a weekend (V-02, V-03) | the service, via `refusalFor(date, officeToday(nowMs(), officeTimezone))` |
| `503` | `service_unavailable` | Supabase unreachable or answering an error | the service |
| `500` | `internal_error` | a defect | `errorHandler` |

No `404` — there is no "no such date". No `409` — nothing races on a read.

**Why `422` and not `400`.** `app-architecture.md:279-290` and `http/errors.ts:62-66`: `400` is "did
not parse or violates a field rule", `422` is "well-formed but the rule refuses it". V-02 and V-03 are
rules, not field shapes. This is also the refusal **US-007 needs for the same two rules on its
`POST`**, which is why it gets a stable code in the shared enum rather than a local string — one code
carrying all three `DateRefusal` reasons, with the reason in `message`. Adding a value to
`errorCodeSchema` is safe by construction: `errorBodySchema.code` is a loose `z.string()` precisely so
an older tab cannot be crashed by a newer code (`error.ts:41-48`).

**This is a server-side defence with no UI state, and that is correct.** US-005's date controls make
a weekend or out-of-window date unreachable by mouse, and `BookADesk.tsx:42` only ever requests
`nextBookableDate(office.today)`. So the `422` is currently unreachable from the browser, and when it
does arrive the UI maps it to **ST-06** through `api-client`'s existing `kind: 'error'` path with a
default branch. **No new UI state, and every failure this story can see lands on ST-06** — `503` and a
transport failure both arrive as `kind: 'unavailable'` (`api-client.ts:59-62`, `:71`), the `400`/`422`
as `kind: 'error'`.

**Forward note for whoever implements `/book?date=`** (SCR-003's Surface line): a bookmarked link to a
date that has since gone past will produce this `422`, and showing *"We couldn't load desk
availability"* for a date the user explicitly asked for is a poor answer. That story must clamp the
incoming date through `refusalFor` before the first request and fall back to `nextBookableDate`. It is
not US-006's, and it is the kind of thing that otherwise gets discovered in production.

### 2.8 The query itself — two reads, and not a PostgREST embed

**Recommended:**

```ts
// apps/api/src/modules/bookings/bookings.repository.ts
listActiveDesks(): supabase().from('desks')
  .select('id, desk_number')
  .eq('is_active', true)        // <- the WHOLE of AC-04 (§6)
  .order('desk_number');        // <- AC-05's order, and a deterministic payload

listConfirmedDeskIds(date): supabase().from('bookings')
  .select('desk_id')            // <- the WHOLE of AC-06 (§2.5): no user_id is ever read
  .eq('booking_date', date)
  .eq('status', 'confirmed');
```

Then the service projects: a desk is `taken` if its id is in that set, `available` otherwise.

**Why two queries rather than one embedded read.** The obvious single-round-trip alternative is
PostgREST's embedded resource:

```
desks?select=id,desk_number,bookings(id)&is_active=eq.true
     &bookings.booking_date=eq.<date>&bookings.status=eq.confirmed
```

It works, and it depends on a PostgREST subtlety that is easy to get wrong in **exactly the direction
that breaks this story silently**: a filter on an embedded resource filters the *embedded rows*, and
adding the `!inner` hint makes it filter the *parent* instead. Write `bookings!inner(...)` and the
response contains only the desks that are **taken** — AC-03 inverted, AC-04 unaffected, and a list
that looks plausible. Against that risk: one saved round trip on ≤100 rows of a table with 30–100
rows. Not worth it. And §6's cheap proof — a recorded call chain — can meaningfully pin
`.eq('is_active', true)`; it cannot pin "the embed filters the child, not the parent".

**Non-atomicity is not a defect here, and a reviewer will ask.** A booking can be created between the
two reads, so a desk can be reported free a moment after it was taken. `app-architecture.md:159-164`
settles this: no availability check precedes the insert, the unique index arbitrates, and *"the 'is it
free?' query still exists, but it serves the availability screen (REQ-007), not the booking
decision."* The read is advisory by design; a transaction around it would buy a guarantee the product
explicitly does not rely on, and the user-visible face of losing the race is SCR-003 **ST-09**, which
is US-007's. Say this in the PR.

---

## 3. `domain/` — nothing new, and here is where each candidate actually goes

### 3.1 The four candidates

`app-architecture.md:101-116` scopes `domain/` to *rules that are pure decisions*, with the stated
purpose that "the rules must be findable in one place" (`:129`). Measured against that, US-006 adds
nothing to it:

| Candidate | Where it goes | Why not `apps/api/src/domain/` |
| --- | --- | --- |
| Zone grouping by letter prefix (AC-05) | `apps/ui/src/screens/book-a-desk/zones.ts` — pure, screen-private (a Medium surface, `task-surfaces.md:66`) | Only the browser groups. A function in `domain/` that the server never calls is dead code in the server's rule book, and the wire contract deliberately carries no zones (§2.4) |
| `A-01` parsing / validation / normalization (BR-001.4, BR-001.8) | **Nowhere in this story.** US-015/US-017's, on the write path | US-006 accepts no desk number as *input*. The `CHECK` in `0002` is what guarantees the shape it reads. Building `deskNumberSchema` now is speculative generality for a story that never validates one — resist it, a reviewer should refuse it |
| The available/taken projection (AC-02, AC-03) | `bookings.service.ts`, as its response builder — exported so it is unit-testable without HTTP | It is a projection over two query results, not a decision. `domain/` holds decisions; filling it with mappings dilutes the one property that makes it useful |
| The date check (V-02, V-03) | **Already exists.** `refusalFor` in `libs/contracts/src/booking-window.ts:70` over `officeToday` in `apps/api/src/domain/booking-window.ts` | US-005 built both so US-006 and US-007 would not have to. `modules/bookings/README.md:10-14` says this in its own words, and *"a second window check here is drift, not defence in depth"* |

**Zone grouping is total by construction and needs no error branch.** The zone is
`deskNumber.charAt(0)`. For any string the `CHECK` admits, that is the letter. For anything else it is
still *a* group rather than a throw, which is the right failure for a presentation grouping — the
function has no way to be handed a malformed number, and if it somehow is, one oddly-labelled group
beats a blank screen. Say so in its docblock; do not add a validation branch that no test can reach.

### 3.2 Where the SQL lives

`bookings.repository.ts` holds both reads and no rule. Rows come back snake_case; the mapping to the
wire's camelCase happens in the service's response builder, which `auth.repository.ts:1-7` established
as the convention on the first module.

### 3.3 The boundary question, and the one ADR I recommend

The availability read queries **`desks`**, a table the `bookings` module does not own.
`app-architecture.md:127` says *"No module imports another module's service; they go through
`domain/` or a declared port."* That rule is about **imports**, and nothing in the architecture says
which module may issue **SQL** against which table. US-006 is the first story that has to answer it,
and the answer binds a lot of later work: REQ-011's admin list joins `bookings`, `user_profiles` and
`desks`; REQ-031 filters bookings by desk; BR-001.9 counts bookings per desk from inside the *desks*
module's deactivation check.

**Recommended rule: read across, write within.** A module's repository may `SELECT` from another
module's tables, with an explicit column list. Only the owning module may `INSERT`, `UPDATE` or
`DELETE` them. So `bookings.repository.ts` reads `id, desk_number` from `desks` and never writes it;
desk inventory writes stay exclusively in `modules/desks` when US-015/US-017 build it.

The rejected alternative is a declared cross-module read port — `modules/desks` exposing
`listActive()` for `bookings` to call. It sounds cleaner and it is the dependency web the boundary
rule exists to prevent: REQ-011's one screen would then need ports into two modules, and each port
becomes a place where a read is shaped for a caller that cannot change it.

**This meets the ADR test** as US-005's note stated it — it binds work well beyond the story that made
it, and it has an alternative a future author will otherwise re-litigate in a review thread (most
likely as a "consolidation" PR when `modules/desks` appears and someone notices two files touching
one table). So: **draft `ADR-004 — table ownership: read across, write within`, in this PR.** Skeleton:

- **Context** — five tables, five modules, no one-to-one mapping. Availability reads two tables;
  REQ-011 reads three. `app-architecture.md` §3 constrains imports, not SQL.
- **Decision** — read across with an explicit column list; write only within the owning module. A
  module's README names the tables it owns.
- **Alternatives** — cross-module read ports (rejected: the dependency web §3's third rule exists to
  prevent); one shared repository layer (rejected: it becomes the place every rule leaks into);
  database views per read (rejected: migration churn per screen, and `bookings_with_status` in §1.3
  already shows views here are not free).
- **Consequences** — two files may `SELECT` one table, so the column-list discipline and the
  write-ownership line are what keep that safe; a reviewer refuses a write outside the owning module;
  `modules/desks`'s README must say it owns `desks`.

**Your trade-off table will be better than mine** — this is exactly the row where a war story beats a
prior. If you'd rather it stayed a note, say so at D1 and DEV records it in `decisions.md` instead; it
is a cheap decision now and an argument in three review threads later.

---

## 4. The browser side

### 4.1 `use-availability.ts` — a third state, and the guard that must cover it

The seam US-005 left (`use-availability.ts:12-14`) is exactly right and needs three changes.

**One.** `AvailabilityFetcher` stops returning `Promise<unknown>`:

```ts
export type AvailabilityOutcome =
  | { kind: 'ok'; data: AvailabilityResponse }
  /** Everything AC-08 covers: a transport failure, a timeout, a 5xx, a 4xx refusal, a body this
   *  build cannot parse. One outcome, because ST-06 is one state (§2.7). */
  | { kind: 'failed' };

export type AvailabilityFetcher = (date: OfficeDate, signal: AbortSignal) => Promise<AvailabilityOutcome>;

export type AvailabilityState =
  | { status: 'loading' }
  | { status: 'ready'; data: AvailabilityResponse }
  | { status: 'error' };
```

Failure arrives as a **value, not a rejection**, because `api-client` already made that choice:
`send`'s catch turns every transport failure into `{ kind: 'unavailable' }` (`api-client.ts:59-62`)
and `readErrorBody` maps 5xx and unparseable bodies the same way (`:71`, `:84`). The screen's fetcher
is a five-line adapter from `ApiResult<AvailabilityResponse>` to `AvailabilityOutcome`.

**Two — and this is the most likely defect in the story.** The current error branch
(`use-availability.ts:36-39`) does nothing. The natural edit is to drop `setState({status:'error'})`
into it. **That is wrong, and it will pass a careless test.** `controller.abort()` in the cleanup
(`:42`) makes the superseded request resolve as a failure too — `api-client`'s catch does not
distinguish the caller's own abort from a network error. So an error painted without the guard means:
change the date, the old request's abort lands, and ST-06 replaces the *fresh* data for the new date.
The failure path needs the same `latestRequestId` check the success path already has:

```ts
fetchAvailability(date, controller.signal).then(
  (outcome) => {
    if (latestRequestId.current !== requestId) return;   // superseded OR aborted — discard
    setState(outcome.kind === 'ok' ? { status: 'ready', data: outcome.data } : { status: 'error' });
  },
  // A fetcher that rejects is a defect, not an outcome. Guarded identically so a superseded
  // rejection cannot paint over fresh data either.
  () => { if (latestRequestId.current === requestId) setState({ status: 'error' }); },
);
```

Pin it: issue for date A, change to date B, **resolve A's failure last**, assert the screen still shows
B's data and no alert ever appeared. That is US-005's AC-08 race test with the arms swapped, and it is
the test that distinguishes a correct implementation from one that merely renders an alert.

**Three.** AC-08's **Try again** cannot be implemented by re-setting the date.
`setSelectedDate(sameDate)` does not change the effect's dependency, so nothing re-fires. Add an
attempt counter:

```ts
export function useAvailability(date, fetchAvailability): AvailabilityState & { retry: () => void }
// internal: const [attempt, setAttempt] = useState(0); … }, [date, fetchAvailability, attempt]);
```

Assert that **Try again** issues a second request for the *same* date. And AC-08's other half — the
date controls stay usable during the error — is structural: the alert replaces only the region below
`<DateStrip>`, and the strip is never disabled. US-005's note already warned that disabling the
controls is the wrong way to satisfy a latest-wins criterion; the same applies here.

### 4.2 Grouping and ordering — the server orders, the browser sorts, and that is not drift

```ts
// apps/ui/src/screens/book-a-desk/zones.ts
export interface Zone { letter: string; desks: DeskAvailability[] }
export function groupByZone(desks: DeskAvailability[]): Zone[]
```

Sorted by `deskNumber` ascending, grouped on `charAt(0)`, zones in letter order.

**Lexicographic order is numeric order here**, and that is a consequence of the `CHECK` constraint,
not a coincidence: every desk number is exactly `^[A-Z]-[0-9]{2}$`, fixed width and zero-padded, so
`'A-01' < 'A-02' < 'A-10' < 'B-01'` as strings sorts exactly as AC-05 requires — across zones and
within them, from one comparison. Put that sentence in the code, the way
`booking-window.ts:66-68` did for date comparison, because a reviewer's instinct is that
string-sorting identifiers is a bug.

**Both sides order, deliberately.** The SQL `ORDER BY desk_number` stays, because a deterministic
payload is worth having for debugging and for any later consumer. `groupByZone` sorts anyway, because
**AC-05 must be provable without a database**: feed it a shuffled three-zone array and assert the
rendered order. If the UI merely preserved encounter order, AC-05's only proof would be an untestable
SQL clause (§6 again), and the test would pass on luck. Two implementations of one total order over a
format the database guarantees is not the drift ADR-002 worries about — that is about two
*definitions*; this is one definition, applied twice, at a cost of sorting ≤100 items.

### 4.3 The count line — AC-01, AC-07 and AC-10 are one component

`availability-count` carries all three, and the mechanism matters more than the markup:

- **One live region node, always mounted, whose text changes.** `role="status"` (implicitly polite),
  present in the loading, ready and error states alike. A live region that mounts *with* content
  often does not announce at all, and one that unmounts and remounts per date change announces twice
  — which is precisely AC-10's *"one 'loading' announcement rather than a stream"*. Follow
  `PolicyChecklist.tsx:96-103`, which is the established precedent in this codebase for a persistent
  polite region.
- **Loading (AC-07):** the region's text is one sentence — *"Loading desk availability for Wed 9
  Sep"* — and the visible skeleton bar plus every skeleton row is `aria-hidden="true"`. That is what
  makes it one announcement rather than forty.
- **Ready (AC-01, AC-10):** the visible line reads *"12 of 40 desks free · Wed 9 Sep"* via the
  existing `formatOfficeDateLabel` (`format-office-date.ts:47`, which already yields "Wed 9 Sep").
  The announcement wants the long form — *"12 of 40 desks free, Wednesday 9 September"* — which does
  **not** exist yet: add `formatOfficeDateLong` beside the others, with `timeZone: 'UTC'` like every
  formatter in that file, for the reason its docblock gives.
  **Recommended construction:** the live region contains the visually-hidden long-form sentence; the
  visible short line is `aria-hidden`. A screen-reader user then gets exactly one reading, in the
  announced form, and it is still readable when browsing statically. Follow
  `policy-checklist.css:46` / `PolicyChecklist.tsx:108` for the visually-hidden class — there is no
  global `sr-only` utility in this codebase and each component defines its own.
  The alternative is `aria-label` on the region carrying the long form; it is one line shorter and
  live-region label handling varies between screen readers, which is a bad thing to bet an AC on.
- **AC-01's ordering is DOM order**, not CSS: the count line precedes the zone list in the markup.
  Assert it that way, or a flex `order:` would satisfy the eye and fail the screen reader.

**AC-07's honest limit.** "No layout shift" is not provable in jsdom. What *is* provable: the skeleton
row and the real desk row take their height from **one** source — a single CSS custom property (say
`--desk-row-height`, defined once in the screen's stylesheet; there is no row-height token in
`tokens.css`, and `tokens.css` is a protected path that this story has no reason to touch). Assert
both components read it. The remaining half is visual: read the real row height off the
`HF / SCR-003 · Book a desk / ST-01 · <width>` frame rather than inventing it, and paste a
before/after at 360/768/1280 into the PR as AC-07's evidence. Say in the PR that the test pins the
shared source and the screenshots pin the outcome — do not let a passing test imply more than it
proves.

### 4.4 Components — and the two things this story must not build

Following SCR-003's component table (lines 150–164) and US-005's precedent, which put `date-strip` and
`date-picker` in `apps/ui/src/components/` although only SCR-003 uses them:

| Component | This story builds | Note |
| --- | --- | --- |
| `availability-count` | yes | §4.3. The live region lives here |
| `zone-group` | yes | heading *"Zone A"* + its rows |
| `desk-row` | yes, **presentational only** | number + status. No selection, no interaction |
| `status-chip` | yes | **Available** / **Taken**. Icon **and** word (NFR-008). `Selected` is US-007's |
| `skeleton-row` | yes | shares `--desk-row-height` with `desk-row` |
| `empty-state` | yes, **ST-05 only** | props mirroring `Alert`'s (`title`, `children`, optional `actions`) — but ST-05 passes no actions: AC-09 forbids alternative dates and forbids an admin link, because an Employee cannot reach the admin area (REQ-004) |
| `alert` | **reuse** | `components/alert/Alert.tsx` exists. ST-06 is `tone="danger"`, `live="assertive"`, with **Try again** in `actions` |
| `spinner` | **not used** | AC-07 asks for skeletons at real row height, which is the opposite of a spinner |

**`desk-row` is not interactive in this story, and that is a decision, not an omission.** ST-07's
selection, the radio-group keyboard model (SCR-003:168), the **Selected** chip and the confirm action
are one design and they are US-007's. Adding `selected`/`onSelect` now would ship an untested
interaction API for a criterion this story does not have.

This is deliberately *not* the reasoning US-001/D-08 applied when it shipped `mustChangePassword` a
story early, and the difference is worth naming because it will come up in review: that was a **data
field on a wire contract** whose value the server already knew, where the alternative was re-tiering
a later story to Complex for one boolean. A component's **interaction contract** is not knowable
before the interaction exists. US-007 will change `desk-row`'s props, that change is Complex, and it
is correctly Complex. Same answer for REQ-034's *"your usual"* hint — a Could, not in US-006's ACs,
and its own story's to add.

### 4.5 Copy: one file, so US-009 cannot reuse ST-05's sentence

AC-09 and QA both require the two empty states to read differently. Make that structural:

```ts
// apps/ui/src/screens/book-a-desk/copy.ts
/** SCR-003 ST-05 (line 103) — AC-09. Approved copy, verbatim; title and body split per the
 *  Designer handoff note. NOT a template: it names no date, because every date is equally
 *  empty and offering alternatives would be cruel. */
export const NO_DESKS_EXIST = {
  title: 'There are no desks set up yet.',
  body: 'Your office admin adds desks before anyone can book.',
} as const;

/** SCR-003 ST-06 (line 109) — AC-08. Names the date. */
export const AVAILABILITY_LOAD_FAILED = (label: string) =>
  `We couldn't load desk availability for ${label}.`;

// US-009 adds FULLY_BOOKED here, beside NO_DESKS_EXIST, and adds the test asserting the two
// differ. The file exists so that reaching for one of these strings puts the other in view.
```

Two rules that go with it: **render this copy, never the server's `message`** — the UI owns
user-visible copy and keys it on `code` (US-001/D-10), and `auth.router.ts:30-35` explains why the
wire's message is a wire-uniformity value rather than screen copy. And ST-06's date label comes from
`formatOfficeDateLabel(selectedDate)`, never from `new Date(dateString).toLocaleDateString()` — the
trap `format-office-date.ts:3-9` exists to close.

### 4.6 ST-04 is absent, and the story is still complete

US-006 renders *"0 of 40 desks free"* over a full list of Taken rows when every desk is taken. That is
correct, complete and AC-compliant — AC-03 requires taken desks shown — it is merely less *helpful*
than ST-04's recovery, which is US-009's whole content (REQ-035, a Could, whose stated fallback if the
lookahead proves expensive is *"Try another day"* with no suggestions: SCR-003:201). Say this in the
PR so nobody reads the missing state as a miss, and keep the ST-05 branch written as
`desks.length === 0` so US-009's branch slots in beside it rather than in front of it (§2.6).

---

## 5. Getting desks into the database, without inventing an admin UI

Three audiences, and only one of them needs real rows.

**Unit and route tests need no database at all.** `auth.routes.spec.ts` drives the *real*
`createApp` through supertest over injected stubs, and `BuildAppOptions` is the seam
(`composition.ts:40-52`). US-006 adds `availability?: AvailabilityRepository` and the QA dataset
becomes fixtures:

```
apps/api/src/modules/bookings/bookings.fixtures.ts
  activeDesks(): 40 desks over A/B/C (QA note's dataset), ordered
  oneInactive:   the inactive desk is simply ABSENT from what the repository returns —
                 which is the shape of the real query, and §6 is why that is not proof
  partialDay:    a set of taken desk ids for one date
  emptyOffice:   []
```

One file, shared by US-006, US-007 and US-009, so the three stories argue about the same 40 desks.

**Local development needs real rows, and there is no product path to create them.** US-017 does not
exist; the human has decided desks are seeded directly. The constraint that shapes the answer is that
the Supabase CLI here is **linked to a hosted project** (`supabase/.temp/linked-project.json`,
`project-ref`, `pooler-url`) and there is **no `supabase/config.toml`**, so there is no local Docker
stack. That rules out the CLI's own convention: `supabase/seed.sql` runs on `supabase db reset`, and
`db reset` against a linked project is destructive. Do not create that file — its name means something
to the CLI.

**Recommended: a deliberately-run, idempotent, clearly-marked dev seed, outside `migrations/`.**

```sql
-- supabase/seed/desks.dev.sql
--
-- DEVELOPMENT AND TEST DATA. Not a migration, not in supabase/migrations/, so `supabase db push`
-- never applies it to any environment. Run it by hand — Supabase SQL editor or psql — against a
-- development project only. Nothing automated runs this file, which is what keeps it out of
-- production (US-006 design note §5).
--
-- Exists because US-017 (an Admin adds a desk) is not implemented yet. DELETE THIS FILE when it
-- is: a seed script that outlives the feature it stood in for becomes a second, untested way to
-- create inventory.
--
-- Idempotent: safe to re-run. It never deletes and never deactivates.

insert into desks (desk_number)
select format('%s-%s', zone, to_char(n, 'FM00'))
from (values ('A'), ('B'), ('C')) as z(zone),
     generate_series(1, 14) as n
where format('%s-%s', z.zone, to_char(n, 'FM00')) <> 'C-15'
on conflict (desk_number) do nothing;

-- REQ-017 / US-006/AC-04's fixture: one retired desk. Availability must not show it on ANY date,
-- as taken or as free, and it must have no booking so that "absent" cannot be mistaken for
-- "taken" (the story's QA note).
update desks set is_active = false, updated_at = now() where desk_number = 'C-14';
```

Tune the counts to the QA dataset (40 active desks over three zones, one inactive). Bookings for a
partially-booked day need a real `user_id`, so either add them in a second statement after a dev
account exists or create them through US-007's endpoint once it lands — and remember `0003`'s weekday
`CHECK` will refuse a Saturday, which is the constraint doing its job.

**Rejected:**

- **Seed rows inside `0002_desks.sql`.** Puts dev fixtures into schema history and into every
  environment, production included. Migrations are structure.
- **`tools/seed-desks.mjs` against the service-role key.** A new script under `tools/` is Complex, and
  a script holding a production credential is an explicit **escalate, don't decide** item
  (`task-surfaces.md:96-100`). It would also duplicate, untested, the write path US-015/US-017 are
  about to build properly. If you do want a script later, it belongs in that story.
- **`supabase/seed.sql`.** The name is the CLI's and its trigger is destructive here.
- **A test-only API route.** A route that exists to create data is a production endpoint with a
  comment asking people not to call it.

---

## 6. The one thing I cannot settle for you: AC-04 lives in a `WHERE` clause

Your QA note is right that AC-04 is *"the one with a real consequence if missed — a bookable inactive
desk breaks BR-001.7 and lets someone reserve a retired seat."* Here is the uncomfortable part.

AC-04 is enforced by exactly one thing: `.eq('is_active', true)` in `listActiveDesks`. And **this
codebase has never proven a query.** `apps/api/src/modules/auth/auth.repository.ts` has no spec file;
every route test injects a stub repository (`auth.routes.spec.ts`). So the obvious test —

```
stub repository returns 39 active desks → assert the inactive desk's number is absent from the body
```

— is **tautological**. It asserts that the array the stub returned is the array that came back. It
cites `US-006/AC-04`, it goes green, it proves nothing, and it is exactly the "passing test that
proves nothing" that US-005's note closed with. If you write it, mark it in the test name as a
pass-through check and do not let it be AC-04's only row in the traceability table.

Three ways out. **This is the decision I am escalating**, because the strongest option adds
infrastructure and a dependency, which is yours and DevOps's to approve, not DEV's or mine.

| Option | What it proves | Cost |
| --- | --- | --- |
| **A. Stubs only, plus documented manual verification** | Nothing about the predicate. AC-04 rests on review and on one manual check pasted into the PR | Zero. Honest only if the PR says so out loud |
| **B. A repository test over a recording fake client** (recommended) | That the query **carries** `.eq('is_active', true)`, `.eq('status','confirmed')`, `.order('desk_number')` and a select list with no user column. Catches the realistic regression: someone drops or inverts the predicate | ~40 lines. **No new dependency, no infra** — `setSupabaseForTesting` (`infra/supabase/index.ts:78`) is already the seam, and the fake records the chained calls |
| **C. Integration tests against a real Postgres** | The predicate *and* the database's behaviour. The only option that would also prove `0003`'s constraints and US-007's unique indexes | Docker + Supabase local stack + `config.toml` + CI service containers. A new dependency and new CI machinery — **escalate** (`task-surfaces.md:96-100`) |

**Recommendation: B for this story, and put C on the table as a separate decision.** B is the
strongest proof available without new infrastructure and it catches the actual failure mode, while
being honest that it pins *our intent*, not Postgres's behaviour. It is also a second reason to prefer
two explicit queries over a PostgREST embed (§2.8): a recorded chain can pin `.eq('is_active', true)`
meaningfully; it cannot pin "the embed filters the child, not the parent".

C stops being optional at **US-007**, where two partial unique indexes are the entire answer to
RISK-004 and no stub can demonstrate that the database refuses the second concurrent insert. Better to
decide it deliberately, in its own change, than to discover it mid-story. If you choose C, it needs an
ADR (it adds a dependency and CI infrastructure). If you choose A or B, it is a `decisions.md` entry,
not an ADR.

**This blocks D1** only in the sense that the implementation plan's test strategy changes shape
depending on the answer. One sentence from you unblocks it.

---

## 7. ADR judgement

The test US-002, US-003, US-004 and US-005 all applied: *does the decision bind work beyond the story
that made it, with a rejected alternative a future author would otherwise re-litigate?*

**One passes: ADR-004 — table ownership, read across / write within (§3.3).** Draft it in this PR.

Everything else in this note fails the test, and naming why is cheaper than an argument later:

| Candidate | Verdict |
| --- | --- |
| Both tables in this story's migration (§1) | **No ADR.** It applies 0001's already-written rule (`0001_user_profiles.sql:5-7`) to the next story. The reasoning belongs in the migration's own header comment, where the next person will actually read it |
| The response shape (§2.3) | **No ADR.** `libs/contracts/src/availability.ts` *is* the contract — the Architect charter's own sentence: in Construction the executable contracts are the design. An ADR would be a second copy |
| Counts and zones derived rather than sent (§2.4) | **No ADR.** One story's shape, reversible in one additive field |
| ST-05-before-ST-04 precedence (§2.6) | **No ADR.** A precedence order pinned by a test, exactly as US-005's §2.4 was |
| Tightening `officeDateSchema` (§2.2) | **No ADR** — it closes a defect. But it edits a merged contract on a protected path, so it goes in `decisions.md` with the alternative named. Open item 2 |
| `domain/` gains nothing (§3.1) | **No ADR.** It applies `app-architecture.md` §2 as written |
| The dev seed (§5) | **No ADR.** Deliberately temporary, with its own deletion condition written into the file |
| How SQL predicates get proven (§6) | **Not mine to package.** An ADR only if you choose option C |

**Nothing here bends an accepted ADR.** ADR-001 is applied — every read goes through Express on the
service-role key and the browser touches no table. ADR-002 is applied — one response shape, parsed on
both sides, with the request/response strictness asymmetry `auth.ts` established. ADR-003 is untouched.

---

## 8. File placement

**New**

```
supabase/migrations/0002_desks.sql                     <- §1.2                    <- protected path
supabase/migrations/0003_bookings.sql                  <- §1.2                    <- protected path
supabase/seed/desks.dev.sql                            <- §5. NOT a migration

libs/contracts/src/availability.ts (+ .spec.ts)        <- §2.2, §2.3              <- protected path

apps/api/src/modules/bookings/bookings.router.ts       <- validate, delegate, shape (§2.1)
apps/api/src/modules/bookings/bookings.service.ts      <- refusalFor + the projection (§3.1)
apps/api/src/modules/bookings/bookings.repository.ts   <- two reads, no rule (§2.8)
apps/api/src/modules/bookings/bookings.service.spec.ts
apps/api/src/modules/bookings/bookings.repository.spec.ts   <- §6 option B
apps/api/src/modules/bookings/bookings.routes.spec.ts       <- supertest over buildApp
apps/api/src/modules/bookings/bookings.fixtures.ts     <- §5

apps/ui/src/screens/book-a-desk/zones.ts (+ .spec.ts)  <- groupByZone (§4.2)
apps/ui/src/screens/book-a-desk/copy.ts                <- §4.5
apps/ui/src/screens/book-a-desk/fetch-availability.ts  <- the ApiResult -> AvailabilityOutcome adapter

apps/ui/src/components/availability-count/  (+ .spec.tsx, .css)   <- the live region (§4.3)
apps/ui/src/components/zone-group/          (+ .spec.tsx, .css)
apps/ui/src/components/desk-row/            (+ .spec.tsx, .css)   <- presentational only (§4.4)
apps/ui/src/components/status-chip/         (+ .spec.tsx, .css)
apps/ui/src/components/skeleton-row/        (+ .spec.tsx, .css)
apps/ui/src/components/empty-state/         (+ .spec.tsx, .css)   <- ST-05 only
                                                       ^ shared component props: a Complex surface
```

**Modified**

```
libs/contracts/src/booking-window.ts   officeDateSchema gains the calendar-validity refine (§2.2)
                                       + booking-window.spec.ts cases                <- protected path
libs/contracts/src/error.ts            + 'date_not_bookable' (§2.7)                  <- protected path
libs/contracts/src/index.ts            + export ./availability.js                    <- protected path

apps/api/src/http/app.ts               AppDeps gains bookingsRouter; the /api/bookings mount
                                       replaces the placeholder comment on line 79 (§2.1)
apps/api/src/composition.ts            wires the bookings service/repository/router;
                                       BuildAppOptions gains `availability` (§2.1)
apps/api/src/modules/bookings/README.md   say what the module now owns, which tables it READS vs
                                          WRITES (§3.3), and that domain/ gained nothing (§3.1)
apps/api/src/modules/desks/README.md      one line: desks is written only by US-015/US-017;
                                          bookings reads it (§3.3)
supabase/migrations/README.md             the two new files, and the real index mapping (§1.5)

apps/ui/src/screens/book-a-desk/use-availability.ts (+ .spec.ts)   the third state and the guard (§4.1)
apps/ui/src/screens/book-a-desk/BookADesk.tsx (+ .spec.tsx, .css)  the list, zones, states, retry
apps/ui/src/lib/format-office-date.ts (+ .spec.ts)                 + formatOfficeDateLong (§4.3)

knowledge/decisions/ADR-004-table-ownership.md    <- §3.3, if you agree
inception/specs/index.md                          the US-006 row
knowledge/traceability/manifest.json              US-006 tests[] — currently empty (line 572ff)
```

**Not modified, and worth saying so:**

- **`apps/api/src/domain/**`** — §3.1. Nothing new. A reviewer should expect no diff here.
- **`apps/api/src/config/**`** — `OFFICE_TIMEZONE` already exists and is already threaded.
- **`apps/api/src/http/middleware/**`** — the chain is untouched; the mount is what changes.
- **`inception/design/tokens.css`** — §4.3. The row height is a screen-level custom property, not a
  new design token. If a hi-fi frame turns out to need a token that does not exist, that is a
  designer decision and a separate change, not a line added in passing to a protected path.
- **`apps/ui/src/components/alert/**`** — ST-06 needs `tone`, `title`, `actions` and `live`, all of
  which `AlertProps` already has. Reuse it; do not widen a shared component's props for nothing.
- **`inception/architecture/db-design.md`** — approved and merged. §1.5's correction goes in the
  migration's comments, not into the Gate 1 document, which is history.

---

## 9. Test placement

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `availability-count.spec.tsx` — renders exactly *"12 of 40 desks free · Wed 9 Sep"* from a 40-desk payload with 12 available | component |
| AC-01 | `BookADesk.spec.tsx` — the count line precedes the first zone heading in **DOM order** (§4.3) | component |
| AC-02 | `desk-row.spec.tsx` — the desk number is rendered; `status-chip.spec.tsx` — **text** "Available"/"Taken" plus an icon element, asserted as text and not as a class or a colour (NFR-008) | component |
| AC-03 | `bookings.routes.spec.ts` — a date with one confirmed booking returns that desk with `status: 'taken'`, **present** in the array, and the array length is unchanged from the free-day case | API |
| AC-03 | `bookings.service.spec.ts` — the projection marks exactly the booked ids taken and omits nothing | unit |
| **AC-04** | `bookings.repository.spec.ts` — the desks read carries `.eq('is_active', true)` (§6 option B). **The one row that actually proves the criterion** | unit (recording fake) |
| AC-04 | `bookings.routes.spec.ts` — a pass-through check over a stub. **Name it as a pass-through**: it is tautological (§6) and must not be AC-04's only row | API (weak — say so) |
| AC-05 | `zones.spec.ts` — a **shuffled** array across A/B/C: zone order, within-zone order, and `A-02 < A-10` (the fixed-width property, §4.2) | unit |
| AC-05 | `zone-group.spec.tsx` — the heading reads *"Zone A"* | component |
| AC-06 | `bookings.routes.spec.ts` — for a taken desk, `Object.keys(desk)` is exactly `['id','deskNumber','status']`, and the serialized body contains no occupant name, id or email | API (the real proof — §2.5) |
| AC-06 | `bookings.repository.spec.ts` — the bookings select list is `desk_id` and names no user column | unit |
| AC-07 | `BookADesk.spec.tsx` — during loading, N skeleton rows render and no desk row does; `skeleton-row` and `desk-row` take their height from the same custom property | component |
| AC-07 | **Screenshots at 360/768/1280**, pasted in the PR. jsdom cannot see layout shift — §4.3 | manual evidence |
| AC-08 | `use-availability.spec.ts` — a failed outcome for the current request yields `status:'error'`; **a superseded failure does not** (resolve A's failure after B succeeds, assert no error state) — §4.1 | unit (the race) |
| AC-08 | `BookADesk.spec.tsx` — the alert replaces the list, names the date, the date strip stays interactive, and **Try again** issues a second request for the same date | component |
| AC-09 | `BookADesk.spec.tsx` — `desks: []` renders `NO_DESKS_EXIST` verbatim, offers no alternative dates and renders no admin link | component |
| AC-09 | `copy.spec.ts` — `NO_DESKS_EXIST` does not contain the word "taken", and (once US-009 lands) differs from `FULLY_BOOKED`. The QA note's pair assertion, made structural — §4.5 | unit |
| AC-10 | `availability-count.spec.tsx` — one `role="status"` element present in **both** loading and ready states (same node), whose loading text is a single sentence; skeleton rows are `aria-hidden`; the announced text is the long form *"…, Wednesday 9 September"* | component |
| — | `booking-window.spec.ts` — `officeDateSchema` rejects `2026-02-30`, `2026-13-01`, `2026-00-10`, `2026-02-00` and accepts `2026-02-28` and `2028-02-29` (§2.2) | unit (boundary) |
| — | `bookings.routes.spec.ts` — `400` for a missing/malformed/repeated `date` and for an unknown query param; `422 date_not_bookable` for a weekend, for `today-1`, for `today+31`; `401` with no bearer; `403` with `must_change_password` set (§2.7) | API |

**Four things not to do**, each of which produces a green test that proves nothing:

1. **Do not let the stub-repository AC-04 test stand as AC-04's proof.** §6.
2. **Do not paint ST-06 from the failure branch without the request-id guard.** §4.1 — it passes a
   careless test and breaks the fresh render.
3. **Do not compute the expected order in the AC-05 test by calling `groupByZone`.** Write the
   expected sequence out as literals, the way US-005's note required for its date boundaries.
4. **Do not assert AC-06 through the response schema.** §2.5 — responses are not `.strict()` and the
   server never validates its own.

---

## 10. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§6 — how AC-04's SQL predicate gets proven.** Option A (stubs + a documented manual check), B (a recording-fake repository test — recommended, no new dependency), or C (real-Postgres integration tests, which needs Docker + the Supabase local stack in CI and is an `Escalate` item). C stops being optional at US-007, where two partial unique indexes are RISK-004's entire answer and no stub can show the database refusing the second insert | Joy Joshua (+ DevOps for C), **before D1** | the plan's test strategy |
| 2 | **§2.2 — `officeDateSchema` accepts `2026-02-30`**, which reaches Postgres and returns `500` on client input. Recommendation: tighten the shared schema. Alternative: a separate request-only schema. It edits a merged contract on a protected path, so pick deliberately and record it | Joy Joshua / DEV, in this PR | nothing |
| 3 | **§3.3 — ADR-004, table ownership (read across, write within).** Recommended. Your trade-off table will be better than mine; if you would rather it stayed a `decisions.md` note, say so at D1 | Joy Joshua, at D1 | nothing |
| 4 | **§1.1 — `bookings` ships with constraints nothing exercises until US-007.** Stated, not hidden. US-007's PR is where each one gets its test, and a reviewer there should check that every constraint in `0003` has acquired one | Manager → US-007 | US-007's definition of done |
| 5 | **§1.3 — `bookings_with_status` is not expressible as a plain view** as `db-design.md:146-152` writes it: the `CASE` needs the office's today, which is neither `current_date` nor a view parameter. Whoever needs the derived **Completed** status (REQ-009, REQ-028) inherits a design question, not four lines of SQL | Manager → the story that renders a booking's status | that story's plan |
| 6 | **§5 — `supabase/seed/desks.dev.sql` must be deleted when US-017 lands.** A seed that outlives the feature it stood in for becomes a second, untested way to create inventory. The deletion condition is written into the file; it still needs someone to act on it | Manager → US-017 | nothing |
| 7 | **§2.7 — `/book?date=` deep links.** SCR-003's Surface line permits them, nothing implements them, and the story that does must clamp the incoming date through `refusalFor` before the first request or a stale bookmark shows *"We couldn't load desk availability"* for a date the user explicitly asked for | Manager → whichever story adds it | nothing |
| 8 | **§4.3, §4.4 — every visual value comes from the `HF / SCR-003 …` frames**, not from this note. DEV inspected them via the Figma connector (file `xjFVgBbMrJUl7Ys3EX3Cbn`) — cite the node ids in the components the way `BookADesk.tsx:71-72` cites node 44:4385, and paste the 360/768/1280 screenshots as AC-07's evidence | DEV, in this PR | AC-07's evidence |
| 9 | **SCR-003:200 — whether zone letters mean anything physically to employees (A-4)** is still an open research question. The grouping is safe either way (the `CHECK` guarantees the letter), and real area names were rejected as scope. §2.4 keeps zones out of the wire contract so this stays a UI question rather than a contract change | PO / research | nothing |

---

**Two limits on what I did**, stated so you do not over-trust it:

- I did not run anything. No lint, no tests, no migration. Every claim here is from reading the files
  named, and the SQL in §1.2 has not been executed against a Postgres — including the assertion that
  `extract(isodow from <date>)` is immutable enough for a `CHECK`, which is documented behaviour but
  worth confirming the first time `supabase db push` runs.
- I did not open the Figma file. The frames are DEV's verification, not mine (open item 8).

**Single next action:** answer open item 1 — one sentence choosing A, B or C — and open items 2 and 3
if you already know your mind. Then DEV writes the spec package and presents Gate D1. The Architect
holds no approval; the GitHub review on the story PR is the authority, and the Architect's review of
that diff comes after.

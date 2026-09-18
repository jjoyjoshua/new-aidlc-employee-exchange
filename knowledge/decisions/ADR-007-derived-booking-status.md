# ADR-007 — Completed is derived at read time in `domain/`, never stored and never a database view

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-18                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-010, US-011, US-013, US-014, US-029; REQ-009, REQ-013, REQ-028, BR-001.5, NFR-001 |

## Context

REQ-028 and BR-001.5 give a booking a third reading the database does not store: a **Confirmed**
booking whose date has passed is presented as **Completed**. BR-001.5's own note leaves the
mechanism to architecture.

Half of that mechanism is settled and holds. `inception/architecture/db-design.md` §1.3 decided to
**derive rather than store**, for three reasons that are still right — a stored value needs a
nightly job, a booking sits in the wrong status between midnight and that job's run (and REQ-028
says the transition happens when the date passes, not when a job notices), that job would be the
only writer changing status with no user acting, and derivation cannot drift. `0003_bookings.sql:16`
implements that half: `create type booking_status as enum ('confirmed', 'cancelled')` — two values,
with a comment saying *"Completed is DERIVED from booking_date and status, never stored."*

The other half does not hold. `db-design.md:153` specifies **where** the derivation lives:

> exposed as a view, `bookings_with_status`, that every read goes through

with this SQL:

```sql
CASE WHEN status = 'confirmed' AND booking_date < <office today> THEN 'completed' ELSE status::text END
```

**`<office today>` is the problem, and it is not a gap in the SQL — it is a gap in the mechanism.**
US-006's design note §1.3 found it while writing the migrations and recorded it as that story's open
item 5, addressed to *"whichever story renders a booking's status"*:

- It is **not `current_date`**. That is the database server's calendar day in the database server's
  timezone. NFR-001 makes every date boundary office-local (`Asia/Kolkata`, UTC+05:30, fixed), and
  the whole reason `booking_date` is a `date` rather than a `timestamptz` (`db-design.md:121-126`)
  is to stop a reader's zone re-deriving the calendar day. Using `current_date` would reintroduce
  precisely the bug the column type exists to prevent, wrong for five and a half hours of every day.
- It is **not available as a view parameter**. A plain SQL view takes no arguments.

So `bookings_with_status` as specified cannot be created. ADR-004 independently reached the
neighbouring conclusion, rejecting *"a database view per cross-module read"* and citing this view by
name as the example that is *"already shown not to be expressible as a plain view once a caller
needs 'today' in the predicate."*

US-010 ("View my own bookings, past and upcoming") is the first story that renders a booking's
status label, so it is the story that inherits the question. It will not be the last: REQ-013 lets
an administrator filter the all-bookings list by Completed (US-013), and US-011 and US-014 both
render a booking's status while acting on it.

One further fact, established while designing US-010 and relevant to the rejected alternatives:
the browser already holds an office-provided `today`. `libs/contracts/src/auth.ts:19-23` sends
`office: { timezone, today }` on sign-in and session restore, with its own docblock recording the
limitation — *"stale only across an office midnight with the tab left open, which US-005's edge
cases explicitly do not require re-deriving."*

## Decision

**We will derive Completed in a pure function in `apps/api/src/domain/`, applied by the service that
builds each response, and carry the result on the wire as a response-only three-value enum that is a
distinct schema from the stored two-value one. `bookings_with_status` will not be created, in any
form.**

Concretely:

- `apps/api/src/domain/booking-history.ts` exports
  `bookingDisplayStatus(stored: BookingStatus, date: OfficeDate, today: OfficeDate): BookingDisplayStatus`.
  It is pure — no clock, no config, no I/O — and receives `today` as an argument, exactly as
  `refusalFor` does. Its only rule: `confirmed` **and** `date < today` → `completed`; everything
  else passes through unchanged. A **Cancelled** booking stays Cancelled whatever its date.
- The office's today is obtained once per request by the service, as
  `officeToday(nowMs(), officeTimezone)` — the single zone-dependent step US-005 built
  (`apps/api/src/domain/booking-window.ts:18`), already injected into `createBookingsService`.
- `libs/contracts/src/bookings.ts` keeps `bookingStatusSchema = z.enum(['confirmed','cancelled'])`
  as the shape of what is **stored** and what `POST /api/bookings` returns, and adds
  `bookingDisplayStatusSchema = z.enum(['confirmed','completed','cancelled'])` as the shape of what
  is **read**. Response schemas that carry a booking's status to a screen use the second.
- **The browser never derives it.** A client-side `date < office.today` is forbidden, for the
  reasons in the alternatives table.
- `supabase/migrations/**` gains nothing. The `booking_status` enum stays two-valued, and no view
  and no function is created.

This **supersedes the mechanism named in `db-design.md` §1.3** while keeping its conclusion. Per
`ai/roles/architect.md`, the Gate 1 architecture deliverable is *"a starting shape, not a standing
contract"* and is not edited once code exists; this ADR is where the supersession is recorded.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **`bookings_with_status` as a plain view using `current_date`** | Exactly what `db-design.md` §1.3 specifies. One definition in the database, every read gets it for free, and REQ-013's Completed filter becomes an equality test in SQL | `current_date` is the database server's calendar day in the database server's timezone, not the office's. `Asia/Kolkata` is UTC+05:30, so a database running in UTC answers "today" wrongly for 5½ hours of every day — and always in the direction that shows a passed booking as still Confirmed | NFR-001 forbids it outright, and it is the exact defect `booking_date`'s `date` type was chosen to prevent (`db-design.md:121-126`). It would also be invisible in every test run in a UTC CI container |
| **A set-returning SQL function, `bookings_with_status(p_today date)`** | Genuinely works. One definition in the database; the office today is passed in from the application, so NFR-001 holds. REQ-013's filter stays a SQL predicate | Every read of a booking goes through PostgREST's `/rpc/` surface, losing the `.select()` column lists and relationship embeds the repository uses everywhere else — including the `desks(desk_number)` embed ADR-004's explicit-column discipline depends on. The rule leaves TypeScript, so it is no longer unit-testable without a database, which is the one property `domain/` exists to provide. And it is a migration, plus a second migration every time the rule is touched | ADR-004 already rejected view-per-read for this codebase, and this is that shape with an argument list. The rule is four lines of pure logic over data the server already holds in memory; putting it behind an RPC boundary buys a SQL-side filter for one future story (REQ-013) and pays for it on every read in every story |
| **Store a third enum value, moved by a nightly job** | An equality test everywhere. No derivation to forget, and Completed is visible in the table when debugging | A booking sits in the wrong status between office midnight and the job's run, which REQ-028 makes a visible defect. The job is the only writer that changes status with no user acting, so every concurrency and idempotency question around it is pure cost. And a stored value can drift; a derived one cannot | Already rejected by `db-design.md` §1.3 on these grounds. This ADR does not reopen that half of the decision; it records it as still correct |
| **Derive in the browser from `status` + `date` + `office.today`** | No server change at all. Not device-clock-dependent either, since `office.today` comes from the server, so NFR-001 is technically satisfied | `office.today` is fetched at sign-in and session restore, and `auth.ts:17-18` states it goes stale across an office midnight with the tab open. REQ-036 (US-012) refreshes the **bookings list** on window focus **without** refreshing the session — so a tab left open overnight re-fetches fresh data and still renders yesterday's booking as Confirmed, which is US-010/AC-04 failing on freshly-fetched data. ADR-002's own table forbids it independently: *"The browser may not evaluate business rules."* And US-013's admin list would need a second implementation of BR-001.5 | The staleness window is not theoretical — it is the exact usage pattern SCR-002 is designed around (*"the row Priya opens the app to see on the morning commute"*). A rule implemented twice is drift, which `modules/bookings/README.md` already names as the reason `refusalFor` is never re-derived |
| **Derive on the server, but carry the stored status on the wire as well** | The browser can tell what is actually in the database; nothing is hidden from a future consumer | Two fields answering one question, which eventually disagree in front of a user (the reasoning US-006 §2.6 used to refuse a `fullyBooked` discriminator, and US-009 §2.3 repeated). And nothing needs the stored value: "is this cancellable" (BR-001.6) is exactly `status === 'confirmed'`, because a passed Confirmed booking is already `completed` | One status per booking on the wire, derived. If a debugging consumer ever needs the raw value, adding a field is additive and safe under ADR-002 |
| **Derive on the server in `domain/`, response-only enum (chosen)** | One implementation, unit-testable with no database and no HTTP. Always fresh, because it is computed from the same request's clock reading. Reusable verbatim by US-011, US-013 and US-014. No migration, no schema surface, nothing to drift. Yields a wire invariant — `confirmed` implies the date has not passed — that removes a date comparison from every consuming screen | REQ-013's Completed filter becomes a predicate on `(status, booking_date)` rather than an equality. Every response carrying a booking's status must thread the office today through its service; a module that forgets would silently emit raw statuses | — |

## Consequences

**Easier**

- BR-001.5 is one four-line pure function with a unit test, rather than SQL that can only be
  exercised against a running database in a particular timezone.
- The office's today reaches the derivation by the same path as every other date decision in this
  codebase (`officeToday(nowMs(), officeTimezone)`), so there is one answer to "what day is it" per
  request and it is testable with `fixedClock`.
- A useful invariant falls out and can be asserted at the API boundary: **a booking whose wire status
  is `confirmed` always has a date of today or later.** Screens grouping upcoming versus past need no
  date comparison of their own, and a cancelled booking dated next week lands in history without a
  special case.
- `booking_status` in Postgres stays two-valued, so `bookings_cancelled_at_matches_status` and the
  two partial unique indexes keep meaning exactly what they mean today.

**Harder**

- **REQ-013's "filter by Completed" on the admin list is a compound predicate**, not an equality:
  `status = 'confirmed' AND booking_date < <office today>`. `db-design.md:162-164` already priced
  this — *"That is one index (§5), and it is cheaper than a job"* — and
  `bookings_booking_date_status_idx (booking_date desc, status)` exists
  (`0003_bookings.sql:78`). US-013 should expect to write the predicate, not `eq('status', …)`.
- **Every response that carries a booking's status must pass the office today into its mapper.**
  The mitigation is structural rather than procedural: the response types are inferred from
  `bookingDisplayStatusSchema`, so a raw `BookingStatus` does not type-check into a field expecting
  `BookingDisplayStatus`, and the mistake is a build failure rather than a wrong screen.
- **Two status enums exist in one contract file** and will look like duplication to a later reader.
  `libs/contracts/src/bookings.ts` carries a docblock on each saying which is which, and a contract
  test asserts `bookingStatusSchema.safeParse('completed')` fails — so a "tidy-up" that merges them
  turns red.

**Follow-up work created**

1. **US-013 and US-014 must call `bookingDisplayStatus`, never re-derive it**, and US-013 must use
   the compound predicate above for REQ-013's filter. Owner: DEV, at those stories.
2. **US-010 must not derive the status in the browser** and must not use `office.today` from the
   auth context for anything but the timezone label. Owner: DEV, in the US-010 PR; called out in
   that story's design note §7.2.
3. **Closes US-006 design note open item 5** — *"`bookings_with_status` is not expressible as a
   plain view … whoever needs the derived Completed status inherits a design question"*. This is
   the answer, and the open item can be marked resolved by this ADR.
4. **`db-design.md` §1.3's view paragraph is now history.** It is not edited: the Gate 1 deliverable
   is a starting shape, not a standing contract (`ai/roles/architect.md`). Anyone who follows it to
   `bookings_with_status` should find this ADR by searching the name, which is why the view is named
   explicitly in the Context above.

**Not closed by this decision**

If a reporting or export consumer ever needs to filter or aggregate by Completed **inside SQL**
across large volumes, the `bookings_with_status(p_today date)` function in the alternatives table
becomes the expected next step, taking the office today from the application exactly as this
decision does. It would supersede the *placement* of the rule, not the conclusion that Completed is
derived rather than stored.

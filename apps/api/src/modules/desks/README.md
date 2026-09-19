# desks

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `desks`. US-017 (add) was this module's first write; US-018 (edit) and
US-019 (activate/deactivate) have both landed too — this module's writes are now complete. Before
US-017, `desks` existed (created by US-006's `0002_desks.sql`) and no code wrote it — rows arrived
via a manual dev seed (`supabase/seed/desks.dev.sql`).

**`insertDesk(deskNumber)` (US-017/AC-01, AC-04, AC-05).** No pre-check `SELECT` precedes the
insert — `desks_desk_number_key` (`0002_desks.sql`) is the sole arbiter of a duplicate, the same
discipline `insertConfirmedBooking` (`modules/bookings`) states for its own two indexes. The
method receives `deskNumber` **already normalised** (trimmed, upper-cased) by
`deskCreateSchema` at the route edge (`libs/contracts/src/desks.ts`) — this repository does not
normalise and must not, or the rule would have two homes. A `23505` naming
`desks_desk_number_key` becomes `{ kind: 'duplicate' }`; any other `23505`, or a `23514` (the
`desks_desk_number_format` CHECK), throws — reaching either means the normaliser or the schema
failed, which must surface as a 500 rather than a false "already taken".

**Why no migration was needed for AC-04/AC-05's case-normalised uniqueness**, worth recording
here because it is counter-intuitive: `desks_desk_number_format`
(`check (desk_number ~ '^[A-Z]-[0-9]{2}$')`) admits **only** upper-case values, so the plain,
case-sensitive `desks_desk_number_key` unique index **is** case-normalised uniqueness — there is
no pair of stored values that could differ only by case, because one of the pair could never have
been written. A migration adding `citext` or a functional lower-case index would be a second,
independent statement of a rule the CHECK already makes unfalsifiable (US-017 design note §2.1).
**This holds for `UPDATE` as well as `INSERT`** (US-018 design note §2.1): a table CHECK is
evaluated on every write to the row, not only its creation, so the same inference — and the same
"a normalisation bug surfaces as a rejected write, never a silent duplicate" property the
migration's own comment names — carries over to `updateDeskNumber` unchanged.

**`updateDeskNumber(id, deskNumber, updatedAt)` (US-018/AC-01, AC-02, AC-03, AC-07).** The
`WHERE` names `id`, **never** `desk_number` — that is what makes a rename preserve the desk's
identity and its booking history (AC-01) and what makes AC-06's "bookings reference the desk, not
the string" true regardless of how many times a desk is renamed. `updated_at` is set explicitly
on every call: `0002_desks.sql`'s column is application-maintained (no trigger), and this method
is its first and only writer. Exactly like `insertDesk`, **no pre-check `SELECT` precedes the
update** — and this single decision is what satisfies AC-07 for free: a self-rename (the new
number equals the row's own current value) never collides, because a unique index is violated by
two DISTINCT live rows sharing a value, and an `UPDATE` produces a new version of the SAME row.
The bug AC-07 exists to catch is not a database behaviour — it is a pre-check `SELECT` that finds
the row itself, which is exactly the implementation this module's race-avoidance rule already
forbids for an unrelated reason (US-018 design note §2.3: "one decision, two ACs"). Anyone adding
an `and id <> $2` exclusion to "be safe" has reintroduced the pre-check and, with it, the race.
Zero matched rows is reported as `{ kind: 'not_found' }` (via `.maybeSingle()`, never `.single()`,
which would turn "no row" into a thrown Postgres error) — desks are never deleted, so this is not
reachable from the screen today, but a write that matches nothing must still answer something
other than a 500.

**`countUpcomingConfirmedForDesk(deskId, status, from)` (US-019/AC-04, AC-07, AC-08 — BR-001.9,
V-09).** Reads `bookings`, a table this module does NOT own — the same ADR-004 justification
`listUpcomingConfirmedDeskIds` states, applied to a count rather than a list. Deliberately a NEW
method rather than a reuse of `listUpcomingConfirmedDeskIds(...).filter(...)`: that method returns
every upcoming booking id in the OFFICE (~3,100 uuids at BR-001.4's ceiling) to answer a question
about ONE desk, on the hot path of a write (`decisions.md` D-04). `{ count: 'exact', head: true }`
— the count is the whole answer and no row is transferred. `status` and `from` arrive from the
SERVICE's `displayStatusPredicate('confirmed', today)` reading, exactly as
`listUpcomingConfirmedDeskIds` requires of itself — **this is the call this file's own earlier
warning was written for**, and it now exists.

**`setDeskActive(id, isActive)` (US-019/AC-01, AC-09 — REQ-017, BR-001.7).** This module's third
write, and its last. ONE method for both transitions — the SQL is the same `UPDATE` with a
different value; the RULES differ, and they live in the service (`deactivateDesk` counts first,
`activateDesk` does not). **`updated_at` is deliberately NOT set** (`decisions.md` D-02) —
`0002_desks.sql`'s column is scoped in writing to REQ-016, "when the desk was last renamed", and
`updateDeskNumber` is its first and only writer. This story is REQ-017; widening the column's
meaning here would make it unreliable for the one thing it does claim. No `23505` mapping: this
write never touches `desk_number`, so `desks_desk_number_key` cannot fire.

**The AC-08 race window — accepted, not closed (`decisions.md` D-01).** There is no database
transaction in this codebase — every repository call is its own PostgREST round trip. Between
`countUpcomingConfirmedForDesk` returning `0` and `setDeskActive` committing, a booking insert can
land, producing a Confirmed booking on an inactive desk. This is symmetric with the booking path's
own read-then-write gap (`bookings.service.ts:181`) and is accepted as a cost rather than closed
by a migration: nothing is cancelled and nothing is deleted (the booking still exists, the desk can
be reactivated by the same control), and it is self-revealing — the next load of `GET
/api/admin/desks` shows an `Inactive` desk with a non-zero `bookedAhead`, a visibly contradictory
row. The only atomic fix is a Postgres function doing a conditional `UPDATE`, which is a migration
in a protected path and out of scope for this story.

**Holds a read-only repository as of US-014, extended by US-016, and a write repository as of
US-017 through US-019** — `desks.repository.ts`'s `DesksRepository`, behind `GET
/api/admin/desks`, `POST /api/admin/desks`, `PATCH /api/admin/desks/:id`, `POST
/api/admin/desks/:id/deactivate` and `.../activate`.

- `listAllDesks()` selects `id, desk_number, is_active` with **no** `is_active` filter, the
  deliberate opposite of `modules/bookings`'s `listActiveDesks`: this read serves the admin
  booking filter's desk dropdown (US-014/AC-03) and the desk inventory screen (US-016/AC-01),
  where an inactive desk must still appear so its historic bookings stay findable. Placed here
  rather than as a sibling method on `modules/bookings`'s `AvailabilityRepository`, per ADR-004
  follow-up 2 and US-013 design note §4.1's own rule applied symmetrically: *put the read where
  the write will have to live* — US-017, US-018 and US-019 each proved the rule out in turn.
- `listUpcomingConfirmedDeskIds(status, from)` reads **`bookings`, a table this module does NOT
  own** (US-016/AC-04, AC-05, BR-001.9). ADR-004's own Context names this exact read as one of the
  cases the rule was written to settle: *"BR-001.9's blocking count is a `bookings` aggregate read
  from inside the `desks` module's deactivation check."* The select list is `desk_id` ONLY — no
  `user_id`, no `*` — the same discipline `modules/bookings`'s own `listConfirmedDeskIds` states
  for this table: the occupant is never read, not merely never sent. `status` and the `>= from`
  bound arrive from the SERVICE's `displayStatusPredicate('confirmed', today)` call
  (`domain/booking-history.ts`) — neither is written literally in this module. US-019's
  deactivation block calls the same `displayStatusPredicate('confirmed', today)` function via its
  OWN dedicated count method (above), not this one — this method stays US-016's own, serving
  `listAllDesks`'s per-list tally, and never reused for the deactivation block (US-018's own
  shortcut of reading the browser's held count is likewise not reused here — US-019's block is
  gated on the count in a way a rename never was, so it needs a genuine server-side call at the
  moment of deactivation).

**Read by:** `modules/bookings` (`bookings.repository.ts`'s `listActiveDesks`, US-006), via an
explicit column list, `is_active = true` only. That module may never write this table. The two
reads (this module's unfiltered one, and `modules/bookings`'s active-only one) serve different
invariants and are not the same method with different callers — see US-006/AC-04, which depends
absolutely on `listActiveDesks`'s filter never being dropped.

This module's writes are complete as of US-019. See `../README.md` for what this module owns and
the boundary it must respect.

# desks

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `desks`. US-017 (add) was this module's first write; US-018 (edit) has
landed too; US-019 (activate/deactivate) is its remaining one. Before US-017, `desks` existed
(created by US-006's `0002_desks.sql`) and no code wrote it — rows arrived via a manual dev seed
(`supabase/seed/desks.dev.sql`).

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

**Holds a read-only repository as of US-014, extended by US-016** — `desks.repository.ts`'s
`DesksRepository`, behind `GET /api/admin/desks`.

- `listAllDesks()` selects `id, desk_number, is_active` with **no** `is_active` filter, the
  deliberate opposite of `modules/bookings`'s `listActiveDesks`: this read serves the admin
  booking filter's desk dropdown (US-014/AC-03) and the desk inventory screen (US-016/AC-01),
  where an inactive desk must still appear so its historic bookings stay findable. Placed here
  rather than as a sibling method on `modules/bookings`'s `AvailabilityRepository`, per ADR-004
  follow-up 2 and US-013 design note §4.1's own rule applied symmetrically: *put the read where
  the write will have to live* — US-017 was the first desk write to land here, proving the rule
  out; US-018 has landed too; US-019 is its remaining one.
- `listUpcomingConfirmedDeskIds(status, from)` reads **`bookings`, a table this module does NOT
  own** (US-016/AC-04, AC-05, BR-001.9). ADR-004's own Context names this exact read as one of the
  cases the rule was written to settle: *"BR-001.9's blocking count is a `bookings` aggregate read
  from inside the `desks` module's deactivation check."* The select list is `desk_id` ONLY — no
  `user_id`, no `*` — the same discipline `modules/bookings`'s own `listConfirmedDeskIds` states
  for this table: the occupant is never read, not merely never sent. `status` and the `>= from`
  bound arrive from the SERVICE's `displayStatusPredicate('confirmed', today)` call
  (`domain/booking-history.ts`) — neither is written literally in this module. **US-019's
  deactivation block must call the same `displayStatusPredicate('confirmed', today)` function**,
  not re-implement the rule by hand, or its block and this count can drift apart (US-016 design
  note §2.4). **Warning for US-019 (US-018 design note §4):** US-018's `renameDesk` reads the
  `bookedAhead` count already on the browser's loaded list — no fresh call to this method —
  because nothing in a rename is gated on that count (AC-03 permits the rename regardless).
  **US-019 must NOT copy that shortcut**: its deactivation block IS gated on the count (BR-001.9
  refuses the deactivation when it is non-zero), so a stale, browser-held number there could show
  a success path the server then blocks. US-019 needs a genuine server-side call to this method
  at the moment of deactivation, not the list's last-known value.

**Read by:** `modules/bookings` (`bookings.repository.ts`'s `listActiveDesks`, US-006), via an
explicit column list, `is_active = true` only. That module may never write this table. The two
reads (this module's unfiltered one, and `modules/bookings`'s active-only one) serve different
invariants and are not the same method with different callers — see US-006/AC-04, which depends
absolutely on `listActiveDesks`'s filter never being dropped.

US-019 is its remaining write. See `../README.md` for what this module owns and the boundary it
must respect.

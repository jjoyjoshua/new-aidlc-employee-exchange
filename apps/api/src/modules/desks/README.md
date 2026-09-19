# desks

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `desks` — once US-017 (add), US-018 (edit) and US-019 (activate/deactivate)
build this module. Until then, `desks` exists (created by US-006's `0002_desks.sql`) and no code
writes it; rows arrive via a manual dev seed (`supabase/seed/desks.dev.sql`), never a migration.

**Holds a read-only repository as of US-014, extended by US-016** — `desks.repository.ts`'s
`DesksRepository`, behind `GET /api/admin/desks`.

- `listAllDesks()` selects `id, desk_number, is_active` with **no** `is_active` filter, the
  deliberate opposite of `modules/bookings`'s `listActiveDesks`: this read serves the admin
  booking filter's desk dropdown (US-014/AC-03) and the desk inventory screen (US-016/AC-01),
  where an inactive desk must still appear so its historic bookings stay findable. Placed here
  rather than as a sibling method on `modules/bookings`'s `AvailabilityRepository`, per ADR-004
  follow-up 2 and US-013 design note §4.1's own rule applied symmetrically: *put the read where
  the write will have to live* — desk writes land here once US-017/US-018/US-019 build them, so
  the read does too.
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
  note §2.4).

**Read by:** `modules/bookings` (`bookings.repository.ts`'s `listActiveDesks`, US-006), via an
explicit column list, `is_active = true` only. That module may never write this table. The two
reads (this module's unfiltered one, and `modules/bookings`'s active-only one) serve different
invariants and are not the same method with different callers — see US-006/AC-04, which depends
absolutely on `listActiveDesks`'s filter never being dropped.

Otherwise empty until US-017/US-018/US-019 fill it with writes. See `../README.md` for what this
module owns and the boundary it must respect.

# desks

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `desks` — once US-015/US-017 build this module. Until then, `desks` exists
(created by US-006's `0002_desks.sql`) and no code writes it; rows arrive via a manual dev seed
(`supabase/seed/desks.dev.sql`), never a migration.

**Holds a read-only repository as of US-014** — `desks.repository.ts`'s `DesksRepository`, behind
`GET /api/admin/desks`. It selects `id, desk_number, is_active` with **no** `is_active` filter,
the deliberate opposite of `modules/bookings`'s `listActiveDesks`: this read serves the admin
booking filter's desk dropdown, where an inactive desk must still appear so its historic bookings
stay findable (US-014/AC-03, story edge case). Placed here rather than as a sibling method on
`modules/bookings`'s `AvailabilityRepository`, per ADR-004 follow-up 2 and US-013 design note
§4.1's own rule applied symmetrically: *put the read where the write will have to live* — desk
writes land here once US-015/US-017 build them, so the read does too.

**Read by:** `modules/bookings` (`bookings.repository.ts`'s `listActiveDesks`, US-006), via an
explicit column list, `is_active = true` only. That module may never write this table. The two
reads (this module's unfiltered one, and `modules/bookings`'s active-only one) serve different
invariants and are not the same method with different callers — see US-006/AC-04, which depends
absolutely on `listActiveDesks`'s filter never being dropped.

Otherwise empty until US-015/US-017 fill it with writes. See `../README.md` for what this module
owns and the boundary it must respect.

# desks

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `desks` — once US-015/US-017 build this module. Until then, `desks` exists
(created by US-006's `0002_desks.sql`) and no code writes it; rows arrive via a manual dev seed
(`supabase/seed/desks.dev.sql`), never a migration.

**Read by:** `modules/bookings` (`bookings.repository.ts`'s `listActiveDesks`, US-006), via an
explicit column list. That module may never write this table.

Otherwise empty until US-015/US-017 fill it. See `../README.md` for what this module owns and the
boundary it must respect.

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

-- 41 desks total (A-01..A-14, B-01..B-14, C-01..C-13), one of which is retired below, leaving
-- exactly 40 ACTIVE desks over three zones — the story's QA dataset (US-006 QA notes).
insert into desks (desk_number)
select format('%s-%s', z.zone, to_char(n, 'FM00'))
from (values ('A', 14), ('B', 14), ('C', 13)) as z(zone, cnt),
     lateral generate_series(1, z.cnt) as n
on conflict (desk_number) do nothing;

-- REQ-017 / US-006/AC-04's fixture: one retired desk. Availability must not show it on ANY date,
-- as taken or as free, and it must have no booking so that "absent" cannot be mistaken for
-- "taken" (the story's QA note).
update desks set is_active = false, updated_at = now() where desk_number = 'C-13';

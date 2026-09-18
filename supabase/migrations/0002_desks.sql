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

-- There is deliberately no `zone` column. db-design.md:98-100: the zone is the first character
-- of desk_number, and a separate column would be a second place for the same fact to disagree
-- with itself. SCR-003 open question 2 resolved real area names out of scope.

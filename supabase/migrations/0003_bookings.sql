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
--
-- Note: (booking_date DESC, status), not (desk_id, booking_date), is what serves US-006's read
-- (all confirmed bookings for one date, no desk in the predicate) — design note §1.5. The other
-- two serve REQ-009/REQ-034 and REQ-031/BR-001.9 respectively.
create index bookings_user_id_booking_date_idx on bookings (user_id, booking_date desc); -- REQ-009, REQ-034
create index bookings_booking_date_status_idx  on bookings (booking_date desc, status);  -- US-006's read, REQ-011-013
create index bookings_desk_id_booking_date_idx on bookings (desk_id, booking_date);      -- REQ-031, BR-001.9

alter table bookings enable row level security;
alter table bookings force row level security;

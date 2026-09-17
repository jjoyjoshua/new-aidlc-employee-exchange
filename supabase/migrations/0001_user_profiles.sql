-- 0001 — user_profiles
--
-- US-001 (sign in). The first migration in the project.
--
-- This table only, plus its enum and its RLS. A migration for a table no code reads is
-- untested schema, and every migration is Complex (ai/standards/task-surfaces.md), so each
-- of the other four tables arrives with the story that reads it, under that story's review.
--
-- ADR-001's follow-up says "enable RLS with deny-all policies on all five tables as part of
-- the first migration". Four of those tables do not exist yet, so the literal instruction
-- cannot be followed. The intent — RLS on from the beginning rather than retrofitted — is
-- served by enabling it on every table in the same migration that creates it (US-001/D-09).
--
-- Spec: inception/architecture/db-design.md §1.1 and §5.

-- citext gives BR-001.10 its case-normalised uniqueness at the database, so two accounts
-- differing only in case cannot exist. The application still lower-cases explicitly before
-- every lookup (US-001/D-02) — the behaviour should be ours and have a test, not be an
-- extension's side effect.
create extension if not exists citext;

-- REQ-004 gives exactly one role from a set of two, so this is a column, not a join table.
-- Adding a third role later is a migration, which is the correct amount of friction for a
-- change that would touch every authorization check.
create type user_role as enum ('employee', 'admin');

create table user_profiles (
  id                    uuid        primary key references auth.users (id) on delete cascade,
  email                 citext      not null,
  full_name             text        not null,
  role                  user_role   not null,
  is_active             boolean     not null default true,
  -- Defaults to true: an account's first credential is always set by somebody else
  -- (REQ-018, BR-001.17). US-004 is what gates on it; US-001 only reports it.
  must_change_password  boolean     not null default true,
  push_opt_in           boolean     not null default false,
  -- NFR-009 and US-003/AC-03 measure 30 days from last USE, not from sign-in. US-001 creates
  -- this column and stamps it; the comparison and the hourly throttle are US-003's.
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Audit: when REQ-020 last ran. Null for an account that has never been deactivated.
  deactivated_at        timestamptz
);

-- BR-001.10 — email is the sign-in identifier and must be unique. citext makes this
-- case-insensitive without a functional index.
create unique index user_profiles_email_key on user_profiles (email);

-- db-design.md §5 — BR-001.11's "is there still an active admin" count, and the people
-- list's default ordering (REQ-032, US-020).
create index user_profiles_is_active_role_idx on user_profiles (is_active, role);

-- Defence in depth, not the rule book. Every request goes through Express, which holds the
-- service-role key and bypasses this (ADR-001). Deny-all means a leaked anon key reads
-- nothing. Do not add a permissive policy to make something work — that quietly moves a rule
-- out of the server and into Postgres, where no test is looking.
alter table user_profiles enable row level security;
alter table user_profiles force row level security;

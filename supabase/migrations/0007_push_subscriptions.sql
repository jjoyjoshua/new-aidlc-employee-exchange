-- 0007 — push_subscriptions
--
-- US-031 (turn browser push alerts on or off). One row per browser the employee opted in from;
-- a person with a laptop and a phone has two. The fifth and last table in db-design.md.
--
-- `user_profiles.push_opt_in` is NOT created here — it has existed since
-- `0001_user_profiles.sql`, defaulting false (REQ-026, BR-001.15, US-031/AC-01). This migration
-- adds only the table that flag gates.
--
-- Spec: inception/architecture/db-design.md §1.4, §2, §3, §4. Architect design note (US-031) §5.

create table push_subscriptions (
  id              uuid        primary key default gen_random_uuid(),
  -- The ONE `on delete cascade` in this schema (db-design.md:295). Everything else is
  -- `restrict`, because nothing else may be orphaned. A subscription without an account is
  -- unreachable noise, and this is the only table the application ever hard-deletes anyway.
  user_id         uuid        not null references user_profiles (id) on delete cascade,
  -- The Web Push URL. Validated at the route edge before it ever reaches here: https only, no
  -- credentials in the URL, no private or literal-IP host (US-031 design note §4.4) — the
  -- server POSTs to this value at US-032, so an unvalidated one is an SSRF primitive.
  endpoint        text        not null,
  p256dh          text        not null,
  auth            text        not null,
  -- Operator diagnosis only (db-design.md:177). Taken from the request's User-Agent header and
  -- truncated, never from the request body.
  user_agent      text,
  created_at      timestamptz not null default now(),
  -- US-032 stamps this after a successful send. Nothing reads it in US-031.
  last_success_at timestamptz
);

-- db-design.md:263 — one row per browser; re-subscribing updates rather than duplicates.
--
-- Deliberately unique on `endpoint` ALONE, not on `(user_id, endpoint)`: an endpoint identifies
-- one browser, and on a shared workstation `(user_id, endpoint)` would let two accounts hold the
-- same browser and deliver one person's desk bookings to the other's screen. Global uniqueness
-- means the row is REASSIGNED to whoever opted in most recently (the route upserts on this
-- index). The residual — the earlier account's flag stays true with no subscription, so they
-- silently stop receiving push — is accepted (US-031 design note §11, open item 6).
create unique index push_subscriptions_endpoint_key on push_subscriptions (endpoint);

-- No index on `user_id`, and that is a decision rather than an oversight. US-032 reads
-- `where user_id = $1`; db-design.md §5 lists the indexes this schema has beyond its
-- constraints and this is not among them. Hundreds of accounts with a row or two each is a
-- sequential scan of a small table.

-- Deny-all, as every table here is. The server's service-role key is the only thing that gets
-- past it (ADR-001). Do not add a permissive policy to make something work.
alter table push_subscriptions enable row level security;
alter table push_subscriptions force row level security;

-- 0006 — notification_deliveries
--
-- US-034 (transactional email is configured, not hard-coded, and failures are logged). Every
-- attempt to notify somebody, and how it went. NFR-005 and US-034/AC-05 require failed sends to
-- be found; the reminder run (REQ-025, US-030) additionally needs to know what it already sent.
--
-- Created WHOLE — every column, all three enums, the reminder partial-unique index — although
-- nothing exercises the reminder path until US-030. Matches `0003_bookings.sql`'s own precedent
-- (design note §1.1 there): a table created without its constraints is a different table, and
-- adding the index later would retrofit REQ-025's idempotency answer onto rows never
-- constrained by it. Architect design note §5 (US-034), D-04.
--
-- Spec: inception/architecture/db-design.md §1.5, §3, §4.

create type notification_channel as enum ('email', 'push');
create type notification_kind    as enum ('confirmation', 'cancellation', 'reminder');
create type delivery_outcome     as enum ('sent', 'failed');

create table notification_deliveries (
  id             uuid                    primary key default gen_random_uuid(),
  -- Nullable: db-design.md §1.5. Every actual send in this release is about a booking, but the
  -- column itself does not require one, matching the source table's own design.
  booking_id     uuid                    references bookings (id)      on delete restrict,
  user_id        uuid                    not null references user_profiles (id) on delete restrict,
  channel        notification_channel    not null,
  kind           notification_kind       not null,
  -- The address/endpoint used, not the message. db-design.md:218 — this table holds no message
  -- body and no password; recipient + kind is enough to answer "did Dana get told?".
  recipient      text                    not null,
  outcome        delivery_outcome        not null,
  -- US-034/AC-05. Set only on a failed attempt. Deliberately never the raw transport error, a
  -- response body, or a credential (US-034/AC-06, RISK-005) — the caller sanitizes before this
  -- ever reaches a row (Architect design note §4, F-5).
  error_detail   text,
  -- The provider's own message id, when it has one. Not a secret; safe to keep.
  provider_ref   text,
  attempted_at   timestamptz             not null default now()
);

-- REQ-025, US-030. "A second run inserts nothing" — the row half of the reminder run's
-- idempotency; the send half is `notifications.service.ts`'s job to arbitrate before this index
-- ever sees a duplicate (Architect design note §2.3, F-6).
--
-- `channel` is deliberately NOT part of this index: BR-001.16 and app-architecture.md §4.3 make
-- the reminder email-only, so a two-channel reminder that could collide does not exist. If a
-- push reminder is ever added, this index's guarantee must be revisited, not assumed to still
-- hold.
--
-- `booking_id` is nullable elsewhere in this table, but a reminder always names a booking — a
-- NULL `booking_id` would not be constrained by a unique index (Postgres treats NULLs as
-- distinct), and this index's safety rests on that never happening for a `kind = 'reminder'` row.
create unique index notification_deliveries_one_sent_reminder_per_booking
  on notification_deliveries (booking_id, kind)
  where kind = 'reminder' and outcome = 'sent';

alter table notification_deliveries enable row level security;
alter table notification_deliveries force row level security;

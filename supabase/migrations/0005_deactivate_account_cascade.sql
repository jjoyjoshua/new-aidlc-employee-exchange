-- 0005 — the deactivation cascade
--
-- US-025 (deactivate an account and release the desks it holds). The project's FIRST database
-- function, and the first multi-statement transaction anywhere in this system: one call flips
-- user_profiles.is_active and cancels every one of that account's upcoming Confirmed bookings,
-- atomically (BR-001.18 — "in the same action"). Architect design note:
-- inception/specs/US-025-deactivate-an-account/design-note.md, §2.
--
-- NO new trigger. 0004_last_active_admin_guard.sql's own comment already covers this write: the
-- guard fires on any UPDATE of role/is_active on user_profiles, and this function's flip is
-- exactly that. Adding a second trigger here would be a review finding (US-025/D-04).
--
-- NO column, index or enum change. is_active/deactivated_at (0001_user_profiles.sql) and
-- cancellation_source = 'deactivation_cascade' (0003_bookings.sql:18-22) already exist, reserved
-- by name for this story.

-- ---------------------------------------------------------------------------------------------
-- WHY THIS FUNCTION HAS NO EXCEPTION BLOCK, AND WHY THAT IS THE POINT
--
-- 0004's trigger fires from inside this function exactly as it fires from a plain UPDATE — an
-- AFTER ROW trigger runs at the end of the STATEMENT that queued it, whether that statement sits
-- in a bare UPDATE or inside a PL/pgSQL function body. Its Z0011 exception, left uncaught, unwinds
-- this whole function and rolls back BOTH tables. That single mechanism is what makes AC-10 (the
-- refusal) and AC-12 (all-or-nothing) one fact rather than two: an EXCEPTION block here that
-- caught Z0011 would roll back to a savepoint and let this function return a "clean" answer with
-- the refusal silently gone. There is deliberately no such block, and no `raise` of its own — the
-- migration adds no new SQLSTATE, and Z0011 stays a fact of exactly one statement in this schema
-- (0004's own comment).
--
-- WHY p_now/p_today ARE PARAMETERS, NOT `now()`/`current_date`
--
-- This database does not know OFFICE_TIMEZONE (apps/api/src/domain/booking-window.ts:officeToday
-- reads it; the database session's own zone is whatever Supabase gives it, typically UTC).
-- `current_date` here would silently re-derive the office's calendar day from the WRONG zone --
-- the exact bug the `booking_date` column's own type comment (0003_bookings.sql) exists to
-- prevent. One `nowMs()` reading in the service produces both p_now and p_today, so the audit
-- stamp and the cascade's date floor can never disagree with each other (design note §2.1).
--
-- WHY THERE IS NO p_status PARAMETER
--
-- `status = 'confirmed'` below is a literal, not an argument. A read (like
-- desks.repository.ts's countUpcomingConfirmedForDesk) may parameterise its predicate for free;
-- a WRITE names the state it transitions FROM, because the transition IS the function's identity.
-- A p_status would make deactivate_account_cascade(..., 'cancelled') a legal call that re-stamps
-- cancelled_at/cancelled_by on an already-cancelled row and destroys BR-001.20's attribution. The
-- literal's other half is apps/api/src/domain/booking-history.ts's displayStatusPredicate
-- ('confirmed', today), and the gated suite (admin.concurrency.spec.ts) proves the two agree.
--
-- WHY FOUR OUTCOMES, AND WHY THREE OF THEM ARE DATA, NOT EXCEPTIONS
--
-- Use an exception only when the abort IS the point. `blocked` is the only case where it is
-- (BR-001.11), and it already has one: Z0011, reused, uncaught. `ok`, `not_found` and
-- `already_inactive` are reported as one jsonb value, never RETURNS TABLE -- a profile plus N
-- bookings is not a table (zero cancelled bookings would return zero rows and lose the profile;
-- not_found would be indistinguishable from "ok, nothing to cancel"). `already_inactive` is a
-- real case a naive `WHERE id = p_target_id AND is_active` predicate makes silently
-- indistinguishable from not_found -- but the account plainly exists, so 404's approved copy
-- ("That account could not be found") would be a lie. usersRepository reports it as its own kind;
-- usersService collapses it to `ok` (design note §2.2, §3.2) -- every promise US-025/AC-13 makes
-- is already true (the person cannot sign in, the row IS Deactivated), so nothing is invented and
-- no new error code is needed.
--
-- WHY THIS FUNCTION MAY NOT BE CALLED BY ANYONE BUT service_role
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and PostgREST publishes every
-- function in the exposed schema at /rest/v1/rpc/<name> -- reachable with the anon key that ships
-- in the browser bundle (apps/ui/src/lib/supabase-client.ts). This is the first thing this
-- application calls through that path. It is harmless TODAY only because user_profiles and
-- bookings carry `force row level security` with no policies (0001, 0003) -- SECURITY INVOKER
-- means an anon caller's own privileges apply, so the writes below match zero rows. That is a
-- SECOND control making a first mistake survivable, not the same as not making it: ADR-001's
-- whole posture is that every rule is enforced in Express, and an admin write reachable at a
-- public URL contradicts it the day anyone adds a permissive policy. The revoke/grant below closes
-- this at the source (design note §2.7, C1 -- blocker).
--
-- WHY VOLATILE (unmarked) AND SECURITY INVOKER (unmarked)
--
-- ADR-013 already records that marking the TRIGGER function STABLE silently restores write skew.
-- The same one-word slip on THIS function has a second, unrelated failure mode: PostgREST runs a
-- STABLE/IMMUTABLE function inside a READ-ONLY transaction, so both UPDATEs below fail with
-- 25006. Loud, at least, but a reader chasing ADR-013's version of the trap will look in the wrong
-- place. SECURITY DEFINER is not used for the same reason 0004 does not use it: this project's
-- every write already runs as service_role (ADR-001, which has BYPASSRLS), so DEFINER buys
-- nothing and adds a search_path hardening obligation -- doubly so for a function reachable, in
-- principle, at a public URL.
--
-- THIS IS THE PROJECT'S FIRST `.rpc()` CALL -- three things for the next author who adds one:
--   * The PostgREST schema cache is reloaded by Supabase's own DDL event trigger after a
--     migration. A `PGRST202 — could not find the function ... in the schema cache` error means
--     the cache or a mis-spelled ARGUMENT NAME, not a missing function -- the repository must
--     never map PGRST202 to a business outcome; it throws.
--   * `create or replace function` cannot change a parameter list. A later migration that adds or
--     renames one creates a SECOND overload, and PostgREST then cannot disambiguate (PGRST203).
--     Any future signature change must `drop function deactivate_account_cascade
--     (uuid, uuid, timestamptz, date)` first.
--   * The four parameter names below (p_target_id, p_actor_id, p_now, p_today) are a WIRE
--     CONTRACT -- supabase-js's `.rpc(name, args)` matches PostgREST arguments BY NAME. Renaming
--     any of them is a breaking change that presents as PGRST202 at runtime, never at typecheck.
--     They are spelled in exactly one TypeScript place: users.repository.ts's
--     DEACTIVATE_ACCOUNT_RPC call.
--
-- ONE NAMED RESIDUAL THIS MIGRATION DOES NOT CLOSE
--
-- A booking INSERTed in the milliseconds around this function's own UPDATE of user_profiles can
-- survive its owner's deactivation: an UPDATE's predicate does not lock rows that do not yet
-- exist, and a booking insert never touches user_profiles, so advisory key 1001011 never sees it.
-- The result is exactly BR-001.18's harm -- one stranded desk -- recoverable only by an
-- administrator cancelling it through US-015. Closing it needs a bookings-side insert-time rule
-- BRD-001 does not state. Named here, and in users/README.md, rather than fixed -- the same way
-- 0004 named its own DELETE-branch residual instead of guarding a path that does not exist
-- (design note §4.3, open item 2).
-- ---------------------------------------------------------------------------------------------

create or replace function deactivate_account_cascade(
  p_target_id uuid,
  p_actor_id  uuid,
  p_now       timestamptz,
  p_today     date
)
returns jsonb
language plpgsql
as $$
declare
  v_profile   record;
  v_cancelled jsonb;
begin
  -- (a) REQ-020, US-025/AC-01. `is_active` is in the SET list, so 0004's trigger is CONSIDERED;
  -- its WHEN clause decides whether it fires. NO pre-check precedes this write -- the write is
  -- the arbiter, the house rule every other writer in this schema follows (US-024/AC-04's own
  -- inverse: US-025/AC-04 is never blocked by a booking count because nothing reads one first).
  --
  -- `and is_active` stops a second deactivation from re-stamping deactivated_at, whose own column
  -- comment (0001_user_profiles.sql) scopes it to "when REQ-020 last ran" -- and is what makes the
  -- miss below classifiable as `already_inactive` rather than a silent no-op.
  update user_profiles
     set is_active      = false,
         deactivated_at = p_now,
         updated_at     = p_now
   where id = p_target_id
     and is_active
  returning id, full_name, email, role, is_active
      into v_profile;

  if not found then
    -- The classifying read: no such account, or already inactive? By the time the UPDATE above
    -- reports zero rows, any competing deactivation has COMMITTED (READ COMMITTED re-evaluates
    -- the predicate against the latest committed row version), so this read cannot observe a
    -- half-finished race -- it sees a settled picture.
    select id, full_name, email, role, is_active
      into v_profile
      from user_profiles
     where id = p_target_id;

    if not found then
      return jsonb_build_object('outcome', 'not_found');
    end if;

    return jsonb_build_object(
      'outcome',            'already_inactive',
      'profile',            jsonb_build_object(
        'id', v_profile.id, 'full_name', v_profile.full_name, 'email', v_profile.email,
        'role', v_profile.role, 'is_active', v_profile.is_active),
      'cancelled_bookings', '[]'::jsonb
    );
  end if;

  -- (b) REQ-030, BR-001.18, US-025/AC-02, AC-03. `WITH ... SELECT ... INTO`, never an assignment
  -- from a scalar subquery -- a data-modifying CTE is only legal at a statement's own top level.
  --
  -- Bounded by requirement, not by hope: bookings_one_confirmed_per_user_per_day permits one
  -- confirmed booking per person per day and REQ-006 caps a bookable date at today + 30, so this
  -- array holds at most 31 rows, realistically <= 23 once bookings_weekday_only is applied.
  with cancelled as (
    update bookings b
       set status              = 'cancelled',
           cancelled_at        = p_now,
           cancelled_by        = p_actor_id,
           cancellation_source = 'deactivation_cascade'
     where b.user_id      = p_target_id
       and b.status       = 'confirmed'
       and b.booking_date >= p_today
    returning b.id, b.desk_id, b.booking_date, b.cancellation_source
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',                  c.id,
               'desk_id',             c.desk_id,
               'desk_number',         d.desk_number,
               'booking_date',        c.booking_date,
               -- Read BACK from the row, never re-asserted as a literal: 0003_bookings.sql's own
               -- comment tells the notification composer (US-029/US-032) to key on THIS column,
               -- never on comparing ids.
               'cancellation_source', c.cancellation_source
             )
             order by c.booking_date, d.desk_number
           ),
           '[]'::jsonb
         )
    into v_cancelled
    from cancelled c
    -- Inner join is safe: bookings.desk_id is NOT NULL with `on delete restrict` (0003:27) --
    -- every cancelled row has a desk.
    join desks d on d.id = c.desk_id;

  return jsonb_build_object(
    'outcome',            'ok',
    'profile',            jsonb_build_object(
      'id', v_profile.id, 'full_name', v_profile.full_name, 'email', v_profile.email,
      'role', v_profile.role, 'is_active', v_profile.is_active),
    'cancelled_bookings', v_cancelled
  );
end;
$$;

-- `public` below is the ROLE PUBLIC, not the schema -- see the block comment above. This is the
-- one migration in this project that needs it: every other write reaches its table only through
-- Express, which never goes near a PostgREST `/rpc/` URL.
revoke execute on function deactivate_account_cascade(uuid, uuid, timestamptz, date)
  from public, anon, authenticated;
grant  execute on function deactivate_account_cascade(uuid, uuid, timestamptz, date)
  to service_role;

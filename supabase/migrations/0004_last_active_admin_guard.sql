-- 0004 — the BR-001.11 guard
--
-- US-024 (change a person's role). The FIRST and ONLY trigger in this schema
-- (db-design.md §3, "The one rule that needs a trigger"). 0002_desks.sql:21-22 already points
-- here in writing: "this schema has exactly one trigger ... and it is not this".
--
-- BR-001.11, V-11, US-024/AC-04, AC-07 — an office must never be left with zero accounts that
-- are both `is_active` and `role = 'admin'`. Zero active admins means nobody can manage desks,
-- bookings or people, INCLUDING nobody able to undo the change that caused it. That is why
-- BR-001.11 is a rejection and not a warning (US-024/AC-06).
--
-- Additive only: one function, one trigger. No column, no index, no data change. Reverting this
-- migration fully undoes it. US-025 (deactivate) and US-026 (reactivate) depend on THIS trigger
-- unmodified and must not add a second one — see "What this covers" below.
--
-- Design note: inception/specs/US-024-change-a-persons-role/design-note.md §2.
-- ADR:         knowledge/decisions/ADR-013-whole-table-invariants-under-concurrency.md
-- Spec:        inception/architecture/db-design.md §3, §5.

-- ---------------------------------------------------------------------------------------------
-- WHY THERE IS A LOCK IN HERE, AND WHY IT IS THE POINT OF THIS MIGRATION
--
-- "Count the active admins after the write and raise if there are none" does NOT hold under
-- concurrency, which is exactly the case db-design.md §3 says this trigger exists to close.
-- Two transactions demoting two DIFFERENT admin rows take no conflicting row locks, so neither
-- blocks; each one's check sees its own row demoted and the OTHER row still an admin; both pass;
-- both commit; zero active admins. This is write skew, and PostgreSQL permits it at both READ
-- COMMITTED and REPEATABLE READ — only SERIALIZABLE detects it, and PostgREST gives the
-- application no per-request isolation control (ADR-001).
--
-- `pg_advisory_xact_lock` serialises the only direction that can break the rule. The second
-- transaction waits for the first to commit, then re-reads and is correctly refused.
--
-- `_xact_`, NEVER `pg_advisory_lock`: the transaction-scoped form releases at COMMIT or ROLLBACK
-- automatically. Supabase's pooler runs in TRANSACTION mode, so a session-scoped lock would
-- outlive the request on a pooled backend and eventually deadlock the application permanently.
--
-- Advisory lock key registry for this project (this is entry 1 of 1):
--   1001011  — read as BR-001.11. This guard. Any future advisory lock picks a different key
--              and adds a line here.
--
-- Lock ORDER, for whoever adds the next writer: this lock is taken AFTER the statement's own row
-- lock, which is safe only because nothing in this codebase updates more than one user_profiles
-- row per statement (PostgREST's `.eq('id', ...)` cannot). A future multi-row writer must take
-- key 1001011 BEFORE its UPDATE, or two such writers can deadlock.
-- ---------------------------------------------------------------------------------------------

create or replace function user_profiles_require_active_admin()
returns trigger
language plpgsql
as $$
begin
  -- MUST be the first statement. See the block comment above.
  perform pg_advisory_xact_lock(1001011);

  -- `is_active AND role = 'admin'` over the WHOLE table, inside the writing transaction, so it
  -- sees this statement's own change. US-024/AC-07: a DEACTIVATED admin cannot sign in (REQ-005)
  -- and therefore does not count — which is why `is_active` is in the predicate and not merely
  -- in the WHEN clause below. Served by user_profiles_is_active_role_idx (0001:52), whose own
  -- comment names this rule.
  --
  -- `exists`, not `count(*)`: the question is "any", and the index scan can stop at the first row.
  if not exists (
    select 1
    from user_profiles
    where is_active and role = 'admin'
  ) then
    -- ERRCODE 'Z0011' is MINTED BY THIS PROJECT and is the whole error signal. The SQL standard
    -- reserves SQLSTATE classes beginning 0-4 and A-H; classes beginning 5-9 and I-Z are
    -- implementation-defined. PostgreSQL uses 53/54/55/57/58/72/F0/HV/P0/XX in that range and
    -- PostgREST reserves the `PT` prefix; `Z0` is free. `0011` echoes BR-001.11.
    --
    -- NOT the default (P0001): that is the SQLSTATE of every unstructured RAISE anywhere, which
    -- would force apps/api/src/modules/users/users.repository.ts to disambiguate on this message
    -- text. It matches on the CODE alone (design note §3.2), so this sentence may be reworded
    -- freely -- it is for logs and for a human reading psql, never for a machine and never for an
    -- end user. The browser renders its own approved copy keyed on the API's
    -- `last_active_admin` code (SCR-008 ST-09).
    raise exception
      'BR-001.11: this change would leave the office with no active administrator'
      using errcode = 'Z0011',
            hint    = 'Make another active account an admin first, then retry.';
  end if;

  return null;  -- AFTER ... FOR EACH ROW: the return value is ignored.
end;
$$;

-- A PLAIN trigger, NOT a `create constraint trigger ... deferrable`. Deferring the check to
-- COMMIT narrows the write-skew window without closing it (the check still runs before its own
-- transaction is visible to the other), so deferral is not what makes this safe -- the advisory
-- lock is. What deferral would additionally buy is a SINGLE transaction that demotes the last
-- admin and promotes a replacement in that order; no code path in this system issues two role
-- writes in one transaction, because PostgREST gives each request its own. The constraint that
-- leaves is "promote somebody first", which is literally the remedy US-024/AC-05's refusal
-- offers. A plain trigger also fails on the statement that caused it rather than at COMMIT,
-- which is easier to attribute.
--
-- `update of role, is_active` -- the trigger is not even CONSIDERED unless one of those columns
-- is in the SET list, which is what keeps US-023's updateProfileDetails write (full_name, email,
-- updated_at) completely unaffected.
--
-- The WHEN clause reads: fire only when this row WAS an active admin and no longer is. Every
-- neighbouring acceptance criterion falls out of it, with no application code:
--   * demoting or deactivating an already-DEACTIVATED admin never fires (US-024/AC-12) -- a row
--     that was not counted cannot reduce the count;
--   * PROMOTING anyone never fires, and so never takes the lock;
--   * REACTIVATING an admin never fires (US-026) -- it can only increase the count;
--   * demoting an active admin while another admin is deactivated DOES fire, and is refused,
--     because the deactivated row fails `is_active` in the function above (US-024/AC-07).
create trigger user_profiles_last_active_admin_guard
  after update of role, is_active on user_profiles
  for each row
  when (
    old.is_active and old.role = 'admin'
    and not (new.is_active and new.role = 'admin')
  )
  execute function user_profiles_require_active_admin();

-- ---------------------------------------------------------------------------------------------
-- WHAT THIS COVERS, AND WHAT IT DELIBERATELY DOES NOT
--
-- US-025 (deactivate) and US-026 (reactivate) need NO further migration. Their writes are
-- `is_active` flips on this same table and are already in this trigger's event list and WHEN
-- clause. app-architecture.md §4.2 puts the deactivation flip and the booking cascade in one
-- transaction: the cascade writes `bookings`, which this trigger does not watch, so the guard
-- fires exactly once and aborts the whole transaction if the flip would leave no active admin --
-- which is precisely what §4.2 describes. A SECOND trigger for US-025 would be a review finding.
--
-- No INSERT branch: an insert cannot reduce the count.
--
-- No DELETE branch, and this leaves one named residual. user_profiles.id references
-- auth.users (id) ON DELETE CASCADE (0001:28), so deleting the last active admin's Auth user
-- would empty the admin population silently. Nothing in this product deletes an account
-- (db-design.md §4), and ADR-012 item 3 makes auth.admin.deleteUser a data-loss bug on any live
-- account. A DELETE branch would guard a path that does not exist and would break the gated
-- concurrency suite's own fixture cleanup. Design note §2.5, open item 4.
--
-- The function is deliberately VOLATILE (plpgsql's default) and NOT marked STABLE or IMMUTABLE.
-- Under READ COMMITTED, each command inside a volatile function takes a FRESH snapshot -- that
-- is what lets the `exists` above see the other transaction's write once the advisory lock is
-- released. Marking it STABLE would pin the calling statement's snapshot and silently restore
-- the write-skew hole with the lock still in place and apparently working. No test would catch
-- that one-word change.
--
-- SECURITY INVOKER (the default), not SECURITY DEFINER. Every write reaches this table through
-- Express on the service-role key (ADR-001), which has BYPASSRLS, so the `exists` sees the whole
-- table despite `force row level security` (0001:56-59). If a future path ever writes as a role
-- WITHOUT BYPASSRLS, this guard sees an empty table and refuses every demotion: wrong, but
-- fail-CLOSED, which is the correct direction for this rule.
-- ---------------------------------------------------------------------------------------------

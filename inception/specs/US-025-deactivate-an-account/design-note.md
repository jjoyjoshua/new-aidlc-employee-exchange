# US-025 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-025 — Deactivate an account and release the desks it holds](../../stories/user-stories/US-025-deactivate-an-account.md) |
| **Screen**   | SCR-008 **ST-05, ST-06, ST-07, ST-12 – ST-15** (row-menu route). **Not frame-verified** — see open item 6 |
| **Tier**     | Complex — **persistence** (a new migration; also the project's first database *function*), **contract** (two new routes), **trust** (a new admin-only write surface, and — new in this story — the first application write reachable at a PostgREST `/rpc/` URL). Any one carries it (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-20 |
| **Rests on** | ADR-001, ADR-002, ADR-004, ADR-009, ADR-010, ADR-013, and the US-015 / US-016 / US-018 / US-019 / US-023 / US-024 design notes — **no new ADR** (§7) |

**Advisory.** The human's GitHub review is the authority. `spec.md`, `impact-analysis.md`,
`implementation-plan.md`, `decisions.md`, `traceability.md` and `change-log.md` stay DEV's.

**Written after Gate D1**, per `ai/gates/delivery.md`'s own ordering, because the plan deferred
exactly one thing to this note: *"Step 2's exact RPC shape (parameters, how 'not found' / 'already
inactive' / 'blocked' / 'ok' are signalled)"*. §8 therefore amends an approved plan rather than
constraining an unwritten one.

**The verdict, in one line each:**

- **The `0004` trigger needs zero changes and fires correctly from inside the new function — D-04 is
  right, and §2.4 walks through why rather than asserting it.** An `AFTER ROW` trigger fires at the
  end of the statement that caused it, including a statement inside a PL/pgSQL function, so it fires
  after the `user_profiles` `UPDATE` and *before* the booking cascade runs. Uncaught, its `Z0011`
  aborts the whole PostgREST transaction. **AC-10 and AC-12 are the same mechanism, not two.**
- **Four outcomes, two mechanisms, and the principle that separates them: an exception aborts, a
  value reports. Use an exception only when the abort is the point.** `blocked` is the only case
  where the abort *is* the point, and it already has its exception (`Z0011`, unchanged, reused).
  `ok` / `not_found` / `already_inactive` are data, returned as one `jsonb` object (§2.2).
- **`RETURNS TABLE` is the wrong shape, and it is the likeliest wrong answer to reach for.** A
  profile plus *N* bookings cannot be one table without repeating the profile per booking; zero
  cancelled bookings would return zero rows and lose the profile; and `not_found` would be
  indistinguishable from "ok, nothing to cancel" (§2.2).
- **`already_inactive` is a real case, and the plan has nowhere to put it.** Step 2's own sketch
  (`WHERE id = $target AND is_active`) collapses it into `not_found`, whose approved copy — *"That
  account could not be found"* — is a lie about an account that plainly exists. The repository
  reports four kinds; the **service** collapses `already_inactive` to `ok` and logs it. No new error
  code, no unapproved copy (§2.2, §3.2). **major.**
- **`p_today` must be a parameter, and that is forced rather than chosen.** The database does not
  know `OFFICE_TIMEZONE`. `current_date` in the function would re-derive the office's calendar day
  from the database session's zone — the exact bug `0003_bookings.sql:29-31` says the `date` column
  type exists to prevent. `p_now` likewise: one `nowMs()` reading, threaded, never `now()` in SQL
  (`desks.repository.ts:79-81`'s standing rule) (§2.1).
- **Do not pass the *status* as a parameter, although `countUpcomingConfirmedForDesk` passes its
  own.** A read may parameterise its predicate; a write names the state it transitions *from*,
  because the transition is the function's identity. A `p_status` would make
  `deactivate_account_cascade(..., 'cancelled')` expressible — re-stamping `cancelled_at` and
  destroying attribution on already-cancelled rows (§2.1). Drift is closed by Step 2a's case 2
  instead, which is a test rather than a hope.
- **`STABLE` bites this project a second time, and worse.** ADR-013 already records that marking the
  *trigger* function `STABLE` silently restores write skew. PostgREST additionally runs a
  `STABLE`/`IMMUTABLE` function **in a read-only transaction**, so a one-word slip here does not
  degrade quietly — both `UPDATE`s fail with `25006`. Loud, but a reader must know why (§2.6).
- **The migration must `revoke execute … from public, anon, authenticated` and grant it explicitly to
  `service_role`.** Postgres grants `EXECUTE` on a new function to `PUBLIC` by default, and PostgREST
  publishes it at `/rest/v1/rpc/deactivate_account_cascade` — reachable with the **anon key that ships
  in the browser bundle**. It fails closed today only because `user_profiles` and `bookings` carry
  `force row level security` with no policies. A system whose entire posture is *"every rule is
  enforced in Express"* (ADR-001) must not publish an admin write at a public URL and rely on a
  second control to make it harmless (§2.7). **blocker** — two lines, in this migration.
- **`composition.ts` is missing from `impact-analysis.md`, and the omission is load-bearing.**
  `UsersServiceDeps` has no `officeTimezone` (`users.service.ts:19-25`); this story is the first to
  need it, which changes `composition.ts:117-121` and every existing `createUsersService(...)` call
  in `users.service.spec.ts` (§3.2). **major** — this is US-024's `use-users.ts` finding, recurring.
- **The NFR-009 "open question" is substantially already answered by shipped code, and the package
  says otherwise.** `require-session.ts` step 3 refuses **every** request from a deactivated account
  with `401 account_inactive`, immediately — its own comment calls this *"the de facto answer to
  db-design.md open question 3"*. What the human is actually being asked is far narrower than
  `spec.md`'s Out-of-scope bullet and `decisions.md`'s open item imply (§4.2). **major.**
- **One genuinely new residual, and it is not the one the package names: a booking can survive its
  owner's deactivation by milliseconds.** An `INSERT` committed after the cascade's `UPDATE` takes its
  snapshot is a phantom the advisory lock cannot see, because a booking insert never touches
  `user_profiles`. The harm is BR-001.18's own — one stranded desk — and the fix is a `bookings`-side
  rule this story has no AC for (§4.3). **Named, not fixed**; open item 2.
- **No new ADR.** ADR-013 already decided the mechanism and named US-025 as an inheritor in its own
  Decision item 4 and follow-up 2. Everything else here is an executable contract carrying ordinary
  decisions — exactly the case `ai/roles/architect.md` says should *not* mint one (§7).
- **The cascade writing `bookings` from a `users`-owned path is a written exception to ADR-004, not a
  dodge — and D-02 justifies it with the weaker of the two available arguments.**
  `app-architecture.md` §2 already granted it in writing; `modules/bookings/README.md` currently says
  `bookings` is written from exactly two objects, which this story makes false (§6.1, F12). **minor.**

---

## 0. The tiering — confirmed

| Surface | What it is here |
| --- | --- |
| **Persistence** | `supabase/migrations/**` is a protected path and **every migration is Complex by convention** (`ai/standards/task-surfaces.md`). This one adds the project's **first database function**, and the first multi-statement transaction anywhere in the system |
| **Contract** | Two new routes — `GET /api/admin/users/:id/deactivation-preview`, `POST /api/admin/users/:id/deactivate` — and one new response schema. *"A new write operation"*, Complex outright |
| **Trust** | A new admin-only write surface **and** a new *externally addressable* one: this is the first thing this application calls through PostgREST's `/rpc/` endpoint, which is reachable with the browser's anon key (§2.7) |

**Not a new guard.** `requireAdmin` mounts once at `/api/admin` (`http/app.ts`); AC-14's production
diff is empty and its test is not. `admin.router.ts`'s own header comment is the worked example.

**`requireActingAdmin` *is* used here**, unlike US-024 — `bookings.cancelled_by` is a real attribution
column and `/bookings/:id/cancel` is the precedent (`admin.router.ts:61-67`, `:432`). Say in the PR
that this is the deliberate opposite of US-024's decision, so the asymmetry reads as intentional.

**Not a new trigger, not an index change, not an enum change.** `deactivation_cascade` is already a
`cancellation_source` member (`0003_bookings.sql:22`), `is_active`/`deactivated_at` already exist
(`0001_user_profiles.sql:32,43`), and `bookings_user_id_booking_date_idx` (`0003:77`) already serves
both the preview and the cascade predicate.

**This story is `deactivated_at`'s first and only writer.** `setRole`'s own docblock reserved it by
name (*"never `deactivated_at` (US-025's)"*). Keep that reservation true in the other direction: the
cascade writes `is_active`, `deactivated_at`, `updated_at` and **nothing else** on `user_profiles`.

---

## 1. What this story actually is

**One transaction, two tables, and a guard that already exists.** Everything genuinely new is in
§2; §3 is plumbing with strong local precedent; the browser work is US-019/US-024's dialog shape
reused.

| AC | Where it is answered |
| --- | --- |
| **AC-01** a deactivated person cannot sign in | Inherited, twice over — `auth.service.ts`'s sign-in check *and* `require-session.ts` step 3 (§4.2). This story only writes the flag |
| **AC-02** upcoming Confirmed bookings cancelled in the same act | **§2.3**'s second `UPDATE`, in the same transaction. Desks return to the pool with no further work: `bookings_one_confirmed_per_desk_per_day` is **partial** on `status = 'confirmed'` (`0003:64-65`), so the slot frees the instant the row flips |
| **AC-03** past bookings kept | **§2.3**'s `booking_date >= p_today` — in the `WHERE`, never a post-filter (FR-03 is right) |
| **AC-04** never blocked by the bookings | Structural: nothing reads a booking count before the write. `DeactivateAccountOutcome` has no `blocked-by-bookings` kind to return (§3.1) — the exact inverse of `deactivateDesk` |
| **AC-05 / AC-06 / AC-07** the two confirmations | FR-01's preview (§3.3) feeds them. Browser copy only; **not frame-verified** (open item 6) |
| **AC-10** the only active admin is refused | **§2.4** — the `0004` trigger, unmodified, fired from inside the function |
| **AC-11** nothing optimistic, a failure changes nothing | §3.4's throw-on-unrecognised, plus the browser's `inFlight` ref |
| **AC-12** the cascade is all or nothing | **§2.4** — one PostgREST transaction; every abort path rolls back both tables. The `bookings_cancelled_at_matches_status` and `bookings_cancelled_has_source` CHECKs (`0003:48-53`) make a *half-written* cancellation uncommittable as well |
| **AC-13** success states the effect, counts update | §3.2's `markDeactivated` (+1 to `deactivated` only) |
| **AC-14** admin only | Inherited (§0), proven at the real mount |
| **FR-12** enough returned for US-029/US-032 | **§2.3**'s `cancelled_bookings` array — desk number and date per row, and `cancellation_source` read back **from the row** rather than re-asserted, which is `0003_bookings.sql:18-21`'s own instruction to the composer |

---

## 2. The migration — `0005_deactivate_account_cascade.sql`

### 2.1 The signature, and why every parameter is a parameter

```sql
create or replace function public.deactivate_account_cascade(
  p_target_id uuid,
  p_actor_id  uuid,
  p_now       timestamptz,
  p_today     date
)
returns jsonb
language plpgsql
```

Six decisions, in order of how badly each would hurt if got wrong:

- **`p_today date`, never `current_date`.** The database does not know `OFFICE_TIMEZONE` —
  `config().OFFICE_TIMEZONE` is read in `composition.ts:101` and reaches `officeToday` and nowhere
  else. A `current_date` here would re-derive the office's calendar day from whatever zone the
  database session happens to hold (UTC on Supabase), which is **precisely** the bug
  `0003_bookings.sql:29-31` says the `date` column type exists to prevent: *"The office's own 'today'
  is computed once on the server, from the configured zone."* Not a preference; a correctness
  constraint with an existing written rationale.
- **`p_now timestamptz`, never `now()`.** `desks.repository.ts:79-81` states the house rule for the
  identical case: *"The timestamp comes from the SERVICE's single `nowMs()` reading, never from
  `now()` in SQL and never from a second clock read."* One reading stamps `deactivated_at`,
  `updated_at` and every `cancelled_at`, so the audit trail ties the three writes to one instant.
  `p_today` is derived from that same reading (§3.2) — two readings could straddle office midnight.
- **No `p_status`, although `countUpcomingConfirmedForDesk(deskId, status, from)` takes one.** That
  method is a **read**; parameterising its predicate costs nothing. This is a **write**, and a
  `p_status` would make `deactivate_account_cascade(..., 'cancelled')` a legal call that re-stamps
  `cancelled_at`/`cancelled_by` on already-cancelled rows and destroys BR-001.20's attribution. *A
  read may parameterise its predicate; a write names the state it transitions from, because the
  transition is the function's identity.* The drift risk this creates against the preview is closed
  by test (Step 2a case 2), and the migration comment must cite
  `apps/api/src/domain/booking-history.ts`'s `displayStatusPredicate` as the other half.
- **`p_`-prefixed names, and the prefix is load-bearing.** A PL/pgSQL parameter named `user_id` or
  `id` is ambiguous against a column of the same name in the `UPDATE`'s own `WHERE` — Postgres
  raises `42702 ambiguous_column`, or, worse, resolves to the column. The prefix makes the class of
  bug unrepresentable.
- **The parameter names are a wire contract.** supabase-js `.rpc(name, args)` sends `args` as a JSON
  object and PostgREST matches **by argument name**. Renaming `p_target_id` is a breaking change
  presenting as `PGRST202` at runtime, never at typecheck. Spell them in exactly one TypeScript
  place (§3.1).
- **`returns jsonb`, `language plpgsql`, and no `security definer`** — §2.2, §2.6, §2.7.

### 2.2 The four outcomes — an exception aborts, a value reports

**The principle: use an exception only when the abort *is* the point.**

| Outcome | Mechanism | Why |
| --- | --- | --- |
| **`blocked`** (BR-001.11) | the **existing** `Z0011` exception from `0004`'s trigger, uncaught | The abort is the entire point — it is what rolls the booking cascade back. Nothing in this migration raises it; the migration adds **no `raise` statement at all**, which is what keeps `users.repository.ts:174-178`'s claim (*"raised by exactly ONE statement in the whole schema"*) true |
| **`ok`** | `{"outcome":"ok","profile":{…},"cancelled_bookings":[…]}` | |
| **`not_found`** | `{"outcome":"not_found"}` | Raising here would abort a transaction that has nothing to roll back, cost a second minted SQLSTATE, and add a second error-mapping branch for a case the data path already expresses |
| **`already_inactive`** | `{"outcome":"already_inactive","profile":{…},"cancelled_bookings":[]}` | §below |

**Why one `jsonb` and not `RETURNS TABLE`.** Three independent reasons, any one sufficient:

1. A profile plus *N* bookings is not a table. `RETURNS TABLE` forces either the profile columns
   repeated on every booking row, or a NULL-padded union of two row shapes.
2. **Zero cancelled bookings returns zero rows** — and AC-07's whole population (somebody with
   nothing upcoming) is that case. The profile would be lost on the most ordinary path.
3. `not_found` would be zero rows too, indistinguishable from (2).

A single scalar `jsonb` arrives at supabase-js as `data` = the parsed object, in one round trip.

**Why `already_inactive` is a real case, and what to do with it.** The row menu offers Deactivate
only on a row the browser believes is active, but two administrators can race, and a list can be
stale. Step 2's sketched predicate — `WHERE id = $target AND is_active` — is right (it stops a
re-stamp of `deactivated_at`, whose own comment scopes it to *"when REQ-020 last ran"*), but it makes
zero rows mean **two different things**, and Step 3's three-kind outcome has nowhere to put the
second one.

- Mapping it to `not_found` ships `404 user_not_found` — *"That account could not be found."* — about
  an account plainly on screen. A lie.
- Mapping it to ST-13 ships *"nothing changed… the account is still active"* (AC-11's own wording).
  Also a lie, and structurally the same defect US-024's note rated **major** in D-01.
- A distinct `409 account_already_inactive` matches `booking_already_cancelled`'s precedent exactly
  (`admin.router.ts:435`) — but needs a new error code and a new SCR-008 state nobody approved. A
  Gate 1 round trip for a millisecond race.

**Recommended: the repository reports four kinds; the service collapses `already_inactive` to `ok`
and logs it** (§3.2). Every AC-13 promise stays true (the row *is* Deactivated, they *cannot* sign
in), no copy is invented, no error code is added, and the distinction survives in the database
contract for whoever needs it — US-026, or an audit story. The one residual is a browser summary
whose `deactivated` count is one high until the next load, which is stale local state, not a wrong
server answer.

**Why the repository keeps the fourth kind rather than collapsing it there:** the repository's job is
to report faithfully what the database said; deciding that two facts are one product outcome is a
service decision. That split is already how `cancelAnyBooking`/`findBookingState` are written.

### 2.3 The SQL

```sql
create or replace function public.deactivate_account_cascade(
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
  -- (a) REQ-020, AC-01. `is_active` is in the SET list, so 0004's trigger is CONSIDERED; its WHEN
  -- clause decides whether it fires (design note §2.4). NO pre-check precedes this write — the
  -- house rule every other writer in this repository states (`insertDesk`, `updateDeskNumber`,
  -- `insertConfirmedBooking`): the write is the arbiter, and a classifying read is issued ONLY to
  -- explain a miss, never to decide whether to write (`cancelAnyBooking`/`findBookingState`).
  --
  -- `and is_active` keeps a second deactivation from re-stamping deactivated_at, whose own comment
  -- (0001:42) scopes it to "when REQ-020 last ran".
  update user_profiles
     set is_active      = false,
         deactivated_at = p_now,
         updated_at     = p_now
   where id = p_target_id
     and is_active
  returning id, full_name, email, role, is_active
      into v_profile;

  if not found then
    -- The classifying read: was there no such account, or was it already inactive? By the time the
    -- UPDATE above reports zero rows, any competing deactivation has COMMITTED (READ COMMITTED
    -- re-evaluates the predicate against the updated row version), so this read cannot see a
    -- half-finished race.
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

  -- (b) REQ-030, BR-001.18, AC-02, AC-03. `status = 'confirmed'` is deliberately a literal and not
  -- a parameter (design note §2.1); its other half is the service's
  -- displayStatusPredicate('confirmed', today) in apps/api/src/domain/booking-history.ts, and
  -- Step 2a case 2 is what keeps the two from drifting.
  --
  -- MUST be `WITH … SELECT … INTO`, never `v_cancelled := (with … select …)`: PostgreSQL allows a
  -- data-modifying CTE only at the top level of a statement, so the assignment form does not parse.
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
               -- Read BACK from the row, never re-asserted as a constant: 0003_bookings.sql:18-21
               -- tells the notification composer to key on THIS column and never on comparing ids.
               'cancellation_source', c.cancellation_source
             )
             order by c.booking_date, d.desk_number
           ),
           '[]'::jsonb
         )
    into v_cancelled
    from cancelled c
    -- Inner join is safe: bookings.desk_id is NOT NULL with `on delete restrict` (0003:27).
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

-- Design note §2.7. `public` here is the ROLE PUBLIC, not the schema — do not "simplify" this away.
-- Postgres grants EXECUTE on a new function to PUBLIC by default and PostgREST publishes it at
-- /rest/v1/rpc/deactivate_account_cascade, which the browser's own anon key can reach.
revoke execute on function public.deactivate_account_cascade(uuid, uuid, timestamptz, date)
  from public, anon, authenticated;
grant  execute on function public.deactivate_account_cascade(uuid, uuid, timestamptz, date)
  to service_role;
```

**The `profile` keys are `snake_case` on purpose** — the exact select list `setRole` and
`updateProfileDetails` already read (`id, full_name, email, role, is_active`), so the payload is a
`ProfileDetailsRow` and `users.service.ts`'s existing `mapAccount` consumes it verbatim. No second
mapping, no new row interface for the same five columns.

**The array is bounded by requirement, not by hope.** `bookings_one_confirmed_per_user_per_day`
(`0003:67`) permits one confirmed booking per person per day and REQ-006 caps a bookable date at
today + 30, so `cancelled_bookings` holds at most 31 entries and, with
`bookings_weekday_only` (`0003:45`), realistically ≤ 23. State the bound in the migration, the way
`listUpcomingConfirmedDeskIds`'s docblock states its own.

### 2.4 The `0004` trigger fires unmodified — the walkthrough D-04 asserts

**Confirmed: zero changes to `0004_last_active_admin_guard.sql`.** Not by inspection of its comment,
but by walking the mechanism:

1. **Is the trigger considered?** It is declared `after update of role, is_active on user_profiles`.
   `UPDATE OF` tests whether the column appears in the `SET` list — `is_active` does. Considered. ✔
2. **Does the `WHEN` clause fire?** `old.is_active and old.role = 'admin' and not (new.is_active and
   new.role = 'admin')`. For an **active admin** target: `true and true and not(false and …)` →
   fires. For an **active employee**: `old.role = 'admin'` is false → does not fire, and **takes no
   advisory lock** — which is why deactivating the ordinary case costs nothing. ✔
3. **Does it fire from inside a PL/pgSQL function?** Yes. A non-deferred `AFTER … FOR EACH ROW`
   trigger fires at the end of the **statement** that queued it, and a statement executed by
   PL/pgSQL ends its own after-trigger queue. It therefore fires after (a) and **before** (b) — so on
   the refused path, no booking row is ever touched.
4. **Does it see the right picture?** Its `exists (… where is_active and role = 'admin')` runs inside
   the writing transaction and sees this statement's own change. The function's `VOLATILE` default
   gives each command a fresh snapshot after the advisory lock releases — ADR-013 §2.6's dependency,
   unchanged and untouched here. ✔
5. **Does the refusal abort everything?** The function has **no `EXCEPTION` block**, so `Z0011`
   propagates out of the function, out of PostgREST's transaction, and rolls back both tables.
   **AC-10 and AC-12 are one mechanism.** ✔
6. **Does the refusal still reach the repository as `Z0011`?** PostgREST maps any PostgreSQL error to
   a body carrying the SQLSTATE as `code`, on the `/rpc/` path as on the table path. This is an
   *assumption*, not a fact verifiable from this environment — the same class ADR-013 item 7 says
   must be proven against real Postgres. §3.5 asserts the raw error (§8 C5).

| Case | `WHEN` | Result |
| --- | --- | --- |
| Deactivate the only active admin (**AC-10**) | fires | `exists` finds none → `Z0011` → whole transaction aborts, bookings untouched |
| Deactivate an active admin, another admin exists but is deactivated | fires | the deactivated row fails `is_active` in the `exists` → refused. Same half of BR-001.11 US-024/AC-07 named |
| Deactivate an active admin, another **active** admin exists | fires | passes. Including self-deactivation — BR-001.11 guards the count, never the identity (§6.2, F13) |
| Deactivate an **employee** (the ordinary case) | does not fire | `old.role = 'admin'` false. No lock, no `exists`, no cost |
| Target already inactive | never reached | the `UPDATE` matches zero rows, so no trigger event exists at all → `already_inactive`, **not** `blocked` — correct: a row that was not counted cannot reduce the count |
| The cascade's `bookings` writes | not considered | the trigger is on `user_profiles`. `0004`'s own closing comment predicted exactly this: *"the cascade writes `bookings`, which this trigger does not watch, so the guard fires exactly once"* |

**The lock-ordering precondition `0004` asks the next writer to check is satisfied.** Its comment:
*"this lock is taken AFTER the statement's own row lock, which is safe only because nothing in this
codebase updates more than one `user_profiles` row per statement… A future multi-row writer must
take key 1001011 BEFORE its UPDATE."* This function's `UPDATE` is keyed on the primary key and
touches exactly one row. **Say this explicitly in the new migration** — it is the first writer since
the note was written, and a reviewer should see it was read, not skipped (§8 C7).

### 2.5 Statement order, and the deadlock question

**Profile first, then the cascade** — matching `app-architecture.md` §4.2's own wording (*"flip
`is_active`, stamp `deactivated_at`, and cancel each of those bookings"*). Reasons, and the honest
cost:

- **The refusal arrives before any work is done** (§2.4 step 3). Correctness is identical either way
  — one transaction, one rollback — but "nothing was touched" is a much easier property to reason
  about than "everything was undone".
- **Cost, named:** when the target *is* an active admin, advisory key `1001011` is then held across
  the booking cascade instead of being taken at the very end. At `db-design.md`'s stated bound
  (hundreds of accounts) with ≤ 23 booking rows, and only on the active-admin path, this is a
  non-issue. Recorded so a future reader does not mistake it for an oversight.

**No deadlock is introduced, and here is the argument rather than the assurance.** Every writer of
`user_profiles` in this system takes the same order: the target row's own lock first (via its
`UPDATE`), then advisory `1001011` if the trigger fires. Two transactions targeting *different* rows
never contend on row locks and queue on the advisory lock in arrival order. Two targeting the *same*
row contend on the row lock **before** either holds the advisory lock, so no cycle can form. The
cascade additionally holds `bookings` row locks, but a booking belongs to exactly one person, so two
cascades touch disjoint sets, and a concurrent single-booking cancel (US-011/US-015) holds one
booking row and waits on nothing this transaction holds.

### 2.6 `VOLATILE`, and why the `STABLE` slip is worse here than in `0004`

Leave the function `VOLATILE` (PL/pgSQL's default). ADR-013's "Harder" section already records that
marking the *trigger* function `STABLE` silently restores write skew with no test to catch it. The
same one-word slip on **this** function has a second, unrelated consequence: **PostgREST runs a
`STABLE` or `IMMUTABLE` function in a read-only transaction**, so both `UPDATE`s fail with
`25006 read_only_sql_transaction`. That failure is loud rather than silent — but a developer who
knows only ADR-013's version of the trap will be looking for the wrong symptom. One line in the
migration comment.

### 2.7 This is the project's first `.rpc()` — four things that will otherwise cost an afternoon

`grep -rn "\.rpc("  apps/api/src` returns **nothing**. US-019's own design note recorded the same
fact as evidence that no transaction existed anywhere; this story ends that.

1. **Who may execute it — `revoke`, then `grant`. blocker.** Postgres grants `EXECUTE` on a new
   function to `PUBLIC` by default, and PostgREST publishes every function in the exposed schema at
   `/rest/v1/rpc/<name>`. The anon key that reaches that URL **ships in the browser bundle**
   (`apps/ui/src/lib/supabase-client.ts`). Today the call is harmless: the function is
   `SECURITY INVOKER`, so as `anon` it runs under `force row level security` with no policies on
   either table, matches zero rows, and answers `not_found`. **That is a second control making a
   first mistake survivable, which is not the same as not making it.** ADR-001's posture is that
   every rule is enforced in Express; an admin write published at a public URL contradicts it, and
   becomes live the day anyone adds a permissive policy. Two lines, in this migration. *Residual:* a
   plain-Postgres instance has no `anon`/`authenticated` roles and the `revoke` would error — this
   project is Supabase-only per ADR-001, and a `do $$ … if exists (select 1 from pg_roles …)` guard
   is available if that ever changes.
2. **`SECURITY INVOKER`, never `DEFINER`** — `0004`'s own reasoning, unchanged and now doubly
   important: a `SECURITY DEFINER` function reachable at a public URL is the textbook privilege
   escalation, and it would additionally oblige us to pin `search_path`.
3. **The schema cache.** PostgREST caches the function catalogue; Supabase's DDL event trigger
   reloads it after a migration. If the gated suite ever reports
   `PGRST202 — Could not find the function … in the schema cache`, the cause is the cache or a
   mis-spelled **argument name**, not a missing function. The repository must **not** map `PGRST202`
   to any outcome — it throws, exactly as `listBookings` recognises only its one expected
   `PGRST103`.
4. **Overloads.** `create or replace function` cannot change a parameter list; a later migration that
   adds or renames one creates a **second overload**, and PostgREST then cannot disambiguate
   (`PGRST203`). Any future signature change must `drop function public.deactivate_account_cascade
   (uuid, uuid, timestamptz, date)` first. One line in the migration comment.

### 2.8 What the migration deliberately does not do

- **No second trigger** (D-04, ADR-013 follow-up 2). A diff adding one is a review finding.
- **No `raise` of its own.** `Z0011` stays a one-statement fact of this schema.
- **No `EXCEPTION` block, anywhere.** A PL/pgSQL exception handler opens a subtransaction; catching
  `Z0011` would roll back to the savepoint and let the function return a "clean" answer while the
  refusal disappeared. A `when others` would additionally swallow genuine failures. **blocker.**
- **No `SECURITY DEFINER`, no `STABLE`/`IMMUTABLE`** (§2.6, §2.7).
- **No index.** `bookings_user_id_booking_date_idx` (`0003:77`) already serves the predicate.
- **No `DELETE` branch, no reactivation path.** `deactivated_at`'s comment (*"Null for an account
  that has never been deactivated"*) implies US-026 must **not** clear it. Forward note only.

---

## 3. The repository, the service, the route

### 3.1 `usersRepository.deactivateAccount` — the signature, confirmed with two corrections

DEV's sketched `deactivateAccount({ id, actorId, now, today })` is **right**. Types and outcomes:

```ts
/** The one place the RPC's name and its four PostgREST argument names are spelled (design note
 *  §2.1). Renaming any of them is a breaking change that presents as `PGRST202` at runtime and
 *  never at typecheck. */
const DEACTIVATE_ACCOUNT_RPC = 'deactivate_account_cascade';

/** US-025/AC-01, AC-02. `now` is the service's ONE `nowMs()` reading and `today` is derived from
 *  the SAME reading via `displayStatusPredicate('confirmed', officeToday(...))` — never a second
 *  clock read, and never `now()`/`current_date` in SQL (`desks.repository.ts`'s standing rule).
 *  `actorId` is ATTRIBUTION only (`bookings.cancelled_by`, BR-001.20) — `requireAdmin` at the
 *  mount is the sole authority over who may call this at all. */
export interface DeactivateAccountInput {
  id: string;
  actorId: string;
  now: Date;
  today: OfficeDate;
}

/** One cascade-cancelled booking, as the RPC returns it. `desk_number` is joined so US-029/US-032
 *  can compose copy naming a desk a human recognises without a second query (FR-12); a uuid is not
 *  composable copy. `cancellation_source` is read BACK from the row, never re-asserted —
 *  `0003_bookings.sql:18-21`'s own instruction to the composer. */
export interface CancelledBookingRow {
  id: string;
  desk_id: string;
  desk_number: string;
  booking_date: OfficeDate;
  cancellation_source: 'deactivation_cascade';
}

export type DeactivateAccountOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow; cancelledBookings: CancelledBookingRow[] }
  /** The account exists and was ALREADY inactive — a race, or a stale list. Distinct from
   *  `not_found` because 404's approved copy would be false (design note §2.2). The SERVICE, not
   *  this method, decides what that means for the product. */
  | { kind: 'already_inactive'; profile: ProfileDetailsRow }
  /** US-025/AC-10 (BR-001.11, V-11). `0004`'s trigger refused it inside the writing transaction,
   *  serialised by its own advisory lock (`ADR-013`) — never an in-app count. */
  | { kind: 'blocked' }
  | { kind: 'not_found' };
```

```ts
async deactivateAccount({ id, actorId, now, today }) {
  const { data, error } = await supabase().rpc(DEACTIVATE_ACCOUNT_RPC, {
    p_target_id: id,
    p_actor_id:  actorId,
    p_now:       now.toISOString(),
    p_today:     today,
  });

  // Same constant, same single match, same reason as `setRole` above: `Z0011` is raised by exactly
  // one statement in the whole schema, so no second discriminator is needed. Everything else —
  // including `PGRST202` (schema cache / argument name) — throws.
  if (error) {
    if (error.code === LAST_ACTIVE_ADMIN_SQLSTATE) return { kind: 'blocked' };
    throw new Error(`account deactivation failed: ${error.message}`);
  }

  const payload = data as DeactivateAccountPayload | null;
  if (!payload) throw new Error('deactivation returned no payload — this is a bug');

  switch (payload.outcome) {
    case 'ok':
      return { kind: 'ok', profile: payload.profile, cancelledBookings: payload.cancelled_bookings };
    case 'already_inactive':
      return { kind: 'already_inactive', profile: payload.profile };
    case 'not_found':
      return { kind: 'not_found' };
    default:
      // `updateProfileDetails`'s "unrecognised unique violation" discipline: an outcome this code
      // does not know is a bug, never a refusal.
      throw new Error(`unrecognised deactivation outcome: ${String(payload.outcome)}`);
  }
}
```

**`LAST_ACTIVE_ADMIN_SQLSTATE` is reused, not re-declared** (`users.repository.ts:179`). Two copies
of that constant in one file would be the first step toward two spellings of it.

### 3.2 `usersService.deactivateAccount` — and the dependency the plan is missing

```ts
export type DeactivateAccountOutcome =
  | { kind: 'ok'; account: AdminUser; cancelledCount: number }
  | { kind: 'blocked' }
  | { kind: 'not_found' };
```

```ts
async deactivateAccount(id: string, actorId: string): Promise<DeactivateAccountOutcome> {
  // ONE clock reading, threaded to both the stamp and the date bound — `deactivateDesk`'s own
  // discipline: two readings could straddle office midnight and cancel a different set of
  // bookings than the one the stamp claims.
  const now = nowMs();
  const today = officeToday(now, officeTimezone);
  const predicate = displayStatusPredicate('confirmed', today);
  if (predicate.from === undefined) {
    throw new Error("displayStatusPredicate('confirmed', today) returned no floor — this is a bug");
  }
  // `predicate.stored` is deliberately NOT passed to the RPC (design note §2.1) — the function
  // names the state it transitions FROM. It IS passed to `previewDeactivation`, which is a read.

  const result = await users.deactivateAccount({
    id, actorId, now: new Date(now), today: predicate.from,
  });

  if (result.kind === 'blocked' || result.kind === 'not_found') return result;

  if (result.kind === 'already_inactive') {
    // A race or a stale list, not a failure: the account IS deactivated and the person CANNOT sign
    // in, which is every promise AC-13 makes. Logged so the race is visible in operations rather
    // than invisible (design note §2.2).
    logger.warn('deactivation found the account already inactive — nothing was changed', { id });
    return { kind: 'ok', account: mapAccount(result.profile), cancelledCount: 0 };
  }

  return {
    kind: 'ok',
    account: mapAccount(result.profile),
    cancelledCount: result.cancelledBookings.length,
  };
}
```

**`UsersServiceDeps` gains `officeTimezone: string`** — it currently has only `{ users, usersAuth,
nowMs }` (`users.service.ts:19-25`). That changes **`composition.ts:117-121`** (add `officeTimezone`,
already in scope at `:101`) and every `createUsersService({…})` call in `users.service.spec.ts`,
which will fail typecheck until updated. **`apps/api/src/composition.ts` is absent from
`impact-analysis.md`'s Files table** (§8 C8). This is US-024's `use-users.ts` omission, recurring in
the same position: the file one layer out from where the plan is looking.

**`cancelledBookings` stops at the service boundary, deliberately.** The service reduces them to a
count; the rows exist where US-029 will need them, and no dead field ships. `desks.service.ts:113-115`
is the precedent for how that story should widen this: *"A future author wiring a rename notification
(e.g. alongside US-029) must add that dependency here, not bolt it on silently."* Say the same thing
in this method's docblock.

### 3.3 `previewDeactivation` — endorsed, with two small corrections

`previewDeactivation(id, status, from)` matching `countUpcomingConfirmedForDesk`'s parameter shape is
right, as is the embedded select (`admin-bookings.repository.ts:144`'s precedent) — including its
stated gotcha: a many-to-one embed is typed as an array by supabase-js with no generated `Database`
schema and arrives as a single object at runtime, so the `as unknown as` cast and the
`if (!row.desks) throw` guard both come across.

- **Drop `count` from `deactivationPreviewSchema`.** It is `bookings.length` on a payload that is
  never paginated (§2.3's bound). Two representations of one fact on one wire shape is the drift
  this project refuses everywhere else; AC-06's label reads `bookings.length`. **minor** (§6.2, F5).
- **No `404` on the preview, stated rather than omitted.** Adding one costs a second query on
  `user_profiles` for a case AC-05 does not describe, and the `POST` is the arbiter regardless —
  US-019/AC-08's rule, *"the count is a prediction, the server is the rule"*. Put that sentence in
  the method's docblock so the absence reads as a decision (§6.2, F7).

### 3.4 The route — no new error code, no wire change on success

```ts
router.post('/users/:id/deactivate', …)
  → userIdParamsSchema (reused verbatim), no body — the verb sub-resource shape
    `/desks/:id/deactivate` established (`api-standards.md`)
  → requireActingAdmin(req) for `cancelled_by` — ATTRIBUTION only, `/bookings/:id/cancel`'s precedent
  → blocked   → unprocessable(ERROR_CODES.last_active_admin, …)  — no `details` payload (US-024 D-03)
  → not_found → notFound(ERROR_CODES.user_not_found, …)
  → 200 outcome.account  — `adminUserSchema`, the SAME body the role route returns
```

**The `200` body carries no `cancelledCount`, and that is deliberate**: AC-13's toast states that the
person can no longer sign in and carries no number, and AC-06's count came from the preview. Adding
one would put a number on the wire for copy nobody approved. Step 1's *"no new error code"* holds
exactly because of §2.2's `already_inactive` decision.

### 3.5 The proof

**Unit fakes** (`users.repository.spec.ts`) — the fake already records calls and takes
`{ code?, message }`; extend it with `rpc`. Five cases, one of which is a negative:

| Fake response | Expected | Proves |
| --- | --- | --- |
| `{ data: { outcome: 'ok', profile, cancelled_bookings: [3 rows] }, error: null }` | `ok`, 3 rows; the recorded args are **exactly** `{p_target_id, p_actor_id, p_now, p_today}` | AC-02, and that the four argument names are what is sent |
| `{ data: { outcome: 'not_found' }, error: null }` | `not_found` | the 404 branch |
| `{ data: { outcome: 'already_inactive', profile }, error: null }` | `already_inactive` | §2.2 |
| `{ data: null, error: { code: 'Z0011', message: 'BR-001.11: …' } }` | `blocked` | AC-10's mapping |
| `{ data: null, error: { code: 'P0001', message: 'BR-001.11: this change would leave the office with no active administrator' } }` | **throws** | the negative that matters: we match the **code**, not the prose. This is the test a reviewer should be able to break on purpose |

**Gated real Postgres** (`admin.concurrency.spec.ts`, `RUN_BOOKINGS_CONCURRENCY_TEST=1`). Step 2a's
three cases are well chosen. **Add a fourth, and it is the one that proves what is new here:**

> **Two active admins, both the last two, both holding upcoming bookings, deactivated via
> `Promise.all`.** Assert exactly one `ok` and one `blocked`; assert the loser's account is still
> `is_active` **and every one of the loser's bookings is still `confirmed`**; assert exactly one
> active admin remains.

That single case proves three separate assumptions at once: the trigger fires from inside a
function, the advisory lock still serialises across the RPC path, and the abort rolls back the
**bookings** writes — which no other test in either story reaches. **Also assert the raw
`.rpc()` error's `code === 'Z0011'` directly** in case 1, as `setRole`'s case 1 does for the table
path: the `/rpc/` route through PostgREST is a different code path and inherits nothing from that
proof (§8 C5). Reuse the file's existing `activeAdminIds`/`demote`/`restore` device and its
snapshot-before-fixtures discipline verbatim — its docblock explains why, and this story's fixtures
raise the identical hazard.

---

## 4. Concurrency (the question the task asks in item 5)

### 4.1 Two concurrent deactivations — already closed, by ADR-013, not by this story

Two transactions deactivating two *different* active admins is US-024's write-skew case with
`is_active` substituted for `role`. The trigger's `WHEN` clause fires for both, `pg_advisory_xact_lock
(1001011)` serialises them, the second re-reads under a fresh snapshot and is refused. **Nothing new
is needed**, and ADR-013 Decision item 4 said so before this story existed. What *is* new is that the
abort now has to roll back a second table's writes, which §3.5's new case proves.

**Calling the function inside a wider transaction does not arise.** PostgREST gives every request its
own transaction; no code path in this system composes two writes into one, the property US-019 §6
recorded and nothing has changed since. The function is a transaction, not a participant in one.

### 4.2 The NFR-009 "open question" is mostly already answered — and the package says otherwise

`spec.md`'s Out-of-scope bullet and `decisions.md`'s open item both present *"does a live session
survive its own account's deactivation"* as open. **`apps/api/src/http/middleware/require-session.ts`
step 3 already answers it**, on every request, on every route except sign-out:

> *"no profile, or `is_active = false` → `401 account_inactive`"* … *"REQ-005 biting here rather than
> at token expiry is what makes deactivation take effect immediately on a live session. That is also
> the de facto answer to `db-design.md` open question 3, which is still formally open and the PO's to
> confirm."*

So a deactivated person's session is refused at its **next request**. What actually remains open is
much smaller, and the human should be asked the smaller question:

1. **Formal confirmation of `db-design.md` open question 3** — the behaviour is shipped; the PO has
   not signed it off. That is a Gate 1 tick, not delivery work.
2. **The browser's in-memory state** between the flip and that next request — nothing is pushed to
   the deactivated person's open tab. `spec.md`'s Out of scope is right about this and should say
   *only* this.

**Correct both files** (§8 C9). Presenting a shipped, commented, tested behaviour as an open question
costs the human a decision they have already effectively made, and hides the one they have not.

### 4.3 The one genuinely new residual: a booking can outlive its owner's deactivation

Reachable, small, and not closed by anything in this design:

| | T1 — deactivate P | T2 — P books desk D for tomorrow |
| --- | --- | --- |
| 1 | | passes `require-session` (P is still active) |
| 2 | `UPDATE user_profiles … id = P` → committed-to-be | |
| 3 | cascade `UPDATE bookings … user_id = P …` takes its snapshot | |
| 4 | | `INSERT` into `bookings` **commits** |
| 5 | `COMMIT` | |

T2's row is a **phantom**: an `UPDATE`'s predicate does not lock rows that do not yet exist, and a
booking insert never touches `user_profiles`, so advisory key `1001011` never sees it. The result is
exactly BR-001.18's harm — a leaver holding a desk nobody notices — and P can no longer cancel it
themselves (§4.2).

- **Window:** milliseconds, and only for a person actively booking at the instant they are being
  deactivated.
- **Recovery:** an administrator cancels it through US-015. Detection is a one-line query.
- **Why not fix it here:** the only real closes are a `bookings`-side insert-time rule (a new trigger
  on a table this story does not own, enforcing an invariant no AC states) or routing booking inserts
  through the same advisory key (serialising every booking in the system to guard a millisecond).
  Both are new rules; BRD-001 states neither.
- **What to do:** one bullet in the migration's closing comment and in `users/README.md`, and
  **open item 2** for the human. Named residuals are how `0004` handled its own `DELETE` hole.

---

## 5. What this story must NOT build

- **No second trigger**, and no `raise` in the new migration (§2.8, D-04, ADR-013 follow-up 2).
- **No `EXCEPTION` block** in the function, and specifically no `when others` (§2.8). **blocker.**
- **No application-side admin count** on any path — not as a pre-check, not for a friendlier message,
  not to disable a control. ADR-013 Decision item 6; a diff adding one is a review finding.
- **No booking count consulted before the write.** AC-04's inverse of `deactivateDesk` is structural:
  `DeactivateAccountOutcome` has no kind to express it.
- **No server-side self-deactivation block** — that would invent a rule BRD-001 does not have
  (US-019/AC-09's own argument). The UI question is §6.2 F13's, and it is the human's.
- **No `role`, `must_change_password`, `push_opt_in` or `last_seen_at` write** on `user_profiles`.
- **No restoration path.** RISK-011: the cancellations are irreversible, and US-026 does not undo
  them.
- **No change to `http/app.ts` or `http/middleware/**`** — AC-14 is inherited; a diff there is a
  review finding.
- **No `details` payload on the `422`** (US-024 D-03, unchanged).
- **No new error code, and no `cancelledCount` on the wire** (§3.4).
- **No notification code, no `modules/notifications` file, no mail dependency** (D-01, issue #59).
- **No `data-refresh.ts` change** — this screen is not on it, as US-019 through US-024 each recorded.

---

## 6. Advisory review of the package

Proportionate: the surrounding design is well-precedented and low-risk, and most of it is right. The
findings concentrate where the mechanism is new.

### 6.1 `decisions.md`

- **D-01 (scope move to US-029/US-032) — endorsed, no change.** The `aidlc-check` argument is
  correct, the change-request is filed, and the story file carries the note. This is the honest
  route, and it is the one US-024's own D-01 hole should have taken.
- **D-03 (a single Postgres function, not compensation) — endorsed, and it is the best entry in the
  file.** The distinction from ADR-011/ADR-012 — *a transaction is actually available here* — is
  exactly right and worth one sentence in the PR.
- **D-04 (no new trigger) — endorsed, now with the walkthrough it was asserting** (§2.4).
- **D-02 — right conclusion, weaker of the two available arguments. minor (F12).** D-02 justifies
  writing `bookings` from a `users`-owned path with *"the write happens inside a Postgres function,
  not a second TypeScript import"*. That satisfies `eslint.config.mjs` but not **ADR-004's** actual
  rule, which is about SQL and not imports: *"Only the table's owning module may INSERT, UPDATE or
  DELETE it."* The real justification already exists and is stronger:
  `app-architecture.md` §2 granted the exception in writing before any code existed — *"`users` owns
  the deactivation cascade, not `bookings`. BR-001.18 makes cancelling the leaver's desks part of
  deactivating the account — one act, one transaction, refusable as a whole"* — and
  `modules/users/README.md` already quotes it. **Cite §2; drop the "inside a function" argument.**
  Then: `modules/bookings/README.md` currently states that `bookings` is written *"from **two**
  objects as of US-015"*, which this story makes false. Both READMEs must record that this one path
  writes `bookings` from outside `modules/bookings`, so a reviewer hunting a stray write finds the
  note instead of a violation. **`modules/bookings/README.md` is missing from Step 8.** No ADR-004
  amendment is needed — the exception predates it in the architecture.

### 6.2 `spec.md`, `implementation-plan.md`, `impact-analysis.md`

| # | Rating | Finding |
| --- | --- | --- |
| **F1** | **blocker** | **The migration must `revoke execute … from public, anon, authenticated` and `grant` it to `service_role`** (§2.7). The first HTTP-reachable database write in a system whose posture is "every rule is enforced in Express". It fails closed today only because of deny-all RLS; that makes it survivable, not acceptable |
| **F2** | **blocker** | **No `EXCEPTION` block in the function** (§2.8). Catching `Z0011` in a subtransaction would roll back to a savepoint and return a "clean" answer with the refusal gone — AC-10 and AC-12 both silently lost |
| **F3** | **major** | **Step 2/Step 3 have nowhere to put "already inactive"** (§2.2). As sketched it becomes `not_found` → `404 user_not_found`, whose approved copy is false about an account on screen. Four repository kinds, three service outcomes |
| **F4** | **major** | **`apps/api/src/composition.ts` is missing from `impact-analysis.md`** (§3.2). `UsersServiceDeps` gains `officeTimezone`; `composition.ts:117-121` and every `createUsersService` call in `users.service.spec.ts` change. US-024's `use-users.ts` finding, recurring |
| **F5** | **major** | **`spec.md`'s Out-of-scope bullet and `decisions.md`'s open item misstate the NFR-009 residual** (§4.2). `require-session.ts` step 3 already refuses a deactivated account's live session at its next request, and says so in a comment. Correct both, and put the narrower question to the human |
| **F6** | **major** | **Step 2a is missing the case that proves what is new**: two concurrent deactivations of the last two active admins, asserting the loser's bookings are all still `confirmed` (§3.5). Without it, nothing proves the trigger fires from inside the function or that the abort reaches the second table |
| **F7** | **minor** | **`deactivationPreviewSchema`'s `count` duplicates `bookings.length`** on an unpaginated payload (§3.3). Drop it |
| **F8** | **minor** | **FR-12 and the plan disagree about the return shape** — FR-12 says *"desk number, date, that the source was `deactivation_cascade`"*; Step 2/`impact-analysis.md` say *"(id, desk id, booking date)"*. Settle on §2.3's five keys: a uuid is not composable copy, and the join costs nothing at ≤ 23 rows |
| **F9** | **minor** | **The preview has no `404`, and the plan does not say so** (§3.3). Recommend leaving it out and documenting why, per US-019/AC-08's rule |
| **F10** | **minor** | **The preview's count can drift from what the cascade actually cancels** — a booking made between the preview and the confirm. AC-06's label is a *prediction*; no copy change is needed because AC-13's toast carries no number, but the success path must never restate the preview's count. One sentence in the dialog hook's docblock |
| **F11** | **minor** | **Step 8 should add `apps/api/src/modules/bookings/README.md`** (§6.1, F12) |
| **F12** | **minor** | **D-02's rationale** — cite `app-architecture.md` §2's written exception, not "inside a function" (§6.1) |
| **F13** | **minor** | **Self-deactivation is undesigned.** BR-001.11 guards the count, never the identity, so an admin who is not the last one *can* deactivate themselves — and `require-session.ts` will then refuse their very next request, bouncing them to SCR-001 mid-flow, moments after AC-13's toast. The server should **not** block it (that would invent a rule). Whether SCR-008's row menu should suppress Deactivate on the acting admin's own row, or the dialog should carry an extra sentence, is copy nobody approved → **open item 3**, not a delivery decision. One incidental confirmation: when it happens, `cancelled_by` equals the booking's own `user_id`, which `0003_bookings.sql:18-21` already anticipated by telling the composer to key on `cancellation_source` and *"never on comparing ids"* |
| **F14** | **nit** | **`users/README.md` (Step 8)** should record: the RPC's four argument names as a wire contract, the `revoke`/`grant`, the overload rule, the `STABLE`-under-PostgREST trap, and §4.3's stranded-booking residual. It is where US-026 and US-029's authors will be standing |
| **F15** | **nit** | **Step 5** should state that `requireActingAdmin` **is** used here and why, given US-024's route deliberately did not — so the asymmetry reads as a decision |

**Everything else is sound.** In particular: the verb sub-resource with no body is right
(`api-standards.md`); `422`, not `409`, for the refusal is right; FR-03's *"the `WHERE` clause on the
write, not a post-filter"* is exactly the right instruction; the Rollback section is accurate (one
new function, nothing existing touched); `markDeactivated` moving `deactivated` **only** — and the
impact analysis's explicit note that it is *not* `markRoleChanged`'s shape — is correct and is the
sort of thing US-024's note had to find the hard way.

---

## 7. No new ADR — and why that is the finding, not the absence of one

`ai/roles/architect.md`'s bar is *"a real trade-off with a rejected alternative"*, and the charter is
explicit that executable contracts — migrations, the OpenAPI document — carry ordinary decisions
without ceremony. Applying it honestly:

- **The concurrency mechanism is decided, by ADR-013**, which names US-025 in its own Decision item 4
  and its follow-up 2 (*"US-025 and US-026 cite this ADR by name in their design notes and add no
  trigger"*). This note does exactly that. Re-minting it would be the duplication ADR-013 exists to
  prevent.
- **The single-function-versus-compensation choice is already decided too**, by ADR-011/ADR-012's
  own scope: those exist because two *separate systems* have no shared transaction. Here one database
  does. `decisions.md` D-03 is the right home for a choice whose alternatives are ruled out by
  existing ADRs rather than weighed against them.
- **Writing `bookings` from a `users`-owned path** looks like an ADR-004 question and is not: the
  exception was granted in writing by `app-architecture.md` §2 before any code existed (§6.1).
- **The RPC's return shape, the four outcomes, the parameter list, the grants** are the migration —
  an executable contract, carrying ordinary decisions, exactly what the charter says should not mint
  an ADR.
- **§4.3's residual is an open question, not a decision.** Nothing is being chosen between viable
  alternatives; a gap is being named and routed to the human, because closing it needs a requirement
  that does not exist.

Say "no ADR needed, here is where the code goes" when that is the truth. It is.

---

## 8. Constraints the implementation must satisfy

| # | Constraint | Severity |
| --- | --- | --- |
| C1 | The migration **revokes** `execute` from `public, anon, authenticated` and **grants** it to `service_role`, in the same file (§2.7) | **blocker** |
| C2 | The function has **no `EXCEPTION` block** and **no `raise`** of its own; `Z0011` propagates from `0004`'s trigger, uncaught (§2.8) | **blocker** |
| C3 | The function is **`VOLATILE`** (unmarked) and **`SECURITY INVOKER`** (unmarked) — never `STABLE`/`IMMUTABLE`, never `DEFINER` (§2.6, §2.7) | **blocker** |
| C4 | `p_now` and `p_today` are **parameters**, both derived from **one** service `nowMs()` reading; no `now()`, `current_date` or `current_timestamp` appears in the function (§2.1) | **blocker** |
| C5 | The gated block lands with §3.5's **concurrent-deactivation case** (loser's bookings all still `confirmed`) and a **raw `.rpc()` error assertion** that `code === 'Z0011'` (§3.5) | **blocker** |
| C6 | `deactivateAccount` matches `error.code === LAST_ACTIVE_ADMIN_SQLSTATE` **only** — the existing constant, no second declaration, no message match — and throws on everything else including `PGRST202` (§3.1) | **blocker** |
| C7 | `0004_last_active_admin_guard.sql` is **byte-for-byte unchanged**, and the new migration states that its single-row-per-statement lock-ordering precondition was checked and holds (§2.4) | **blocker** |
| C8 | The repository reports four kinds; the **service** collapses `already_inactive` to `ok` with `cancelledCount: 0` and a `logger.warn` (§2.2, §3.2) | **major** |
| C9 | `UsersServiceDeps` gains `officeTimezone`; `apps/api/src/composition.ts` is added to `impact-analysis.md`'s Files table and updated (§3.2) | **major** |
| C10 | `spec.md`'s Out-of-scope bullet and `decisions.md`'s open item are corrected to the narrower NFR-009 residual `require-session.ts` actually leaves (§4.2) | **major** |
| C11 | The function takes **no** status parameter; `status = 'confirmed'` is a literal whose other half is named in the comment, and Step 2a case 2 proves they agree (§2.1) | **major** |
| C12 | No pre-check precedes either write; the classifying `select` runs **only** on the `UPDATE`'s miss (§2.3) | **major** |
| C13 | The cascade's aggregation uses `WITH … SELECT … INTO`, never an assignment from a scalar subquery — a data-modifying CTE is legal only at statement top level (§2.3) | **major** |
| C14 | §4.3's stranded-booking residual and §2.7's overload rule are written into the migration's closing comment (§2.7, §4.3) | **major** |
| C15 | `deactivationPreviewSchema` drops `count`; the preview's missing `404` is documented as a decision (§3.3) | **minor** |
| C16 | `cancelled_bookings` carries `id, desk_id, desk_number, booking_date, cancellation_source`, ordered by date then desk number; FR-12 and `impact-analysis.md` are reconciled to that (§2.3, F8) | **minor** |
| C17 | D-02's rationale cites `app-architecture.md` §2; Step 8 adds `modules/bookings/README.md`, which currently says `bookings` is written from exactly two objects (§6.1) | **minor** |
| C18 | `users/README.md` records the four argument names, the grants, the overload rule, the `STABLE`-under-PostgREST trap and §4.3's residual (F14) | **nit** |
| C19 | Step 5 states that `requireActingAdmin` **is** used here, deliberately unlike US-024 (F15) | **nit** |

---

## 9. Open items for the human

| # | Item | Owner |
| --- | --- | --- |
| 1 | **§2.2.** The `already_inactive` collapse to `ok`. The alternative is a `409 account_already_inactive` matching `booking_already_cancelled`'s precedent, which needs a new error code and an SCR-008 state — a Gate 1 round trip for a millisecond race. Confirm the collapse, or send it to Gate 1 | Joy Joshua |
| 2 | **§4.3.** A booking inserted in the milliseconds around the cascade can survive its owner's deactivation — BR-001.18's own harm, through a phantom no lock in this design can see. Closing it needs a `bookings`-side rule BRD-001 does not state. Confirm the residual is accepted and named | Joy Joshua |
| 3 | **§6.2 F13.** Self-deactivation. The server permits it (BR-001.11 guards the count, not the identity) and `require-session.ts` will bounce the administrator to sign-in on their very next request, moments after AC-13's toast. Should SCR-008 suppress Deactivate on the acting admin's own row, or say something? That is copy nobody approved | Joy Joshua / UX |
| 4 | **§4.2.** `db-design.md` open question 3 — *"does deactivation end a live session"* — is **shipped** and commented but never formally confirmed. A Gate 1 tick, not delivery work | Joy Joshua / BA |
| 5 | **§2.7 / §3.5.** That a custom SQLSTATE survives PostgREST's `/rpc/` path into `error.code` is **not verifiable from this environment** — it is a different code path from the table write US-024 proved. Until the gated suite runs against a real project, `blocked` on this route has a unit-test proof and no integration one | DEV |
| 6 | **Header.** SCR-008 ST-05 / ST-06 / ST-07 were **not** read off the Figma frames by this note's author — the Figma connector is unauthorized in this session. The two-shaped confirmation, the individually-listed bookings and the counted action label are taken from the story text and `spec.md`. Confirm against the real frames before the dialog is built | **resolved — see `change-log.md`.** DEV read the real frames (node-ids 252-1291/1354/1394, 252-1466/1508/1548, 252-1605/1689/1750) after this note landed; they match this note's and `spec.md`'s wording exactly, no discrepancy |

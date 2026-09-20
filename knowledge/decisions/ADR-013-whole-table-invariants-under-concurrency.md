# ADR-013 — Enforcing a whole-table invariant under concurrency

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-20                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-024; US-025, US-026 (forecast)                                        |
| **Amends**  | `inception/architecture/db-design.md` §3 — "The one rule that needs a trigger" |

## Context

BR-001.11 says an office must never be left with zero accounts that are both `is_active` and
`role = 'admin'`. It is the only rule in this product that is a **predicate over a whole table**
rather than a property of one row, which is why `db-design.md` §3 could not express it as a `CHECK`
or an index and reached for a trigger instead.

That section also states the threat correctly:

> *"two admins deactivating each other in the same instant would both read 'two active admins' and
> both proceed… the rule is additionally a constraint trigger on `user_profiles`, fired after any
> change to `role` or `is_active`, which raises if no active admin remains."*

**The shape it proposes does not close the case it names.** Two transactions demoting two
*different* admin rows lock different rows, so neither blocks the other. Each one's check runs
inside its own transaction and sees its own row demoted and the other still an admin. Both pass.
Both commit. Zero active admins, and nobody left who can undo it.

This is **write skew**: a conflict on a predicate rather than on a row. PostgreSQL permits it at
`READ COMMITTED` and at `REPEATABLE READ`; only `SERIALIZABLE` detects it. All database access in
this product goes through PostgREST on the service-role key (ADR-001), which gives the application
no per-request isolation control and no transaction boundary of its own — every repository call is
its own implicit transaction.

So the question this ADR answers is not *"where does BR-001.11 live"* — `db-design.md` settled that,
correctly, at the database. It is **"what makes a whole-table check correct when two writers cannot
see each other"**, and every story that flips `role` or `is_active` inherits the answer: US-024 now,
US-025 and US-026 next, the latter through `app-architecture.md` §4.2's cascade.

## Decision

**We will enforce BR-001.11 with a plain `AFTER UPDATE … FOR EACH ROW` trigger on `user_profiles`
that takes a transaction-scoped advisory lock as its first statement, before evaluating the
invariant — and we will narrow the trigger, with a `WHEN` clause, to the only transition that can
break the rule.**

Concretely:

1. **The invariant is serialised by `pg_advisory_xact_lock(1001011)`, taken first.** Only one
   transaction at a time may be in the act of removing an active admin. The second waits, then
   re-reads under a fresh snapshot and is correctly refused. Without it the trigger is decorative
   in exactly the scenario it was written for.
2. **`_xact_`, never the session-scoped form.** Supabase's pooler runs in transaction mode; a
   session-scoped advisory lock would outlive the request on a pooled backend and eventually
   deadlock the application permanently. This is a correctness constraint, not a preference.
3. **A plain trigger, not a `CONSTRAINT TRIGGER … DEFERRABLE`.** Deferral narrows the write-skew
   window without closing it, so it is not what makes the rule safe and must not be believed to be.
   What it would additionally buy — a single transaction that demotes before it promotes — is not
   reachable through PostgREST, and the ordering constraint it would relax ("promote somebody
   first") is the product's own approved remedy (US-024/AC-05).
4. **The trigger fires only on `old.is_active and old.role = 'admin' and not (new.is_active and
   new.role = 'admin')`.** Promotions, reactivations, and changes to already-deactivated accounts
   never fire and never take the lock. This is not an optimisation for its own sake: it is what makes
   US-024/AC-07 ("a deactivated admin does not count") and AC-12 ("a deactivated person's role can
   still be changed") **structural** rather than conditional logic somebody has to get right.
5. **The refusal is signalled by a project-minted SQLSTATE, `Z0011`**, matched by the repository on
   `error.code` alone. `Z0` is in the SQL standard's implementation-defined range and is used by
   neither PostgreSQL nor PostgREST. The raised message is for logs and is never matched on, so it
   stays editable.
6. **No application-side count, on any path.** `db-design.md` §3 already rejected it as the sole
   mechanism; this ADR extends that to a prohibition on a *supplementary* one. A pre-check would be a
   second statement of one rule that can disagree with the first, and the screen cannot predict the
   refusal anyway — the people list's admin count includes deactivated admins, and BR-001.11's does
   not.
7. **The proof is a gated real-Postgres test, not a fake.** A recording fake can be *told* that
   Postgres raised; it cannot discover whether Postgres *would have*. Two simultaneous demotions of
   two active admins must leave exactly one, asserted against a real database, in
   `apps/api/src/modules/admin/admin.concurrency.spec.ts` under the existing
   `RUN_BOOKINGS_CONCURRENCY_TEST=1` gate. That test fails against the trigger `db-design.md` §3
   describes and passes against this one, which is the whole reason it must exist.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **A count-and-raise trigger with no serialisation — `db-design.md` §3 as written** | Simplest possible; reads correctly; passes every test a fake client can express | Permits write skew in exactly the "two admins demoting each other" scenario the section itself names. The failure is rare, silent, and locks an organisation out of its own administration with no in-product recovery | It does not enforce the rule it is written to enforce. Named first because it is what a reviewer will expect to see |
| **`CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`** | The phrase "constraint trigger" is what `db-design.md` §3 asks for; feels more rigorous; allows demote-then-promote inside one transaction | Deferring to COMMIT shortens the window but does not close it — a deferred check still runs before its own commit is visible to the other transaction. It would therefore look like the fix while not being one, which is worse than not trying | The most dangerous option on this list, because it is plausible and wrong. It is not an alternative to the lock; with the lock it is merely redundant |
| **`SELECT … FROM user_profiles WHERE is_active AND role = 'admin' FOR UPDATE` inside the trigger** | No advisory lock; uses ordinary row locking; intuitively "locks the thing being checked" | Two concurrent demotions each lock the row the other is updating, in opposite order — a **deadlock**, resolved by PostgreSQL aborting one with `40P01`. Correct by accident, and the survivor's partner gets a generic serialisation error instead of US-024's refusal, so ST-09 never renders. It also cannot lock the *absence* of rows, which is the actual phantom | The right outcome reached through an error the product cannot explain to an administrator |
| **`SERIALIZABLE` isolation on the writing transaction** | The textbook answer; PostgreSQL detects write skew natively; no lock to reason about | Not reachable: PostgREST opens the transaction and this application cannot set isolation per request (ADR-001). Setting it database-wide would impose serialisation-failure retry handling on every read in the product, which nothing is written to do | Not available. A fact about the infrastructure, as ADR-011 recorded for the absence of a distributed transaction |
| **`LOCK TABLE user_profiles IN EXCLUSIVE MODE` inside the trigger** | Unambiguous; no key registry to maintain | Blocks all concurrent writers to the table, including US-023's unrelated name/email corrections, and cannot be taken before the statement's own row lock — so it raises the same lock-ordering hazard with a much wider blast radius | The advisory lock gives the same serialisation scoped to the one transition that needs it |
| **Enforce it in the Express service with a count-then-write** | No trigger; testable with the existing fakes; no migration | The race is between two *requests*, which no single request can see. `db-design.md` §3 rejected this on exactly these grounds before any code existed, and nothing has changed | Rejected before this ADR, and re-rejected here as a supplement (Decision item 6) |
| **A `deactivated_admins`-style sentinel row or a counter table, locked on every write** | Turns the predicate into a single row, so ordinary row locking suffices | A second place the same fact lives, able to disagree with `user_profiles`; needs its own backfill, its own migration, and its own trigger to stay true. `db-design.md` refuses derived storage throughout (ADR-007's reasoning, applied to a different fact) | Denormalisation to buy a lock this product can take directly |

## Consequences

**Easier.** US-025 and US-026 inherit a guard that is already correct for `is_active` flips in both
directions and need **no second migration** — the risk `US-024/impact-analysis.md` names as medium is
closed by Decision item 4, not merely mitigated. AC-07 and AC-12 need no application code at all, so
the two acceptance criteria most likely to be got wrong cannot be got wrong in TypeScript.

**Harder.** This project now has a lock key registry, kept in `0004_last_active_admin_guard.sql`'s
own comment, that a future advisory lock must read before choosing a number. It also has one
non-obvious correctness dependency with no test behind it: marking the trigger function `STABLE`
would silently restore the hole. Both are written into the migration where the next author will be
standing.

The invariant is enforced in a place unit tests cannot reach, so **the gated real-Postgres suite
becomes load-bearing** rather than supplementary. A CI run without `RUN_BOOKINGS_CONCURRENCY_TEST=1`
proves the *mapping* and not the *rule*, and the PR must say so.

`db-design.md` §3's *"constraint trigger"* is superseded by this ADR. Per `ai/roles/architect.md` the
Inception architecture is a starting shape and the migration is now the source of truth for this
rule; `libs/contracts/src/error.ts`'s `last_active_admin` comment is corrected in the same PR.

**Follow-up work created.**

1. `apps/api/src/modules/users/README.md` records the lock, the `DELETE` residual, the SQLSTATE, and
   the distinction between the people list's admin count and BR-001.11's.
2. US-025 and US-026 cite this ADR by name in their design notes and add **no** trigger.
3. If a second whole-table invariant ever appears, it takes its own advisory key from the registry
   and cites this ADR rather than re-deriving it.

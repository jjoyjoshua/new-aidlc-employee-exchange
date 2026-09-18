# ADR-004 — Table ownership: a module may read another module's tables, only the owning module writes them

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-18                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-006 (see desk availability); binds REQ-011 (admin bookings list), REQ-031 (desk filter), BR-001.9 (blocking count) and any later story that reads across module lines |

## Context

`app-architecture.md` §3 gives five modules over five tables, with the rule "no module imports
another module's **service**; they go through `domain/` or a declared port." That rule constrains
**imports**. It says nothing about which module may issue **SQL** against which table, and until
US-006 nothing forced the question: every prior story's queries stayed inside their own module's
table.

US-006's availability read is the first to cross the line. `GET /api/bookings/availability?date=`
lives in the `bookings` module (`app-architecture.md:88` names it there by the endpoint it owns),
but answering it requires reading `desks` — a table `bookings` does not own and never writes. The
same shape recurs immediately in already-approved requirements that have not been built yet:
REQ-011's admin bookings list joins `bookings`, `user_profiles` and `desks`; REQ-031 filters
bookings by desk; BR-001.9's blocking count is a `bookings` aggregate read from inside the `desks`
module's deactivation check. Five tables and five modules, with no one-to-one mapping between them,
means this question recurs by construction, not by coincidence.

Left unanswered, each story would improvise its own answer, and the first inconsistency would
surface as a "consolidation" PR arguing after the fact over code nobody meant as a decision.

## Decision

**A module's repository may `SELECT` from another module's tables, using an explicit column list.
Only the table's owning module may `INSERT`, `UPDATE` or `DELETE` it.**

- Each module's `README.md` states which tables it **owns** (may write) and which it **reads**
  (may only select from).
- A cross-module `SELECT` always names its columns explicitly — never `select *` — so a read
  cannot silently widen into a column the owning module considers private (US-006 design note §2.5
  applies this to keep booking's occupant identity out of the availability read).
- `bookings.repository.ts` reads `id, desk_number` from `desks`; desk inventory writes stay
  exclusively inside `modules/desks` once US-015/US-017 build it.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **Declared cross-module read port** (`modules/desks` exposes `listActive()` for `bookings` to call) | Keeps all access to a table behind its own module's code; looks like a clean service boundary | Reintroduces exactly the dependency web `app-architecture.md` §3's import rule exists to prevent — REQ-011's one screen would need ports into two or three modules, and each port becomes a read shaped for whichever caller asked for it first, not for the actual reader | The problem this ADR solves is reads, not service coupling; a port converts a read into an import dependency for no protection gained |
| **One shared repository layer over all tables** | A single place to look for any query | Becomes the place every module's rule eventually leaks into, once two callers of the same query want slightly different behaviour | Dissolves the module boundary `app-architecture.md` §2 exists to keep rules findable in one place |
| **A database view per cross-module read** | Read logic lives in the database, not duplicated per caller | Migration churn per screen; `db-design.md`'s `bookings_with_status` view is already shown (US-006 design note §1.3) not to be expressible as a plain view once a caller needs "today" in the predicate | Not a general answer, and adds schema surface for what is often a two-line query |
| **Read across, write within** (chosen) | No new dependency, no new file per read, matches how the two existing modules (`auth`, and now `bookings`) already touch `user_profiles`; the write boundary is what actually protects data integrity | Two files may now `SELECT` one table, which needs the column-list discipline to stay safe, and a reviewer must catch a write placed outside the owning module | — |

## Consequences

**Easier**

- A story that needs to read across two or three tables for one screen (REQ-011, REQ-031, BR-001.9)
  does so directly in its own repository, with no new port to design or wire.
- The one rule that actually protects data integrity — who may write a table — stays simple and
  reviewable: one module owns each table's writes, named in that module's `README.md`.

**Harder**

- More than one file can now `SELECT` the same table, so the explicit-column-list discipline is
  load-bearing, not a style preference — a reviewer refuses a cross-module `select *`.
- A reviewer must check that a write to a table always originates in its owning module; this ADR
  gives the rule but not an automated enforcement (no lint rule exists for it yet).

**Follow-up work created**

1. `apps/api/src/modules/bookings/README.md` and `apps/api/src/modules/desks/README.md` each state
   which tables they own and which they read, per this decision (US-006 design note §8).
2. When `modules/desks` is built (US-015/US-017), its README is where `desks` is first declared
   **owned**, and its write paths are the only ones a reviewer should accept for that table.
3. REQ-011's admin bookings list (a later story) inherits this rule rather than re-deciding it: it
   reads `bookings`, `user_profiles` and `desks` from its own repository, writing none of them.

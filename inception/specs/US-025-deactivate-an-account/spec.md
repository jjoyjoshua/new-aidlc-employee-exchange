# US-025 — Deactivate an account and release the desks it holds

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                    |
| ----------------- | ------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-025-deactivate-an-account.md`  |
| **Traces to**     | REQ-020, REQ-030, REQ-005, BR-001.11, BR-001.18, BR-001.20, V-11, V-17 |
| **Screen**        | SCR-008 — ST-05, ST-06, ST-07, ST-12, ST-13, ST-14, ST-15           |
| **Covering ADRs** | `ADR-013-whole-table-invariants-under-concurrency.md` — inherited unmodified (the existing trigger already covers `is_active`, migration `0004_last_active_admin_guard.sql`'s own comment says so). No new ADR — see `design-note.md` §7 |
| **Tier**          | Complex                                                            |
| **Status**        | implemented                                                        |
| **Updated**       | 2026-09-20                                                         |

## Problem

An administrator can create, edit and change the role of an account (US-021, US-023, US-024), but cannot revoke one. A leaver's account stays **Active** indefinitely, and any desk they are still holding on a future date sits reserved until somebody notices. This story adds the one remaining destructive write on `user_profiles`: deactivate, cascading into every one of that person's **Confirmed**, not-yet-past bookings so the desks return to the pool in the same act (BR-001.18).

**Scope decision (D-01, confirmed with the human 2026-09-20):** the story's original two criteria — a cancellation email per cancelled booking, and a push alert naming the office admin — have been **removed from the US-025 story file** and moved into US-029 and US-032 respectively, which already specify the identical behaviour and already cite this story by id (`US-029/AC-03`, `US-029/AC-04`, `US-029/AC-06`; `US-032/AC-02`, `US-032/AC-03`, `US-032/AC-09`) — restating them here was duplication of an already-owned requirement, not a second one. Filed as a Gate 1 change-request ([issue #59](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/59)). No notifications module exists yet (`apps/api/src/modules/notifications/README.md`: *"Empty until a story fills it"*), no mail or push library is installed, and the mail vendor is explicitly `TBD (owner: IT)` (`inception/architecture/app-architecture.md` §5.4 item 4) — building real sending inside this story would mean adding a new external dependency and secrets mid-story, a hard `STOP-and-ask` under `ai/context/task-classification.md`'s override table, for a capability that is US-029's and US-032's own scope to build. This story's cascade still returns each cancelled booking's desk, date and cascade-source flag so those two stories' triggers can compose their own copy without a second query; it sends nothing itself.

## Acceptance criteria in scope for this PR

AC-01 through AC-07, AC-10 through AC-14 — the whole of US-025's story file as it now stands. The manifest's `acs[]` for US-025 matches this set exactly (`aidlc-check` requires the two to agree).

## Functional requirements

| ID     | Requirement                                                                                                                                          | Priority | Serves        | Status      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ----------- |
| FR-01  | `GET /api/admin/users/:id/deactivation-preview` returns the account's **Confirmed** bookings dated today-or-later — desk number and date each. Read-only; changes nothing. No separate `count` field on the wire — the browser reads `bookings.length` (design note §3.3, C15) | Must     | AC-05          | implemented |
| FR-02  | `POST /api/admin/users/:id/deactivate` (no body) atomically, in one database transaction (a new Postgres function, `deactivate_account_cascade`): sets `user_profiles.is_active = false` and stamps `deactivated_at`, and cancels every one of that account's **Confirmed** bookings dated today-or-later (`cancellation_source = 'deactivation_cascade'`, `cancelled_by` = the acting admin). Four outcomes reach the repository — `ok`, `blocked`, `not_found`, and `already_inactive` (a race or a stale list, distinct from `not_found` because that refusal's approved copy would be false about an account that exists) — the service collapses `already_inactive` into `ok` (design note §2.2, §3.2, C8) | Must     | AC-01, AC-02, AC-04 | implemented |
| FR-03  | Past bookings, and bookings already **Cancelled**, are never touched by the cascade — the `WHERE` clause on the write, not a post-filter             | Must     | AC-03          | implemented |
| FR-04  | The existing BR-001.11 trigger (`0004_last_active_admin_guard.sql`) — unmodified, no new trigger — aborts the whole transaction if the target is the only active admin; the endpoint maps that refusal to `422 last_active_admin`, naming the consequence and routing to promotion | Must     | AC-10          | implemented |
| FR-05  | A cascade cancellation failing partway aborts the whole transaction — the account stays **Active** and every booking stays **Confirmed**; nothing reports partial success | Must     | AC-12          | implemented |
| FR-06  | The row-menu Deactivate confirmation renders one of two bodies depending on FR-01's preview: a **cancellation** body listing each booking (desk + date) individually, with the confirming action's own label carrying the count (*"Deactivate and cancel 3 bookings"*) | Must     | AC-05, AC-06   | implemented |
| FR-07  | When the preview returns zero qualifying bookings, a distinct, simpler confirmation is shown instead — no cancellation clause, no count, states that past bookings are kept | Must     | AC-07          | implemented |
| FR-08  | While the deactivate request is in flight, the row is not updated ahead of the result and Escape is suppressed; a failure that is not the BR-001.11 refusal leaves the account **Active**, every booking **Confirmed**, and states plainly that nothing changed | Must     | AC-11          | implemented |
| FR-09  | On success, the row's chip becomes **Deactivated** in place, the summary line's counts update, a transient message states that the person can no longer sign in, and focus returns to the row's overflow trigger | Must     | AC-13          | implemented |
| FR-10  | Only a caller whose session role is `admin` may reach either endpoint (inherited from the existing `requireAdmin` mount on `/api/admin`)              | Must     | AC-14          | implemented |
| FR-11  | A deactivated account cannot sign in — inherited from REQ-005/US-001/AC-04's existing check against `is_active`; this story adds no new sign-in code, only the write that flips the flag | Must     | AC-01          | implemented |
| FR-12  | The cascade's return value carries, per cancelled booking: id, desk id, desk number, booking date, and `cancellation_source` (read back from the row, never re-asserted) — enough for US-029/US-032's own triggers to compose their copy without a second query (design note §2.3, C16) | Should   | enables US-029/US-032 | implemented |

## Non-functional requirements

None new. V-07 (admin-only surfaces) is already carried by the `requireAdmin` mount; this story adds two new routes behind the same guard, not a new guard.

## Technical constraints

- **`modules/users` may not import `modules/bookings`** (`eslint.config.mjs` `MAY_IMPORT: { users: ['notifications'] }`). Both the preview read and the cascade write stay inside `modules/users`, reading and writing the `bookings` table **directly** — per **ADR-004** ("read across, write within"), the same rule `desks.repository.ts:100-120`'s `countUpcomingConfirmedForDesk` already exercises for a read. The cascade's *write* to `bookings` happens inside a single database function, never through a `modules/bookings` TypeScript import.
- **The cascade's atomicity (AC-12) is a real, single-transaction database write** — a new PL/pgSQL function (`supabase/migrations/0005_deactivate_account_cascade.sql`), invoked via `.rpc()`, not two separate repository calls orchestrated by application code. Unlike `createAccount`/`updateAccount` (Supabase Auth + `user_profiles`, two systems, ADR-011/ADR-012's compensation shapes), both writes here are the **same** Postgres database, which has real transactions — reaching for compensation instead would be strictly weaker.
- **No new trigger.** The existing `user_profiles_require_active_admin()` trigger (`0004_last_active_admin_guard.sql`) already fires on any `UPDATE OF role, is_active` and its own comment states it already covers this story's write. The new migration must not add a second guard.
- **`cancellation_source = 'deactivation_cascade'`** is already a reserved enum value (`0003_bookings.sql:18-22`) — no enum change needed.
- Both the preview (FR-01) and the cascade's write predicate (FR-02/FR-03) must compute "today" the same way `desks.service.ts:150-158` does for desk deactivation — `officeToday(nowMs(), officeTimezone)` / `displayStatusPredicate('confirmed', today)` (`apps/api/src/domain/booking-window.ts`, `booking-history.ts`) — never a raw `>= now()`, and never two separate readings that could straddle office midnight.
- `POST /api/admin/users/:id/deactivate` is a verb sub-resource with **no body** — the identical shape `/desks/:id/deactivate` already established (`ai/standards/api-standards.md`), not a `PATCH`.
- `cancelled_by` is attribution only, from `requireActingAdmin(req)` (`admin.router.ts`'s existing `/bookings/:id/cancel` precedent) — never an authorization check; `requireAdmin` at the mount is the sole authority over who reaches the router at all.
- **Migration SQL settled by the Architect design note** (`design-note.md`), after Gate D1 and before Step 2 is coded — the identical deferral `US-024/implementation-plan.md` Step 2 used for its trigger SQL. Constraints that carry forward from that note:
  - The function is the project's **first PostgREST `/rpc/` write**, which is reachable at a public URL with the browser's anon key by default. The migration **must** `revoke execute … from public, anon, authenticated` and `grant … to service_role` (design note §2.7, C1) — **blocker**.
  - The function has **no `EXCEPTION` block and raises nothing of its own** — the existing `Z0011` from `0004`'s trigger must propagate uncaught, or the whole point of using a real transaction for AC-10/AC-12 is lost (§2.8, C2) — **blocker**.
  - `VOLATILE` (unmarked) and `SECURITY INVOKER` (unmarked) — never `STABLE`/`IMMUTABLE` (PostgREST runs those in a read-only transaction and both writes fail) or `SECURITY DEFINER` (§2.6, §2.7, C3) — **blocker**.
  - `p_now`/`p_today` are **parameters**, both derived from one service `nowMs()` reading — never `now()`/`current_date` in SQL, which would use the database's own timezone instead of the office's configured one (§2.1, C4) — **blocker**.
  - The function takes **no status parameter** — `status = 'confirmed'` is a literal naming the state the write transitions *from*; a parameterised status would make re-cancelling an already-cancelled booking callable (§2.1, C11).
  - The cascade's row aggregation uses `WITH … SELECT … INTO`, never an assignment from a scalar subquery — a data-modifying CTE is only legal at a statement's top level (§2.3, C13).
- D-01's removal of the story's original notification criteria means this story's cascade returns the cancelled booking rows (id, desk id, desk number, booking date, cancellation source) from the RPC so US-029/US-032 can dispatch notifications without a second query — the shape is forward-compatible, but no notification code is written here.
- `UsersServiceDeps` gains `officeTimezone: string` (it currently has only `{ users, usersAuth, nowMs }`) — the first story to need it. This changes `apps/api/src/composition.ts` and every existing `createUsersService(...)` call in `users.service.spec.ts` (design note §3.2, C9).

## Out of scope

- The cancellation email and push alert for each cascade-cancelled booking — see D-01. Fully owned by US-029 and US-032, which already specify this exact behaviour and cite this story by id.
- US-026 (reactivate) and any restoration of cancelled bookings on reactivation — RISK-011 states cancellations are irreversible; nothing here or in a future US-026 undoes them.
- **Pushing a live update to the deactivated person's own already-open browser tab.** This is narrower than the story text's own framing: `apps/api/src/http/middleware/require-session.ts` step 3 already refuses **every** request from a deactivated account with `401 account_inactive`, so a live session is in fact ended at its very next request — this is shipped, commented code, not an open question (design note §4.2, C10). What is genuinely out of scope is the browser's in-memory state between the flip and that next request; nothing pushes an update into an already-rendered page. Formally confirming `db-design.md` open question 3 against this behaviour is a Gate 1 tick, not delivery work (`decisions.md`, open item).
- Notifying the deactivated person that their *own* account was deactivated — no such notification is specified in the story and none is invented.
- Any change to how the first administrator is seeded, or any BR-001.11-style limit other than "never zero" — BRD-001 states none.

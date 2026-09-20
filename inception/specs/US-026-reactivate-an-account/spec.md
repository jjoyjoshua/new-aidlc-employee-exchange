# US-026 — Bring a deactivated account back

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                    |
| ----------------- | ------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-026-reactivate-an-account.md`  |
| **Traces to**     | REQ-020, REQ-005                                                   |
| **Screen**        | SCR-008 — ST-14, ST-15 (the existing **Activate** row-menu item)   |
| **Covering ADRs** | `ADR-013-whole-table-invariants-under-concurrency.md` — inherited unmodified. `0004_last_active_admin_guard.sql`'s own closing comment states in writing that reactivation "can only increase the count" and fires no branch of the trigger. No new ADR |
| **Tier**          | Complex                                                            |
| **Status**        | draft                                                              |
| **Updated**       | 2026-09-20                                                         |

## Problem

An administrator can deactivate an account (US-025), but the **Activate** branch of the same row-menu item is still `aria-disabled` (`AccountRowMenu.tsx:37,238-249` — "the ACTIVATE branch of this same item (`!account.isActive`, US-026), stay `aria-disabled`"). There is no way to bring a deactivated account back without a database write done by hand. This story wires that branch to a real, admin-only write that flips `is_active` back to `true`, restoring sign-in without touching role, password state, or any cancelled booking.

## Functional requirements

| ID    | Requirement                                                                                                                          | Priority | Serves       | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01 | `POST /api/admin/users/:id/activate` (no body) sets `user_profiles.is_active = true` for the target account and returns the updated account | Must     | AC-01, AC-02, AC-03 | not started |
| FR-02 | The write touches only `is_active` and `updated_at` — never `role`, `deactivated_at`, `must_change_password`, or any `bookings` row  | Must     | AC-03, AC-04, AC-05 | not started |
| FR-03 | Zero rows matched → `404 user_not_found`, the same code every other admin user route already uses                                    | Must     | AC-07        | not started |
| FR-04 | Only a caller whose session role is `admin` may reach the route (inherited from the existing `requireAdmin` mount on `/api/admin`)   | Must     | AC-08        | not started |
| FR-05 | No confirmation dialog: activating is a one-click action from the row menu, matching the desk asymmetry (`/desks/:id/activate`, US-019/AC-09) | Must     | edge case    | not started |
| FR-06 | On success, the row's chip becomes **Active** in place, the summary line's `deactivated` count decreases by one, a transient message states the effect, and focus returns to the row's overflow trigger | Must     | AC-06        | not started |
| FR-07 | On failure, the account stays **Deactivated** and a page-level message states nothing changed, mirroring `desks.tsx`'s `activateFailedAlert` shape — no dialog exists for this action to fail inside | Must     | AC-07        | not started |

## Non-functional requirements

None new. V-07 (admin-only surfaces) is already carried by the `requireAdmin` mount; this story adds one new route behind the same guard, not a new guard.

## Technical constraints

- **No new migration.** `supabase/migrations/0004_last_active_admin_guard.sql`'s closing comment states explicitly: *"US-025 (deactivate) and US-026 (reactivate) need NO further migration... REACTIVATING an admin never fires (US-026) — it can only increase the count."* The existing `user_profiles_last_active_admin_guard` trigger is not touched.
- **Plain single-table `UPDATE`, not an RPC.** Unlike US-025's cascade, this write touches one row in one table with no cross-table effect, so it follows `setRole`'s shape (`users.repository.ts:341-352`) — a `.update().eq('id', id).select(...).maybeSingle()` — never a Postgres function.
- **`deactivated_at` is left untouched** (`D-01`, `decisions.md`). The column's own comment (`0001_user_profiles.sql:42-43`) reads "Audit: when REQ-020 last ran" — an audit trail of the *last deactivation*, not a state flag — so reactivation does not null it. Confirmed with the Architect design note before Step 1 lands.
- **No `requireActingAdmin`.** This write has no attribution column to fill (unlike US-025's `cancelled_by`) — the same reasoning `POST /users/:id/role` already applies (`admin.router.ts:236-237`).
- **`POST /api/admin/users/:id/activate` is a verb sub-resource with no body** — the identical shape `/desks/:id/activate` already established (`admin.router.ts:465-482`, `ai/standards/api-standards.md`).
- **No new error code, no new contract schema.** The response reuses `adminUserSchema` (`libs/contracts/src/users.ts:22`) exactly as `/role` and `/deactivate` already do; `userIdParamsSchema` is reused verbatim for `:id`.
- `modules/users` stays inside its own table for this write — no cross-module import, unlike US-025's read of `bookings`.

## Out of scope

- Restoring any booking the deactivation cascade cancelled — RISK-011 states cancellations are irreversible; this story does not touch `bookings` at all (US-025/spec.md's own forward statement).
- Notifying the reactivated person — no such notification is specified in the story.
- A confirmation dialog — the edge cases explicitly reject one, matching the desk asymmetry; if the PO wants one later, it is a one-line change flagged for their walkthrough.
- Any change to `deactivated_at`'s meaning or a formal decision between "audit of last deactivation" and "currently deactivated at" — flagged to the Architect and the PO in `decisions.md` D-01, not decided silently here.

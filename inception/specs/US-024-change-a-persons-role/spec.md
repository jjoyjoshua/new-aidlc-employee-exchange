# US-024 — Change a person's role

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                    |
| ----------------- | ------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-024-change-a-persons-role.md`  |
| **Traces to**     | REQ-022, REQ-004, BR-001.11, V-11                                  |
| **Screen**        | SCR-008 (row menu route), SCR-009 (edit form route)                |
| **Covering ADRs** | `ADR-013-whole-table-invariants-under-concurrency.md` — the Architect's design note found the architecture's own proposed trigger shape does not hold under concurrency (write skew) and settled the fix (a transaction-scoped advisory lock) |
| **Tier**          | Complex                                                            |
| **Status**        | implemented                                                        |
| **Updated**       | 2026-09-20                                                         |

## Problem

Today `user_profiles.role` can only be set at creation (`POST /api/admin/users`, US-021). There is no way to change an existing account's role afterward, and nothing in the system enforces BR-001.11 ("never zero active admins") for either a role change or a deactivation — the architecture names it as a database constraint trigger (`db-design.md` §3) but no migration has added it yet. The row menu on SCR-008 already renders a disabled **Make an admin** / **Make an employee** item reserved for this story (`AccountRowMenu.tsx`, ADR-010), and SCR-009's edit form already disables its role radios with a note naming this story as what makes them "savable" (`copy.ts:152-159`). This story makes both live, adds the write endpoint, and adds the trigger both this story and the later deactivation story (US-025) depend on.

## Functional requirements

| ID     | Requirement                                                                                                                                          | Priority | Serves        | Status      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ----------- |
| FR-01  | `POST /api/admin/users/:id/role` sets `user_profiles.role` to the requested value (`employee` \| `admin`)                                              | Must     | AC-01          | implemented |
| FR-02  | A database trigger on `user_profiles`, fired only on a write that removes an active admin (`old.is_active and old.role = 'admin' and not (new.is_active and new.role = 'admin')`), raises if it would leave zero active admins — serialised against concurrent writes by a transaction-scoped advisory lock (`ADR-013`), never a count read earlier in the request and never merely "evaluated at write time" (that shape permits write skew: two concurrent demotions of two different admins can both pass) | Must     | AC-04, AC-07  | implemented |
| FR-03  | The endpoint maps the trigger's rejection to a distinguishable `422 last_active_admin` refusal, never a generic `500`                                  | Must     | AC-04          | implemented |
| FR-04  | The row-menu role action opens a confirmation naming the effect in whichever direction applies — a promotion states what is gained, a demotion states what is lost and that the person becomes able to book a desk | Must     | AC-02          | implemented |
| FR-05  | The blocked refusal names the account and offers exactly one route, "Make someone an admin", which dismisses the dialog and focuses the People search field; no override control exists anywhere on the refusal | Must     | AC-05, AC-06   | implemented |
| FR-06  | SCR-009's edit-form role radios call the same endpoint; a blocked change is shown in-form directly above the radios, reverts the radio to the stored role, and leaves the rest of the form's edits intact and still saveable | Must     | AC-08          | implemented |
| FR-07  | While a role-change request is in flight, the confirming control is busy, both dialog actions are disabled, no optimistic row/radio update occurs, and Escape is suppressed | Must     | AC-09          | implemented |
| FR-08  | A failure that is not the BR-001.11 refusal keeps the dialog open, leaves the role unchanged, and states plainly that nothing changed                  | Must     | AC-10          | implemented |
| FR-09  | On success, the row's role updates in place, the summary line's admin count updates with it, a transient message states the effect, and focus returns to the row's overflow trigger | Must     | AC-11          | implemented |
| FR-10  | The role action is available and functional from the row menu on a deactivated account                                                                 | Must     | AC-12          | implemented |
| FR-11  | When the acting administrator changes their **own** role, the browser's own session state updates immediately so admin-only navigation and routes disappear without requiring a fresh sign-in | Must     | edge case (self-demotion) | implemented |
| FR-12  | Only a caller whose session role is `admin` may reach the endpoint (inherited from the existing `requireAdmin` mount on `/api/admin`)                    | Must     | AC-13          | implemented |

## Non-functional requirements

None new. V-07 (admin-only surfaces) is already carried by the `requireAdmin` mount (`apps/api/src/http/middleware/require-admin.ts`) and role is already read fresh from `user_profiles` on every request rather than from a JWT claim (that file's own docblock) — this story adds a new route behind the same guard, not a new guard.

## Technical constraints

- This is a **single-system write** — `user_profiles.role` only. Unlike `createAccount`/`updateAccount`, it never calls Supabase Auth, so `ADR-011`/`ADR-012`'s cross-system compensation shapes do not apply here (`users/README.md`'s own forward note confirms role change is not one of the two future Auth-crossing writes; only US-025/US-027 are).
- A refusable state **transition**, not a plain field update — `POST /api/admin/users/:id/role`, a verb sub-resource, per `ai/standards/api-standards.md`'s rule and its own worked example (`/desks/:id/deactivate`), not `PATCH /api/admin/users/:id`.
- BR-001.11 is enforced at the database as a plain `AFTER UPDATE OF role, is_active … FOR EACH ROW` trigger on `user_profiles` (`design-note.md` §2, `ADR-013`) — **not** the `CONSTRAINT TRIGGER … DEFERRABLE` shape `db-design.md` §3 originally named; deferral narrows the write-skew window without closing it, so the design note supersedes that word deliberately. This is the **first migration to add the trigger**. `supabase/migrations/0002_desks.sql:22`'s own comment already points here ("one trigger ... and it is not this"). US-025 (deactivate) depends on the identical trigger, unmodified, and must not add a second one.
- The rule is a **predicate over the whole table**, so a row lock alone does not serialise it (two concurrent demotions of *different* rows never conflict — write skew). The trigger function takes `pg_advisory_xact_lock(1001011)` as its first statement before checking the invariant (`ADR-013` Decision items 1–2, migration `0004_last_active_admin_guard.sql`).
- The trigger's rejection is signalled by a project-minted SQLSTATE (`Z0011`, not the default `P0001`), matched by `usersRepository.setRole` on `error.code` alone — never a message match (design note §3.1–§3.2).
- `modules/users` may not import `modules/auth` (`eslint.config.mjs` `MAY_IMPORT`).
- Any new/changed read keeps the explicit select-list discipline `ADR-004`/`users/README.md` state — no `select('*')`.
- The browser's `useAuth()` role is not re-fetched on navigation (`auth-context.tsx`) — a self-role-change must update local state directly on success, not rely on a future request to notice.

## Out of scope

- Reset password and deactivate/activate (US-025 – US-027) — this story lights up exactly one of the four row-menu items.
- Any change to how the first administrator is seeded.
- Any BR-001.11-style limit other than "never zero" (e.g. a maximum admin count) — BRD-001 states none.
- Pushing a live update to an already-open session belonging to a **different** demoted administrator — that session's next server round trip is refused by the existing `requireAdmin` guard regardless; only the acting administrator's own, current session gets an immediate client-side update (FR-11).

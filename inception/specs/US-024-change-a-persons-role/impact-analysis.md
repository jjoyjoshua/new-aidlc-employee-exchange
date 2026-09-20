# US-024 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-024-change-a-persons-role.md`  |
| **Tier**    | Complex                                                            |
| **Updated** | 2026-09-20                                                         |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                 |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Contract                  | yes      | New write route `POST /api/admin/users/:id/role`; new request schema `roleChangeRequestSchema`; new error code `last_active_admin` |
| Persistence                | yes      | New migration `0004_last_active_admin_guard.sql` — a plain `AFTER UPDATE` trigger on `user_profiles`, serialised by a transaction-scoped advisory lock (`ADR-013`; no column/index change) |
| Trust                     | yes      | The endpoint sits behind the existing `requireAdmin` mount (no new guard code, but a new admin-only write surface); self-role-change also mutates the acting admin's own client-side session state |
| Dependency & integration  | no       | No new package, no external service                                                                                              |
| Operational                | no       | No new job, env value, or middleware                                                                                             |

## Files and callers

| File                                                    | Symbol                        | Change             | Callers found (`file:line`)                                                                 |
| -------------------------------------------------------- | ------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------- |
| `libs/contracts/src/error.ts`                             | `errorCodeSchema`              | add `last_active_admin` enum value | `apps/api/src/http/errors.ts:18` (re-exports `ERROR_CODES`); every route/screen switching on `ErrorCode` is additive-safe (new enum member, no removal) |
| `libs/contracts/src/users.ts`                             | `roleChangeRequestSchema` (new) | add                 | `apps/api/src/modules/admin/admin.router.ts` (new route), `apps/ui/src/lib/change-role.ts` (new) |
| `supabase/migrations/0004_last_active_admin_guard.sql`    | trigger (new)                  | add                 | Fires on any `UPDATE` to `user_profiles.role`/`is_active` — this story's `setRole`, and US-025's future deactivate/reactivate writes |
| `apps/api/src/modules/users/users.repository.ts`          | `setRole` (new), `UsersRepository` | add method to interface | `apps/api/src/modules/users/users.service.ts` (new call), `apps/api/src/modules/users/users.repository.spec.ts` |
| `apps/api/src/modules/users/users.service.ts`             | `changeRole` (new), `UsersServiceDeps` (unchanged shape) | add method | `apps/api/src/modules/admin/admin.router.ts` (new route) |
| `apps/api/src/modules/admin/admin.router.ts`              | new `router.post('/users/:id/role', ...)` | add | mounted under `requireAdmin` (`http/app.ts`, unchanged) |
| `apps/ui/src/lib/change-role.ts`                          | `ChangeRoleFetcher` (new)       | add                 | `apps/ui/src/screens/people/use-role-change-dialog.ts` (new), `use-user-form-dialog.ts` (modified) |
| `apps/ui/src/screens/people/AccountRowMenu.tsx`           | the role `menuitem`            | `renderDisabledItem` → live button with `onClick` | `apps/ui/src/screens/people/AccountRow.tsx:83-89` (already threads a new prop the same way `onEdit` is threaded) |
| `apps/ui/src/lib/use-users.ts`                            | `markRoleChanged` (new)        | add                 | `apps/ui/src/screens/people/People.tsx` (new call). **Not** `markUpdated`: that method spreads `summary` through unchanged by design (US-023 moved no counts), and US-024 moves `employees`/`admins` in opposite directions — design note §4.1 |
| `apps/ui/src/screens/people/People.tsx`                   | `PeopleContent`                 | mounts a second dialog (`RoleChangeDialog`) alongside `UserFormDialog` | none outside this file — screen-private |
| `apps/ui/src/screens/people/use-user-form-dialog.ts`      | `submit`                        | edit-mode branch gains a role pre-check before the existing `updateAccount` call | `apps/ui/src/screens/people/People.tsx:143` (unchanged call site — the hook's public shape is unchanged) |
| `apps/ui/src/lib/auth/auth-context.tsx`                   | `AuthContextValue` (or equivalent) | add a local-state patch method | `apps/ui/src/screens/people/People.tsx`, `use-user-form-dialog.ts` (new calls); `apps/ui/src/lib/auth/require-role.tsx` reads `user.role` and is unaffected in shape, only in *when* it re-renders |

## Regression risk

| Area                                             | Risk   | Why                                                                                                                     | Covered by                                      |
| -------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| US-023's `updateAccount` PATCH path                 | low    | Untouched contract and untouched service method; this story only adds a sibling route and a sibling service method    | existing `users.service.spec.ts`, `admin.routes.spec.ts` suites, unmodified |
| US-025/US-026 (not yet built)                       | low (was medium — closed, not merely mitigated) | Both depend on the SAME trigger this story adds | `ADR-013` Decision item 4 / design note §2.4 settle the trigger's `WHEN` clause (`UPDATE OF role, is_active`, both columns) to cover both future stories' writes unmodified — confirmed, not merely hoped |
| `AccountRowMenu`'s existing `aria-disabled` items    | low    | Only the role item's rendering branches; **Reset password** and **Deactivate/Activate** keep `renderDisabledItem` untouched | `AccountRowMenu.spec.tsx`'s existing disabled-item assertions, unmodified |
| `useAuth()` consumers other than `RequireRole`       | low    | The new session-patch method only ever narrows `role`; every other field on `AuthenticatedUser` is untouched, and the method is additive to the context value | `auth-context.spec.ts` |
| `UserFormDialog`'s create-mode path (US-021)         | low    | The role-then-details submit ordering (D-01) applies to the **edit** branch only; `dialog.mode === 'create'` keeps its existing single-call `createAccount` path unchanged | `use-user-form-dialog.spec.ts`'s existing create-mode suite |

## Deliberately not touched

- `desks.service.ts` / `desks.repository.ts` — no desk-side code changes; the trigger lives entirely in `user_profiles`.
- The `Reset password` and `Deactivate`/`Activate` row-menu items stay `aria-disabled` — US-025/US-026/US-027's own scope.
- `RequireRole`'s own logic (`require-role.tsx`) — it already redirects on any `user.role` mismatch; this story only makes `user.role` change without a full page reload for the acting admin's own self-change, it does not change the guard itself.
- The first-admin seed process — out of scope per `spec.md`.

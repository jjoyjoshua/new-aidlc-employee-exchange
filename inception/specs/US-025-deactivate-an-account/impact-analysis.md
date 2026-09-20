# US-025 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-025-deactivate-an-account.md`  |
| **Tier**    | Complex                                                            |
| **Updated** | 2026-09-20                                                         |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                 |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Contract                  | yes      | Two new routes: `GET /api/admin/users/:id/deactivation-preview` (read), `POST /api/admin/users/:id/deactivate` (write); one new response schema |
| Persistence                | yes      | New migration `0005_deactivate_account_cascade.sql` — a new PL/pgSQL function performing the atomic flip + cascade cancel. No column/index/enum change — `is_active`, `deactivated_at` and `cancellation_source = 'deactivation_cascade'` already exist |
| Trust                     | yes      | Both endpoints sit behind the existing `requireAdmin` mount (no new guard code) — a new admin-only write surface, the cascade's first cross-table transactional write, **and the project's first PostgREST `/rpc/` write**, which Postgres grants to `PUBLIC` by default and must be explicitly revoked/re-granted to `service_role` in the migration (design note §2.7, C1) |
| Dependency & integration  | no       | No new package, no external service. (The original AC-08/AC-09, which would have needed one, are now US-029's/US-032's own scope — D-01) |
| Operational                | no       | No new job, env value, or middleware                                                                                              |

## Files and callers

| File                                                    | Symbol                        | Change             | Callers found (`file:line`)                                                                 |
| -------------------------------------------------------- | ------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------- |
| `libs/contracts/src/users.ts`                             | `deactivationPreviewSchema` (new) | add                 | `apps/api/src/modules/admin/admin.router.ts` (new route), `apps/ui/src/lib/deactivate-account.ts` (new) |
| `supabase/migrations/0005_deactivate_account_cascade.sql` | `deactivate_account_cascade()` (new function) | add | Called only via `usersRepository.deactivateAccount`'s `.rpc()` — no other caller |
| `apps/api/src/modules/users/users.repository.ts`          | `previewDeactivation` (new), `deactivateAccount` (new, four-kind outcome incl. `already_inactive`), `UsersRepository` | add two methods to interface | `apps/api/src/modules/users/users.service.ts` (new calls), `apps/api/src/modules/users/users.repository.spec.ts` |
| `apps/api/src/modules/users/users.service.ts`             | `previewDeactivation` (new), `deactivateAccount` (new, collapses `already_inactive` to `ok`) | add methods | `apps/api/src/modules/admin/admin.router.ts` (new routes) |
| `apps/api/src/composition.ts`                             | `UsersServiceDeps` construction | add `officeTimezone` (already read at `:101`) to the `createUsersService({...})` call | `apps/api/src/modules/users/users.service.spec.ts` (every existing `createUsersService(...)` call needs updating or typecheck fails) — design note §3.2, C9 |
| `apps/api/src/modules/bookings/README.md`                 | module boundary note | modify — record that this one path writes `bookings` from outside `modules/bookings` (per `app-architecture.md` §2's written exception), correcting its current claim that `bookings` is written from exactly two objects | design note §6.1, C17 |
| `apps/api/src/modules/admin/admin.router.ts`              | new `router.get('/users/:id/deactivation-preview', ...)`, new `router.post('/users/:id/deactivate', ...)` | add | mounted under `requireAdmin` (`http/app.ts`, unchanged); `cancelled_by` read via the existing `requireActingAdmin(req)` (`/bookings/:id/cancel`'s own precedent) |
| `apps/ui/src/lib/deactivate-account.ts` (new)             | `DeactivationPreviewFetcher`, `DeactivateAccountFetcher` | add                 | `apps/ui/src/screens/people/use-deactivate-account-dialog.ts` (new) |
| `apps/ui/src/screens/people/DeactivateAccountDialog.tsx` (new) | one mounted `Dialog`, body/footer switched on `phase`/`outcome` | add | `apps/ui/src/screens/people/People.tsx` (new mount) |
| `apps/ui/src/screens/people/use-deactivate-account-dialog.ts` (new) | `open`/`confirm`/`dismiss`/`routeToPromote` | add | `DeactivateAccountDialog.tsx` |
| `apps/ui/src/screens/people/AccountRowMenu.tsx`           | the deactivate/activate `menuitem` | `renderDisabledItem` → live button **for the deactivate branch only** (`account.isActive === true`); the activate branch (US-026) stays `renderDisabledItem` | `apps/ui/src/screens/people/AccountRow.tsx` (already threads new props the same way `onEdit`/`onChangeRole` are threaded) |
| `apps/ui/src/lib/use-users.ts`                            | `markDeactivated` (new)        | add                 | `apps/ui/src/screens/people/People.tsx` (new call). Moves `deactivated` (+1) only — `total`, `employees`/`admins` are unchanged by a deactivation (role is untouched), unlike `markRoleChanged` |
| `apps/ui/src/screens/people/People.tsx`                   | `PeopleContent`                 | mounts a third dialog (`DeactivateAccountDialog`) alongside `UserFormDialog`/`RoleChangeDialog` | none outside this file — screen-private |

## Regression risk

| Area                                             | Risk   | Why                                                                                                                     | Covered by                                      |
| -------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| US-024's `setRole` / the last-admin trigger        | low    | The migration adds a **new function**, not a change to the existing trigger; `changeRole`'s own call path is untouched | existing `users.repository.spec.ts`, `admin.concurrency.spec.ts` suites, unmodified |
| US-011/US-015's single-booking cancel paths        | low    | Those repositories/services are not called by this story (`modules/users` cannot import `modules/bookings`, D-02) — the cascade is a separate write path entirely, inside the new migration's function | existing `bookings.repository.spec.ts`, `admin-bookings.repository.spec.ts` suites, unmodified |
| US-026 (not yet built)                              | low    | Depends on the same `is_active`/`deactivated_at` columns and the same trigger, unmodified by this story | D-04 confirms the trigger already covers both directions |
| US-029/US-032 (not yet built)                       | low | They now own the cascade-email/push behaviour outright (D-01, issue #59); they will need the cascade's returned booking rows, a shape this story fixes now | `spec.md`'s Technical constraints note the RPC returns cancelled-booking rows for exactly this reason |
| `AccountRowMenu`'s existing `aria-disabled` items   | low    | Only the deactivate branch of one item changes; **Reset password** and the **activate** branch keep `renderDisabledItem` untouched | `AccountRowMenu.spec.tsx`'s existing disabled-item assertions |

## Deliberately not touched

- `apps/api/src/modules/bookings/**` — no import, no shared code; the cascade's write lives entirely inside the new migration's function (D-02, D-03).
- `apps/api/src/modules/notifications/**` — stays empty; the original AC-08/AC-09 moved to US-029/US-032 (D-01).
- `0004_last_active_admin_guard.sql` — reused unmodified (D-04).
- The `activate` branch of `AccountRowMenu`'s deactivate/activate item, and `RadioGroup`/`UserFormDialog` — US-026's/US-027's own scope.
- The first-admin seed process.

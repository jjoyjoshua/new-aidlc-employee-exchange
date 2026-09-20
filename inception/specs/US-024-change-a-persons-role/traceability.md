# US-024 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-024-change-a-persons-role.md`  |
| **Updated** | 2026-09-20                                                         |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------ | --------- | ----------- |
| FR-01  | `apps/api/src/modules/admin/admin.router.ts`, `apps/api/src/modules/users/users.service.ts`, `apps/api/src/modules/users/users.repository.ts` | `POST /users/:id/role`, `changeRole`, `setRole` | `admin.routes.spec.ts`, `users.service.spec.ts`, `users.repository.spec.ts`, `admin.concurrency.spec.ts` (gated) | implemented |
| FR-02  | `supabase/migrations/0004_last_active_admin_guard.sql` | `user_profiles_require_active_admin()` trigger, `pg_advisory_xact_lock(1001011)` | `admin.concurrency.spec.ts` (gated, case 1 and case 3) | implemented |
| FR-03  | `apps/api/src/modules/admin/admin.router.ts`, `apps/api/src/modules/users/users.repository.ts` | `blocked` → `422 last_active_admin`, `Z0011` SQLSTATE match | `admin.routes.spec.ts`, `users.repository.spec.ts` | implemented |
| FR-04  | `apps/ui/src/screens/people/RoleChangeDialog.tsx`, `apps/ui/src/screens/people/copy.ts` | `roleChangeConfirmTitle`, `roleChangeConfirmBody` | `RoleChangeDialog.spec.tsx`, `copy.spec.ts` | implemented |
| FR-05  | `apps/ui/src/screens/people/RoleChangeDialog.tsx`, `use-role-change-dialog.ts`, `People.tsx` | `routeToPromote`, `MAKE_SOMEONE_ADMIN_LABEL` | `RoleChangeDialog.spec.tsx`, `use-role-change-dialog.spec.ts`, `People.spec.tsx` | implemented |
| FR-06  | `apps/ui/src/screens/people/UserFormDialog.tsx`, `use-user-form-dialog.ts` | `lastAdmin` outcome, ST-05 `Alert` above `RadioGroup` | `UserFormDialog.spec.tsx`, `use-user-form-dialog.spec.ts`, `People.spec.tsx` | implemented |
| FR-07  | `apps/ui/src/screens/people/use-role-change-dialog.ts`, `RoleChangeDialog.tsx` | `busy`, `inFlight` ref, `Dialog`'s own Escape suppression | `use-role-change-dialog.spec.ts`, `RoleChangeDialog.spec.tsx` | implemented |
| FR-08  | `apps/ui/src/screens/people/use-role-change-dialog.ts`, `use-user-form-dialog.ts` | `outcome: 'failed'`, `roleChangeFailedAlert` | `use-role-change-dialog.spec.ts`, `use-user-form-dialog.spec.ts`, `RoleChangeDialog.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/lib/use-users.ts`, `apps/ui/src/screens/people/People.tsx`, `copy.ts` | `markRoleChanged`, `roleChangedToast` | `use-users.spec.ts`, `People.spec.tsx`, `copy.spec.ts` | implemented |
| FR-10  | `apps/ui/src/screens/people/AccountRowMenu.tsx` | the role `menuitem`, live for every account | `AccountRowMenu.spec.tsx` (deactivated-admin case) | implemented |
| FR-11  | `apps/ui/src/lib/auth/auth-context.tsx`, `People.tsx`, `use-user-form-dialog.ts`-driven `handleUpdated` | `updateOwnRole` | `auth-context.spec.tsx`, `People.spec.tsx` (both routes) | implemented |
| FR-12  | inherited — `apps/api/src/http/middleware/require-admin.ts` (unchanged) | `requireAdmin` mount | `admin.routes.spec.ts` (AC-13 case) | implemented |

## Key symbols

| Symbol                            | Location            |
| --------------------------------- | -------------------- |
| `usersRepository.setRole`         | `apps/api/src/modules/users/users.repository.ts` |
| `usersService.changeRole`         | `apps/api/src/modules/users/users.service.ts` |
| `POST /api/admin/users/:id/role`  | `apps/api/src/modules/admin/admin.router.ts` |
| `user_profiles_require_active_admin` (trigger) | `supabase/migrations/0004_last_active_admin_guard.sql` |
| `createChangeRole` / `ChangeRoleFetcher` | `apps/ui/src/lib/change-role.ts` |
| `RoleChangeDialog`                | `apps/ui/src/screens/people/RoleChangeDialog.tsx` |
| `useRoleChangeDialog`             | `apps/ui/src/screens/people/use-role-change-dialog.ts` |
| `useUsers.markRoleChanged`        | `apps/ui/src/lib/use-users.ts` |
| `useAuth().updateOwnRole`         | `apps/ui/src/lib/auth/auth-context.tsx` |

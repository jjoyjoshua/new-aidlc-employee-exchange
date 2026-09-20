# US-023 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-023-correct-a-persons-details.md` |
| **Updated** | 2026-09-20                                       |

## Requirement to code

| Req   | File | Symbol / location | Proven by | Status      |
| ----- | ---- | ------------------ | --------- | ----------- |
| FR-01 | `apps/api/src/modules/users/users.service.ts` | `updateAccount` | `apps/api/src/modules/users/users.service.spec.ts`; manually verified in the browser | implemented |
| FR-02 | `apps/api/src/modules/users/users.service.ts` | `updateAccount` (the `findByEmail` pre-check) | `apps/api/src/modules/users/users.service.spec.ts`; manually verified — duplicate active/deactivated both refused | implemented |
| FR-03 | `apps/api/src/modules/users/users.service.ts` | `updateAccount` (the unchanged-email guard, §2.3/§2.8) | `apps/api/src/modules/users/users.service.spec.ts`; manually verified — saving unchanged fields succeeds | implemented |
| FR-04 | `apps/ui/src/screens/people/UserFormDialog.tsx` | `handleSubmit` (edit branch, `userUpdateSchema`) | `apps/ui/src/screens/people/UserFormDialog.spec.tsx`; `libs/contracts/src/users.spec.ts`; manually verified — an implausible email is caught with no request sent | implemented |
| FR-05 | `apps/api/src/modules/users/users.adapter.ts` | `updateEmail` | `apps/api/src/modules/users/users.adapter.spec.ts`; manually verified end-to-end against the live Supabase project — the old email stops signing in, the new one signs in with the same password | implemented |
| FR-06 | `apps/api/src/modules/users/users.repository.ts` | `updateProfileDetails` (writes `user_profiles.email`, which every future notification read must use) | `apps/api/src/modules/users/users.repository.spec.ts`; structural proof only — `modules/notifications` has no code yet to observe (design note §3.6) | implemented |
| FR-07 | `apps/api/src/modules/users/users.service.ts`, `users.adapter.ts` | `updateAccount` (never calls `deleteAccount`); `updateEmail` (constructs no `password` key) | `apps/api/src/modules/users/users.service.spec.ts` ("deleteAccount is unreachable" suite); `users.adapter.spec.ts`; manually verified — no forced password-change screen after the edit | implemented |
| FR-08 | `apps/ui/src/screens/people/use-user-form-dialog.ts` | `useUserFormDialog` (`inFlight` guard, shared with create) | `apps/ui/src/screens/people/use-user-form-dialog.spec.ts`; `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (ST-08) | implemented |
| FR-09 | inherited — `apps/api/src/http/middleware/require-admin.ts` (mounted in `apps/api/src/http/app.ts`) | `requireAdmin` | `apps/api/src/modules/admin/admin.routes.spec.ts` ("refuses an Employee session... reaching the real mount") | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it. A requirement with no code yet gets a row with status `not started` and `—` in File; a row is how you can see what is missing.

## Key symbols

| Symbol                            | Location            |
| --------------------------------- | -------------------- |
| `updateAccount`                    | `apps/api/src/modules/users/users.service.ts` |
| `updateProfileDetails`, `findById` | `apps/api/src/modules/users/users.repository.ts` |
| `updateEmail`                      | `apps/api/src/modules/users/users.adapter.ts` |
| `PATCH /api/admin/users/:id`       | `apps/api/src/modules/admin/admin.router.ts` |
| `userUpdateSchema`, `userIdParamsSchema`, `fullNameSchema`, `emailSchema` | `libs/contracts/src/users.ts` |
| `user_not_found`                   | `libs/contracts/src/error.ts` |
| `useUserFormDialog` (edit mode)    | `apps/ui/src/screens/people/use-user-form-dialog.ts` |
| `UserFormDialog` (edit mode)       | `apps/ui/src/screens/people/UserFormDialog.tsx` |
| `RadioGroup` (`ariaDisabled` path) | `apps/ui/src/screens/people/RadioGroup.tsx` |
| `markUpdated`                      | `apps/ui/src/lib/use-users.ts` |
| `createUpdateAccount`              | `apps/ui/src/lib/update-account.ts` |
| `AccountRowMenu`'s **Edit** item   | `apps/ui/src/screens/people/AccountRowMenu.tsx` |

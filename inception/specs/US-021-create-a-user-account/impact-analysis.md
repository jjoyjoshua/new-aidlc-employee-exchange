# US-021 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-021-create-a-user-account.md` |
| **Tier**    | Complex                                          |
| **Updated** | 2026-09-20                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                    |
| ------------------------ | -------- | ------------------------------------------------ |
| Contract                 | yes      | New write endpoint `POST /api/admin/users`, new required request fields (`fullName`, `email`, `role`, `password`), new response use of the existing `adminUserSchema` on a `201` |
| Persistence              | yes      | A new row in `user_profiles` per successful call; no schema/migration change — the table, its unique email index and its column defaults already exist |
| Trust                    | yes      | Admin-only write (inherited `requireAdmin` mount); a new credential is minted via Supabase Auth's service-role admin API; PII (name, email) is written and echoed back on `201` |
| Dependency & integration | no       | Supabase Auth is already an integration this codebase calls (`auth.adapter.ts`); this story adds a new call (`auth.admin.createUser`) on the same client, not a new dependency |
| Operational               | no       | No new job, schedule, or env value; `Cache-Control: private, no-store` reuses the existing convention |

## Files and callers

| File                                                | Symbol                        | Change                | Callers found (`file:line`)                                  |
| ---------------------------------------------------- | ------------------------------ | ---------------------- | -------------------------------------------------------------- |
| `libs/contracts/src/users.ts`                        | `createAccountRequestSchema`  | new export             | `apps/api/src/modules/admin/admin.router.ts` (new route)       |
| `libs/contracts/src/error.ts`                        | `errorCodeSchema` enum         | add `'email_taken'`    | `apps/api/src/modules/admin/admin.router.ts`, `apps/ui/src/lib/create-account.ts` |
| `apps/api/src/modules/users/users.adapter.ts`        | new file — a `UsersAuthAdapter` interface owned by `users.service.ts`, one method `createAccount(email, password)` | new              | `apps/api/src/modules/users/users.service.ts` (new call), `apps/api/src/composition.ts` (wired alongside `usersRepository`) — **cannot** live in or import `auth/auth.adapter.ts`: `eslint.config.mjs:18` forbids `modules/users` importing `modules/auth` |
| `apps/api/src/modules/users/users.repository.ts`     | `UsersRepository` interface     | add `findByEmail`, `insertProfile` | `apps/api/src/modules/users/users.service.ts:66-77` (existing `listAccounts` caller), `apps/api/src/composition.ts:114` (`createUsersService({ users: ... })`) |
| `apps/api/src/modules/users/users.service.ts`        | `createUsersService`           | add `createAccount(input)` | `apps/api/src/modules/admin/admin.router.ts` (new route), `apps/api/src/composition.ts:114` |
| `apps/api/src/composition.ts`                        | `buildApp`                      | wire the auth adapter into `createUsersService`; add a `BuildAppOptions` test seam mirroring `options.users` (`:68`) | test harnesses in `admin.routes.spec.ts`, `admin.concurrency.spec.ts` |
| `apps/api/src/modules/admin/admin.router.ts`         | `createAdminRouter`             | add `router.post('/users', ...)` | none outside this file — routers are terminal |
| `apps/ui/src/components/radio-group/RadioGroup.tsx`  | `RadioGroup`, `RadioOption`     | new component           | `apps/ui/src/screens/people/UserFormDialog.tsx` (new, this story) |
| `apps/ui/src/lib/generate-password.ts`               | `generatePassword`              | new function             | `apps/ui/src/screens/people/UserFormDialog.tsx` |
| `apps/ui/src/lib/create-account.ts`                  | `createCreateAccount`           | new function             | `apps/ui/src/screens/people/People.tsx` |
| `apps/ui/src/lib/use-users.ts`                       | `useUsers` return shape          | add `markAdded(account, role)`-equivalent updater | `apps/ui/src/screens/people/People.tsx:95` |
| `apps/ui/src/screens/people/People.tsx`              | `PeopleContent`                  | wire both `ADD_PERSON_LABEL` buttons (`:147`, `:237`) to open the new dialog; render the dialog and a save toast | none outside this file |

## Regression risk

| Area                                          | Risk   | Why                                                                                                     | Covered by                                       |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `GET /api/admin/users` (US-020)               | low    | Same router, same service, same repository file gain new siblings; no existing export's signature changes | `admin.routes.spec.ts`'s existing US-020 cases, re-run unmodified |
| `People.tsx`'s search/summary behaviour (US-020) | medium | `useUsers`'s state shape gains an updater; a bug in the in-place `markAdded`-equivalent could corrupt `summary` (the exact "recompute vs. drift" risk `desks.service.ts`'s tally comment already names for its own module) | new `use-users.spec.ts` cases asserting `summary.total` and the created role's counter both increment by exactly one, and the filtered `users` array is unaffected when a committed search term does not match the new name |
| `auth.adapter.ts`'s existing exports (US-001, US-004) | low | Adding `createAccount` alongside `signInWithPassword`/`revokeSession`/`setPassword` on the same object literal; none of those three change | existing `auth.service.spec.ts`, `auth.adapter` is not otherwise touched |
| Orphaned `auth.users` row on a partial failure | medium | A new failure mode this story introduces (two systems, one write each) that no existing story has — see Open questions | the design note's chosen compensating behaviour, tested against a forced repository failure after a stubbed successful Auth call |

## Deliberately not touched

- `require-session.ts` / `require-admin.ts` — reused verbatim; no new guard, no new role.
- `Dialog.tsx` — `UserFormDialog` wraps it exactly as `DeskFormDialog` does; no prop added to the shared component.
- `StatusChip.tsx` — this story never renders an account's active/inactive state; it only creates one, always active.
- `AccountRow.tsx` / `AccountRowMenu.tsx` (US-020) — the row-level **Edit** action stays disabled; this story does not enable it.
- The `notifications` module — reserved, still empty; no email is sent by this story.

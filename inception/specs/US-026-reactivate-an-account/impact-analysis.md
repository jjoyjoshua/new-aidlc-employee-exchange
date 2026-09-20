# US-026 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-026-reactivate-an-account.md`  |
| **Tier**    | Complex                                                            |
| **Updated** | 2026-09-20                                                         |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| Contract                 | yes      | New route `POST /api/admin/users/:id/activate` — a new write operation, which is what sets the tier    |
| Persistence              | no       | No new column, index, or migration — the existing `is_active` column and `0004`'s trigger already cover this write (confirmed by that migration's own closing comment) |
| Trust                    | no       | No new guard — reuses the existing `requireAdmin` mount, the same authority every other `/api/admin/users/*` route already relies on |
| Dependency & integration | no       | Nothing added                                                                                          |
| Operational              | no       | Nothing added                                                                                          |

Contract alone sets the tier to Complex, per the framework's hard rule (a new write operation is Complex regardless of how small the write is).

## Files and callers

| File                                             | Symbol                              | Change  | Callers found (`file:line`)                                                                 |
| ------------------------------------------------- | ------------------------------------ | ------- | --------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/users/users.repository.ts` | `UsersRepository.activateAccount`   | add     | `apps/api/src/modules/users/users.service.ts` (new call, Step 2)                              |
| `apps/api/src/modules/users/users.service.ts`    | `UsersService.activateAccount`      | add     | `apps/api/src/modules/admin/admin.router.ts` (new call, Step 3)                               |
| `apps/api/src/modules/admin/admin.router.ts`     | new route `POST /users/:id/activate`| add     | `apps/ui/src/lib/activate-account.ts` (new fetcher, Step 4)                                    |
| `apps/ui/src/lib/activate-account.ts`            | `createActivateAccount`             | add     | `apps/ui/src/screens/people/People.tsx` (Step 5)                                              |
| `apps/ui/src/screens/people/AccountRowMenu.tsx`  | `AccountRowMenuProps.onActivate`    | add     | `apps/ui/src/screens/people/AccountRow.tsx:97-103` (threads the new prop)                     |
| `apps/ui/src/screens/people/AccountRow.tsx`      | `AccountRowProps.onActivate`        | add     | `apps/ui/src/screens/people/People.tsx:441-463` (threads the new prop to both row layouts)    |
| `apps/ui/src/lib/use-users.ts`                   | `UseUsersResult.markReactivated`    | add     | `apps/ui/src/screens/people/People.tsx` (new call, Step 5)                                     |
| `apps/ui/src/screens/people/copy.ts`             | `reactivatedToast`, `activateAccountFailedAlert` | add | `apps/ui/src/screens/people/People.tsx` (Step 5)                                               |

No existing exported symbol changes signature — every change above is an addition. `AccountRowMenuProps`/`AccountRowProps` gain one new required prop each, so every existing test that renders `AccountRowMenu`/`AccountRow` needs the new prop or typecheck fails — the same ripple `onDeactivate`'s own introduction in US-025 caused, already a known and accepted shape.

## Regression risk

| Area                                    | Risk   | Why                                                                                                     | Covered by                                                     |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `AccountRowMenu`'s disabled-item rendering | low    | The `!account.isActive` branch changes from `renderDisabledItem` to a live button; the active-account branch (`Deactivate`) is untouched | `AccountRowMenu.spec.tsx` existing + new cases                  |
| Summary counts (`use-users.ts`)         | low    | `markReactivated` is new and additive; `markDeactivated`/`markRoleChanged`/`markUpdated` are not modified | `use-users.spec.ts` existing + new case                         |
| BR-001.11 (last active admin)           | none   | Reactivation only ever increases the active-admin count, so the trigger's `WHEN` clause cannot fire on this write — confirmed by reading `0004_last_active_admin_guard.sql`'s own closing comment, not assumed | The trigger's existing concurrency suite in `admin.concurrency.spec.ts` is unmodified; no new gated case needed for this story |
| Sign-in after reactivation (AC-02)      | none   | No code change — `require-session.ts`'s existing `is_active` check already permits sign-in once the flag flips true; this story writes the flag, nothing else | Inherited from US-001/AC-04's existing test coverage             |

## Deliberately not touched

- `supabase/migrations/` — no new file. `0004`'s own closing comment states this write needs no further migration.
- `deactivated_at` — read but never written by this story's UPDATE (D-01, `decisions.md`).
- `bookings` — this write never reads or writes that table; RISK-011's cancellations stay irreversible (US-025/spec.md's own forward statement).
- `role`, `must_change_password` — neither is named in the UPDATE, so both survive reactivation exactly as they were (AC-03, AC-05).

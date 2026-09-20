# US-023 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-023-correct-a-persons-details.md` |
| **Tier**    | Complex                                          |
| **Updated** | 2026-09-20                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                    |
| ------------------------ | -------- | ------------------------------------------------ |
| Contract                 | yes      | New write operation `PATCH /api/admin/users/:id`; new `userUpdateSchema`/`userIdParamsSchema` in `libs/contracts/src/users.ts` (a protected path); no new response schema (`adminUserSchema` reused) |
| Persistence               | yes      | `modules/users`'s first `UPDATE` on `user_profiles` (`full_name`, `email`, `updated_at`); no migration — every column already exists |
| Trust                     | yes      | The sign-in identity (`auth.users.email`) is rewritten on the service-role client; admin-only enforcement is inherited, not added |
| Dependency & integration | no       | `@supabase/supabase-js` 2.109.0 already installed; `updateUserById` is new *usage* of an existing SDK method, not a new dependency |
| Operational               | no       | No new job, env value, or middleware; `requireAdmin` mounts once and is untouched |

## Files and callers

| File | Symbol | Change | Callers found (`file:line`) |
| ---- | ------ | ------ | ---------------------------- |
| `libs/contracts/src/users.ts` | `fullNameSchema`, `emailSchema` | extracted from inside `createAccountRequestSchema` (98-106) into standalone exports, reused by both schemas | `createAccountRequestSchema` itself (`users.ts:98-106`) — behaviour unchanged, pure extraction |
| `libs/contracts/src/users.ts` | `userUpdateSchema`, `userIdParamsSchema` | new | `admin.router.ts` (new handler), `apps/ui/src/screens/people/UserFormDialog.tsx` (edit-mode client validation), `apps/ui/src/lib/update-account.ts` (new) |
| `libs/contracts/src/error.ts` | `ERROR_CODES` | add `user_not_found` | `admin.router.ts` (new handler), `apps/ui/src/lib/update-account.ts` (new) |
| `apps/api/src/modules/users/users.repository.ts` | `UsersRepository` interface (`:46`) | add `findById`, `updateProfileDetails`; `findByEmail` (`:80`) gains an optional `excludeId` param | `users.service.ts:116,128` (existing `findByEmail(email)` calls — both keep working unchanged, `excludeId` is optional); `composition.ts` (repository still satisfies the interface it's injected against) |
| `apps/api/src/modules/users/users.adapter.ts` | `UsersAuthAdapter` interface (`:28`) | add `updateEmail` | `composition.ts` (adapter still satisfies the interface it's injected against); `users.service.ts` (new call site) |
| `apps/api/src/modules/users/users.service.ts` | `UsersService` (return of `createUsersService`) | add `updateAccount`; `UsersServiceDeps` gains `nowMs` | `admin.router.ts` (new call site, mirrors `users.createAccount` at `:156`) |
| `apps/api/src/modules/admin/admin.router.ts` | router | add `PATCH /users/:id` handler, after the existing `POST /users` (`:149-174`) | mounted at `/api/admin` in `http/app.ts` (unchanged — inherits `requireAdmin`) |
| `apps/ui/src/screens/people/use-user-form-dialog.ts` | `useUserFormDialog` | gains `mode`, `account`; `submit` branches to create vs. update | `apps/ui/src/screens/people/People.tsx` (existing caller — its `openAdd()` call keeps working; a new `openEdit(account)` is added) |
| `apps/ui/src/screens/people/UserFormDialog.tsx` | `UserFormDialog` | grows an edit-mode render path (no password field, `Save changes` label, ST-02 layout) | `People.tsx` (existing render site — same component, same props shape plus `dialog.mode`) |
| `apps/ui/src/screens/people/RadioGroup.tsx` | `RadioGroup` | gains an `aria-disabled` path distinct from native `disabled` (ADR-010) | `UserFormDialog.tsx` (only caller) |
| `apps/ui/src/lib/use-users.ts` | the list-state hook | add `markUpdated` | `People.tsx` (new call site, alongside the existing `markAdded`) |
| `apps/ui/src/lib/update-account.ts` | `createUpdateAccount` | new file | `People.tsx` (wired the same way `create-account.ts`'s fetcher is) |
| `apps/ui/src/screens/people/AccountRowMenu.tsx` | **Edit** menu item (`:186`) | stops being `aria-disabled`, gains its `onClick` | `AccountRow.tsx` (existing caller, unchanged props shape) |
| `knowledge/decisions/ADR-011-cross-system-write-compensation.md` | item 1 | one forward-pointing line scoping it to creation | none — documentation only |

## Regression risk

| Area | Risk | Why | Covered by |
| ---- | ---- | --- | ---------- |
| US-021 create flow | low | `createAccountRequestSchema`'s shape and behaviour are unchanged by the `fullNameSchema`/`emailSchema` extraction — same validation, same object, pure refactor | Existing `users.service.spec.ts`, `admin.router.spec.ts` create-path tests must stay green unmodified |
| `findByEmail` existing callers | low | New `excludeId` param is optional; both existing call sites (`users.service.ts:116,128`) omit it and keep their current behaviour | Existing `users.repository.spec.ts` cases for `findByEmail(email)` |
| People list state after other operations | low | `markUpdated` is a new function; `markAdded` and the existing list/search/summary logic in `use-users.ts` are not modified by adding a sibling | Existing `use-users.spec.ts` cases (unchanged) plus new `markUpdated` cases |
| `RadioGroup`'s existing (create-mode) callers | low | The new `aria-disabled` path is additive — a new optional prop with a default that preserves today's native-`disabled` behaviour in create mode | Existing `RadioGroup.spec.tsx` create-mode cases |
| Auth/profile email divergence on a rare Auth failure | medium | New failure mode this story introduces (ADR-012's residual) — a diverged account degrades US-004's V-15 "same as current" check (design-note.md §2.9) until the administrator retries | New service-level test forcing the Auth write to fail after the profile write succeeds, asserting the restore and the exact log line |
| `usersAuthAdapter.deleteAccount` reachability | medium if wrong | The single most likely wrong implementation (story's own QA notes) — re-provisioning on email change would delete-cascade the profile row | New test asserting the adapter fake's `deleteAccount` is never invoked by `updateAccount`, on every branch |

## Deliberately not touched

- `apps/api/src/http/app.ts` and `apps/api/src/http/middleware/require-admin.ts` — AC-09 is inherited
  from the existing mount-level guard; no per-route check is added.
- `supabase/migrations/**` — no new column, index, or table. Every field this story writes already
  exists.
- `apps/ui/src/lib/data-refresh.ts` — the People screen is not on the app-wide focus-refresh list and
  does not join it for this story.
- `apps/api/src/modules/notifications/` — still a README only; AC-06 is proven structurally (the
  address `user_profiles.email` holds is what any future notification code must read), not by
  observing a sent notification, because no notification code exists yet.
- US-024's role-change path and SCR-009 ST-05's last-admin refusal — a different AC, different story,
  same screen.

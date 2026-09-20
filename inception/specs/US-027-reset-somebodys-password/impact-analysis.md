# US-027 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                     |
| ----------- | --------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-027-reset-somebodys-password.md`   |
| **Tier**    | Complex                                                              |
| **Updated** | 2026-09-20                                                           |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                              |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | New write endpoint `POST /api/admin/users/:id/reset-password`; new response schema `resetPasswordResponseSchema` (`libs/contracts/src/users.ts`); new additive prop `dismissible?: boolean` on the shared `Dialog` component (`apps/ui/src/components/dialog/Dialog.tsx`) |
| Persistence              | no       | `must_change_password` already exists (`supabase/migrations/0001_user_profiles.sql:35`); this story writes to it, it does not change its shape. No migration. |
| Trust                    | yes      | Credential generation and handling: a plaintext password crosses the wire exactly once; the account's Supabase Auth credential is overwritten server-side; `requireAdmin` gates the whole route (inherited from the `/api/admin` mount, `require-admin.ts:21-37`) |
| Dependency & integration | no       | No new package; reuses the existing `@supabase/supabase-js` Auth admin API already used elsewhere in `modules/users`                                     |
| Operational              | no       | No new job, env value, or middleware                                                                                                                     |

## Files and callers

| File                                                    | Symbol                          | Change                | Callers found (`file:line`)                                                                 |
| -------------------------------------------------------- | -------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `apps/api/src/domain/generate-reset-password.ts`          | `generateResetPassword`         | new                   | `apps/api/src/modules/users/users.service.ts` (new call site)                                 |
| `libs/contracts/src/users.ts`                             | `resetPasswordResponseSchema`   | new                   | `apps/api/src/modules/admin/admin.router.ts` (new route), `apps/ui/src/lib/reset-password.ts` (new) |
| `apps/api/src/modules/users/users.adapter.ts`             | `UsersAuthAdapter.setPassword`  | new interface member  | `apps/api/src/modules/users/users.service.ts` (new call site), `apps/api/src/modules/users/users.adapter.spec.ts` (new tests) |
| `apps/api/src/modules/users/users.repository.ts`          | `armMustChangePassword`         | new                   | `apps/api/src/modules/users/users.service.ts` (new call site)                                 |
| `apps/api/src/modules/users/users.service.ts`             | `resetPassword`                 | new                   | `apps/api/src/modules/admin/admin.router.ts` (new route)                                      |
| `apps/api/src/modules/users/README.md`                    | prose                            | modify — records `must_change_password`'s first re-armer and the no-compensating-un-arm residual (design note §2.4, §13) | none — documentation |
| `apps/ui/src/lib/generate-password.ts`                    | file docblock (`:10-12`)         | modify — corrects a citation that becomes contradictory after D-01 (design note §5.3, F4) | none — comment only, no behaviour change |
| `apps/api/src/modules/admin/admin.router.ts`              | `POST /users/:id/reset-password`| new route             | none outside this router (a route, not a function others call)                                |
| `apps/ui/src/components/dialog/Dialog.tsx`                | `DialogProps.dismissible`       | new optional prop     | Every existing `<Dialog>` caller keeps its current behaviour with the prop omitted: `UserFormDialog.tsx`, `RoleChangeDialog.tsx`, `DeactivateAccountDialog.tsx`, `ConfirmDialog` (`components/confirm-dialog/`) |
| `apps/ui/src/screens/people/AccountRowMenu.tsx`           | `AccountRowMenuProps.onResetPassword`, item wiring | new prop, item un-disabled | `apps/ui/src/screens/people/AccountRow.tsx` (passes prop through), `AccountRowMenu.spec.tsx` (rewritten assertions) |
| `apps/ui/src/screens/people/AccountRow.tsx`               | `onResetPassword`                | new prop threaded through | `apps/ui/src/screens/people/People.tsx` (new call site)                                       |
| `apps/ui/src/screens/people/People.tsx`                   | reset-password dialog wiring     | new                   | none outside this screen                                                                       |
| `apps/ui/src/screens/people/ResetPasswordDialog.tsx`      | `ResetPasswordDialog`            | new file              | `apps/ui/src/screens/people/People.tsx`                                                        |
| `apps/ui/src/screens/people/use-reset-password-dialog.ts` | `useResetPasswordDialog`         | new file              | `apps/ui/src/screens/people/ResetPasswordDialog.tsx` (or `People.tsx`, per `RoleChangeDialog`'s pairing) |
| `apps/ui/src/lib/reset-password.ts`                       | `resetPassword` fetcher          | new file              | `apps/ui/src/screens/people/use-reset-password-dialog.ts`                                      |
| `apps/ui/src/screens/people/copy.ts`                      | reset-password dialog copy       | new constants         | `apps/ui/src/screens/people/ResetPasswordDialog.tsx`                                           |
| `apps/ui/src/screens/people/people.css`                   | credential field / copy button styling | new rules       | `apps/ui/src/screens/people/ResetPasswordDialog.tsx`                                           |
| `knowledge/traceability/manifest.json`                    | `US-027.tests`                   | filled in            | `aidlc-check` (check 4)                                                                         |

## Regression risk

| Area                                          | Risk   | Why                                                                                                                                             | Covered by                                                        |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Every existing `Dialog` consumer               | low    | `dismissible` is optional and defaults `true` — omitting it (every existing caller) reproduces today's exact render and escape/close behaviour     | Existing `Dialog`-consumer test suites stay green unmodified (no changes to their specs) |
| `AccountRowMenu`'s fixed four-item order       | medium | The existing test asserts a fixed 4-item list including one `aria-disabled` item; un-disabling "Reset password" changes both the accessible-name and the item count | `AccountRowMenu.spec.tsx` rewritten the same way US-023/024/025/026 rewrote their own equivalents |
| `must_change_password` sign-in gate (US-004)   | medium | This is the first writer to set the flag back to `true` on an already-active account; a bug here could either fail to force the change or force it on the wrong account | New repository/service tests for `armMustChangePassword`/`resetPassword`, plus an AC-07 test asserting the *affected* account (not the caller) is gated |
| Wrong write order stranding a credential       | **was high, now eliminated** | The original plan wrote Supabase Auth before `user_profiles`; a failure between the two could leave an account holding a password nobody has seen. **Fixed per the Architect design note's blocker finding (F1)**: `user_profiles` write first (which also serves as the existence check — no `findById`), Supabase Auth second, following `updateAccount`'s established order (ADR-012) | `users.service.spec.ts` — a dedicated case for a mid-sequence Auth failure (design note §12 item 1) |
| Log output leaking the password (AC-08)        | high   | Every log call anywhere in the new code path is a place the password string could leak if a future edit passes the whole request/response object instead of named fields | A dedicated AC-08 test asserting the mocked logger is never called with the password value, per the story's own QA notes |

## Deliberately not touched

- `apps/ui/src/lib/generate-password.ts` and `UserFormDialog.tsx`'s **Suggest a password** flow (US-021/US-022) — a different generator, for a different act (creation, client-supplied), stays as it is.
- `PasswordField` component — the reset result is a *display*, never an editable field, so it gets its own markup inside `ResetPasswordDialog.tsx` rather than reusing or modifying `PasswordField`.
- `auth.repository.ts`'s `clearMustChangePassword` — untouched; this story only adds the re-arming direction, on a different module (`modules/users`, not `modules/auth`).
- `adminUserSchema` — no `mustChangePassword` field is added to it; the People list does not need to display this fact (confirmed by reading `users.ts:22-28`'s own docblock on deliberately narrow admin-list fields).

# US-027 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                     |
| ----------- | --------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-027-reset-somebodys-password.md`   |
| **Updated** | 2026-09-20                                                           |

## Requirement to code

| Req    | File                                                    | Symbol / location                          | Proven by                              | Status      |
| ------ | ---------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ----------- |
| FR-01  | `apps/api/src/modules/admin/admin.router.ts`              | `POST /users/:id/reset-password`             | `admin.routes.spec.ts`                    | implemented |
| FR-02  | `apps/ui/src/screens/people/ResetPasswordDialog.tsx`      | confirm phase body copy                      | `ResetPasswordDialog.spec.tsx`, `copy.spec.ts` | implemented |
| FR-03  | `apps/ui/src/screens/people/ResetPasswordDialog.tsx`      | result phase credential field + Copy         | `ResetPasswordDialog.spec.tsx`            | implemented |
| FR-04  | `apps/ui/src/components/dialog/Dialog.tsx`                | `dismissible` prop                           | `Dialog.spec.tsx`, `ResetPasswordDialog.spec.tsx` | implemented |
| FR-05  | `apps/ui/src/screens/people/use-reset-password-dialog.ts` | result state cleared on `dismiss()`          | `use-reset-password-dialog.spec.ts`, `People.spec.tsx` | implemented |
| FR-06  | `apps/api/src/modules/users/users.adapter.ts`             | `UsersAuthAdapter.setPassword`               | `users.adapter.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-07  | `apps/api/src/modules/users/users.repository.ts`          | `armMustChangePassword`                      | `users.repository.spec.ts`, `users.service.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-08  | `apps/api/src/modules/users/users.service.ts`             | `resetPassword` (no password in any log call) | `users.adapter.spec.ts`, `users.service.spec.ts` | implemented |
| FR-09  | `apps/api/src/modules/users/users.service.ts`, `apps/ui/src/screens/people/use-reset-password-dialog.ts` | write-order (D-06) + `busy`/`outcome: 'failed'` state | `users.service.spec.ts`, `use-reset-password-dialog.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-10  | `apps/api/src/modules/users/users.repository.ts`          | `armMustChangePassword` (unconditional write) | `users.repository.spec.ts`, `users.service.spec.ts`, `People.spec.tsx` | implemented |
| FR-11  | `apps/api/src/http/middleware/require-admin.ts`           | mount-level guard (inherited, not re-checked) | `admin.routes.spec.ts`, `AccountRowMenu.spec.tsx`, `People.spec.tsx` | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it. A requirement with no code yet gets a row with status `not started` and `—` in File; a row is how you can see what is missing.

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------ | --------- | ----------- |
| NFR-01 | `apps/api/src/modules/admin/admin.router.ts` | `Cache-Control: private, no-store` on the reset response | `admin.routes.spec.ts` | implemented |
| NFR-02 | `apps/ui/src/screens/people/people.css` | credential field responsive rules (built on existing `--f-mono`/`--t-mono`/`--lh-mono` tokens, no new breakpoint) | manual check against the approved SCR-008 spec text at 360/768/1280 | implemented |

## Key symbols

| Symbol                          | Location                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `generateResetPassword`          | `apps/api/src/domain/generate-reset-password.ts`                |
| `resetPasswordResponseSchema`    | `libs/contracts/src/users.ts`                                   |
| `UsersAuthAdapter.setPassword`   | `apps/api/src/modules/users/users.adapter.ts`                    |
| `armMustChangePassword`          | `apps/api/src/modules/users/users.repository.ts`                 |
| `resetPassword` (service)        | `apps/api/src/modules/users/users.service.ts`                    |
| `Dialog.dismissible`             | `apps/ui/src/components/dialog/Dialog.tsx`                       |
| `ResetPasswordDialog`            | `apps/ui/src/screens/people/ResetPasswordDialog.tsx`             |
| `useResetPasswordDialog`         | `apps/ui/src/screens/people/use-reset-password-dialog.ts`        |
| `resetPassword` (fetcher)        | `apps/ui/src/lib/reset-password.ts`                              |

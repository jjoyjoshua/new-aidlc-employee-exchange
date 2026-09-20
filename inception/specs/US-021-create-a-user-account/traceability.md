# US-021 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-021-create-a-user-account.md` |
| **Updated** | 2026-09-20                                       |

## Requirement to code

| Req    | File                                                             | Symbol / location                          | Proven by                                                                 | Status      |
| ------ | ------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| FR-01  | `apps/api/src/modules/admin/admin.router.ts`                       | `router.post('/users', ...)`                | `apps/api/src/modules/admin/admin.routes.spec.ts` (US-021/AC-01)             | implemented |
| FR-02  | `libs/contracts/src/users.ts`                                      | `createAccountRequestSchema` (`role`)        | `libs/contracts/src/users.spec.ts` (US-021/AC-02)                            | implemented |
| FR-03  | `libs/contracts/src/users.ts`                                      | `createAccountRequestSchema` (`password`)    | `libs/contracts/src/users.spec.ts`, `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-021/AC-03) | implemented |
| FR-04  | `apps/ui/src/screens/people/UserFormDialog.tsx`                    | `<PolicyChecklist rules={rules} .../>`       | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-021/AC-04)          | implemented |
| FR-05  | `apps/ui/src/lib/generate-password.ts`                             | `generatePassword`                           | `apps/ui/src/lib/generate-password.spec.ts` (US-021/AC-04)                   | implemented |
| FR-06  | `apps/ui/src/screens/people/UserFormDialog.tsx`                    | `handleSubmit` (client-side `safeParse`)     | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-021/AC-05)          | implemented |
| FR-07  | `apps/api/src/modules/users/users.service.ts`, `admin.router.ts`   | `createAccount` (duplicate branch), the route | `apps/api/src/modules/users/users.service.spec.ts`, `admin.routes.spec.ts` (US-021/AC-06) | implemented |
| FR-08  | `apps/ui/src/screens/people/UserFormDialog.tsx`, `copy.ts`         | the unconditional `<Alert>` (`DELIVERY_WARNING`) | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-021/AC-07)          | implemented |
| FR-09  | `apps/api/src/modules/users/users.repository.ts`                  | `insertProfile` (no `must_change_password` key) | `apps/api/src/modules/users/users.repository.spec.ts` (US-021/AC-08)        | implemented |
| FR-10  | `apps/ui/src/screens/people/copy.ts`, `People.tsx`                 | `accountCreatedToast`, `handleCreated`       | `apps/ui/src/screens/people/copy.spec.ts`, `People.spec.tsx` (US-021/AC-09)  | implemented |
| FR-11  | `apps/api/src/modules/users/users.adapter.ts`                      | `createAccount` (`email_confirm: true`)      | `apps/api/src/modules/users/users.adapter.spec.ts` (US-021/AC-10) — proven as an absence: the `notifications` module is untouched by this story | implemented |
| FR-12  | `apps/ui/src/screens/people/use-user-form-dialog.ts`               | `inFlight` ref guard; ST-08 retains all fields | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (ST-06, ST-08; US-021/AC-11) | implemented |
| FR-13  | `apps/api/src/http/app.ts` (inherited `requireAdmin` mount)        | —                                             | `apps/api/src/modules/admin/admin.routes.spec.ts` (US-021/AC-12)             | implemented |
| NFR-01 | `apps/ui/src/components/policy-checklist/`, `text-field/`         | (existing components, reused verbatim)       | `apps/ui/src/screens/people/UserFormDialog.spec.tsx`                         | implemented |
| NFR-02 | `apps/ui/src/components/dialog/dialog.css`                         | (existing shared modal/full-screen CSS, reused — no new responsive CSS needed for this story) | visual — no automated breakpoint test, matching `DeskFormDialog`'s own precedent | implemented |
| NFR-03 | `apps/api/src/modules/admin/admin.router.ts`                       | `res.setHeader('Cache-Control', 'private, no-store')` | `apps/api/src/modules/admin/admin.routes.spec.ts` (US-021/AC-01 case)        | implemented |

## Key symbols

| Symbol                            | Location                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| `createAccountRequestSchema`      | `libs/contracts/src/users.ts`                                        |
| `emailTakenDetailsSchema`         | `libs/contracts/src/users.ts`                                        |
| `usersAuthAdapter`, `UsersAuthAdapter` | `apps/api/src/modules/users/users.adapter.ts`                    |
| `createUsersService(...).createAccount` | `apps/api/src/modules/users/users.repository.ts` (`findByEmail`, `insertProfile`), `users.service.ts` |
| `UserFormDialog`                   | `apps/ui/src/screens/people/UserFormDialog.tsx`                      |
| `useUserFormDialog`                | `apps/ui/src/screens/people/use-user-form-dialog.ts`                 |
| `RadioGroup`, `RadioOption`        | `apps/ui/src/screens/people/RadioGroup.tsx`                          |
| `generatePassword`                 | `apps/ui/src/lib/generate-password.ts`                               |
| `createCreateAccount`              | `apps/ui/src/lib/create-account.ts`                                  |
| `useUsers(...).markAdded`          | `apps/ui/src/lib/use-users.ts`                                       |

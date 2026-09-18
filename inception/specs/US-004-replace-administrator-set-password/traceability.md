# US-004 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                                |
| ----------- | -------------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-004-replace-administrator-set-password.md`   |
| **Updated** | 2026-09-18                                                                       |

## Requirement to code

| Req    | File                                                        | Symbol / location                | Proven by                                                              | Status      |
| ------ | ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------- | ----------- |
| FR-01  | `apps/api/src/http/middleware/require-session.ts`            | `requireSession` step 5           | `apps/api/src/modules/auth/auth.routes.spec.ts`                          | implemented |
| FR-02  | `apps/api/src/http/middleware/require-session.ts`            | `requireSession` (steps 1-4 order) | `apps/api/src/modules/auth/auth.routes.spec.ts`                          | implemented |
| FR-03  | `apps/api/src/http/middleware/require-session.ts`            | `requireSession` step 5, before `requireAdmin` | `apps/api/src/modules/auth/auth.routes.spec.ts`               | implemented |
| FR-04  | `apps/api/src/composition.ts`, `apps/api/src/modules/auth/auth.router.ts` | `sessionForPasswordChange`, `GET /session` mount | `apps/api/src/modules/auth/auth.routes.spec.ts`              | implemented |
| FR-05  | `apps/api/src/http/middleware/require-session.ts`            | `RequireSessionDeps.passwordChangeGate` | `apps/api/src/modules/auth/auth.routes.spec.ts`                     | implemented |
| FR-06  | `libs/contracts/src/auth.ts`                                 | `setPasswordRequestSchema`        | `libs/contracts/src/auth.spec.ts`                                        | implemented |
| FR-07  | `libs/contracts/src/auth.ts`, `apps/api/src/modules/auth/auth.router.ts` | `setPasswordRequestSchema`, `POST /set-password` | `apps/api/src/modules/auth/auth.routes.spec.ts`               | implemented |
| FR-08  | `apps/api/src/modules/auth/auth.service.ts`                  | `setPassword` (`not-required`)    | `apps/api/src/modules/auth/auth.service.spec.ts`, `apps/api/src/modules/auth/auth.routes.spec.ts`  | implemented |
| FR-09  | `apps/api/src/modules/auth/auth.service.ts`                  | `setPassword` (the probe)         | `apps/api/src/modules/auth/auth.service.spec.ts`, `apps/api/src/modules/auth/auth.routes.spec.ts`  | implemented |
| FR-10  | `apps/api/src/modules/auth/auth.service.ts`                  | `setPassword` (probe revoke)      | `apps/api/src/modules/auth/auth.service.spec.ts`                         | implemented |
| FR-11  | `apps/api/src/modules/auth/auth.service.ts`                  | `setPassword` (`unavailable`)     | `apps/api/src/modules/auth/auth.service.spec.ts`                         | implemented |
| FR-12  | `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/auth/auth.adapter.ts`, `apps/api/src/modules/auth/auth.repository.ts` | `setPassword`, `AuthAdapter.setPassword`, `clearMustChangePassword` | `apps/api/src/modules/auth/auth.service.spec.ts`, `apps/api/src/modules/auth/auth.adapter.spec.ts`, `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-13  | `apps/api/src/modules/auth/auth.service.ts`                  | `setPassword` (write failure)     | `apps/api/src/modules/auth/auth.service.spec.ts`                         | implemented |
| FR-14  | `apps/api/src/modules/auth/auth.service.ts`                  | `setPassword` (clear failure)     | `apps/api/src/modules/auth/auth.service.spec.ts`                         | implemented |
| FR-15  | `apps/api/src/modules/auth/auth.router.ts`, `apps/api/src/modules/auth/auth.service.ts`, `libs/contracts/src/auth.ts` | `POST /set-password` response, the re-sign-in fallback (design note §6.4, confirmed) | `apps/api/src/modules/auth/auth.routes.spec.ts`, `apps/api/src/modules/auth/auth.service.spec.ts`, `libs/contracts/src/auth.spec.ts`, `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-16  | `apps/api/src/modules/auth/auth.service.ts`                  | `setPassword` (no extra revoke)   | `apps/api/src/modules/auth/auth.service.spec.ts`                         | implemented |
| FR-17  | `libs/contracts/src/password.ts`                             | `evaluatePasswordPolicy`, `newPasswordSchema` | `libs/contracts/src/password.spec.ts`                       | implemented |
| FR-18  | `libs/contracts/src/auth.ts`                                 | `setPasswordRequestSchema`, `setPasswordResponseSchema` | `libs/contracts/src/auth.spec.ts`                    | implemented |
| FR-19  | `libs/contracts/src/error.ts`                                | `errorCodeSchema`                 | `libs/contracts/src/error.spec.ts`                                       | implemented |
| FR-20  | `apps/ui/src/lib/auth/landing.ts`, `apps/ui/src/screens/sign-in/SignIn.tsx` | `landingPathFor`  | `apps/ui/src/lib/auth/landing.spec.ts`, `apps/ui/src/screens/sign-in/SignIn.spec.tsx` | implemented |
| FR-21  | `apps/ui/src/lib/auth/require-session.tsx`                   | `RequireSession`                  | `apps/ui/src/lib/auth/require-session.spec.tsx`                          | implemented |
| FR-22  | `apps/ui/src/lib/auth/require-password-change.tsx`           | `RequirePasswordChange`           | `apps/ui/src/lib/auth/require-password-change.spec.tsx`                  | implemented |
| FR-23  | `apps/ui/src/routes.tsx`                                     | `/set-password` route             | `apps/ui/src/lib/auth/require-password-change.spec.tsx` (guard), `apps/ui/src/screens/set-password/SetPassword.spec.tsx` (screen) — wiring itself is not independently exercised, matching this project's existing treatment of route registration | implemented |
| FR-24  | `apps/ui/src/lib/auth/auth-context.tsx`                      | `setPassword`                     | `apps/ui/src/lib/auth/auth-context.spec.tsx`                             | implemented |
| FR-25  | `apps/ui/src/components/policy-checklist/PolicyChecklist.tsx` | `PolicyChecklist`               | `apps/ui/src/components/policy-checklist/PolicyChecklist.spec.tsx`       | implemented |
| FR-26  | `apps/ui/src/screens/set-password/SetPassword.tsx`           | `SetPassword`                     | `apps/ui/src/screens/set-password/SetPassword.spec.tsx`                  | implemented |
| FR-27  | `apps/ui/src/screens/set-password/SetPassword.tsx`           | `SetPassword` (Sign out control)  | `apps/ui/src/screens/set-password/SetPassword.spec.tsx`                  | implemented |
| FR-28  | `apps/ui/src/components/toast/Toast.tsx`, `apps/ui/src/screens/my-bookings/MyBookings.tsx`, `apps/ui/src/screens/all-bookings/AllBookings.tsx` | `Toast` | `apps/ui/src/components/toast/Toast.spec.tsx`, `apps/ui/src/screens/my-bookings/MyBookings.spec.tsx`, `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` | implemented |
| NFR-01 | `apps/api/src/modules/auth/auth.router.ts`, `apps/api/src/modules/auth/auth.adapter.ts` | (absence of logging) | verified by code review against `decisions.md` D-06 — a negative constraint has no positive test to write | implemented |
| NFR-02 | `apps/ui/src/components/policy-checklist/PolicyChecklist.tsx` | icon + text per rule status      | `apps/ui/src/components/policy-checklist/PolicyChecklist.spec.tsx`       | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it.

## Key symbols

| Symbol                     | Location                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `requireSession`            | `apps/api/src/http/middleware/require-session.ts`               |
| `createAuthService`         | `apps/api/src/modules/auth/auth.service.ts`                     |
| `createAuthRouter`          | `apps/api/src/modules/auth/auth.router.ts`                      |
| `evaluatePasswordPolicy`    | `libs/contracts/src/password.ts`                                |
| `newPasswordSchema`         | `libs/contracts/src/password.ts`                                |
| `landingPathFor`            | `apps/ui/src/lib/auth/landing.ts`                               |
| `RequirePasswordChange`     | `apps/ui/src/lib/auth/require-password-change.tsx`              |
| `PolicyChecklist`           | `apps/ui/src/components/policy-checklist/PolicyChecklist.tsx`   |
| `Toast`                     | `apps/ui/src/components/toast/Toast.tsx`                        |
| `SetPassword`               | `apps/ui/src/screens/set-password/SetPassword.tsx`              |

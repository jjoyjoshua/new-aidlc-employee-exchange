# US-025 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-025-deactivate-an-account.md`  |
| **Updated** | 2026-09-20                                                         |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------ | --------- | ----------- |
| FR-01  | `apps/api/src/modules/users/users.repository.ts`, `users.service.ts`, `apps/api/src/modules/admin/admin.router.ts` | `previewDeactivation` (repository + service), `GET /users/:id/deactivation-preview` | `users.repository.spec.ts`, `users.service.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-02  | `supabase/migrations/0005_deactivate_account_cascade.sql`, `users.repository.ts`, `users.service.ts`, `admin.router.ts` | `deactivate_account_cascade()`, `usersRepository.deactivateAccount`, `usersService.deactivateAccount`, `POST /users/:id/deactivate` | `users.repository.spec.ts`, `users.service.spec.ts`, `admin.routes.spec.ts`, `admin.concurrency.spec.ts` (gated) | implemented |
| FR-03  | `supabase/migrations/0005_deactivate_account_cascade.sql` | the cascade's `WHERE b.status = 'confirmed' AND b.booking_date >= p_today` | `admin.concurrency.spec.ts` (gated, case 2) | implemented |
| FR-04  | `supabase/migrations/0004_last_active_admin_guard.sql` (unmodified), `users.repository.ts`, `admin.router.ts` | reused `LAST_ACTIVE_ADMIN_SQLSTATE`/`Z0011` mapping, `422 last_active_admin` | `users.repository.spec.ts`, `admin.routes.spec.ts`, `admin.concurrency.spec.ts` (gated, case 1) | implemented |
| FR-05  | `supabase/migrations/0005_deactivate_account_cascade.sql` (no `EXCEPTION` block — the trigger's abort unwinds the whole function) | `deactivate_account_cascade()` | `admin.concurrency.spec.ts` (gated, case 1, case 4) | implemented |
| FR-06  | `apps/ui/src/screens/people/DeactivateAccountDialog.tsx`, `copy.ts` | ST-06 body (`deactivateConfirmBodyWithBookings`, `deactivateAndCancelLabel`) | `DeactivateAccountDialog.spec.tsx`, `copy.spec.ts`, `People.spec.tsx` | implemented |
| FR-07  | `apps/ui/src/screens/people/DeactivateAccountDialog.tsx`, `copy.ts` | ST-05 body (`DEACTIVATE_CONFIRM_BODY_NO_BOOKINGS`) | `DeactivateAccountDialog.spec.tsx`, `copy.spec.ts`, `People.spec.tsx` | implemented |
| FR-08  | `apps/ui/src/screens/people/use-deactivate-account-dialog.ts` | `inFlight` ref, `busy` state, `Dialog`'s own Escape suppression | `use-deactivate-account-dialog.spec.ts`, `DeactivateAccountDialog.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/lib/use-users.ts`, `apps/ui/src/screens/people/People.tsx`, `copy.ts` | `markDeactivated`, `deactivatedToast` | `use-users.spec.ts`, `People.spec.tsx`, `copy.spec.ts` | implemented |
| FR-10  | inherited — `apps/api/src/http/middleware/require-admin.ts` (unchanged) | `requireAdmin` mount | `admin.routes.spec.ts` (AC-14 case) | implemented |
| FR-11  | inherited — `apps/api/src/modules/auth/**`, `apps/api/src/http/middleware/require-session.ts` (unchanged, US-001/AC-04) | sign-in/session `is_active` check | existing `auth.service.spec.ts`/`require-session.spec.ts` suites, unmodified | implemented |
| FR-12  | `supabase/migrations/0005_deactivate_account_cascade.sql`, `users.repository.ts` | `cancelled_bookings` jsonb array (`id, desk_id, desk_number, booking_date, cancellation_source`), `CancelledBookingRow` | `users.repository.spec.ts`, `admin.concurrency.spec.ts` (gated, case 2) | implemented |

## Key symbols

| Symbol                            | Location            |
| --------------------------------- | -------------------- |
| `deactivate_account_cascade()` (function) | `supabase/migrations/0005_deactivate_account_cascade.sql` |
| `usersRepository.previewDeactivation` | `apps/api/src/modules/users/users.repository.ts` |
| `usersRepository.deactivateAccount`   | `apps/api/src/modules/users/users.repository.ts` |
| `usersService.previewDeactivation`    | `apps/api/src/modules/users/users.service.ts` |
| `usersService.deactivateAccount`      | `apps/api/src/modules/users/users.service.ts` |
| `GET /api/admin/users/:id/deactivation-preview` | `apps/api/src/modules/admin/admin.router.ts` |
| `POST /api/admin/users/:id/deactivate` | `apps/api/src/modules/admin/admin.router.ts` |
| `deactivationPreviewSchema` | `libs/contracts/src/users.ts` |
| `createPreviewDeactivation`, `createDeactivateAccount` | `apps/ui/src/lib/deactivate-account.ts` |
| `DeactivateAccountDialog`          | `apps/ui/src/screens/people/DeactivateAccountDialog.tsx` |
| `useDeactivateAccountDialog`       | `apps/ui/src/screens/people/use-deactivate-account-dialog.ts` |
| `useUsers.markDeactivated`         | `apps/ui/src/lib/use-users.ts` |
| `AccountRowMenu`'s deactivate branch | `apps/ui/src/screens/people/AccountRowMenu.tsx` |

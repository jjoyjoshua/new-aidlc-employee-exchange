# US-015 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                       |
| ----------- | --------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-015-cancel-a-booking-on-behalf.md` |
| **Updated** | 2026-09-19                                                             |

## Requirement to code

| Req | File | Symbol / location | Proven by | Status |
| --- | --- | --- | --- | --- |
| FR-01 | `apps/api/src/modules/admin/admin.router.ts:103` | `POST /bookings/:id/cancel` | `apps/api/src/modules/admin/admin.routes.spec.ts` | implemented |
| FR-02 | `apps/api/src/modules/bookings/admin-bookings.repository.ts:199` | `cancelAnyBooking` | `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` | implemented |
| FR-03 | `apps/api/src/modules/bookings/admin-bookings.repository.ts:218` | `findBookingState` | `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` | implemented |
| FR-04 | `apps/api/src/modules/bookings/admin-bookings.service.ts:121` | `cancelAnyBooking` | `apps/api/src/modules/bookings/admin-bookings.service.spec.ts` | implemented |
| FR-05 | `apps/api/src/modules/admin/admin.router.ts:40` | `requireActingAdmin` | `apps/api/src/modules/admin/admin.routes.spec.ts` | implemented |
| FR-06 | `apps/ui/src/screens/all-bookings/use-all-bookings.ts:130` | `markCancelled` | `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` | implemented |
| FR-07 | `apps/ui/src/screens/all-bookings/use-admin-cancel-dialog.ts:33` | `useAdminCancelDialog` | `apps/ui/src/screens/all-bookings/use-admin-cancel-dialog.spec.ts` | implemented |
| FR-08 | `apps/ui/src/lib/cancel-booking.ts:66` | `createAdminCancelBooking` | `apps/ui/src/lib/cancel-booking.spec.ts` | implemented |
| FR-09 | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx:56` | `AdminBookingRow` | `apps/ui/src/screens/all-bookings/AdminBookingRow.spec.tsx` | implemented |
| FR-10 | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx:30`, `AdminSkeletonRow.tsx` | `AdminBookingsTableHead`, `AdminSkeletonRow` | `AdminBookingRow.spec.tsx` | implemented |
| FR-11 | `apps/ui/src/screens/all-bookings/AllBookings.tsx:138-167,248` | `handleCancelled`, `handleAlreadyCancelled`, the focus-return effect, `<ConfirmDialog>` | `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` | implemented |
| FR-12 | `apps/ui/src/screens/all-bookings/copy.ts` | `cancelReason`, `cancelDialogTitle`, `cancelDialogBody`, `CANCEL_*`, `alreadyCancelledMessage`, `cancelledToast` | `apps/ui/src/screens/all-bookings/copy.spec.ts` | implemented |
| FR-13 | `apps/ui/src/screens/all-bookings/AdminSkeletonRow.tsx`, `all-bookings.css` | (360px card height, 188px) | `AllBookings.spec.tsx` (US-013/AC-09) | implemented |
| FR-14 | `apps/ui/src/screens/all-bookings/AdminBookingRow.spec.tsx` | (extended 5-header assertion) | itself | implemented |
| FR-15 | `apps/ui/src/screens/all-bookings/AllBookings.tsx` | (structural absence) | `AllBookings.spec.tsx` | implemented |
| NFR-01 | `apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts` | (two new gated tests) | itself, `RUN_BOOKINGS_CONCURRENCY_TEST=1` | implemented, **not run** — no disposable Postgres project available in this environment; see `change-log.md` |
| NFR-02 | `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` | (recording fake gains `update`/`maybeSingle`) | itself | implemented |

## Key symbols

| Symbol | Location |
| --- | --- |
| `CancelAnyBookingOutcome` | `apps/api/src/modules/bookings/admin-bookings.service.ts:32` |
| `cancelAnyBooking` (repository) | `apps/api/src/modules/bookings/admin-bookings.repository.ts:199` |
| `cancelAnyBooking` (service) | `apps/api/src/modules/bookings/admin-bookings.service.ts:121` |
| `findBookingState` | `apps/api/src/modules/bookings/admin-bookings.repository.ts:218` |
| `requireActingAdmin` | `apps/api/src/modules/admin/admin.router.ts:40` |
| `createAdminCancelBooking` | `apps/ui/src/lib/cancel-booking.ts:66` |
| `useAdminCancelDialog` | `apps/ui/src/screens/all-bookings/use-admin-cancel-dialog.ts:33` |
| `markCancelled` | `apps/ui/src/screens/all-bookings/use-all-bookings.ts:130` |

# US-029 — traceability

|             |                                                                        |
| ----------- | -------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-029-booking-cancellation-email.md`    |
| **Updated** | 2026-09-21                                                                |

## Requirement to code

| Req   | File | Symbol / location | Proven by | Status      |
| ----- | ---- | ------------------ | --------- | ----------- |
| FR-01 | `apps/api/src/modules/notifications/notifications.service.ts`, `apps/api/src/domain/format-display-date.ts`, `apps/api/src/domain/cancellation-copy.ts` | `sendBookingCancellation`, `formatShortDate`, `cancellationCopy` | `apps/api/src/modules/notifications/notifications.service.spec.ts`, `apps/api/src/domain/format-display-date.spec.ts`, `apps/api/src/domain/cancellation-copy.spec.ts` — `(US-029/AC-01)`, `(US-029/AC-02)`, `(US-029/AC-04, AC-05, AC-06)`, `(US-029/AC-08)`, `(US-029/AC-10)` | implemented |
| FR-02 | `apps/api/src/modules/bookings/bookings.repository.ts` | `cancelOwnedBooking` | `apps/api/src/modules/bookings/bookings.repository.spec.ts` | implemented |
| FR-03 | `apps/api/src/modules/bookings/bookings.router.ts`, `apps/api/src/modules/bookings/bookings.service.ts` | `POST /:id/cancel` handler, `cancelBooking` | `apps/api/src/modules/bookings/bookings.routes.spec.ts`, `apps/api/src/modules/bookings/bookings.service.spec.ts` — `(US-029/AC-01, US-029/AC-02, US-029/AC-05)`, `(US-029/AC-09)`, `(US-029/AC-10)` | implemented |
| FR-04 | `apps/api/src/modules/bookings/admin-bookings.repository.ts` | `cancelAnyBooking` | `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` | implemented |
| FR-05 | `apps/api/src/modules/admin/admin.router.ts`, `apps/api/src/modules/bookings/admin-bookings.service.ts` | `POST /bookings/:id/cancel` handler, `cancelAnyBooking` | `apps/api/src/modules/admin/admin.routes.spec.ts`, `apps/api/src/modules/bookings/admin-bookings.service.spec.ts` — `(US-029/AC-01, US-029/AC-02, US-029/AC-04, US-029/AC-07)`, `(US-029/AC-09)`, `(US-029/AC-10)` | implemented |
| FR-06 | `apps/api/src/modules/users/users.service.ts` | `deactivateAccount` | `apps/api/src/modules/users/users.service.spec.ts` — `(US-029/D-04)` | implemented |
| FR-07 | `apps/api/src/modules/admin/admin.router.ts` | `POST /users/:id/deactivate` handler | `apps/api/src/modules/admin/admin.routes.spec.ts` — `(US-029/AC-03)`, `(US-029/AC-10)` | implemented |
| FR-08 | (no new production code) | — | `apps/api/src/modules/bookings/bookings.routes.spec.ts`, `apps/api/src/modules/admin/admin.routes.spec.ts` — `(US-029/AC-09)` | implemented |

Every `FR-##` above has a row here, filled as the code lands, in the same commit.

## AC to requirement

| AC    | Served by            |
| ----- | --------------------- |
| AC-01 | FR-01, FR-03, FR-05   |
| AC-02 | FR-01, FR-02, FR-03, FR-04, FR-05 |
| AC-03 | FR-06, FR-07          |
| AC-04 | FR-01, FR-04, FR-05, FR-07 |
| AC-05 | FR-01, FR-03          |
| AC-06 | FR-01, FR-06, FR-07   |
| AC-07 | FR-03, FR-04, FR-05, FR-07 |
| AC-08 | FR-01, FR-03, FR-05, FR-07 |
| AC-09 | FR-08                 |
| AC-10 | FR-03, FR-05, FR-07   |

## Key symbols

| Symbol                    | Location                                                          |
| -------------------------- | ------------------------------------------------------------------ |
| `sendBookingCancellation`  | `apps/api/src/modules/notifications/notifications.service.ts`     |
| `formatShortDate`          | `apps/api/src/domain/format-display-date.ts`                      |
| `cancellationCopy`         | `apps/api/src/domain/cancellation-copy.ts`                        |
| `POST /:id/cancel` handler | `apps/api/src/modules/bookings/bookings.router.ts`                 |
| `POST /bookings/:id/cancel` handler | `apps/api/src/modules/admin/admin.router.ts`               |
| `POST /users/:id/deactivate` handler | `apps/api/src/modules/admin/admin.router.ts`              |

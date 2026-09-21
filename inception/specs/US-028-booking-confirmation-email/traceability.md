# US-028 — traceability

|             |                                                                        |
| ----------- | -------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-028-booking-confirmation-email.md`    |
| **Updated** | 2026-09-21                                                                |

## Requirement to code

| Req   | File                                                              | Symbol / location         | Proven by                                                                                                                                                       | Status      |
| ----- | ---------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| FR-01 | `apps/api/src/modules/notifications/notifications.service.ts`         | `sendBookingConfirmation`   | `apps/api/src/modules/notifications/notifications.service.spec.ts` — `(US-028/AC-01, US-028/AC-03)`, `(US-028/AC-02)`, `(US-028/AC-04)`, `(US-028/AC-08)`         | implemented |
| FR-02 | `apps/api/src/modules/bookings/bookings.router.ts`                    | `POST /` handler            | `apps/api/src/modules/bookings/bookings.routes.spec.ts` — `(US-028/AC-01, US-028/AC-02, US-028/AC-06)`                                                            | implemented |
| FR-03 | `apps/api/src/modules/bookings/bookings.router.ts`                    | `POST /` handler            | `apps/api/src/modules/bookings/bookings.routes.spec.ts` — `(US-028/AC-05)`                                                                                        | implemented |
| FR-04 | `apps/api/src/modules/bookings/bookings.router.ts`                    | `POST /` handler            | `apps/api/src/modules/bookings/bookings.routes.spec.ts` — `(US-028/AC-07)` (x2); `apps/api/src/modules/notifications/notifications.service.spec.ts` — `(US-028/AC-07)` | implemented |

Every `FR-##` above has a row here, filled as the code landed, in the same commit.

## AC to requirement

| AC     | Served by |
| ------ | ------------ |
| AC-01  | FR-01, FR-02 |
| AC-02  | FR-01, FR-02 |
| AC-03  | FR-01        |
| AC-04  | FR-01        |
| AC-05  | FR-03        |
| AC-06  | FR-02        |
| AC-07  | FR-04        |
| AC-08  | FR-01        |

## Key symbols

| Symbol                       | Location                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `sendBookingConfirmation`      | `apps/api/src/modules/notifications/notifications.service.ts`     |
| `POST /api/bookings` handler   | `apps/api/src/modules/bookings/bookings.router.ts`                 |

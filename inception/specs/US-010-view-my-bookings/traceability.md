# US-010 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                               |
| ----------- | ----------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-010-view-my-bookings.md`       |
| **Updated** | 2026-09-19                                                         |

## Requirement to code

| Req    | File                                                                       | Symbol / location                          | Proven by                                        | Status      |
| ------ | ----------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- | ----------- |
| FR-01  | `apps/api/src/modules/bookings/bookings.router.ts`                             | `GET /` handler                               | `bookings.routes.spec.ts`                           | implemented |
| FR-02  | `apps/api/src/modules/bookings/bookings.service.ts`                            | `listMyBookings`                              | `bookings.service.spec.ts`, `bookings.routes.spec.ts` | implemented |
| FR-03  | `libs/contracts/src/bookings.ts`                                                | `myBookingsResponseSchema`                    | `bookings.spec.ts` (contract)                       | implemented |
| FR-04  | `libs/contracts/src/bookings.ts`                                                | `bookingDisplayStatusSchema`, `myBookingsQuerySchema`, `myBookingListItemSchema` | `bookings.spec.ts` (contract)    | implemented |
| FR-05  | `apps/api/src/domain/booking-history.ts`                                       | `bookingDisplayStatus`, `historyFloor`, `HISTORY_WINDOW_DAYS` | `booking-history.spec.ts`          | implemented |
| FR-06  | `apps/api/src/modules/bookings/bookings.repository.ts`                         | `listMyBookingsInWindow`, `findMyNewestBookingBefore` | `bookings.repository.spec.ts`               | implemented |
| FR-07  | `apps/api/src/modules/bookings/bookings.service.ts`                            | `listMyBookings`                              | `bookings.service.spec.ts`                          | implemented |
| FR-08  | `apps/api/src/modules/bookings/bookings.router.ts`                             | `GET /` handler                               | `bookings.routes.spec.ts`                           | implemented |
| FR-09  | `apps/ui/src/screens/my-bookings/MyBookings.tsx`                               | `MyBookingsReady` sectioning logic             | `MyBookings.spec.tsx`                               | implemented |
| FR-10  | `apps/ui/src/screens/my-bookings/MyBookings.tsx`, `apps/ui/src/screens/my-bookings/copy.ts` | ST-03 / ST-04 render + copy       | `MyBookings.spec.tsx`, `copy.spec.ts`               | implemented |
| FR-11  | `apps/ui/src/screens/my-bookings/MyBookings.tsx`                               | loading render                                | `MyBookings.spec.tsx`                               | implemented |
| FR-12  | `apps/ui/src/screens/my-bookings/MyBookings.tsx`, `apps/ui/src/screens/my-bookings/use-my-bookings.ts` | error render, `retry()`   | `MyBookings.spec.tsx`, `use-my-bookings.spec.ts`    | implemented |
| FR-13  | `apps/ui/src/components/status-chip/StatusChip.tsx`                            | `kind: 'booking'` variant                     | `StatusChip.spec.tsx`                               | implemented |
| FR-14  | `apps/ui/src/screens/my-bookings/MyBookings.tsx`, `apps/ui/src/screens/my-bookings/copy.ts` | header line (`OFFICE_TIME`)      | `MyBookings.spec.tsx`                               | implemented |
| FR-15  | `apps/ui/src/screens/my-bookings/use-my-bookings.ts`                           | `loadOlder`, accumulation                      | `MyBookings.spec.tsx`, `use-my-bookings.spec.ts`    | implemented |
| NFR-01 | `apps/ui/src/screens/my-bookings/MyBookings.tsx`                               | single `role="status"` node                    | `MyBookings.spec.tsx`                               | implemented |
| NFR-02 | `apps/ui/src/screens/my-bookings/my-bookings.css`, `apps/ui/src/screens/my-bookings/booking-row.css` | control sizing                | visual/manual — no dedicated test                   | implemented |
| NFR-03 | `apps/api/src/domain/booking-history.ts`                                       | `bookingDisplayStatus`, `historyFloor`         | `booking-history.spec.ts`                           | implemented |

## Key symbols

| Symbol                       | Location                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `bookingDisplayStatus`         | `apps/api/src/domain/booking-history.ts`                                          |
| `historyFloor`                 | `apps/api/src/domain/booking-history.ts`                                          |
| `listMyBookingsInWindow`       | `apps/api/src/modules/bookings/bookings.repository.ts`                            |
| `findMyNewestBookingBefore`    | `apps/api/src/modules/bookings/bookings.repository.ts`                            |
| `listMyBookings`               | `apps/api/src/modules/bookings/bookings.service.ts`                               |
| `myBookingsResponseSchema`     | `libs/contracts/src/bookings.ts`                                                   |
| `bookingDisplayStatusSchema`   | `libs/contracts/src/bookings.ts`                                                   |
| `MyBookings`                   | `apps/ui/src/screens/my-bookings/MyBookings.tsx`                                   |
| `BookingRow`                   | `apps/ui/src/screens/my-bookings/BookingRow.tsx`                                   |
| `useMyBookings`                | `apps/ui/src/screens/my-bookings/use-my-bookings.ts`                              |
| `createFetchMyBookings`        | `apps/ui/src/screens/my-bookings/fetch-my-bookings.ts`                            |

# US-007 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                    |
| ----------- | -------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-007-book-an-available-desk.md` |
| **Updated** | 2026-09-18                                                          |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------- | ----------- | ----------- |
| FR-01  | `apps/api/src/modules/bookings/bookings.router.ts`, `.service.ts`, `.repository.ts` | `POST /`, `createBooking` | `bookings.routes.spec.ts`, `bookings.service.spec.ts` | implemented |
| FR-02  | `apps/api/src/modules/bookings/bookings.repository.ts` | `insertConfirmedBooking`, constraint-name mapping | `bookings.repository.spec.ts` (mapping logic), `bookings.repository.concurrency.spec.ts` (real Postgres, gated on `RUN_BOOKINGS_CONCURRENCY_TEST=1` — skipped in the default run) | implemented |
| FR-03  | `apps/api/src/modules/bookings/bookings.service.ts` | `createBooking`'s `refusalFor` guard | `bookings.service.spec.ts`, `bookings.routes.spec.ts` | implemented |
| FR-04  | `apps/api/src/modules/bookings/bookings.repository.ts`, `.service.ts` | `getDeskById`, active/exists guard | `bookings.repository.spec.ts`, `bookings.service.spec.ts` | implemented |
| FR-05  | `apps/api/src/modules/bookings/bookings.service.ts` | `getAvailability`'s `myBooking` projection | `bookings.service.spec.ts`, `bookings.routes.spec.ts` | implemented |
| FR-06  | `apps/api/src/modules/bookings/bookings.router.ts`, `.service.ts`, `.repository.ts` | `POST /:id/cancel`, `cancelBooking`, `cancelOwnedBooking` | `bookings.routes.spec.ts`, `bookings.service.spec.ts` | implemented |
| FR-07  | `apps/ui/src/components/desk-row/DeskRow.tsx`, `apps/ui/src/components/confirm-booking-bar/` | `selected`, `onSelect`, confirm label | `DeskRow.spec.tsx`, `ConfirmBookingBar.spec.tsx`, `BookADesk.spec.tsx` | implemented |
| FR-08  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | single-selection state | `BookADesk.spec.tsx`, `ZoneGroup.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | selection reset on date change | `BookADesk.spec.tsx` | implemented |
| FR-10  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx`, `apps/ui/src/screens/my-bookings/MyBookings.tsx` | post-confirm navigation + `bookingConfirmation` toast | `BookADesk.spec.tsx`, `MyBookings.spec.tsx` | implemented (toast only — "visible in Upcoming" is US-010's, D-08) |
| FR-11  | `apps/ui/src/components/existing-booking-state/`, `BookADesk.tsx` | `ExistingBookingState` | `ExistingBookingState.spec.tsx`, `BookADesk.spec.tsx` | implemented |
| FR-12  | `apps/ui/src/components/existing-booking-state/` | `ConfirmDialog` wiring, `cancel-booking.ts` | `ExistingBookingState.spec.tsx`, `cancel-booking.spec.ts` | implemented |
| FR-13  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | `409 desk_already_booked` handler | `BookADesk.spec.tsx` | implemented |
| FR-14  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | `409 already_booked_that_date` handler (refetch-then-render) | `BookADesk.spec.tsx` | implemented |
| FR-15  | `apps/ui/src/components/confirm-booking-bar/`, `apps/ui/src/screens/book-a-desk/use-book-desk.ts` | busy state, request de-dup | `ConfirmBookingBar.spec.tsx`, `use-book-desk.spec.ts`, `BookADesk.spec.tsx` | implemented |
| FR-16  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | generic-failure state | `BookADesk.spec.tsx` | implemented |
| NFR-01 | `apps/ui/src/components/desk-row/DeskRow.tsx`, `apps/ui/src/components/status-chip/StatusChip.tsx` (adds `selected`) | selected/available/taken rendering | `DeskRow.spec.tsx`, `StatusChip.spec.tsx` | implemented |
| NFR-02 | `apps/api/src/modules/bookings/bookings.service.ts` | server-side re-derivation | `bookings.service.spec.ts` | implemented |
| NFR-03 | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | assertive live regions + focus move | `BookADesk.spec.tsx` | implemented |

## Key symbols

| Symbol                    | Location                                                |
| -------------------------- | -------------------------------------------------------- |
| `insertConfirmedBooking`   | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `cancelOwnedBooking`       | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `getDeskById`              | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `findMyConfirmedBooking`   | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `createBooking`            | `apps/api/src/modules/bookings/bookings.service.ts`     |
| `cancelBooking`            | `apps/api/src/modules/bookings/bookings.service.ts`     |
| `ConfirmBookingBar`        | `apps/ui/src/components/confirm-booking-bar/`           |
| `ConfirmDialog`            | `apps/ui/src/components/confirm-dialog/`                |
| `ExistingBookingState`     | `apps/ui/src/components/existing-booking-state/`        |
| `createCancelBooking`      | `apps/ui/src/components/existing-booking-state/cancel-booking.ts` |
| `useBookDesk`              | `apps/ui/src/screens/book-a-desk/use-book-desk.ts`      |
| `createCreateBooking`      | `apps/ui/src/screens/book-a-desk/create-booking.ts`     |

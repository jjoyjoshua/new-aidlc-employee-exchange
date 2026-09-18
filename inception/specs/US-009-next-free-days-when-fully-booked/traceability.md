# US-009 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                    |
| ----------- | -------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-009-next-free-days-when-fully-booked.md` |
| **Updated** | 2026-09-18                                                          |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------- | ----------- | ----------- |
| FR-01  | `libs/contracts/src/availability.ts` | `availabilityResponseSchema.nextFreeDays` | `availability.spec.ts` | implemented |
| FR-02  | `apps/api/src/modules/bookings/bookings.service.ts` | `getAvailability`'s fully-booked branch | `bookings.service.spec.ts` | implemented |
| FR-03  | `apps/api/src/domain/next-free-days.ts` | `pickNextFreeDays` | `next-free-days.spec.ts` | implemented |
| FR-04  | `apps/api/src/modules/bookings/bookings.repository.ts` | `listConfirmedDeskIdsInRange`, `listMyConfirmedDatesInRange` | `bookings.repository.spec.ts` | implemented |
| FR-05  | `apps/api/src/modules/bookings/bookings.service.ts` | the `from > to` guard | `bookings.service.spec.ts` | implemented |
| FR-06  | `apps/api/src/modules/bookings/bookings.service.ts` | (no catch around the range reads) | `bookings.service.spec.ts` | implemented |
| FR-07  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | the ST-04 branch's position (also gated on `!confirmFailure`, D-07) | `BookADesk.spec.tsx` | implemented |
| FR-08  | `apps/ui/src/components/empty-state/EmptyState.tsx` | `EmptyStateProps` (`body?`, `actions?`) | `EmptyState.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/screens/book-a-desk/copy.ts` | `FULLY_BOOKED`, `FULLY_BOOKED_LEAD` | `copy.spec.ts` | implemented |
| FR-10  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | suggestion buttons (`selectDate`) | `BookADesk.spec.tsx` | implemented |
| FR-11  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | the "Pick another date" link inside `actions` | `BookADesk.spec.tsx` | implemented |
| FR-12  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | branch placement (structural absence) | `BookADesk.spec.tsx` | implemented |
| NFR-01 | `apps/ui/src/components/availability-count/AvailabilityCount.tsx` | unchanged | `BookADesk.spec.tsx` | implemented |
| NFR-02 | `apps/ui/src/components/button/Button.tsx` | unchanged | `BookADesk.spec.tsx` | implemented |
| D-07   | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | the `!confirmFailure` guard (discovered during implementation) | `BookADesk.spec.tsx` (US-007/AC-08 test) | implemented |

## Key symbols

| Symbol                          | Location                                                |
| -------------------------------- | -------------------------------------------------------- |
| `pickNextFreeDays`               | `apps/api/src/domain/next-free-days.ts`                 |
| `listConfirmedDeskIdsInRange`    | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `listMyConfirmedDatesInRange`    | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `FULLY_BOOKED`                   | `apps/ui/src/screens/book-a-desk/copy.ts`               |

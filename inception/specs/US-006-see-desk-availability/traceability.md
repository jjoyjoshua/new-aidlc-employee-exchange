# US-006 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                  |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-006-see-desk-availability.md` |
| **Updated** | 2026-09-18                                                        |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------- | ----------- | ----------- |
| FR-01  | `apps/api/src/modules/bookings/bookings.router.ts`, `apps/api/src/modules/bookings/bookings.service.ts` | `createBookingsRouter`, `getAvailability` | `apps/api/src/modules/bookings/bookings.routes.spec.ts`, `apps/api/src/modules/bookings/bookings.service.spec.ts` | implemented |
| FR-02  | `apps/api/src/modules/bookings/bookings.service.ts` | `getAvailability`'s projection | `apps/api/src/modules/bookings/bookings.service.spec.ts`, `apps/api/src/modules/bookings/bookings.routes.spec.ts` | implemented |
| FR-03  | `apps/api/src/modules/bookings/bookings.repository.ts` | `listActiveDesks` (`.eq('is_active', true)`) | `apps/api/src/modules/bookings/bookings.repository.spec.ts` | implemented |
| FR-04  | `apps/api/src/modules/bookings/bookings.repository.ts` | `listConfirmedDeskIds` (select list is `desk_id` only) | `apps/api/src/modules/bookings/bookings.repository.spec.ts`, `apps/api/src/modules/bookings/bookings.routes.spec.ts` | implemented |
| FR-05  | `libs/contracts/src/booking-window.ts`, `apps/api/src/modules/bookings/bookings.router.ts` | `officeDateSchema`, `date_not_bookable` mapping | `libs/contracts/src/booking-window.spec.ts`, `apps/api/src/modules/bookings/bookings.routes.spec.ts` | implemented |
| FR-06  | `apps/ui/src/screens/book-a-desk/zones.ts` | `groupByZone` | `apps/ui/src/screens/book-a-desk/zones.spec.ts`, `apps/ui/src/components/zone-group/ZoneGroup.spec.tsx` | implemented |
| FR-07  | `apps/ui/src/components/availability-count/AvailabilityCount.tsx`, `apps/ui/src/screens/book-a-desk/BookADesk.tsx` | `AvailabilityCount` | `apps/ui/src/components/availability-count/AvailabilityCount.spec.tsx`, `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx` | implemented |
| FR-08  | `apps/ui/src/components/status-chip/StatusChip.tsx`, `apps/ui/src/components/desk-row/DeskRow.tsx` | `StatusChip`, `DeskRow` | `apps/ui/src/components/status-chip/StatusChip.spec.tsx`, `apps/ui/src/components/desk-row/DeskRow.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/components/skeleton-row/SkeletonRow.tsx`, `apps/ui/src/screens/book-a-desk/book-a-desk.css` | `SkeletonRow`, `--desk-row-height` | `apps/ui/src/components/desk-row/DeskRow.spec.tsx`, `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx` | implemented |
| FR-10  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx`, `apps/ui/src/screens/book-a-desk/copy.ts` | `desks.length === 0` branch, `NO_DESKS_EXIST` | `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx`, `apps/ui/src/screens/book-a-desk/copy.spec.ts`, `apps/ui/src/components/empty-state/EmptyState.spec.tsx` | implemented |
| FR-11  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx`, `apps/ui/src/screens/book-a-desk/use-availability.ts` | error branch + `Alert` | `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx`, `apps/ui/src/screens/book-a-desk/use-availability.spec.ts` | implemented |
| FR-12  | `apps/ui/src/screens/book-a-desk/use-availability.ts` | `retry`, `latestRequestId` guard | `apps/ui/src/screens/book-a-desk/use-availability.spec.ts` | implemented |
| FR-13  | `apps/ui/src/components/availability-count/AvailabilityCount.tsx`, `apps/ui/src/lib/format-office-date.ts` | live region, `formatOfficeDateLong` | `apps/ui/src/components/availability-count/AvailabilityCount.spec.tsx`, `apps/ui/src/lib/format-office-date.spec.ts` | implemented |
| NFR-01 | `apps/ui/src/components/status-chip/StatusChip.tsx` | icon + word, never colour alone | `apps/ui/src/components/status-chip/StatusChip.spec.tsx` | implemented |
| NFR-02 | `apps/api/src/modules/bookings/bookings.service.ts` | `officeToday`/`refusalFor` reuse | `apps/api/src/modules/bookings/bookings.service.spec.ts` | implemented |

## Key symbols

| Symbol                  | Location                                                |
| ------------------------ | -------------------------------------------------------- |
| `listActiveDesks`        | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `listConfirmedDeskIds`   | `apps/api/src/modules/bookings/bookings.repository.ts`  |
| `createBookingsService`  | `apps/api/src/modules/bookings/bookings.service.ts`     |
| `createBookingsRouter`   | `apps/api/src/modules/bookings/bookings.router.ts`      |
| `groupByZone`            | `apps/ui/src/screens/book-a-desk/zones.ts`               |
| `AvailabilityOutcome`    | `apps/ui/src/screens/book-a-desk/use-availability.ts`    |
| `createFetchAvailability`| `apps/ui/src/screens/book-a-desk/fetch-availability.ts`  |

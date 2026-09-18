# US-008 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-008-see-my-last-booked-desk.md` |
| **Updated** | 2026-09-18                                       |

## Requirement to code

| Req    | File                                                       | Symbol / location                      | Proven by                                            | Status      |
| ------ | -------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- | ----------- |
| FR-01  | `libs/contracts/src/availability.ts`                            | `availabilityResponseSchema.usualDeskId`  | `libs/contracts/src/availability.spec.ts`                 | done |
| FR-02  | `apps/api/src/modules/bookings/bookings.repository.ts`          | `findMyLastBookedDeskId`                  | `apps/api/src/modules/bookings/bookings.repository.spec.ts` | done |
| FR-03  | `apps/api/src/modules/bookings/bookings.repository.ts`          | `findMyLastBookedDeskId` (order clause)   | `apps/api/src/modules/bookings/bookings.repository.spec.ts` | done |
| FR-04  | `apps/api/src/modules/bookings/bookings.service.ts`              | `getAvailability` (usualDeskId filter)    | `apps/api/src/modules/bookings/bookings.service.spec.ts`   | done |
| FR-05  | `apps/ui/src/components/desk-row/DeskRow.tsx`                    | `DeskRow` (`usual` prop)                  | `apps/ui/src/components/desk-row/DeskRow.spec.tsx`         | done |
| FR-06  | `apps/ui/src/components/desk-row/DeskRow.tsx`                    | `DeskRow` (composed `aria-label`)         | `apps/ui/src/components/desk-row/DeskRow.spec.tsx`         | done |
| FR-07  | `apps/ui/src/components/zone-group/ZoneGroup.tsx`                | `ZoneGroup` (`usualDeskId` prop)          | `apps/ui/src/components/zone-group/ZoneGroup.spec.tsx`     | done |
| FR-08  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx`                  | `BookADeskContent`                        | `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx`       | done |
| NFR-01 | `apps/ui/src/components/desk-row/DeskRow.tsx`                    | `DeskRow` (text-only hint)                | `apps/ui/src/components/desk-row/DeskRow.spec.tsx`         | done |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it. A requirement with no code yet gets a row with status `not started` and `—` in File; a row is how you can see what is missing.

## Key symbols

| Symbol                    | Location                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| `usualDeskId`                 | `libs/contracts/src/availability.ts`                          |
| `findMyLastBookedDeskId`      | `apps/api/src/modules/bookings/bookings.repository.ts`         |

# US-014 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                  |
| ----------- | -------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-014-filter-all-bookings.md`       |
| **Updated** | 2026-09-19                                                            |

## Requirement to code

| Req   | File | Symbol / location | Proven by | Status |
| ----- | ---- | ------------------ | --------- | ------ |
| FR-01 | `libs/contracts/src/bookings.ts:140` | `allBookingsQuerySchema` (extended: `from`, `to`, `status`, `deskId`, `.refine`) | `libs/contracts/src/bookings.spec.ts` | implemented |
| FR-02 | `libs/contracts/src/bookings.ts:74` | `bookingDisplayStatusSchema` docblock | `libs/contracts/src/bookings.spec.ts` | implemented |
| FR-03 | `libs/contracts/src/bookings.ts:160` | `allBookingsResponseSchema` (unchanged, asserted so) | `libs/contracts/src/bookings.spec.ts` | implemented |
| FR-04 | `libs/contracts/src/desks.ts:13,30` | `adminDeskSchema`, `adminDesksResponseSchema` | `libs/contracts/src/desks.spec.ts` | implemented |
| FR-05 | `apps/api/src/domain/booking-history.ts:56,64` | `DisplayStatusPredicate`, `displayStatusPredicate` | `apps/api/src/domain/booking-history.spec.ts` | implemented |
| FR-06 | `apps/api/src/domain/booking-history.ts:40` | `bookingDisplayStatus` (unchanged, asserted so) | `apps/api/src/domain/booking-history.spec.ts` | implemented |
| FR-07 | `apps/api/src/modules/bookings/admin-bookings.repository.ts:83,87` | `AdminBookingsRepository.listBookings` | `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` | implemented |
| FR-08 | `apps/api/src/modules/bookings/admin-bookings.service.ts:41` | `createAdminBookingsService.listAllBookings` (filter resolution) | `apps/api/src/modules/bookings/admin-bookings.service.spec.ts` | implemented |
| FR-09 | `apps/api/src/modules/desks/desks.repository.ts:24,27,28` | `DesksRepository.listAllDesks`, `desksRepository` | `apps/api/src/modules/desks/desks.repository.spec.ts` | implemented |
| FR-10 | `apps/api/src/modules/desks/desks.service.ts:11` | `createDesksService` | `apps/api/src/modules/desks/desks.service.spec.ts` | implemented |
| FR-11 | `apps/api/src/modules/admin/admin.router.ts:40,68` | `GET /bookings` (extended), `GET /desks` | `apps/api/src/modules/admin/admin.routes.spec.ts` | implemented |
| FR-12 | `apps/api/src/composition.ts:108,117` | `buildApp`'s `desks` seam | `apps/api/src/modules/admin/admin.routes.spec.ts` (through the real `buildApp`) | implemented |
| FR-13 | `apps/ui/src/screens/all-bookings/filters.ts:24,39,63` | `isFiltered`, `parseFilters`, `toQueryString` | `apps/ui/src/screens/all-bookings/filters.spec.ts` | implemented |
| FR-14 | `apps/ui/src/screens/all-bookings/use-all-bookings.ts:49,55` | `useAllBookings` (filters in effect deps) | `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` | implemented |
| FR-15 | `apps/ui/src/screens/all-bookings/fetch-all-bookings.ts:16` | `createFetchAllBookings` (widened signature) | `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` | implemented |
| FR-16 | `apps/ui/src/screens/all-bookings/FilterBar.tsx:49`, `Select.tsx:34`, `DateField.tsx:28`, `Calendar.tsx:58` | `FilterBar`, `Select`, `DateField`, `Calendar` | `FilterBar.spec.tsx`, `Select.spec.tsx`, `DateField.spec.tsx` | implemented |
| FR-17 | `apps/ui/src/screens/all-bookings/FilterBar.tsx:49` (toggle + panel), `all-bookings.css` | `FilterBar`'s collapse behaviour | `apps/ui/src/screens/all-bookings/FilterBar.spec.tsx` | implemented |
| FR-18 | `apps/ui/src/lib/fetch-desks.ts:10`, `use-desks.ts:22` (moved here by US-016/D-01, now a second consumer) | `createFetchDesks`, `useDesks` | `apps/ui/src/lib/use-desks.spec.ts` | implemented |
| FR-19 | `apps/ui/src/screens/all-bookings/AllBookings.tsx:91,162,190` | `AllBookingsContent`/`AllBookingsReady` (ST-04/ST-03 branch, count line) | `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` | implemented |
| FR-20 | `apps/ui/src/screens/all-bookings/AllBookings.tsx:79` | `AllBookingsContent` (`parseFilters(location.search)` on mount) | `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` | implemented |

Every `FR-##` in `spec.md` has a row here.

## Non-functional requirements

| Req    | File | Symbol / location | Proven by | Status |
| ------ | ---- | ------------------ | --------- | ------ |
| NFR-01 | `apps/ui/src/screens/all-bookings/all-bookings.css` (§ the filter bar), `FilterBar.tsx` | `FilterBar`'s CSS-only collapse | `apps/ui/src/screens/all-bookings/FilterBar.spec.tsx` | implemented |
| NFR-02 | `apps/api/src/modules/desks/desks.repository.spec.ts` | the recording fake, asserts no `is_active` filter | (is the test) | implemented |
| NFR-03 | `apps/api/src/domain/booking-history.spec.ts` | the round-trip property test | (is the test) | implemented |
| NFR-04 | n/a — no new gated test required (design note §10) | n/a | n/a | not applicable |

## Key symbols

| Symbol                       | Location                                                     |
| ------------------------------ | -------------------------------------------------------------- |
| `displayStatusPredicate`       | `apps/api/src/domain/booking-history.ts:64`                    |
| `DesksRepository`/`desksRepository` | `apps/api/src/modules/desks/desks.repository.ts:24,27`     |
| `createDesksService`           | `apps/api/src/modules/desks/desks.service.ts:11`                |
| `AllBookingsFilters`/`isFiltered`/`parseFilters` | `apps/ui/src/screens/all-bookings/filters.ts`  |
| `FilterBar`                    | `apps/ui/src/screens/all-bookings/FilterBar.tsx:49`             |

# US-013 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                               |
| ----------- | -------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-013-see-every-booking.md`   |
| **Updated** | 2026-09-19                                                      |

## Requirement to code

| Req   | File | Symbol / location | Proven by | Status |
| ----- | ---- | ------------------ | --------- | ------ |
| FR-01 | `apps/api/src/http/app.ts:78` (unchanged mount) | `GET /api/admin/bookings` | `apps/api/src/modules/admin/admin.routes.spec.ts` | implemented |
| FR-02 | `libs/contracts/src/bookings.ts:133,142,160` | `allBookingsQuerySchema`, `allBookingsListItemSchema`, `allBookingsResponseSchema` | `libs/contracts/src/bookings.spec.ts` | implemented |
| FR-03 | `apps/api/src/modules/bookings/admin-bookings.repository.ts:36,54,58` | `AdminBookingsRepository`, `listBookingsFromDate` | `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` | implemented |
| FR-04 | `apps/api/src/modules/bookings/admin-bookings.service.ts:22,30` | `createAdminBookingsService`, `listAllBookings` | `apps/api/src/modules/bookings/admin-bookings.service.spec.ts` | implemented |
| FR-05 | `apps/api/src/modules/admin/admin.router.ts:27,37` | `createAdminRouter`, `GET /bookings` | `apps/api/src/modules/admin/admin.routes.spec.ts` | implemented |
| FR-06 | `apps/api/src/composition.ts:23,60,98-99,111` | `buildApp`'s `adminBookings` seam | `apps/api/src/modules/admin/admin.routes.spec.ts` (through the real `buildApp`) | implemented |
| FR-07 | `apps/ui/src/screens/all-bookings/AllBookings.tsx:35,99` | `AllBookings`, header/count-line/`Alert` states | `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` | implemented |
| FR-08 | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx:43,46`, `apps/ui/src/screens/all-bookings/all-bookings.css` | `AdminBookingRow`'s `layout` switch, CSS `@media (min-width: 1024px)` | `apps/ui/src/screens/all-bookings/AdminBookingRow.spec.tsx` | implemented |
| FR-09 | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx:43` | four-field row, no action column | `apps/ui/src/screens/all-bookings/AdminBookingRow.spec.tsx` | implemented |
| FR-10 | `apps/ui/src/screens/all-bookings/AllBookings.tsx:138` | ST-03 empty state | `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` | implemented |
| FR-11 | `apps/ui/src/screens/all-bookings/use-all-bookings.ts:40,76` | `useAllBookings`, `loadMore` | `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` | implemented |
| FR-12 | `apps/ui/src/screens/all-bookings/fetch-all-bookings.ts:15` | `createFetchAllBookings` | `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` | implemented |
| FR-13 | `apps/ui/src/lib/auth/landing.ts:14` (unchanged) | `landingPathFor` | `apps/ui/src/lib/auth/landing.spec.ts:32` | implemented |
| FR-14 | `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` | test infrastructure (`AuthProvider`+`MemoryRouter`) | (is the test) | implemented |

Every `FR-##` in `spec.md` has a row here.

## Non-functional requirements

| Req    | File | Symbol / location | Proven by | Status |
| ------ | ---- | ------------------ | --------- | ------ |
| NFR-01 | `apps/ui/src/screens/all-bookings/copy.ts:26` | `OFFICE_TIME` | `apps/ui/src/screens/all-bookings/copy.spec.ts` | implemented |
| NFR-02 | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx` | `StatusChip kind="booking"` (reused, no new variant) | `apps/ui/src/screens/all-bookings/AdminBookingRow.spec.tsx` | implemented |
| NFR-03 | `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` | the recording-fake's `range`/`selectOptions` support | (is the test) | implemented |
| NFR-04 | `apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts` | the gated real-Postgres verification | (is the test) | implemented |

**Real-Postgres verification (Step 6, design-note §3.1/§3.4):** tracked separately from the `FR-##` table above because it verifies an assumption `FR-03` depends on, not a requirement of its own. **Run 2026-09-19** against the project's disposable Supabase project (`apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts`, gated `RUN_BOOKINGS_CONCURRENCY_TEST=1`) — both new cases passed: the `user_profiles!user_id` embed resolves to the booking's HOLDER, never the canceller; a page past the last row surfaces as PostgREST's `PGRST103`, which the repository now maps to an empty page (`decisions.md` D-10) rather than throwing — this mapping did not exist before the real run surfaced it. Output:

```
✓ adminBookingsRepository.listBookingsFromDate — real Postgres (US-013/AC-03, AC-04) (2)
  ✓ the user_profiles embed resolves via user_id, never cancelled_by — the HOLDER's name, not the canceller's (US-013/AC-03, design note §3.1)
  ✓ a page far beyond the last row resolves to an empty page, never a thrown error (US-013/AC-04, design note §3.4)

Test Files  1 passed (1)
     Tests  4 passed (4)
```

## Key symbols

| Symbol                    | Location                                                     |
| -------------------------- | -------------------------------------------------------------- |
| `AdminBookingsRepository`  | `apps/api/src/modules/bookings/admin-bookings.repository.ts:36` |
| `createAdminBookingsService` | `apps/api/src/modules/bookings/admin-bookings.service.ts:22` |
| `createAdminRouter`        | `apps/api/src/modules/admin/admin.router.ts:27`                |
| `useAllBookings`           | `apps/ui/src/screens/all-bookings/use-all-bookings.ts:40`      |
| `AdminBookingRow`          | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx:43`      |

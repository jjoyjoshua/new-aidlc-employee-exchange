# US-014 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                  |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-014-filter-all-bookings.md`     |
| **Tier**    | Complex                                                             |
| **Updated** | 2026-09-19                                                          |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                     |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | `libs/contracts/src/bookings.ts` — `allBookingsQuerySchema` gains four optional fields + a `.refine()`. New `libs/contracts/src/desks.ts` — `adminDeskSchema`, `adminDesksResponseSchema`. `allBookingsResponseSchema` is **not** touched (design-note §5) |
| Persistence               | no       | No migration, no column, no index. `bookings_desk_id_booking_date_idx` (`0003_bookings.sql:79`) was pre-placed for this read (comment names `REQ-031`) |
| Trust                     | no       | `GET /api/admin/desks` and the extended `GET /api/admin/bookings` both inherit `requireSession` + `requireAdmin` from the existing `/api/admin` mount; no new authz surface, no middleware change |
| Dependency & integration | no       | Nothing new                                                                                                                          |
| Operational               | no       | Nothing scheduled, no new config, no new middleware. `data-refresh.ts` explicitly not touched (design-note §0)                       |

The Server surface (a **new route**, `GET /api/admin/desks`) is Complex on its own per `task-surfaces.md:39`, independent of the contract table above — two independent Complex surfaces, not one (design-note §0), the same shape as US-013.

## Files and callers

| File                                                                | Symbol                                              | Change              | Callers found (`file:line`)                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `libs/contracts/src/bookings.ts`                                       | `allBookingsQuerySchema`, `bookingDisplayStatusSchema` (docblock only) | modify (extend + refine) | `admin.router.ts` (existing handler), `fetch-all-bookings.ts` (existing) |
| `libs/contracts/src/desks.ts`                                          | new: `adminDeskSchema`, `adminDesksResponseSchema`  | create               | `admin.router.ts` (new handler), `fetch-desks.ts` (new)                                          |
| `libs/contracts/src/index.ts`                                          | exports                                              | modify — export `./desks.js` | anything importing `@desk-booking/contracts` |
| `apps/api/src/domain/booking-history.ts`                               | `displayStatusPredicate` (new); `bookingDisplayStatus` (unchanged) | add                  | `admin-bookings.service.ts`                                                                      |
| `apps/api/src/modules/bookings/admin-bookings.repository.ts`           | `listBookingsFromDate` → `listBookings`              | modify (rename + widen signature) | `admin-bookings.service.ts` (its only caller — grep-confirmed)                                    |
| `apps/api/src/modules/bookings/admin-bookings.service.ts`              | `createAdminBookingsService`                         | modify (resolve the filter) | `admin.router.ts` (existing handler), `composition.ts`                                            |
| `apps/api/src/modules/bookings/README.md`                              | ownership doc                                        | modify — the filter paragraph | ADR-004 requires it |
| `apps/api/src/modules/desks/desks.repository.ts`                       | new: `DesksRepository`, `desksRepository`            | create               | `desks.service.ts`                                                                                |
| `apps/api/src/modules/desks/desks.service.ts`                          | new: `createDesksService`                            | create               | `admin.router.ts` (new handler), `composition.ts`                                                 |
| `apps/api/src/modules/desks/README.md`                                 | ownership doc                                        | modify — now holds a read-only repository | ADR-004 requires it |
| `apps/api/src/modules/admin/admin.router.ts`                           | `createAdminRouter(deps)`                            | modify — new `GET /desks`, extended `GET /bookings` parsing | `composition.ts` (its only caller) |
| `apps/api/src/composition.ts`                                          | `buildApp`, `BuildAppOptions`                        | modify — add `desks?` seam; wire the new service/router | none outside this file |
| `apps/ui/src/screens/all-bookings/AllBookings.tsx`                     | component                                            | modify — mount `FilterBar`, ST-04/ST-03 branch, count line | `apps/ui/src/routes.tsx:56` (`/admin/bookings`, unchanged mount) |
| `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx`                | tests                                                | modify (extend US-013's suite) | n/a |
| `apps/ui/src/screens/all-bookings/use-all-bookings.ts`                 | `useAllBookings`                                     | modify — `filters` in dependency array | `AllBookings.tsx` |
| `apps/ui/src/screens/all-bookings/fetch-all-bookings.ts`               | `createFetchAllBookings`                             | modify — fetcher signature widens | `use-all-bookings.ts` |
| `apps/ui/src/screens/all-bookings/copy.ts`                             | count-line builder, ST-04 copy                       | modify              | `AllBookings.tsx` |
| `apps/ui/src/screens/all-bookings/*.ts(x)` (new)                       | `filters`, `fetch-desks`, `use-desks`, `FilterBar`, `Select`, `DateField` | create | `AllBookings.tsx` |
| `inception/specs/index.md`                                             | spec index                                           | modify — add the US-014 row | n/a |
| `knowledge/traceability/manifest.json`                                 | `stories.US-014`                                     | modify — `tests[]`, `decisions[]` | n/a |

## Regression risk

| Area                                                     | Risk   | Why                                                                                                                        | Covered by                                    |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| US-013's default (unfiltered) view of `GET /api/admin/bookings` | medium | The repository method is renamed and its signature widens from `(from, offset, limit)` to `(filter, offset, limit)`; a wiring mistake could silently drop the default `from >= today` floor | `admin.routes.spec.ts`'s existing US-013 assertions re-run unmodified in intent; `admin-bookings.repository.spec.ts`'s existing "no status filter by default" case stays green |
| `bookingDisplayStatus` (ADR-007, used across US-006/US-009/US-010/US-013) | none | Not edited — `displayStatusPredicate` is added beside it as a new, separate pure function (design-note §6.1) | A diff touching `booking-history.ts:40-47` is a review finding; the round-trip property test (Step 2) would also fail if the two ever disagreed |
| `modules/bookings`'s `listActiveDesks` (US-006/AC-04's availability grid) | none | Not modified — the new `is_active`-inclusive read lives in the new `modules/desks`, a separate object (design-note §3.2) | Existing `bookings.repository.spec.ts` suite stays green |
| `GET /api/bookings`, `POST /api/bookings`, `POST /api/bookings/:id/cancel` | none | Not touched | Existing `bookings.routes.spec.ts` suite stays green |
| `AllBookings.tsx`'s existing US-013 states (ST-01 loading via skeleton, ST-03 empty-unfiltered, ST-05 error) | medium | The component is rewired to read filters and branch on `isFiltered`; the unfiltered path must still reach the exact ST-03 copy US-013 shipped | Existing US-013 tests re-run, unmodified in intent (Step 11) |
| Future US-016 (desk inventory) work reusing `GET /api/admin/desks` | low | `adminDesksResponseSchema` is an object wrapper (`{ desks: [] }`), additive-extendable for a future `bookedAhead` field | N/A — that story not started |

## Deliberately not touched

- `supabase/migrations/**` — no migration; both indexes this story reads already exist.
- `apps/api/src/http/app.ts` and `apps/api/src/http/middleware/**` — the `/api/admin` mount and both guards already exist; no auth-chain change.
- `libs/contracts/src/error.ts` — no new error code; `invalid_request` covers every new failure mode.
- `libs/contracts/src/availability.ts` — `deskAvailabilitySchema` is a different fact (per-date occupancy) and is not widened to carry `isActive`.
- `apps/api/src/domain/booking-history.ts`'s `bookingDisplayStatus` — added beside, never edited.
- `apps/api/src/modules/bookings/bookings.{repository,service,router}.ts` — the employee-scoped objects are untouched.
- `apps/ui/src/components/**` — no shared component's props change; `DatePicker` specifically is not reused (design-note §7.4).
- `apps/ui/src/lib/data-refresh.ts` — the data-fetching layer's cache/refresh behaviour is REQ-036's, set once for the whole app.
- `apps/ui/src/routes.tsx` — a query string needs no new route declaration.
- `eslint.config.mjs` — `modules/admin` carries no import-boundary rule today, and `modules/desks` imports nothing new.

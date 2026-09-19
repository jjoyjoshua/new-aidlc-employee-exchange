# US-013 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                               |
| ----------- | --------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-013-see-every-booking.md`    |
| **Tier**    | Complex                                                          |
| **Updated** | 2026-09-19                                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                   |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | `libs/contracts/src/bookings.ts` — new `allBookingsQuerySchema`, `allBookingsListItemSchema`, `allBookingsResponseSchema`. No existing schema changes shape |
| Persistence               | no       | No migration, no column, no index. `bookings_booking_date_status_idx` (`0003_bookings.sql:78`) was pre-placed for this read (comment names `REQ-011-013`) |
| Trust                     | no       | `GET /api/admin/bookings` inherits `requireSession` + `requireAdmin` by mounting where the empty `adminRouter` already sits (`app.ts:78`); no new authz surface, no middleware change |
| Dependency & integration | no       | Nothing new |
| Operational               | no       | Nothing scheduled, no new config, no new middleware |

The Server surface (a **new route**) is Complex on its own per `task-surfaces.md:39`, independent of the contract table above — two independent Complex surfaces, not one (design-note §0).

## Files and callers

| File                                                                | Symbol                                              | Change              | Callers found (`file:line`)                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `libs/contracts/src/bookings.ts`                                       | new: `allBookingsQuerySchema`, `allBookingsListItemSchema`, `allBookingsResponseSchema` | add | `admin.router.ts` (new route handler), `fetch-all-bookings.ts` (new) |
| `libs/contracts/src/index.ts`                                          | exports                                              | none — already re-exports `./bookings.js` wholesale | anything importing `@desk-booking/contracts` |
| `apps/api/src/modules/bookings/admin-bookings.repository.ts`           | `AdminBookingsRepository`, `adminBookingsRepository` | create               | `admin-bookings.service.ts`                                                                      |
| `apps/api/src/modules/bookings/admin-bookings.service.ts`              | `createAdminBookingsService`                         | create               | `admin.router.ts` (new handler), `composition.ts`                                               |
| `apps/api/src/modules/bookings/README.md`                              | ownership doc                                        | modify — now reads `user_profiles` too | ADR-004 requires the README to state it |
| `apps/api/src/modules/admin/admin.router.ts`                           | `adminRouter` (bare) → `createAdminRouter(deps)`     | rewrite (factory)    | `composition.ts` (its only caller)                                                               |
| `apps/api/src/composition.ts`                                          | `buildApp`, `BuildAppOptions`                        | add `adminBookings?` seam; wire the new service/router | none outside this file |
| `apps/ui/src/screens/all-bookings/AllBookings.tsx`                     | component                                            | replace stub content | `apps/ui/src/routes.tsx:56` (`/admin/bookings`, unchanged mount) |
| `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx`                | tests                                                | rewrite around `AuthProvider`+`MemoryRouter` | n/a |
| `apps/ui/src/screens/all-bookings/*.ts(x)` (new)                       | `use-all-bookings`, `fetch-all-bookings`, `AdminBookingRow`, `AdminSkeletonRow`, `copy`, css | create | `AllBookings.tsx` |
| `apps/ui/src/lib/auth/landing.spec.ts`                                 | test                                                 | add one assertion     | n/a |
| `ai/standards/api-standards.md`                                        | §Pagination                                          | add the row-count-vs-date-window criterion, and "page size is the server's" | n/a |

## Regression risk

| Area                                                     | Risk   | Why                                                                                                                        | Covered by                                    |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `GET /api/bookings`, `POST /api/bookings`, `POST /api/bookings/:id/cancel` | none   | Not touched. `bookings.repository.ts`, `bookings.service.ts`, `bookings.router.ts` are untouched (design-note §4.2) | Existing `bookings.routes.spec.ts` suite stays green |
| `AllBookings.tsx`'s existing password-saved toast (US-004/AC-07) | medium | The stub's toast `useState` must survive being built into a non-stub screen carrying real data-fetching | Existing toast tests re-run (rewritten test file, same assertions) — FR-14 |
| `admin.router.ts`'s US-001/AC-03 guarantee (Employee → 403, Admin → 404 on an unknown path) | low    | The router stops being empty, but the guard is still mounted in front of it at `app.ts:78`, unchanged | US-001's existing admin-guard tests hit `/api/admin/anything`, a path this story does not add — unaffected |
| `BookingRow.tsx` (SCR-002)                                   | none   | Not modified, not extracted (design-note §6.1) | n/a |
| `StatusChip`, `EmptyState`, `Alert`, `Button`, `SkeletonRow`  | none   | Used as-is; `SkeletonRow` specifically NOT widened — a new screen-private `AdminSkeletonRow` is built instead (design-note §6.3) | Existing component specs stay green (props unchanged) |
| Future US-014/US-015 work on the same screen                 | low    | `allBookingsQuerySchema`/`allBookingsResponseSchema` are additive-extendable (new optional query fields, non-`.strict()` response) | N/A — those stories not started |

## Deliberately not touched

- `supabase/migrations/**` — no migration; the index this story reads already exists.
- `apps/api/src/http/app.ts` — the `/api/admin` mount and both guards (`requireSession`, `requireAdmin`) already exist at line 78.
- `apps/api/src/http/middleware/**` — no auth-chain change.
- `libs/contracts/src/error.ts` — all seven reachable error codes already exist (design-note §2.7).
- `apps/api/src/modules/bookings/bookings.{repository,service,router}.ts` — the employee-scoped objects and their invariant (every method desk-scoped or `user_id`-filtered) are untouched.
- `apps/ui/src/routes.tsx` — the `/admin/bookings` address and its `RequireRole` guard already exist.
- `apps/ui/src/components/**` — no shared component's props change.

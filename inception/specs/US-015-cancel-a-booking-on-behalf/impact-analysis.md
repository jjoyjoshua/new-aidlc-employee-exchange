# US-015 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                       |
| ----------- | --------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-015-cancel-a-booking-on-behalf.md` |
| **Tier**    | Complex                                                                |
| **Updated** | 2026-09-19                                                             |

## Surfaces crossed

| Surface | Crossed? | What exactly |
| --- | --- | --- |
| Contract | yes | A **new write route**, `POST /api/admin/bookings/:id/cancel` — the surface that sets the tier. `libs/contracts/src/bookings.ts` and `error.ts` are both otherwise untouched (design-note §0, §2) |
| Persistence | no | Every column, enum value and constraint this story writes already exists (`0003_bookings.sql:18-22, 36-37, 48-53`). No migration |
| Trust | narrow | Not a new guard — the existing `requireAdmin` mount covers the new route automatically. What is genuinely new: the first write in the codebase that changes a row belonging to someone other than the caller (design-note §0) |
| Dependency & integration | no | No new package, no external service |
| Operational | no | No new job, env value, or middleware |

## Files and callers

| File | Symbol | Change | Callers found (`file:line`) |
| --- | --- | --- | --- |
| `apps/api/src/modules/bookings/admin-bookings.repository.ts` | `AdminBookingsRepository` | + `cancelAnyBooking`, + `findBookingState` | Consumed only by `admin-bookings.service.ts`'s new `cancelAnyBooking` |
| `apps/api/src/modules/bookings/admin-bookings.service.ts` | `AdminBookingsService` | + `cancelAnyBooking` | Consumed only by `admin.router.ts`'s new route handler |
| `apps/api/src/modules/admin/admin.router.ts` | `createAdminRouter` | + `POST /bookings/:id/cancel` | Mounted at `apps/api/src/http/app.ts:78` (unmodified — the mount already exists) |
| `apps/ui/src/lib/cancel-booking.ts` | (module) | + `createAdminCancelBooking`, existing `createCancelBooking` unchanged | New export consumed only by `use-admin-cancel-dialog.ts`; existing export's callers (`ExistingBookingState`, `MyBookings`'s `use-cancel-dialog.ts`) untouched |
| `apps/ui/src/screens/all-bookings/use-all-bookings.ts` | `useAllBookings` | + `markCancelled` return value | Consumed only by `AllBookings.tsx` |
| `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx` | `AdminBookingRow`, `AdminBookingsTableHead` | + fifth field/column | Consumed only by `AllBookings.tsx` |
| `apps/ui/src/screens/all-bookings/AdminSkeletonRow.tsx` | `AdminSkeletonRow` | `colSpan` 4→5; 360px height 160→188 | Consumed only by `AllBookings.tsx` |
| `apps/ui/src/screens/all-bookings/AllBookings.tsx` | `AllBookings` | + dialog wiring, toast, focus-return | Mounted at `apps/ui/src/routes.tsx` (unmodified — the route already exists) |
| `apps/ui/src/screens/all-bookings/copy.ts` | (module) | + ST-07–ST-11 strings | Consumed only by `AllBookings.tsx`, `AdminBookingRow.tsx` |
| `apps/api/src/modules/bookings/README.md` | (docs) | + ownership/write paragraph | n/a |
| `ai/standards/api-standards.md` | (docs, §Errors) | + disclosure-rule row | n/a |

No existing function's **signature** changes. Every edit above is an addition beside existing code, which is why the callers column is short — nothing that already worked had its contract altered.

## Regression risk

| Area | Risk | Why | Covered by |
| --- | --- | --- | --- |
| US-013's admin list rendering (table `<th>` order) | medium | The new fifth column could silently break the existing `US-013/AC-11` header-order assertion if it's replaced instead of extended | `AllBookings.spec.tsx`'s extended (not replaced) header assertion — FR-14 |
| US-014's status/desk filters, specifically `status=confirmed` | high | A refetch-based "refresh the list" implementation (the obvious wrong turn, design-note §5.3) would make a just-cancelled row vanish under an active filter — the exact behaviour AC-04 forbids, and it would still pass every unfiltered test | `AllBookings.spec.tsx` — a component test asserting the row survives with `status=confirmed` active in filter state (AC-04's test row in `design-note.md` §9) |
| US-011's employee-side cancel (`bookings.repository.ts`, `bookings.service.ts`, `bookings.router.ts`) | low | These files are not modified by this story; risk is only that a future refactor conflates the employee and admin cancel paths | Explicitly listed as untouched in `design-note.md` §6; existing US-011 test suite is unaffected |
| Concurrent cancels from two different actors (owner vs admin, or two admins) | medium | No row-version column exists; correctness depends on the `status='confirmed'` predicate alone arbitraging concurrent writes, which no unit test (recording fake) can prove | Gated real-Postgres harness, `bookings.repository.concurrency.spec.ts` — NFR-01, two new assertions |
| `AdminSkeletonRow`'s existing US-013/AC-09 "skeleton at real row height" guarantee | low | Changing the 360px height from 160 to 188 (FR-13) fixes a shift for the common case but does not eliminate it for the minority (non-cancellable rows in a 360px viewport) | Named as an accepted, non-blocking cosmetic trade-off (`design-note.md` §5.5, open item 3) — no new test asserts zero shift |

## Deliberately not touched

- `supabase/migrations/**` — every column and constraint this story writes already exists.
- `apps/api/src/http/app.ts`, `apps/api/src/http/middleware/**` — the admin guard predates this route.
- `apps/api/src/composition.ts` — the admin service's existing dependencies already cover the new method.
- `libs/contracts/src/error.ts`, `libs/contracts/src/bookings.ts` — no new error code, no response schema, no new field.
- `apps/api/src/modules/bookings/bookings.{repository,service,router}.ts` — the employee-scoped cancel path keeps its own invariant untouched.
- `apps/api/src/domain/**` — no new or edited business rule; BR-001.6 is expressed as a predicate at the write, exactly as US-011 expressed it.
- `apps/ui/src/components/**` — every shared component (`ConfirmDialog`, `Button`, `Alert`, `StatusChip`) is used exactly as it exists today; no new prop.
- `apps/ui/src/lib/data-refresh.ts`, `apps/ui/src/routes.tsx` — no change to the polling/refresh behaviour or to routing.
- `infra/mailer/**`, `infra/webpush/**` — no send code, no new dependency.

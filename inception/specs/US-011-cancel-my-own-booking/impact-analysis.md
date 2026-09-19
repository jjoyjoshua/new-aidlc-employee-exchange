# US-011 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-011-cancel-my-own-booking.md` |
| **Tier**    | Complex                                          |
| **Updated** | 2026-09-19                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                    |
| ------------------------ | -------- | ------------------------------------------------ |
| Contract                 | yes      | `libs/contracts/src/error.ts` gains `booking_already_cancelled` (protected path); `POST /api/bookings/:id/cancel`'s response shape gains a reachable `409` |
| Persistence              | no       | No migration. Every column/constraint/index already exists (`0003_bookings.sql`) |
| Trust                    | no       | No new authz surface; route already behind `requireSession`; owner-scoping stays a `WHERE`/`.eq('user_id', ...)` predicate |
| Dependency & integration | no       | Nothing new, nothing external |
| Operational              | no       | Nothing scheduled, no new env value, no new middleware |
| Contract (UI, project extension) | yes | `ConfirmDialog`'s public props gain `error?` and `singleAction?` — a shared component under `apps/ui/src/components/` |

## Files and callers

| File                                                                 | Symbol                        | Change              | Callers found (`file:line`)                                                                 |
| --------------------------------------------------------------------- | ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------- |
| `libs/contracts/src/error.ts`                                        | `errorCodeSchema`              | add enum member      | Both apps switch on `ERROR_CODES`, never a literal — no caller needs a change for the addition |
| `apps/api/src/modules/bookings/bookings.repository.ts`               | `cancelOwnedBooking`           | signature (+`today`) | `bookings.service.ts` cancelBooking (the only caller)                                          |
| `apps/api/src/modules/bookings/bookings.repository.ts`               | `findMyBookingState` (new)     | new                  | `bookings.service.ts` cancelBooking (the only caller)                                          |
| `apps/api/src/modules/bookings/bookings.service.ts`                  | `cancelBooking`                | return shape (+1 outcome) | `bookings.router.ts:170` (the only caller)                                                |
| `apps/api/src/modules/bookings/bookings.router.ts`                   | `POST /:id/cancel` handler     | new branch            | mounted in `apps/api/src/http/app.ts` (unchanged)                                             |
| `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx`            | `ConfirmDialogProps`           | +2 optional props, Escape guard, focus trap/restore, close icon, CSS | `apps/ui/src/components/existing-booking-state/ExistingBookingState.tsx:67` (existing, unaffected by defaults); `apps/ui/src/screens/my-bookings/MyBookings.tsx` (new, this story) |
| `apps/ui/src/components/existing-booking-state/cancel-booking.ts` → `apps/ui/src/lib/cancel-booking.ts` | `CancelBookingOutcome`, `createCancelBooking` | moved + outcome widened (2→4) | `ExistingBookingState.tsx` (updated import + collapse); `MyBookings.tsx` (new consumer) |
| `apps/ui/src/screens/my-bookings/BookingRow.tsx`                     | `BookingRowProps`              | +1 optional prop      | `MyBookings.tsx` (the only caller)                                                             |
| `apps/ui/src/screens/my-bookings/use-my-bookings.ts`                 | `UseMyBookingsResult`          | +1 action (`markCancelled`) | `MyBookings.tsx` (the only caller)                                                        |

## Regression risk

| Area                                                              | Risk   | Why                                                                                                                                          | Covered by                                                        |
| -------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| SCR-003's "already booked that date" cancel flow (`ExistingBookingState`, US-007/AC-07) | high   | Its fetcher currently maps any non-`ok` outcome from the old 2-value shape to `failed` except `booking_not_found`→`ok`; widening to 4 outcomes without updating its call site's collapse would send the new `409`/`refused` cases to `failed`, breaking a converge-don't-fail behaviour that already shipped | `ExistingBookingState.spec.tsx` regression test citing `US-007/AC-07`, plus `cancel-booking.spec.ts`'s full 4-outcome mapping table |
| `ConfirmDialog`'s Escape/focus behaviour on its existing consumer      | medium | Adding a busy-guard to Escape and a focus trap/restore changes behaviour for `ExistingBookingState` too, not just the new consumer — both are pure fixes toward the approved spec, but any hidden reliance on the old (buggy) behaviour would show up here | `ConfirmDialog.spec.tsx`'s existing suite (must stay green) plus new focus-trap/Escape-while-busy cases |
| `bookings.repository.spec.ts` / `bookings.service.spec.ts` / `bookings.routes.spec.ts` (US-007's existing cancel tests) | medium | The repository/service/router signatures change (new params, new outcome, new branch) — existing tests referencing the old 2-outcome shape must be updated, not just extended | Full existing suite re-run; new cases added alongside, not replacing coverage |
| `bookings.fixtures.ts`                                                | low    | A new past-Confirmed + a second-actor-cancelled fixture row are needed for AC-02/AC-09's tests | New fixture rows, additive only |

## Deliberately not touched

- `supabase/migrations/**` — no schema change; every column/constraint/index this needs already exists.
- `libs/contracts/src/bookings.ts` — no request/response schema changes.
- `inception/design/tokens.css` — the danger action fill and booking-state chip families already exist.
- `apps/api/src/domain/**` — no new pure-rule function; the existing `bookingDisplayStatus` (ADR-007) already expresses BR-001.6.
- `apps/api/src/composition.ts`, `apps/api/src/http/app.ts`, the middleware chain — the route, its mount, and its injected `nowMs`/`officeTimezone` already exist.
- `GET /api/bookings`, `GET /api/bookings/availability` — unchanged in every respect.
- `refusalFor` / `REFUSAL_MESSAGE` / `date_not_bookable` in `bookings.router.ts` — those refuse dates for *booking*, not cancelling; reusing them was considered and rejected (design-note §2.1).
- Any OpenAPI document — none exists yet in this repository (story's own text).

# US-007 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                    |
| ----------- | -------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-007-book-an-available-desk.md` |
| **Tier**    | Complex                                                              |
| **Updated** | 2026-09-18                                                          |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                    |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | New **write** route `POST /api/bookings` and new route `POST /api/bookings/:id/cancel`; a **changed response shape** on the existing `GET /api/bookings/availability` (additive `myBooking` field); five new error codes in `libs/contracts/src/error.ts` (protected path) |
| Persistence               | yes (first write only) | First `INSERT`/`UPDATE` against `bookings` — the table and both partial unique indexes already exist (`0003_bookings.sql`, created whole by US-006); no migration needed by this story |
| Trust                    | no       | Reuses `requireSession` as-is. `req.user.id` scopes both the insert (owner) and the cancel (ownership check); no new role, no new credential handling |
| Dependency & integration | no       | No new package, no new external service. `modules/notifications`/`infra/mailer` are deliberately **not** called (see `spec.md`'s AC-04 constraint) |
| Operational               | no       | No new scheduled job, env value, or middleware                                                                    |

Also Complex by the project's own surface (`ai/standards/task-surfaces.md`): a new write operation on
`bookings.repository.ts` (currently read-only), and new/changed props on `apps/ui` components that
render SCR-003's selectable list (`desk-row` gains selection; a new confirm-action component).

## Files and callers

| File                                                          | Symbol                                    | Change                                                                | Callers found (`file:line`)                                                          |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `libs/contracts/src/error.ts`                                   | `errorCodeSchema`                          | add `desk_already_booked`, `already_booked_that_date`, `desk_not_found`, `desk_inactive`, `booking_not_found` | `apps/api/src/http/errors.ts`, `apps/ui/src/lib/api-client.ts` (loose `z.string()`, additive-safe) |
| `libs/contracts/src/availability.ts`                            | `availabilityResponseSchema`, `deskAvailabilitySchema` | add `myBooking: z.object({ id, deskId, deskNumber }).nullable()` (not `.strict()`, additive) | `apps/api/src/modules/bookings/bookings.service.ts:getAvailability`, `apps/ui/src/screens/book-a-desk/use-availability.ts` |
| `libs/contracts/src/bookings.ts` (new)                          | `bookingCreateSchema`, `bookingSchema`, `cancelBookingParamsSchema` | create — request/response shapes for `POST /api/bookings` and `POST /api/bookings/:id/cancel` | `apps/api/src/modules/bookings/bookings.router.ts` (new handlers), `apps/ui/src/screens/book-a-desk/*` |
| `libs/contracts/src/index.ts`                                   | barrel export                              | add `./bookings.js`                                                     | every consumer of `@desk-booking/contracts`                                              |
| `apps/api/src/modules/bookings/bookings.repository.ts`          | `AvailabilityRepository` (renamed/extended, see `decisions.md` D-01) | add `getDeskById`, `findMyConfirmedBooking`, `insertConfirmedBooking`, `cancelOwnedBooking` | `bookings.service.ts`                                                                     |
| `apps/api/src/modules/bookings/bookings.service.ts`             | `createBookingsService`, `getAvailability` | `getAvailability` gains a `userId` parameter and threads `myBooking` through; add `createBooking(userId, input)` and `cancelBooking(userId, bookingId)` | `bookings.router.ts`                                                                       |
| `apps/api/src/modules/bookings/bookings.router.ts`               | `createBookingsRouter`                     | `GET /availability` passes `req.user.id`; add `POST /` and `POST /:id/cancel`, each validating via Zod, delegating, mapping outcomes to status codes | `apps/api/src/http/app.ts` (already mounts this router at `/api/bookings` behind `requireSession`) |
| `apps/api/src/composition.ts`                                    | `BuildAppOptions`                          | `bookings` service deps gain `nowMs`/`officeTimezone` reuse (already threaded for US-006) — no new dependency shape expected beyond the repository's new methods | `apps/api/src/index.ts`, `*.routes.spec.ts`                                               |
| `apps/ui/src/screens/book-a-desk/use-availability.ts`            | `AvailabilityOutcome`                      | response type gains `myBooking`                                          | `BookADesk.tsx`                                                                            |
| `apps/ui/src/screens/book-a-desk/BookADesk.tsx`                  | `BookADeskContent`                         | renders the existing-booking state (FR-11) ahead of the desk list; wires desk selection, confirm action, and the cancel dialog | `apps/ui/src/routes.tsx` (mounts `/book`)                                                 |
| `apps/ui/src/components/desk-row/DeskRow.tsx`                    | `DeskRowProps`                             | gains `selected`, `onSelect` (US-006 explicitly deferred this — design note §4.4) | `BookADesk.tsx`                                                                            |
| `apps/ui/src/components/confirm-booking-bar/` (new)              | —                                           | bottom-anchored confirm action naming desk + date; busy state for FR-15   | `BookADesk.tsx`                                                                            |
| `apps/ui/src/components/confirm-dialog/` (new)                   | —                                           | generic confirm/cancel dialog (D-06) — no component like this exists yet; built here so US-011 reuses it rather than duplicating it | `existing-booking-state`                                                                    |
| `apps/ui/src/components/existing-booking-state/` (new)           | —                                           | FR-11's replacement view; opens `confirm-dialog` for FR-12                | `BookADesk.tsx`                                                                            |
| `apps/ui/src/lib/auth/auth-context.tsx`                          | (none expected)                            | `api: ApiClient` already exposed for US-006; reused as-is for the new POSTs | `BookADesk.tsx`                                                                            |

## Regression risk

| Area                                                   | Risk            | Why                                                                                                                                 | Covered by                                                                 |
| --------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `availabilityResponseSchema` gaining `myBooking`           | low             | Additive, non-`.strict()` field; every existing consumer (US-006's `BookADesk.tsx`) already tolerates unknown response fields by construction | `availability.spec.ts` — old fixtures (no `myBooking`) still parse if the field is optional-with-default-null in the schema helper, new fixtures assert the field |
| Constraint-violation mapping (FR-02) matched wrong, or matched by mocked error only | high if missed  | A mocked/stubbed unique-violation error proves the *code* branches correctly, not that Postgres's real error shape matches what the code expects — the exact trap `testing-standards.md` calls out | A real-Postgres concurrency test: two concurrent `POST /api/bookings` for the same desk/date, assert exactly one `201` and one `409 desk_already_booked`; same shape for the per-user index and `409 already_booked_that_date` |
| FR-04's desk-active check racing a hypothetical desk deactivation | low             | US-015/US-017 (desk admin) are not yet built, so no code path can flip `is_active` concurrently with a booking attempt today; the check is still correct in isolation | `bookings.service.spec.ts` — stubbed inactive/missing desk cases              |
| FR-06's cancel endpoint being mistaken for US-011's full feature | medium           | A reviewer or a later story could assume `POST /api/bookings/:id/cancel` already satisfies US-011's ACs (eligibility, idempotency, email) | `spec.md`'s "Out of scope" section, `decisions.md` D-0x, and this story's own README update state the boundary explicitly |
| `DeskRow` gaining `selected`/`onSelect`                    | low              | Additive optional props; US-006's existing rendering (no selection) is the default when the props are omitted                             | `DeskRow.spec.tsx` — existing US-006 cases re-run unchanged, new cases add selection |
| Focus management on ST-09/ST-10/ST-12 (assertive announce + focus move) | medium           | Easy to add the live region and forget to move focus, which the story calls out by name for both ST-09 and ST-10                            | `BookADesk.spec.tsx` — assert `document.activeElement` after each outcome     |

## Deliberately not touched

- `supabase/migrations/**` — no migration. The table and both indexes were created whole by US-006
  specifically so this story would not need one.
- `apps/api/src/domain/**` — no new pure rule; date-window logic is fully reused from US-005.
- `apps/api/src/modules/notifications/**`, `apps/api/src/infra/mailer/**` — remain empty stubs; not
  called by this story (see `spec.md`'s AC-04 constraint).
- `apps/api/src/modules/desks/**` — does not exist yet (US-015/US-017); this story only reads `desks`
  via `bookings.repository.ts`, per ADR-004.
- `inception/architecture/app-architecture.md`, `inception/architecture/db-design.md` — approved and
  merged; this story implements §4.1 as already written, it does not revise it.

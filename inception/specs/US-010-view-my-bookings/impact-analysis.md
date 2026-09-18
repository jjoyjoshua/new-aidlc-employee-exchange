# US-010 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                               |
| ----------- | --------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-010-view-my-bookings.md`     |
| **Tier**    | Complex                                                          |
| **Updated** | 2026-09-18                                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                   |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | `libs/contracts/src/bookings.ts` — new query/item/response schemas, new `bookingDisplayStatusSchema` (response-only, second status enum). `apps/ui/src/components/status-chip/StatusChip.tsx`'s public props gain an optional `kind` discriminator (shared component) |
| Persistence               | no       | No migration, no column, no index. `bookings_user_id_booking_date_idx` (`0003_bookings.sql:77`) was pre-built for this read (comment: "REQ-009, REQ-034") |
| Trust                     | no       | `GET /api/bookings` inherits `requireSession` by being mounted where `POST /api/bookings` already is (`app.ts:84`); no new authz surface |
| Dependency & integration | no       | Nothing new |
| Operational               | no       | Nothing scheduled, no new config, no new middleware |

The Server surface (a **new route**, `GET /api/bookings`) is Complex on its own per `task-surfaces.md`'s server rule, independent of the contract/persistence table above.

## Files and callers

| File                                                          | Symbol                                    | Change              | Callers found (`file:line`)                                                                 |
| -------------------------------------------------------------- | ------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------- |
| `libs/contracts/src/bookings.ts`                                | `bookingStatusSchema`                      | none (kept as-is)    | `bookings.service.ts:45` (`CreatedBooking.status` literal `'confirmed'`), `bookings.repository.ts` |
| `libs/contracts/src/bookings.ts`                                | new: `bookingDisplayStatusSchema`, `myBookingsQuerySchema`, `myBookingListItemSchema`, `myBookingsResponseSchema` | add | `bookings.router.ts` (new route), `MyBookings.tsx`/`fetch-my-bookings.ts` (new) |
| `libs/contracts/src/index.ts`                                   | exports                                    | add                  | anything importing `@desk-booking/contracts`                                                     |
| `apps/api/src/domain/booking-history.ts`                        | new: `bookingDisplayStatus`, `historyFloor`, `HISTORY_WINDOW_DAYS` | create | `bookings.service.ts` (new call sites)                                                          |
| `apps/api/src/modules/bookings/bookings.repository.ts`          | `AvailabilityRepository` interface + impl  | add two methods       | `bookings.service.ts`                                                                            |
| `apps/api/src/modules/bookings/bookings.service.ts`             | `createBookingsService`                    | add `listMyBookings`  | `bookings.router.ts` (new `GET /` handler)                                                       |
| `apps/api/src/modules/bookings/bookings.router.ts`               | router                                     | add `GET /`           | `composition.ts` (mounts the module, unchanged)                                                  |
| `apps/ui/src/components/status-chip/StatusChip.tsx`             | `StatusChipProps`, `DeskStatus`            | widen (additive)      | `apps/ui/src/screens/book-a-desk/DeskRow.tsx` and any other existing `<StatusChip>` call site (unaffected — `kind` defaults to `'desk'`) |
| `apps/ui/src/screens/my-bookings/MyBookings.tsx`                 | component                                  | replace stub content  | `apps/ui/src/routes.tsx:51` (`/bookings`, unchanged mount)                                       |

## Regression risk

| Area                                            | Risk   | Why                                                                                                                        | Covered by                                    |
| -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `POST /api/bookings` / `POST /api/bookings/:id/cancel` | low    | Not touched. `bookingStatusSchema` (the two-value, stored shape) is unchanged, so the create/cancel response shape is untouched | Existing `bookings.routes.spec.ts` suite stays green |
| Existing `<StatusChip status="taken">` etc. call sites | low    | `kind` is optional and defaults to `'desk'`; `DeskStatus`'s three values and `LABEL` map are unchanged                          | `StatusChip.spec.tsx` — assert existing desk variants render unchanged |
| `MyBookings.tsx`'s two existing toasts (password-saved US-004/AC-07, booking-confirmation US-007/AC-03,AC-04) | medium | The stub's toast logic (`useState(() => state?.toast === ...)`) must survive being built into a non-stub screen              | Existing `MyBookings.spec.tsx` toast tests re-run unmodified; new list logic added alongside, not replacing, the toast `useState` |
| Admin "all bookings" list (US-013, not yet built)  | low    | `GET /api/bookings` and any future `GET /api/admin/bookings` are different routes behind different guards (design-note §1.1); no shared code between them yet | N/A — US-013 not started |
| `db-design.md` readers expecting `bookings_with_status` | medium | ADR-007 supersedes that mechanism; a future author reading Gate-1 architecture in isolation could still look for the view | ADR-007 names the view explicitly in its Context section so a search finds the supersession |

## Deliberately not touched

- `supabase/migrations/**` — no migration; the index this story reads already exists.
- `inception/design/tokens.css` — all three booking-lifecycle token families (`--c-state-confirmed/completed/cancelled-*`) already exist in both themes; no token diff.
- `apps/api/src/composition.ts`, `apps/api/src/http/app.ts` — the mount and both injected dependencies (`nowMs`, `officeTimezone`) already exist; no wiring change.
- `apps/ui/src/lib/api-client.ts` — reused as-is, one more `request(path, schema)` call.
- `apps/ui/src/components/**` other than `status-chip/` — `SkeletonRow`, `Alert`, `EmptyState`, `Button`, `Toast` used as they are, no prop changes.
- `inception/design/screens/SCR-002-my-bookings.md`, `inception/architecture/db-design.md` — both approved Gate-1 documents; not edited. The supersession is recorded in ADR-007, not by editing history.
- `POST /api/bookings/:id/cancel` and any Cancel-button behaviour — US-011's.

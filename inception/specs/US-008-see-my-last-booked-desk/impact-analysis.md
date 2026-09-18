# US-008 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-008-see-my-last-booked-desk.md` |
| **Tier**    | Complex                                          |
| **Updated** | 2026-09-18                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                       |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | `GET /api/bookings/availability`'s response gains an additive field, `usualDeskId`; `DeskRow`'s and `ZoneGroup`'s props gain `usual`/`usualDeskId` |
| Persistence               | no       | No migration. Reuses the existing `bookings_user_id_booking_date_idx` index (`0003_bookings.sql:77`), already tagged `REQ-034` |
| Trust                     | no       | No new guard, role, or credential path — reads only the caller's own `userId`, already available from the session |
| Dependency & integration | no       | No new package, no external service                                                                 |
| Operational               | no       | No new job, env value, or middleware                                                                |

## Files and callers

| File                                                          | Symbol                          | Change                     | Callers found (`file:line`)                                                              |
| --------------------------------------------------------------- | -------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `libs/contracts/src/availability.ts`                             | `availabilityResponseSchema`     | add field `usualDeskId`     | `bookings.service.ts:94` (constructs), `apps/ui/src/screens/book-a-desk/use-availability.ts` (consumes) |
| `apps/api/src/modules/bookings/bookings.repository.ts`          | `AvailabilityRepository`         | add method `findMyLastBookedDeskId` | `bookings.service.ts` (new call site in `getAvailability`)                                   |
| `apps/api/src/modules/bookings/bookings.service.ts`              | `getAvailability`                | add 4th parallel read + filter | `bookings.router.ts:66`                                                                       |
| `apps/ui/src/components/desk-row/DeskRow.tsx`                    | `DeskRowProps`, `DeskRow`        | add `usual` prop; compose `aria-label` for every available row | `ZoneGroup.tsx:35-40`                                                                          |
| `apps/ui/src/components/zone-group/ZoneGroup.tsx`                | `ZoneGroupProps`, `ZoneGroup`    | add `usualDeskId` prop      | `BookADesk.tsx:294-301`                                                                       |
| `apps/ui/src/screens/book-a-desk/BookADesk.tsx`                  | `BookADeskContent`               | pass `usualDeskId` through  | none further (top-level screen)                                                              |
| `apps/ui/src/screens/book-a-desk/copy.ts`                        | (new export)                     | add the "your usual desk" string | `DeskRow.tsx` or `ZoneGroup.tsx`, wherever the string is composed                             |

## Regression risk

| Area                                                             | Risk   | Why                                                                                                    | Covered by                                              |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| AC-02 (no pre-selection)                                          | medium | `usualDeskId` and `selectedDeskId` are two props flowing through the same components; a later "simplification" could merge them | `... (US-008/AC-02)` — asserts nothing selected/checked on load, confirm reads "Select a desk", **with `usualDeskId` seeded** |
| Accessible name of every available row (not only the usual one) | low    | FR-06 changes today's bare `aria-label={deskNumber}` to a composed name for **all** available rows, not only usual ones. Existing tests match by substring regex (`{ name: /A-01/ }`, verified in `DeskRow.spec.tsx`, `ZoneGroup.spec.tsx`, `BookADesk.spec.tsx`) so none break, but the assertions become weaker than what the new behaviour deserves | `... (US-008/AC-06)` asserts the full composed name, not a substring |
| Cancel-then-rebook same-date tie (BR-001.2)                       | medium | With Cancelled counting toward history, two rows can share the most recent `booking_date`; a single-key sort returns either non-deterministically | `... (US-008/AC-03)` — seeds one cancelled + one confirmed booking, same user, same date, confirmed created later; asserts `usualDeskId` is the confirmed desk |
| `myBooking` non-null hides the desk list entirely (US-007)       | low    | `BookADesk.tsx:242` replaces the whole list with `ExistingBookingState` when the caller already holds a booking for the selected date — a US-008 screen test that seeds `myBooking` non-null can never observe a label | Every US-008 screen-level test seeds `myBooking: null` explicitly |

## Deliberately not touched

- `deskAvailabilitySchema` / `desks[]` — no per-row `isUsual` flag added (spec.md, Technical constraints).
- The `bookings` table and its `status` enum — no migration, no new column, no "completed" state.
- AC-05's literal "renamed" wording in the story file itself — flagged via
  [issue #37](../../../../issues/37), not edited by this change. The code implements the Edge Cases
  reading regardless of when/whether the story text is corrected.

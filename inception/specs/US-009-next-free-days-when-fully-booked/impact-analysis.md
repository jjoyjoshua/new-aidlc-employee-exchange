# US-009 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-009-next-free-days-when-fully-booked.md` |
| **Tier**    | Complex                                                              |
| **Updated** | 2026-09-18                                                          |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                    |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | `availabilityResponseSchema` gains a field (`libs/contracts/src/availability.ts`, protected path) — additive, non-`.strict()`. `EmptyState`'s public props gain `body?`/`actions?` — a **shared** UI component's props, a Complex surface on its own |
| Persistence               | no       | No migration, no new column, no new index. Both range reads are served by indexes `0003_bookings.sql:77-78` already created |
| Trust                    | no       | No new authz surface. The lookahead reads no column US-006/US-007 did not already establish as safe (no `user_id` in the desk-wide read; the caller-scoped read is filtered to `req.user.id` as `myBooking`/`usualDeskId` already are) |
| Dependency & integration | no       | No new package, no external service                                                                                |
| Operational               | no       | No new route, no new mount, no new scheduled job, no new env value                                                 |

Also Complex by the project's own surface (`ai/standards/task-surfaces.md`): a changed response
shape on an existing protected-path contract, and changed props on a shared `apps/ui/src/components/**`
component.

## Files and callers

| File                                                          | Symbol                                    | Change                                                                | Callers found (`file:line`)                                                          |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `libs/contracts/src/availability.ts`                            | `availabilityResponseSchema`               | add `nextFreeDays: z.array(officeDateSchema).max(2).default([])` (line 55-89, after `usualDeskId`) | `apps/api/src/modules/bookings/bookings.service.ts:getAvailability` (:104), `apps/ui/src/screens/book-a-desk/use-availability.ts` |
| `apps/api/src/domain/next-free-days.ts` (new)                  | `pickNextFreeDays`                         | create — pure candidate scan, reusing `refusalFor`/`addDays`/`lastBookableDate` (`booking-window.ts`) | `bookings.service.ts:getAvailability`                                                    |
| `apps/api/src/modules/bookings/bookings.repository.ts`         | `AvailabilityRepository`                   | add `listConfirmedDeskIdsInRange(from, to)`, `listMyConfirmedDatesInRange(userId, from, to)` (after `findMyLastBookedDeskId`, :83) | `bookings.service.ts`                                                                     |
| `apps/api/src/modules/bookings/bookings.service.ts`             | `getAvailability`                          | after the existing projection (:82-102), compute `fullyBooked`; if fully booked and `myBooking` is null and the window has room after `date`, run the two range reads and call `pickNextFreeDays`; else `nextFreeDays: []` | `bookings.router.ts` (unchanged call site — the field rides the existing response)         |
| `apps/api/src/modules/bookings/bookings.fixtures.ts`            | —                                           | add a fully-booked dataset with controlled free/full days after it (QA's data note) | `bookings.service.spec.ts`, `bookings.repository.spec.ts`                                 |
| `apps/ui/src/components/empty-state/EmptyState.tsx`             | `EmptyStateProps`                           | `body: string` → `body?: string`; add `actions?: ReactNode` (currently lines 11-14) | `BookADesk.tsx` (both ST-05's and the new ST-04 call site)                                |
| `apps/ui/src/screens/book-a-desk/copy.ts`                       | —                                           | add `FULLY_BOOKED(label)`, a lead-line helper keyed on suggestion count (after `YOUR_USUAL_DESK`, :40) | `BookADesk.tsx`, `copy.spec.ts`                                                            |
| `apps/ui/src/screens/book-a-desk/BookADesk.tsx`                 | `BookADeskContent`                         | insert the ST-04 branch between the `desks.length === 0` check (:252-255) and the ordinary-list branch (:256-312); compute `fullyBooked` from `availability.data.desks` | `apps/ui/src/routes.tsx` (mounts `/book`, unchanged)                                       |

## Regression risk

| Area                                                   | Risk            | Why                                                                                                                                 | Covered by                                                                 |
| --------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `availabilityResponseSchema` gaining `nextFreeDays`        | low             | Additive, non-`.strict()`, `.default([])` — every existing consumer already tolerates unknown/missing response fields by construction (`myBooking`/`usualDeskId` precedent) | `availability.spec.ts` — an old fixture with no `nextFreeDays` key still parses to `[]`; three entries rejected by `.max(2)` |
| The candidate loop in `pickNextFreeDays` never terminating | high if missed  | A loop written to stop only when 2 days are found never terminates in exactly the AC-05 case (a window with fewer than two free days) — passes every happy-path test | `next-free-days.spec.ts` — a dataset full to the window's edge, asserting the function *returns* `[]` |
| ST-05 vs. ST-04 precedence collapsing                      | medium          | `desks.length === 0` also satisfies "no desk is available"; a fully-booked branch placed one position earlier renders ST-04's text to an office that has never had a desk | `BookADesk.spec.tsx` — `desks: []` still renders ST-05, asserted even when a (impossible in practice, but test-constructed) `nextFreeDays` is non-empty |
| `EmptyState.body` becoming optional                       | low             | Existing ST-05 call site always passes `body`; making it optional only widens what's accepted | `EmptyState.spec.tsx` — ST-05's existing case re-run unchanged, new case renders with no `body` |
| Swallowing a failed range read as `[]`                     | medium          | `[]` is a legitimate answer (AC-05); catching and defaulting to it on a real failure would be indistinguishable from "nothing free" | `bookings.service.spec.ts` — a range-read rejection propagates, the request does not resolve `ok` with `nextFreeDays: []` |

## Deliberately not touched

- `supabase/migrations/**` — no migration. Both indexes the range reads need already exist.
- `libs/contracts/src/error.ts` — no new error code; this story adds no new refusal.
- `apps/api/src/http/**`, `composition.ts` — no new route, no new mount, no new seam.
- `apps/ui/src/components/availability-count/**` — `freeCount={0}` needs no change.
- `apps/ui/src/screens/book-a-desk/use-availability.ts` — the field arrives inside the response it
  already parses; no new state, no second fetcher.
- `inception/design/screens/SCR-003-book-a-desk.md` — approved and merged. The per-suggestion
  free-count mismatch and the "Pick another date" link found in the real Figma frame are recorded
  here and in `decisions.md`; correcting the spec/frame itself is a follow-up `change-request`.

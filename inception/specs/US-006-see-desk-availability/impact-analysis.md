# US-006 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                  |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-006-see-desk-availability.md` |
| **Tier**    | Complex                                                            |
| **Updated** | 2026-09-18                                                        |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                    |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | New `GET /api/bookings/availability?date=` (request + response shapes in `libs/contracts/src/availability.ts`); a new `date_not_bookable` error code; a **tightening** of `officeDateSchema` (protected path, `libs/contracts`) |
| Persistence               | yes      | New `desks` and `bookings` tables, three enums-worth of constraints, five indexes, two migrations (`supabase/migrations/0002_desks.sql`, `0003_bookings.sql`) |
| Trust                    | no       | Reuses the existing `requireSession` chain; no new role, no new credential handling. AC-06 is a read-shape decision (never selecting the occupant column), not a trust boundary |
| Dependency & integration | no       | No new package, no new external service                                                                          |
| Operational               | no       | No new scheduled job, env value, or middleware; `OFFICE_TIMEZONE` and `nowMs` already exist and are already threaded |

Also Complex by the project's own surface: a new module mount (`apps/api/src/http/app.ts`'s
`/api/bookings` placeholder) and new shared-component props (`desk-row`, `status-chip`,
`zone-group`, `skeleton-row`, `empty-state`, `availability-count` under `apps/ui/src/components/`).

## Files and callers

| File                                              | Symbol                          | Change                | Callers found (`file:line`)                                                        |
| -------------------------------------------------- | -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `libs/contracts/src/booking-window.ts`             | `officeDateSchema`                | tightened (adds `.refine`) | `libs/contracts/src/auth.ts` (`officeSchema.today`), the new `availabilityQuerySchema`/`availabilityResponseSchema` |
| `libs/contracts/src/index.ts`                      | barrel export                    | add `./availability.js` | every consumer of `@desk-booking/contracts`                                          |
| `libs/contracts/src/error.ts`                      | `errorCodeSchema`                 | add `'date_not_bookable'` | `apps/api/src/http/errors.ts`, `apps/ui/src/lib/api-client.ts` (loose `z.string()`, additive-safe) |
| `apps/api/src/http/app.ts`                         | `AppDeps`, route mount            | `bookingsRouter` added, `/api/bookings` mount replaces the placeholder comment (line 79) | `apps/api/src/composition.ts` (`createApp`)                                          |
| `apps/api/src/composition.ts`                      | `BuildAppOptions`                 | gains `availability?: AvailabilityRepository` | `apps/api/src/index.ts`, `apps/api/src/modules/*/*.routes.spec.ts`                    |
| `apps/ui/src/screens/book-a-desk/use-availability.ts` | `AvailabilityFetcher`, `useAvailability` | signature change: `Promise<unknown>` → `Promise<AvailabilityOutcome>`; adds `error` state and `retry` | `apps/ui/src/screens/book-a-desk/BookADesk.tsx`, `use-availability.spec.ts`            |
| `apps/ui/src/screens/book-a-desk/BookADesk.tsx`     | `BookADeskContent`                | renders the zone list, count line, empty and error states below the date controls | `apps/ui/src/routes.tsx` (mounts `/book`)                                             |
| `apps/ui/src/lib/format-office-date.ts`             | module                            | add `formatOfficeDateLong` | `apps/ui/src/components/availability-count/AvailabilityCount.tsx` (new)              |
| `apps/ui/src/lib/auth/auth-context.tsx`             | `AuthContextValue`                | gains `api: ApiClient` (D-08 — not anticipated by the design note; no prior screen needed an authenticated call of its own) | `apps/ui/src/screens/book-a-desk/fetch-availability.ts` (new) |

## Regression risk

| Area                                             | Risk   | Why                                                                                                                                              | Covered by                                                                 |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `officeDateSchema` tightening                       | low    | Every legitimate value already produced (server-generated `office.today`, or a UI-selected date from `refusalFor`'s own window) is a real calendar date; only a malformed/invalid client value now fails earlier, as a `400` instead of a `500` | `booking-window.spec.ts` boundary cases; `auth.spec.ts` unchanged fixtures  |
| `use-availability.ts` failure-path guard            | high if missed | Painting an error without the `latestRequestId` check lets a stale request's abort resolve into `status:'error'` and overwrite a *fresh* date's data — the exact bug the design note flags as the most likely defect in the story | `use-availability.spec.ts` — resolve the superseded request's failure *after* the current one succeeds, assert no error state |
| AC-04 (inactive desk exclusion)                     | high if unproven | Enforced by one `.eq('is_active', true)` predicate; a stub-only test is tautological and would not catch the predicate being dropped or inverted | `bookings.repository.spec.ts` over a recording fake client (D1 decision: option B) |
| AC-09 vs. the (not-yet-built) fully-booked state    | medium | A render checking `freeCount === 0` before `desks.length === 0` shows the wrong empty state to an office with zero desks; passes any test that only exercises partial-booking data | `BookADesk.spec.tsx` asserts the `desks.length === 0` branch is checked first; `copy.spec.ts` pins the two strings differ |
| `bookings` table shipping with unproven write constraints | low, stated | Two partial unique indexes and three check constraints have no code exercising them until US-007 | Design note §1.1; PR description states the gap explicitly; US-007 is where each constraint gets its test |

## Deliberately not touched

- `apps/api/src/domain/**` — no new pure rule; the date-window check already exists (`booking-window.ts`, US-005).
- `apps/api/src/config/**` — `OFFICE_TIMEZONE` and `nowMs` are already required and already wired.
- `apps/api/src/http/middleware/**` — the session/password-change chain is unchanged; only the mount point changes.
- `inception/design/tokens.css` — the shared desk-row height is a screen-level CSS custom property, not a new design token.
- `apps/ui/src/components/alert/**` — reused as-is for ST-06 (`tone`, `title`, `actions`, `live` already exist on `AlertProps`).
- `inception/architecture/db-design.md` — approved and merged; the index-comment correction (design note §1.5) goes into the migration's own comments, not back into the Gate 1 document.

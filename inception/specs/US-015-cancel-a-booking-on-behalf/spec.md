# US-015 — Cancel an employee's booking on their behalf

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-015-cancel-a-booking-on-behalf.md`              |
| **Traces to**     | REQ-014                                                                             |
| **Screen**        | SCR-005 — ST-07, ST-08, ST-09, ST-10, ST-11. ST-01/ST-03/ST-05 are US-013's, ST-02/ST-04/ST-06/ST-12 are US-014's — all preserved, none touched |
| **Covering ADRs** | ADR-004, ADR-007 (both applied, neither amended). **No new ADR** — `decisions.md` D-03 |
| **Tier**          | Complex                                                                             |
| **Status**        | approved (code complete, PR not yet opened — `inception/specs/index.md`'s Status flips to `implemented` on merge) |
| **Updated**       | 2026-09-19                                                                          |

## Problem

An administrator viewing `GET /api/admin/bookings` (US-013/US-014) can see every booking in the office but cannot act on any of them — `AdminBookingRow.tsx`'s own docblock reserves the fifth column by name: *"US-015 owns the fifth."* There is also no server-side way to cancel a booking that belongs to someone else; the only existing cancel endpoint (`POST /api/bookings/:id/cancel`, US-011) is scoped to the caller's own bookings by design.

The Architect design note (`design-note.md`, this folder) settles the question the story hands over (story line 106): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §2–§5 are that settlement, confirmed with the human on three open items (§10 of the note). This spec restates it as testable `FR-##`s; it does not re-argue it.

## Functional requirements

| ID | Requirement | Priority | Serves | Status |
| --- | --- | --- | --- | --- |
| FR-01 | New route `POST /api/admin/bookings/:id/cancel` on the existing `createAdminRouter` factory, reusing `cancelBookingParamsSchema` verbatim. Answers `200` with an empty body (success), `409 booking_already_cancelled`, or `404 booking_not_found` (no such booking, or a real booking that is past-dated) (design-note §2, §4) | Must | AC-01, AC-02, AC-04, AC-07, AC-09 | planned |
| FR-02 | `AdminBookingsRepository` gains `cancelAnyBooking(bookingId, adminId, cancelledAt, today)`: one atomic `UPDATE … WHERE id=? AND status='confirmed' AND booking_date>=today RETURNING id`, writing `status='cancelled'`, `cancelled_at`, `cancelled_by=adminId`, `cancellation_source='admin'`. Deliberately **no** `.eq('user_id', …)` — REQ-014's authority comes from the `/api/admin` mount, never a predicate here (design-note §3.2) | Must | AC-01, AC-02, AC-04, AC-05, AC-06, AC-07 | planned |
| FR-03 | `AdminBookingsRepository` gains `findBookingState(bookingId)` — an **unscoped** read of `status, booking_date` and nothing wider, used only to classify a write that matched zero rows, and only after the write has already been attempted (design-note §3.1, §3.3) | Must | AC-09 | planned |
| FR-04 | `AdminBookingsService` gains `cancelAnyBooking(adminId, bookingId): Promise<CancelAnyBookingOutcome>` (`'ok' \| 'already_cancelled' \| 'not_found'`), taking one clock reading (`nowMs()`/`officeToday`) and calling the repository write before the classification read — never the reverse (design-note §3.3) | Must | AC-02, AC-04, AC-07, AC-09 | planned |
| FR-05 | `admin.router.ts`'s new handler reads `req.user.id` **only for attribution** (`cancelled_by`), never for authorization — the mount's existing `requireAdmin` guard is the sole authority, and no role check is added here (design-note §4) | Must | AC-02, AC-04, AC-09 | planned |
| FR-06 | `useAllBookings` gains `markCancelled(bookingId)`: flips one item's `status` to `'cancelled'` in the already-loaded list, in place, without a refetch and without decrementing `total`. Called on **both** the `ok` and `already_cancelled` outcomes; never called on a transport failure (design-note §5.3) | Must | AC-04, AC-09 | planned |
| FR-07 | New screen-private `use-admin-cancel-dialog.ts`, mirroring `use-cancel-dialog.ts`: a synchronous `inFlight` ref guard checked before any state read, `busy`/`error`/`singleAction` state driving `ConfirmDialog`'s existing props, no optimistic update, and an `onAlreadyCancelled` callback (not a refetch) on the `409` branch (design-note §5.2) | Must | AC-07, AC-08, AC-09 | planned |
| FR-08 | `lib/cancel-booking.ts` gains `createAdminCancelBooking(api)`, a sibling to the existing `createCancelBooking`, calling `POST /api/admin/bookings/:id/cancel` and sharing one private outcome-mapping function with the employee fetcher. `createCancelBooking`'s existing signature is **not** changed (design-note §5.1) | Must | AC-04, AC-07, AC-08, AC-09 | planned |
| FR-09 | `AdminBookingRow` renders a fifth field: a **Cancel** `Button variant="secondary"` when `item.status === 'confirmed'`; otherwise an em dash plus an accessible reason (*"Past bookings can't be cancelled"* for `completed`, *"Already cancelled"* for `cancelled`), visible in the card layouts and as an accessible label + `title` tooltip in the table layout. Cancellability is derived from `item.status` alone — **never** a date comparison in the browser (design-note §5.4) | Must | AC-01, AC-02 | planned |
| FR-10 | `AdminBookingsTableHead` gains a fifth `<th scope="col">` with a visually-hidden "Action" label; `AdminSkeletonRow`'s table variant `colSpan` becomes `5` (design-note §5.4) | Must | AC-01, AC-02 | planned |
| FR-11 | `AllBookings.tsx` composes the Cancel action with `ConfirmDialog` (title naming the employee, body naming desk + date + "is emailed", the busy/error/singleAction states, the cancelled toast) and returns focus to the row after a successful cancel via a `justCancelledId`, since the row's own Cancel button — the element focus would otherwise restore to — no longer exists in the DOM (design-note §5.2, §5.6) | Must | AC-03, AC-04, AC-07, AC-08, AC-09 | planned |
| FR-12 | `copy.ts` gains the ST-07–ST-11 strings — dialog title/body, button labels (*"Cancel this booking"*, *"Keep it"*, *"Try again"*, *"Close"*), the two failure/already-cancelled messages, and the cancelled toast — built from `item.employeeName`'s **full name** throughout, never a derived first name (design-note §5.5) | Must | AC-03, AC-05, AC-06, AC-08, AC-09 | planned |
| FR-13 | `AdminSkeletonRow`'s 360px card height changes from 160px to 188px, so a mixed list of cancellable and non-cancellable rows no longer visibly jumps on load (design-note §5.5, `decisions.md` D-04) | Must | protects US-013/AC-09 | planned |
| FR-14 | `AllBookings.spec.tsx`'s existing table-header assertion (citing `US-013/AC-11`) is **extended** to include the fifth column — never replaced or deleted (design-note §5.4) | Must | regression guard | planned |
| FR-15 | No bulk-cancel affordance exists anywhere on the screen: no `checkbox` role, no multi-select state, no "select all"/"cancel selected" control, in either the table or the card layout, and the number of Cancel controls always equals the number of cancellable rows (design-note §5.7) | Must | AC-10 | planned |

## Non-functional requirements

| ID | Requirement | Serves |
| --- | --- | --- |
| NFR-01 | The existing gated real-Postgres harness (`RUN_BOOKINGS_CONCURRENCY_TEST=1`, `bookings.repository.concurrency.spec.ts`) gains two assertions: a two-actor race (`cancelOwnedBooking` vs `cancelAnyBooking` on the same row, run concurrently) and a two-admin race, both proving exactly one write wins and the stored `cancellation_source` matches the winner (design-note §3.4, §9) | AC-07, AC-09 |
| NFR-02 | `admin-bookings.repository.spec.ts`'s recording fake gains `update`/`maybeSingle` verbs, following the existing no-mocking-library convention — nothing pinned that isn't visible in the test itself (design-note §8) | testing-standards.md |

## Technical constraints

- **No migration.** Every column, enum value and constraint this story writes (`cancellation_source`, `cancelled_by`) already exists (`supabase/migrations/0003_bookings.sql:18-22, 36-37, 48-53`). A migration in this PR is a review finding (design-note §0, §6).
- **No new error code, and `libs/contracts/src/error.ts` is not modified.** All reachable codes already exist (design-note §2.4).
- **`libs/contracts/src/bookings.ts` is not modified.** `cancelBookingParamsSchema` is reused verbatim; there is no response schema; **no `employeeEmail` field is added anywhere** — an administrator does not need a colleague's email address to be told they were emailed (design-note §2.3, §6).
- **No new or changed prop on any shared component** in `apps/ui/src/components/**`. `ConfirmDialog`, `Button`, `Alert`, `StatusChip` are used exactly as they exist today (design-note §0, §6).
- **`apps/api/src/http/app.ts`, `apps/api/src/http/middleware/**`, and `apps/api/src/composition.ts` are not modified.** The admin mount's guard predates this route, and the admin service's existing dependencies cover the new method (design-note §0, §4, §6).
- **No email or push send code, and no import from `infra/mailer` or `infra/webpush`.** This story writes exactly two columns (`cancellation_source`, `cancelled_by`); sending is US-029's and US-032's work (design-note §3.5, `decisions.md` D-03).
- **Cancellability in the browser is `item.status === 'confirmed'` and nothing else** — never a date comparison, which would go stale across an office midnight with the tab open (design-note §5.4).
- **No refetch after a successful or already-cancelled outcome.** Under an active `status=confirmed` filter (US-014), a refetch would make the row vanish — the exact behaviour AC-04 forbids. The row is updated in place via `markCancelled` (design-note §5.3).
- **`AllBookings` does not subscribe to `lib/data-refresh.ts`.** REQ-036's behaviour is set once for the whole app and this story does not change it (design-note §0).

## Out of scope

- Actually sending the cancellation email or the push notification — US-029 and US-032 build the senders; this story writes only the attribution data (`cancellation_source`, `cancelled_by`) they will read (design-note §3.5).
- Distinguishing, anywhere in the UI or the API response, whether the employee cancelled their own booking first or another admin's request won a race — AC-09 is deliberately one outcome (design-note §3.3).
- A distinct error code or a third dialog message for a past-dated cancel attempt — folded into the existing `404`, confirmed with the human (`decisions.md` D-07).
- Bulk or multi-select cancellation of any kind — AC-10 forbids it outright, permanently, not just for this release.

# US-010 — View my own bookings, past and upcoming

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-010-view-my-bookings.md`                        |
| **Traces to**     | REQ-009, REQ-028, BR-001.5, NFR-001                                                |
| **Screen**        | SCR-002 — ST-01 through ST-06. ST-07–ST-10 (cancellation) are US-011's, not touched |
| **Covering ADRs** | ADR-001, ADR-002, ADR-004 (all applied, none amended). **One new ADR: ADR-007** — Completed is derived server-side in `domain/`, superseding `db-design.md` §1.3's `bookings_with_status` view, which the Architect design note (`design-note.md`, this folder, §2) found not expressible against NFR-001's office timezone |
| **Tier**          | Complex                                                                            |
| **Status**        | implemented                                                                        |
| **Updated**       | 2026-09-19                                                                         |

## Problem

`GET /api/bookings/availability` today answers "what does the board look like for one date". Nothing
answers "what have I booked" — SCR-002's route (`/`, the employee's landing screen) currently renders
`MyBookings.tsx` as a stub that carries only two toasts (`apps/ui/src/screens/my-bookings/MyBookings.tsx`).
REQ-009 needs the employee's own bookings, upcoming first then the last 30 days with an explicit
"load older" control; REQ-028/BR-001.5 need a passed Confirmed booking to read as Completed, a status
the database never stores.

The Architect design note (`design-note.md`, this folder) settles the two questions the story text
explicitly defers to `/architect` (story lines 98, 105): the list/paging API shape (§1) and where
Completed is computed (§2). This spec restates those as testable `FR-##`s; it does not re-argue them
— the design note is the argument, this is the checklist.

## Functional requirements

| ID    | Requirement                                                                                                                                                                   | Priority | Serves      | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- | ----------- |
| FR-01 | `GET /api/bookings` (new route, mounted where `POST /api/bookings` already is) returns the caller's own bookings for a **date-floor window**: no `before` → `booking_date >= today − 30`, unbounded above (design-note §1.1, §1.2) | Must | AC-01, AC-03 | implemented |
| FR-02 | `?before=<date>` returns one older page: every booking in `[historyFloor(D), D]` where `D` is the caller's newest booking strictly before `before`; `nextBefore` is `historyFloor(D)` or `null` when nothing older exists (design-note §1.3) | Must | AC-03 | implemented |
| FR-03 | The response is `{ today, items[], nextBefore }` — one flat array ordered `booking_date` DESC then `created_at` DESC, never split into upcoming/past on the wire (design-note §1.4) | Must | AC-01, AC-03 | implemented |
| FR-04 | `libs/contracts/src/bookings.ts` gains `myBookingsQuerySchema` (`.strict()`, `before` optional), `myBookingListItemSchema`, `myBookingsResponseSchema`, and `bookingDisplayStatusSchema = z.enum(['confirmed','completed','cancelled'])` as a **second, response-only** schema — `bookingStatusSchema` (the stored, two-value shape) is unchanged (design-note §2.2, ADR-007) | Must | AC-04, AC-05 | implemented |
| FR-05 | A new pure function `bookingDisplayStatus(stored, date, today)` in `apps/api/src/domain/booking-history.ts`: `confirmed` + `date < today` → `completed`; every other combination passes through unchanged. Exported alongside `HISTORY_WINDOW_DAYS = 30` and `historyFloor(anchor)` (design-note §3, ADR-007) | Must | AC-04 | implemented |
| FR-06 | Two new `AvailabilityRepository` methods: `listMyBookingsInWindow(userId, from, to?)` and `findMyNewestBookingBefore(userId, before)`, both filtered to `user_id`, both ordered `booking_date desc, created_at desc`, both embedding `desks(desk_number)` (design-note §5) | Must | AC-01, AC-03, AC-04, AC-05 | implemented |
| FR-07 | `bookings.service.ts` gains `listMyBookings({ userId, before })`: computes `today` via the existing `officeToday(nowMs(), officeTimezone)` seam, runs the two repository reads, maps each row through `bookingDisplayStatus`, and sets `nextBefore` to the **floor**, not the oldest item's date (design-note §5) | Must | AC-01, AC-03, AC-04 | implemented |
| FR-08 | The route validates `before` via `.strict()` (unknown query fields → `400 invalid_request`), sets `Cache-Control: private, no-store`, and never swallows a repository failure into `items: []` (design-note §1.5) | Must | AC-09 | implemented |
| FR-09 | `MyBookings.tsx` sections the payload by `status`, **never** by a date comparison: `status === 'confirmed' && date === today` → today's row (ST-05); `status === 'confirmed' && date > today` → Upcoming, reversed to ascending; everything else → Past, left DESC. `data.today` from the payload is the only "today" the screen uses (design-note §4.1, §7.1, §7.2) | Must | AC-01, AC-02 | implemented |
| FR-10 | Three distinct empty/near-empty renders: ST-03 (`items.length === 0 && nextBefore === null`), ST-04 nothing-upcoming (`items` has no confirmed row, and either `items.length > 0` or `nextBefore !== null`) — including the sub-case where the Past section itself is empty but `nextBefore` is non-null (design-note §4.2, §7.3) | Must | AC-06, AC-07 | implemented |
| FR-11 | Loading renders `SkeletonRow`s at real row height, `aria-hidden`, with exactly one `role="status"` announcement ("Loading your bookings" → "`N` upcoming bookings"), never a stream (design-note §4.6) | Must | AC-08 | implemented |
| FR-12 | A failed fetch renders `Alert tone="danger"` with **Try again**; **Book a desk** is hidden in this state (SCR-002 ST-06); `retry()` resets to the default page and drops any accumulated older pages (design-note §1.5, §4.3) | Must | AC-09 | implemented |
| FR-13 | `StatusChip` gains an optional `kind?: 'desk' \| 'booking'` discriminator; `kind: 'booking'` accepts `'confirmed' \| 'completed' \| 'cancelled'` and renders `BOOKING_LABEL`'s word plus an `aria-hidden` icon (check-circle / clock / close). Existing `kind`-less call sites are unaffected (design-note §4.4) | Must | AC-05 | implemented |
| FR-14 | The page header states the office timezone once, from `office.timezone` in the auth context — **never** `office.today`, which is only used for the timezone label, not for any date decision (design-note §4.5, §7.2) | Must | AC-10 | implemented |
| FR-15 | The "load older" control is present iff `nextBefore` is non-null; pressing it requests `?before=<nextBefore>` unchanged and **appends** the response to the accumulated list, with a separate `loadingOlder` flag that does not re-trigger the initial-load skeleton (design-note §4.3, §7.4) | Must | AC-03 | implemented |

## Non-functional requirements

| ID     | Requirement                                                                                      | Serves  |
| ------ | --------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | No second live region: the existing single `role="status"` node's content changes, matching `AvailabilityCount`'s pattern (US-006) | NFR-008 |
| NFR-02 | Every control on the screen (row Cancel excluded — US-011's) is 48px tall, matching SCR-002's stated floor | NFR-008 |
| NFR-03 | `bookingDisplayStatus` and `historyFloor` are pure — no clock, no I/O — and unit-tested with literal dates, never a computed expectation (design-note §9, item 2) | testing-standards.md |

## Technical constraints

- **No migration.** `bookings_user_id_booking_date_idx` already exists and its comment already names REQ-009 (`supabase/migrations/0003_bookings.sql:77`). A migration in this PR is a review finding (design-note §0).
- **`bookings_with_status` is never created**, in any form — ADR-007 retires the Gate-1 view mechanism.
- **`HISTORY_WINDOW_DAYS` (30) is declared separately from `BOOKING_WINDOW_DAYS`** (also 30) — they are two different requirements that share a number today (design-note §1.2).
- **The browser never derives Completed.** `bookingDisplayStatus` runs once, server-side, per request (ADR-007).
- **`BookingRow` is private to `apps/ui/src/screens/my-bookings/`**, not extracted as a shared component — SCR-002 lists `booking-row` in its components table, but US-013's admin row differs (carries the employee's name) and there is only one real consumer today (design-note §0).
- **The Figma frames for ST-01–ST-06 were opened and cited by node id before the UI is built** (design-note §4.7; node ids in `implementation-plan.md` Steps 7–8). Unlike US-008 and US-009, the frames matched the written SCR-002 spec exactly — no corrections were needed. One thing the frames surfaced that neither the story nor the design note named: the approved row components render a `Cancel` control that is out of this story's scope (`decisions.md` D-05).

## Out of scope

- Cancellation (ST-07–ST-10, the `Cancel` control's behaviour) — US-011.
- The refresh-on-window-focus behaviour (REQ-036) — US-012. The state shape here is built so "re-fetch page 1, drop accumulated older pages" is expressible later, but the refresh itself is not wired in this story.
- The admin "all bookings" list (`GET /api/admin/bookings`, REQ-011/US-013) and its `page & limit` pagination — a different resource behind a different guard (design-note §1.1).
- Drawing the missing ST-04 sub-frame (Past section empty, only "Show older" showing) — design-note open item 2, a designer/PO question.
- Confirming the "Show older" control's exact copy — design-note open item 3, a `/ba` question (SCR-002's conflict table says "Show more"; the story says "an explicit control").

# US-009 — Be offered the next free days when everything is taken

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-009-next-free-days-when-fully-booked.md`        |
| **Traces to**     | REQ-035, BR-001.1, BR-001.3, V-02                                                   |
| **Screen**        | SCR-003 — ST-04 (fully booked). ST-05 (no desks) and ST-10 (already booked) are US-006's/US-007's and are not touched, and both still outrank ST-04 in the render |
| **Covering ADRs** | ADR-001, ADR-002, ADR-004 (all exercised, none amended). No new ADR — the Architect design note (§5) found nothing here binds work beyond this story: not the build-vs-fallback verdict, not the additive-field contract shape, not the lean-vs-Figma-counts call |
| **Tier**          | Complex                                                                              |
| **Status**        | approved                                                                             |
| **Updated**       | 2026-09-18                                                                           |

## Problem

When an employee's selected date has no free desk left, SCR-003 today has nothing more to say than
"every desk is taken" — a dead end. REQ-035 asks for a next step: the next two working days, inside
the 30-day booking window, that still have at least one free desk, offered as one-tap alternatives.
The story's own API-impacts note flagged this as a possible cost problem and named a pre-approved
fallback ("Try another day", no suggestions) in case a multi-day lookahead proved expensive — a
question it explicitly left to `/architect`.

The Architect design note (`design-note.md`, this folder) settled that question: build it. The
lookahead costs two extra indexed queries, run only in the one screen state that has nothing else to
render, over indexes the schema already has. No migration, no new endpoint, no new ADR.

Opening the real Figma frames for ST-04 (not just the written screen spec) surfaced two things the
design note didn't anticipate: the approved frame shows a free-desk count on each suggested day
("Thu 10 Sep · 12 free"), and a third "Pick another date" link inside the card itself. Both are
resolved below (Technical constraints) and confirmed with the human at Gate D1.

## Functional requirements

| ID    | Requirement                                                                                                                                                          | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `GET /api/bookings/availability`'s response gains an additive field `nextFreeDays: OfficeDate[]`, at most 2 entries, ascending | Must | AC-02 | not started |
| FR-02 | `nextFreeDays` is populated only when the selected date is fully booked (`desks.length > 0` and none `available`) **and** `myBooking` is `null`; every other case returns `[]` with no extra query | Must | AC-01, AC-07 | not started |
| FR-03 | A new pure function `pickNextFreeDays` (`apps/api/src/domain/next-free-days.ts`) computes up to 2 candidate dates strictly after the selected date, through `lastBookableDate(today)`, skipping weekends and out-of-window dates via `refusalFor`, skipping any date the caller already holds a Confirmed booking on (BR-001.1), and requiring at least one free desk | Must | AC-02, AC-05, AC-06 | not started |
| FR-04 | Two new repository reads, both scoped to `bookings` (ADR-004 unchanged, no new cross-table read): `listConfirmedDeskIdsInRange(from, to)` — `booking_date, desk_id`, no `user_id` — and `listMyConfirmedDatesInRange(userId, from, to)` — `booking_date`, filtered to the caller | Must | AC-06 | not started |
| FR-05 | When the selected date is the window's right edge (`addDays(date, 1) > lastBookableDate(today)`), the range reads are skipped entirely and `nextFreeDays` is `[]` | Must | AC-05 | not started |
| FR-06 | A failure in either range read is **not** swallowed — it propagates like any other availability failure (500/503, ST-06), never silently degrading to `[]` (which is itself a legitimate answer, AC-05) | Must | (edge case — honest failure) | not started |
| FR-07 | `BookADesk.tsx`'s render precedence gains one branch — `myBooking` → `desks.length === 0` (ST-05) → **fully booked (ST-04, here)** → the ordinary list — inserted after both existing checks, never before either | Must | AC-04, AC-07 | not started |
| FR-08 | `EmptyState` gains two optional props: `body?: string` (US-009's zero-suggestion case has no body text at all) and `actions?: ReactNode`. ST-05's call site passes neither — unchanged | Must | AC-04, AC-05 | not started |
| FR-09 | Copy: `FULLY_BOOKED(label)` names the date; a lead-line helper reads correctly for exactly 2, exactly 1, or 0 suggestions (AC-05) — see Technical constraints for the exact strings | Must | AC-01, AC-05 | not started |
| FR-10 | Each suggested day renders as a `Button variant="secondary"` showing the short date label, with a long-form `aria-label` (e.g. "Book a desk on Thursday 10 September"); activating it calls the existing `selectDate(date)` handler — no calendar step, no new fetch path | Must | AC-03 | not started |
| FR-11 | A `Button variant="ghost"` reading "Pick another date" renders inside the same `actions`, opening the existing date-picker (`setPickerOpen(true)`) — matching the approved Figma frame, not previously described in the story text | Must | (Figma-verified addition) | not started |
| FR-12 | The confirm action (`ConfirmBookingBar`) is absent, not disabled, in the ST-04 branch — free by construction of the branch's placement outside the ordinary-list branch | Must | AC-04 | not started |

## Non-functional requirements

| ID     | Requirement                                                                                          | Serves  |
| ------ | ----------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | No new live region. `AvailabilityCount`'s existing `role="status"` still announces the count on a date change; the empty state arriving underneath needs no second announcement | NFR-008 |
| NFR-02 | Suggestion buttons and the "Pick another date" link meet the existing 44px minimum control height and icon/word conventions — they are `Button`s, so nothing new is needed | NFR-008 |

## Technical constraints

- **Build the lookahead, not REQ-035's fallback.** Confirmed with the human at Gate D1, on the
  Architect's recommendation (`design-note.md` §1): the cost is two indexed queries over a bounded
  range, paid only in the one state that has nothing else to show.
- **`desks` is not re-read for the lookahead.** The active desk list from the availability call's
  first read is reused in memory; "does date *d* have a free desk?" is a set difference over ≤100
  ids, not a query.
- **No `freeCount` in the wire contract.** The approved Figma frame for ST-04 shows a free-desk
  count on each suggestion ("Thu 10 Sep · 12 free"), which the Architect's design note argued
  against carrying in the API (a count can go stale between being suggested and being clicked —
  the same staleness the story's own Edge cases already accept for the date itself). Confirmed with
  the human at Gate D1: build the lean contract, and file a `change-request` after this PR to
  correct the Figma frame/spec to drop the counts — the frame is the artifact that's wrong here, not
  the code.
- **Lead-line wording is keyed on the suggestion count**, because AC-05 requires the message to
  read correctly at every count and the approved frame's line names "two" explicitly:
  - Exactly 2 suggestions: *"The next two working days with desks free:"* (verbatim, from the
    approved Figma frame, node `39:1245`).
  - Exactly 1: *"The next working day with a desk free:"* (count word dropped).
  - 0: no lead line at all — only the title and the "Pick another date" link.
- **The "Pick another date" link inside the empty state is a Figma-verified addition**, found only
  by opening the real frames (node `39:1245`/`39:1420`/`39:1543`, file `xjFVgBbMrJUl7Ys3EX3Cbn`) —
  neither the story text nor the Architect's design note (which did not open Figma) described it.
  It reuses the existing picker-opening callback, not a new component.
- **No new `errorCodeSchema` value.** This story adds no refusal a user can cause and no new status
  (`design-note.md` §2.6).
- **No migration.** Both indexes the range reads need (`bookings_booking_date_status_idx`,
  `bookings_user_id_booking_date_idx`) already exist (`0003_bookings.sql:77-78`).

## Out of scope

- REQ-035's fallback ("Try another day", no suggestions) — not built; the lookahead was accepted as
  cheap enough (Gate D1).
- Correcting `inception/design/screens/SCR-003-book-a-desk.md` or the Figma frame to drop the
  per-suggestion free-desk counts — a `change-request` issue after this PR, not an edit here.
  Updating an approved screen spec mid-story is out of bounds for a Complex-tier delivery PR.
- ST-05 (no desks) and ST-10 (already booked) — untouched; both still outrank ST-04 (design note §2.6,
  §4.1).
- Any new ADR — the Architect's design note found none of this story's decisions rise to that bar
  (§5).

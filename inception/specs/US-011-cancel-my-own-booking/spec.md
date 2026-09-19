# US-011 — Cancel my own booking

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-011-cancel-my-own-booking.md`                  |
| **Traces to**     | REQ-010, BR-001.5, BR-001.6, V-06                                                  |
| **Screen**        | SCR-002 — ST-07 through ST-10. ST-01–ST-06 are US-010's, already built             |
| **Covering ADRs** | ADR-001, ADR-002, ADR-004, ADR-007 (all applied, none amended). **No new ADR** — `design-note.md` §7 explains why the wire-shape decision doesn't clear the bar |
| **Tier**          | Complex                                                                            |
| **Status**        | draft                                                                              |
| **Updated**       | 2026-09-19                                                                         |

## Problem

`POST /api/bookings/:id/cancel` already exists and already cancels a booking (built by US-007, for
its own "already booked that date" recovery flow on SCR-003). It is missing two things this story
requires: it never checks whether the booking's date has already passed (AC-02), and it cannot tell
the caller "that's already cancelled" apart from a generic failure (AC-09) — a deliberate limitation
US-007 left for this story to lift (`US-007/D-03`). Meanwhile the employee's own "My bookings" screen
(SCR-002) renders no Cancel control at all — `BookingRow` deliberately omits it, citing this story by
name (`decisions.md` D-05, in US-010's package).

The Architect design note (`design-note.md`, this folder) settles the two questions the story text
explicitly defers to `/architect` (story line 106): the wire shape for "already cancelled" (§1) and
where the past-date refusal is enforced (§2). This spec restates those as testable `FR-##`s; it does
not re-argue them.

## Functional requirements

| ID    | Requirement                                                                                                                                                                   | Priority | Serves      | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- | ----------- |
| FR-01 | `libs/contracts/src/error.ts` gains `booking_already_cancelled` in `errorCodeSchema`; the `booking_not_found` comment is corrected to describe two of the three original cases, not all three (design-note §1.1, §3) | Must | AC-09 | not started |
| FR-02 | `bookings.repository.ts`'s `cancelOwnedBooking` takes a new `today: OfficeDate` parameter and adds `.gte('booking_date', today)` to its existing `UPDATE ... WHERE` — one clock reading in the service supplies both `cancelledAt` and `today` (design-note §2.1) | Must | AC-02 | not started |
| FR-03 | A new repository method `findMyBookingState(userId, bookingId)` — one owner-scoped, read-only lookup of `{status, booking_date}`, issued only when `cancelOwnedBooking` returns nothing (design-note §4.2) | Must | AC-09 | not started |
| FR-04 | `bookings.service.ts`'s `cancelBooking` returns one of three outcomes — `ok`, `already_cancelled`, `not_found` — via write-first-then-explain: the `UPDATE` is the sole write, the disambiguating read runs only on a miss (design-note §1.4, §4.1) | Must | AC-02, AC-04, AC-09 | not started |
| FR-05 | `bookings.router.ts`'s `POST /:id/cancel` gains a `409 booking_already_cancelled` branch (via `conflict()`) ahead of the existing `404 booking_not_found` branch; the `200`-empty success path is unchanged (design-note §4.3) | Must | AC-09 | not started |
| FR-06 | Four docblocks that assert the endpoint is fully undiscriminated are corrected to say two of three cases stay merged, one peels off — `error.ts`, `bookings.router.ts`, `bookings.service.ts`, `bookings.repository.ts` (design-note §3) | Must | — (correctness of record) | not started |
| FR-07 | `ConfirmDialog` gains two additive optional props — `error?: ReactNode` (rendered via `Alert`) and `singleAction?: boolean` (collapses the footer to one "Close"-style action) — with no change to any existing call site's behaviour (design-note §5.1a) | Must | AC-08, AC-09 | not started |
| FR-08 | `ConfirmDialog`'s Escape handler is guarded by `!busy` (currently unconditional — a live defect); the new header close (✕) icon is disabled under the same condition (design-note §5.1b) | Must | AC-07 | not started |
| FR-09 | `ConfirmDialog` traps Tab focus within itself while open and restores focus to the triggering element on unmount; a header close (✕) icon (Figma node `11:50`, already in `assets/icon-close.svg`) is added, calling the same `onCancel` (design-note §5.1c; verified against Figma nodes `103:6156`–`104:2210`) | Must | AC-03 | not started |
| FR-10 | `ConfirmDialog`'s CSS is corrected to match its own approved Figma master component: `480px` centred card (not `420px`), `--c-surface-overlay` + `--shadow-3`, no border, over `--c-scrim` (not a raw `rgba` value); below 768px it becomes a full-width bottom sheet with squared bottom corners on `--shadow-sheet` (verified against Figma; design-note §5.1a) | Must | AC-03 | not started |
| FR-11 | `apps/ui/src/components/existing-booking-state/cancel-booking.ts` moves to `apps/ui/src/lib/cancel-booking.ts` and its outcome widens to four: `ok`, `already_cancelled`, `refused`, `failed`. `ExistingBookingState` collapses the two new outcomes into its own `ok`, preserving US-007/AC-07's converge-don't-fail behaviour unchanged (design-note §5.2) | Must | AC-09 (and a regression guard on US-007/AC-07) | not started |
| FR-12 | `BookingRow` gains an optional `onCancel?: () => void` prop; `MyBookings` passes it only for the TODAY row and Upcoming rows, never for Past rows (design-note §5.4) | Must | AC-01 | not started |
| FR-13 | `useMyBookings` gains a `markCancelled(bookingId)` action that flips one item's `status` to `'cancelled'` in place, with no re-fetch; sectioning (already built by US-010) moves the row into Past automatically (design-note §5.3) | Must | AC-05 | not started |
| FR-14 | `MyBookings` wires the full flow: Cancel opens `ConfirmDialog` naming the row's own desk and date; confirming calls the (moved) cancel fetcher; `ok` → `markCancelled` + toast; `already_cancelled` → non-retryable message, **Close**, `retry()` on dismissal; `refused`/`failed` → retryable message, dialog stays open, nothing else changes (design-note §5.3) | Must | AC-01, AC-03, AC-04, AC-05, AC-07, AC-08, AC-09 | not started |
| FR-15 | New copy in `my-bookings/copy.ts`: ST-07's dialog title/body (built from the row's own desk/date, never a literal), **Cancel booking**/**Keep it**, ST-09's two messages, ST-10's toast — verified verbatim against the live Figma frames (design-note §5.5) | Must | AC-03, AC-05, AC-08, AC-09 | not started |
| FR-16 | The whole flow issues no password prompt and no `set-password`/sign-in request at any point (negative assertion) | Must | AC-06 | not started |

## Non-functional requirements

| ID     | Requirement                                                                                      | Serves  |
| ------ | --------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | Exactly one live region on the screen remains — ST-09's error uses `Alert`'s own `role="alert"` inside the dialog, ST-10's toast uses `Toast`'s own `role="status"`; `MyBookings`'s single list-level `role="status"` node is not joined by a second | NFR-008 |
| NFR-02 | The Cancel control is 48px tall and right-aligned at its natural width at 360px, matching SCR-002's stated floor and structural decision | NFR-008 |
| NFR-03 | `findMyBookingState`'s select list is `status, booking_date` only — no `user_id`, no `desk_id` — matching the module's existing discipline | api-standards.md |

## Technical constraints

- **No migration.** Every column, constraint and index this needs already exists (design-note §0, §6). A migration in this PR is a review finding.
- **`libs/contracts/src/bookings.ts` is untouched.** The wire shape change is confined to `error.ts`; no request or response schema gains a field (design-note §1.1, §6).
- **The `UPDATE` stays the sole write and the sole arbiter of "confirmed → cancelled."** The disambiguating read is issued only on a miss, and only to classify it — never to decide whether to write (design-note §1.4, §8.1).
- **One clock reading per request** for both `cancelledAt` and `today` (design-note §2.1, §8.4).
- **No new `apps/api/src/domain/` function.** BR-001.6's cancellability rule is already `bookingDisplayStatus(...) === 'confirmed'` (ADR-007); the SQL predicate is that same rule expressed at the write (design-note §2.1, §8.1 note in §0).
- **The browser never derives cancellability from a date comparison.** The Cancel control's presence is driven by `status === 'confirmed'` alone (design-note §5.4, §8.3).
- **`cancel-booking.ts`'s existing consumer (`ExistingBookingState`, SCR-003) must keep its current behaviour exactly** — a `409` or a past-date refusal collapses into its own `ok`, the same as `booking_not_found` does today (design-note §5.2, §8.2). A regression test citing `US-007/AC-07` is required in this PR.
- **The Figma frames are the visual authority for ST-07–ST-10**, not the written screen spec alone (`HF / SCR-002 · My bookings / ST-07…ST-10` in Figma file `xjFVgBbMrJUl7Ys3EX3Cbn`, node ids in `traceability.md`) — confirmed with the human before this package was finalized, per this repo's own past-feedback practice on UI stories.

## Out of scope

- **US-029** (the actual cancellation email) — AC-10 is proven at the unit level only, by asserting the service performs exactly one write on success (design-note §1.5, open item 6). No mail is sent by this PR.
- **Open item 1** (design-note §2.3, §11): what the screen does about a stale "today" row across office midnight — a tab left open overnight showing a now-past booking as still Confirmed. The proposed mitigation (refresh on any server-answered dismissal) is a small deviation from the approved screen spec and needs a PO/Designer call, not a DEV decision. Implemented per the design note's default (retryable message) unless the human says otherwise at D1.
- **`ai/standards/api-standards.md`'s new disclosure-rule row** (design-note §1.2, open item 4) — a separate, Simple-tier change after this story, not part of this PR.
- **Extracting `BookingRow` as a shared component** — still US-013's call, unchanged from US-010 §0.

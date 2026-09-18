# US-007 — Book an available desk

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-007-book-an-available-desk.md`                   |
| **Traces to**     | REQ-008, BR-001.1, BR-001.2, BR-001.5, V-04, V-05                                    |
| **Screen**        | SCR-003 — ST-07 (selected) · ST-08 (booking) · ST-09 (taken while looking) · ST-10 (already booked that date) · ST-11 (booked) · ST-12 (booking failed); reuses **SCR-002 ST-07** (cancel confirmation dialog) for AC-07 |
| **Covering ADRs** | ADR-001, ADR-002, ADR-004 (all exercised, none amended). No new ADR: the concurrency design (insert-without-precheck, let the two partial unique indexes arbitrate) is already settled in `inception/architecture/app-architecture.md` §4.1, echoed in `ai/standards/api-standards.md` (Concurrency) and `ai/standards/testing-standards.md`. The Architect design note at Complex tier confirms/reviews this story's mapping of that design onto `POST /api/bookings`; it is not re-deciding the approach |
| **Tier**          | Complex                                                                              |
| **Status**        | approved                                                                             |
| **Updated**       | 2026-09-18                                                                           |

## Problem

Today `desks` and `bookings` exist and are read (US-006), but nothing ever writes `bookings` — the
two partial unique indexes created whole by `0003_bookings.sql` have never been exercised. The
system must let a signed-in employee turn one **Available** desk, for the date they already chose
(US-005), into a **Confirmed** booking: exactly one desk, exactly one booking per employee per day,
with the database — not application code — arbitrating any race between two employees who both see
the same free desk at once. It must also stop the wasted choice of picking a desk on a date the
employee already holds, refuse a booking outright for a non-working or out-of-window date or an
inactive desk regardless of what the client sent, and give the employee a way out of an already-booked
date by cancelling that one booking from the same screen.

## Functional requirements

| ID    | Requirement                                                                                                                                                          | Priority | Serves | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ----------- |
| FR-01 | `POST /api/bookings` accepts `{ date, deskId }`, creates a **Confirmed** booking for the caller (`req.user.id`), and responds `201` with the booking id, desk id/number, date, status and `confirmationEmail` (the caller's account email) | Must     | AC-03, AC-04 | not started |
| FR-02 | The insert is attempted with **no preceding availability check**; Postgres's two partial unique indexes arbitrate. A violation of `bookings_one_confirmed_per_desk_per_day` maps to `409 desk_already_booked`; a violation of `bookings_one_confirmed_per_user_per_day` maps to `409 already_booked_that_date` | Must     | AC-05, AC-08 | not started |
| FR-03 | A date that `refusalFor` refuses (past, beyond the 30-day window, or a weekend) is rejected `422 date_not_bookable` before any insert is attempted, however the request was built | Must     | AC-11 | not started |
| FR-04 | A `deskId` that does not exist is rejected `404 desk_not_found`; a `deskId` for a desk with `is_active = false` is rejected `422 desk_inactive` — both before any insert is attempted | Must     | AC-12 | not started |
| FR-05 | `GET /api/bookings/availability` (US-006) gains an additive `myBooking` field: the caller's own **Confirmed** booking for the requested date (`{ id, deskId, deskNumber }`), or `null` | Must     | AC-06 | not started |
| FR-06 | `POST /api/bookings/:id/cancel` cancels the caller's own **Confirmed** booking (status → `cancelled`, `cancelled_at` set, `cancelled_by` = self, `cancellation_source: 'owner'`) and responds `200`. A booking that does not exist, is not the caller's, or is not currently `confirmed` is rejected `404 booking_not_found` — undistinguished, because this story needs only enough to unblock AC-07; US-011 owns the fuller eligibility surface | Must     | AC-07 | not started |
| FR-07 | Selecting an **Available** desk row marks it **Selected** (icon + word) and enables the confirm action, labelled `"Book {deskNumber} for {formatted date}"` | Must     | AC-01 | not started |
| FR-08 | Selecting a different **Available** desk row moves the selection; at most one desk row is ever `Selected` | Must     | AC-02 | not started |
| FR-09 | When the date control's value changes, any desk selection clears and the confirm action returns to disabled | Must     | (edge case — date change clears selection) | not started |
| FR-10 | On confirm success, the employee is navigated to **My bookings**, and the destination carries a message naming the desk, the date and the confirmation email address — dismiss-free, not a modal. **"Visible in Upcoming" is not implemented here** — `MyBookings` is a documented stub with no booking list until US-010 (discovered during implementation, D-08) | Must     | AC-03, AC-04 | not started |
| FR-11 | When availability loads (or reloads) for a date and `myBooking` is non-null, the desk list is replaced by the existing-booking state immediately — before any desk row is rendered as selectable — and the confirm action is hidden | Must     | AC-06 | not started |
| FR-12 | From the existing-booking state, the reused SCR-002 ST-07 dialog's confirm action calls `POST /api/bookings/:id/cancel` for that booking; on success, availability for the same date is reloaded so desks become selectable again | Must     | AC-07 | not started |
| FR-13 | On `409 desk_already_booked` from the confirm action: show an alert stating the desk was just taken, reload availability for the same date, clear the selection, return the confirm action to disabled, move focus to the alert, and create no booking | Must     | AC-08 | not started |
| FR-14 | On `409 already_booked_that_date` from the confirm action (the race variant of AC-05/AC-06 — booked elsewhere between page load and confirm): **refetch availability for the same date** (the `409` body carries no desk/booking data — `api-standards.md`'s error shape forbids it), then replace the desk list with the existing-booking state from the refetched `myBooking`, focus moved to the explanation after the refetch resolves. If the refetch's `myBooking` comes back `null` (the conflicting booking was itself cancelled in the interim), fall back to the ordinary desk list instead of an empty existing-booking state (Architect design note §4) | Must     | AC-05 | not started |
| FR-15 | While a confirm request is in flight: the confirm action shows busy with its label unchanged, desk rows and the date control become read-only, the layout does not shift, and a second activation before the response arrives issues no second request | Must     | AC-09 | not started |
| FR-16 | On any confirm failure that is neither FR-13 nor FR-14 (server error, timeout, lost connection): show a failure state that states the uncertainty, offers **Check my bookings** (primary) and **Try again** (secondary), retains the desk selection, and announces assertively | Must     | AC-10 | not started |

## Non-functional requirements

| ID     | Requirement                                                                                          | Serves  |
| ------ | ----------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | Selected/Available/Taken status is never conveyed by colour alone — icon and word together, reusing `status-chip` (US-006) | NFR-008 |
| NFR-02 | The date and desk checks are re-derived server-side on every request; the server never trusts a client-supplied notion of "today," "bookable," or "active" | NFR-001 |
| NFR-03 | ST-09's alert and ST-12's failure state announce assertively (`aria-live="assertive"`), matching the story's UI commitments | NFR-008 |

## Technical constraints

- **No new `domain/` function.** `refusalFor` and `officeToday` (US-005) are reused as-is for FR-03;
  a second window check in this story would be drift, not defence in depth (same rule US-006 already
  applied).
- **Insert-without-precheck is not optional.** `app-architecture.md` §4.1 step 4 names it as the
  design decision, restated in `ai/standards/api-standards.md`'s Concurrency section: "the booking
  insert is attempted without a preceding availability check... a check-then-insert has a race window
  no application code closes." The existing `GET /availability` read still exists — it serves the
  availability screen, not the booking decision.
- **Constraint-violation mapping is proven by a real-Postgres test, not a stub.**
  `ai/standards/testing-standards.md`'s "Concurrency has to be tested where it is decided" requires two
  concurrent inserts against a real Postgres instance (Supabase local or a disposable project), not a
  mocked error — this is also the QA notes' explicit warning for ST-09/AC-08.
- **`bookings.repository.ts` may `SELECT` from `desks`** (ADR-004, already precedented by
  `listActiveDesks`) for the FR-04 active/exists check, but only `modules/desks` (US-015/US-017,
  not yet built) may write it.
- **The cancel endpoint (FR-06) is deliberately undiscriminating.** It returns one outcome —
  cancelled, or `404 booking_not_found` for every other case (not found, not owned, not confirmed) —
  because AC-07 needs only "cancel it, then rebook," not the eligibility rules, double-submit
  protection, or cancellation email that belong to US-011/US-029. Building those here would be scope
  this story was not approved for.
- **AC-04's "confirmation emailed to..." is UI copy, not a dispatch.** `confirmationEmail` in FR-01's
  response is `req.user.email`, read fresh from `user_profiles` by the session middleware already in
  place — no call into `modules/notifications` or `infra/mailer`, both empty stubs. US-028
  ("get a confirmation email when my booking is made") is the story that actually sends it, and its
  own spec says so directly: *"The employee-facing confirmation on screen already names the address
  the email went to (US-007/AC-04). If the two disagree, the screen is wrong."*
- **`GET /api/bookings/availability`'s response gains one additive field** (`myBooking`), not a
  second endpoint — the response schema is already non-`.strict()` (US-006's stated rule for every
  response in `@desk-booking/contracts`), and AC-06 needs the existing-booking fact available at the
  same moment the desk list arrives, not after a second round trip.
- Error codes added to `libs/contracts/src/error.ts`'s `errorCodeSchema`: `desk_already_booked`,
  `already_booked_that_date`, `desk_not_found`, `desk_inactive`, `booking_not_found`. `date_not_bookable`
  already exists (added by US-006, whose own comment names US-007 as its second user).

## Out of scope

- The full "cancel my own booking" surface — eligibility rules beyond "confirmed and mine," the
  cancel action on the **My bookings** list, double-submit protection on cancel, "already cancelled
  elsewhere" handling, and the cancellation email — all US-011/US-029.
- The confirmation email actually being sent — US-028 (depends on US-007, and on US-034 for mail
  configuration).
- ST-04 / next-available-day suggestions when fully booked — US-009.
- Admin booking on behalf of an employee — explicitly out of scope entirely per the story
  (BRD-001 §10, decided 2026-09-07); an Admin has no booking screen.
- Push notification on booking — US-032.
- **The zone-tabs/desk-tile grid layout.** `inception/design/screens/SCR-003-book-a-desk.md` carries
  an uncommitted 2026-09-18 revision replacing US-006's merged flat `zone-group`/`desk-row` list with
  a tabbed, tiled layout, and that revision names itself explicitly as needing "a follow-up dev story"
  before the product matches it — not this one. Confirmed with the human at D1: US-007 builds AC-01/02
  (selection, single-select) on the **current, merged** `desk-row`/`zone-group` components. The tile-grid
  rebuild is a separate story, to be raised through Gate 1 once that spec's own open questions (5 and 6
  in that file) are resolved.

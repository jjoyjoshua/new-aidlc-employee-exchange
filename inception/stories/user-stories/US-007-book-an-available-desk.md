# US-007 — Book an available desk

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-007-book-an-available-desk`) merging with every AC proven by a test named `... (US-007/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-008, BR-001.1, BR-001.2, BR-001.5, V-04, V-05      |
| **Priority**   | Must                                                   |
| **Estimate**   | 8 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-005, US-006                                         |

## Story

As an employee
I want to reserve one specific free desk for the day I picked
So that the seat is waiting for me when I come in.

## Acceptance criteria

### AC-01 Selecting a desk arms a confirm action that names the choice

- **Given** availability is shown for a date
- **When** an **Available** desk row is selected
- **Then** that row reads **Selected** with an icon and the word, and the confirm action becomes enabled reading *"Book A-02 for Wed 9 Sep"* — the desk and the date in the label (SCR-003 ST-07)

### AC-02 Only one desk can be selected

- **Given** a selected desk
- **When** another available desk is selected
- **Then** the selection moves to the new desk and only one desk is ever selected — this screen books exactly one desk (REQ-008)

### AC-03 Confirming creates a Confirmed booking

- **Given** a selected available desk on a bookable date
- **When** the confirm action is used
- **Then** a booking is created for that employee, that desk and that date with status **Confirmed** (REQ-008, BR-001.5), and the employee lands on **My bookings** with it visible in Upcoming (SCR-003 ST-11)

### AC-04 A confirmation names the channel it was sent on

- **Given** a booking that has just succeeded
- **When** the confirmation is shown
- **Then** it names the desk, the date and the email address the confirmation went to — *"A-02 booked for Wed 9 Sep. Confirmation emailed to priya@company.com."* — and is carried by the destination rather than needing to be dismissed (SCR-003 ST-11, REQ-023)

### AC-05 A second booking on the same date is refused

- **Given** an employee who already holds a **Confirmed** booking for the selected date
- **When** they attempt to book any desk for that date
- **Then** the booking is refused, and the desk list is replaced by their existing booking for that date with the only route through — cancel it, then rebook (BR-001.1, BR-001.2, V-05, SCR-003 ST-10)

### AC-06 That refusal arrives before the desk is chosen

- **Given** an employee choosing a date on which they already hold a booking
- **When** the date is selected
- **Then** the existing-booking state appears immediately, before any desk selection, and the confirm action is hidden — the wasted choice never happens (SCR-003 ST-10)

### AC-07 Cancelling from that state returns a bookable screen

- **Given** the existing-booking state for a date
- **When** the employee cancels that booking from the confirmation dialog opened there
- **Then** they land back on the same date with availability shown and desks selectable (BR-001.2, SCR-003 ST-10)

### AC-08 A desk taken while they were looking refreshes rather than retries

- **Given** a selected desk that another employee has since booked
- **When** the confirm action is used and the server refuses
- **Then** an alert states that the desk was just taken, availability refreshes underneath, the selection clears, the confirm action returns to disabled, and no booking is created (V-04, SCR-003 ST-09)

### AC-09 A double tap creates one booking

- **Given** the confirm action has been used
- **When** it is activated again before the response arrives
- **Then** exactly one booking exists, the action is shown busy with its label kept, the desk rows and date control are read-only, and the layout does not shift (SCR-003 ST-08)

### AC-10 An ambiguous failure sends them to check, not to retry

- **Given** a booking request that fails for a reason that is neither AC-05 nor AC-08 — server error, timeout, lost connection
- **When** the failure is reported
- **Then** it states the uncertainty plainly, offers **Check my bookings** as the primary route and **Try again** as secondary, and retains the desk selection (SCR-003 ST-12)

### AC-11 A weekend or out-of-window date cannot be booked from anywhere

- **Given** a booking request for a Saturday, a Sunday, a past date, or a date beyond today + 30 days
- **When** it reaches the server, however it was constructed
- **Then** it is refused — the date rules are enforced server-side, not only in the date control (BR-001.3, V-02, V-03)

### AC-12 An inactive desk cannot be booked from anywhere

- **Given** a booking request naming a desk marked **Inactive**
- **When** it reaches the server
- **Then** it is refused (REQ-017, BR-001.7, V-09's counterpart on the booking side)

## Edge cases

- Two employees confirming the same desk at the same instant: exactly one booking is created and the other sees AC-08. This is RISK-004's user-visible face; the locking mechanism is `/architect`'s, the outcome is this AC's.
- AC-10's honesty is deliberate: a blind retry either double-books — refused confusingly by BR-001.1 — or works, and the interface genuinely cannot tell which. Sending the employee to check first is the design decision, not a placeholder.
- An employee whose only booking for the date is **Cancelled** may book again for that date: BR-001.1 counts **Confirmed** bookings only.
- Changing the date clears any desk selection — availability is per-date.
- Booking by an Admin account: out of scope entirely (BRD-001 §10, decided 2026-09-07). An Admin has no booking screen.

## UI

Served by **SCR-003 — Book a desk**, approved in design step 2, with the cancel confirmation dialog reused from **SCR-002 ST-07** for AC-07.

States exercised: **ST-07** desk selected · **ST-08** booking in progress · **ST-09** desk taken while she looked · **ST-10** already booked that date · **ST-11** booked · **ST-12** booking failed.

Design commitments this story must honour: the confirm action names the desk and the date, because on a phone the chosen row has often scrolled away by the time the thumb arrives; the action is bottom-anchored above the bottom bar below 768px, never a floating button covering the last row; after ST-09's refresh, focus moves to the alert so the reason is heard before the list is re-scanned; ST-10 moves focus to the explanation rather than the cancel action, so the reason is read before acting; ST-09 and ST-12 announce assertively; the destructive cancel action in AC-07 uses the solid danger fill added on 2026-09-08.

## QA notes

- **ST-09 (AC-08) is the state most likely to be skipped and the most likely to happen** — 9am on a Monday in a busy office. The screen spec says so explicitly. Give it a real concurrency test, not a mocked error.
- AC-11 and AC-12 must be tested at the server, bypassing the date control and the desk list. Client-only enforcement passes every UI test and fails both ACs.
- AC-05 and AC-06 are the same rule from two directions: refused on the date change, and refused again on confirm if the earlier booking was made elsewhere. Both paths need a test.
- AC-09: assert the booking count, not the button's appearance.
- Data setup: an employee with no bookings; the same employee with a **Confirmed** booking on the target date; one with only a **Cancelled** booking on that date; a desk that gets booked by a second actor mid-flow; one inactive desk.

## API impacts

Needs a booking-creation endpoint that enforces, server-side, every one of: availability (V-04), one-per-day (V-05), working day (V-03), window (V-02), and desk active (BR-001.7) — and that distinguishes AC-08's "already taken" from AC-05's "you already have one" from AC-10's generic failure, because the screen shows three different states for them. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

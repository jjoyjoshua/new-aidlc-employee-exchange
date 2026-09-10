# US-015 — Cancel an employee's booking on their behalf

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-015-cancel-a-booking-on-behalf`) merging with every AC proven by a test named `... (US-015/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-014, BR-001.6, BR-001.20                           |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-013                                                 |

## Story

As an office administrator
I want to cancel a booking somebody else made
So that a desk held by someone who is not coming in goes back into the pool.

## Acceptance criteria

### AC-01 Today's and future Confirmed bookings can be cancelled

- **Given** a booking dated today or later with status **Confirmed**
- **When** the administrator views its row
- **Then** a **Cancel** action is offered (REQ-014, BR-001.6)

### AC-02 Everything else cannot

- **Given** a booking that is past-dated, or whose status is **Cancelled** or **Completed**
- **When** the row is rendered
- **Then** no **Cancel** action is offered, the reason is stated in words in the card layouts, and a cancellation request naming that booking is refused at the server (V-06, SCR-005 ST-07)

### AC-03 The confirmation names the employee

- **Given** the **Cancel** action on an eligible row
- **When** it is used
- **Then** the confirmation names the employee as well as the desk and the date — this is the one screen where the person losing the desk is not the person clicking (SCR-005 ST-08)

### AC-04 Confirming voids the booking and frees the desk

- **Given** the confirmation
- **When** the administrator confirms
- **Then** the booking becomes **Cancelled**, the desk becomes available for that date, and the row stays in place showing its new status rather than disappearing (BR-001.5, SCR-005 ST-11)

### AC-05 The employee is emailed

- **Given** a successful cancellation
- **When** the status becomes **Cancelled**
- **Then** the cancellation email goes to the booking owner, not to the administrator who cancelled it (REQ-024, BR-001.13; BRD-001 §10 — no admin copies)

### AC-06 An opted-in employee's push alert names the office admin

- **Given** the booking owner has opted in to browser push (US-031)
- **When** the administrator cancels their booking
- **Then** the push alert states that the office admin cancelled it, rather than reporting a cancellation with no cause (REQ-027, BR-001.20 — delivered by US-032)

### AC-07 One cancellation, one email

- **Given** a cancellation in flight
- **When** the confirming action is activated again
- **Then** exactly one cancellation and one email exist, the action shows busy, and nothing is changed optimistically behind the dialog (SCR-005 ST-09)

### AC-08 A failure says nothing changed

- **Given** the request fails
- **When** the failure is reported
- **Then** the dialog stays open, the booking is still **Confirmed**, and the message says nothing changed and offers a retry (SCR-005 ST-10)

### AC-09 The employee getting there first is not an error

- **Given** a booking the employee has already cancelled themselves (US-011)
- **When** the administrator confirms their cancellation of it
- **Then** they are told it is already cancelled, the row updates, and no second cancellation or second email is produced (SCR-005 ST-10)

### AC-10 There is no bulk cancel

- **Given** the booking list
- **When** it is rendered
- **Then** no multi-select, checkbox column or bulk cancellation exists — one mis-click must not be able to cancel ten people's days (SCR-005 structural decisions)

## Edge cases

- The administrator cancelling their own booking is impossible: Admin accounts cannot book (BRD-001 §10).
- Cancelling several bookings on one desk to clear a blocked deactivation (US-019/AC-04) is done one at a time, arriving pre-filtered via US-014/AC-08. That is the accepted cost of rejecting bulk actions.
- BR-001.20 covers the **push** channel only. Whether the cancellation **email** also names the actor is **BRD-001 open question #14**, unresolved — US-029/AC-04 carries it. Most employees only get the email, so this is the more widely felt half.
- An employee cancelled out of a desk gets no explanation in the interface itself; the notification is the whole of the explanation. That is why BR-001.20 exists.

## UI

Served by **SCR-005 — All bookings**, approved in design step 2.

States exercised: **ST-07** row not cancellable · **ST-08** cancel confirmation · **ST-09** cancelling · **ST-10** cancel failed · **ST-11** cancelled.

Design commitments this story must honour: the confirmation names the employee; the cancelled row stays in place, because an administrator's next thought is "did that work?"; the destructive action uses the solid crimson danger fill added 2026-09-08; no optimistic update.

## QA notes

- AC-05 and AC-06 are the pair most likely to be got wrong together: assert the email goes only to the owner, and that the push wording differs from the employee-initiated cancellation in US-011. A shared "cancelled" template would pass US-011 and fail BR-001.20.
- AC-09 is the mirror of US-011/AC-09 and needs the same two-actor test from the other side.
- AC-02 needs a server-side attempt with a past booking's identifier.
- AC-10 is a negative assertion that protects a deliberate decision.
- Data setup: bookings for several employees today, future and past; one owner opted in to push and one not; one booking cancelled by its owner mid-flow.

## API impacts

Needs a cancellation endpoint that is Admin-only, enforces BR-001.6, records that the actor was not the owner so BR-001.20's wording can be selected, and reports "already cancelled" distinguishably. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

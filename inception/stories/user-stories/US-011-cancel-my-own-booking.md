# US-011 — Cancel my own booking

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-011-cancel-my-own-booking`) merging with every AC proven by a test named `... (US-011/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-010, BR-001.5, BR-001.6, V-06                      |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-010                                                 |

## Story

As an employee whose plans changed
I want to cancel a desk I booked
So that a colleague can use the seat I am not going to sit in.

## Acceptance criteria

### AC-01 Today's and future Confirmed bookings can be cancelled

- **Given** a **Confirmed** booking dated today or later in the office timezone
- **When** the employee views it
- **Then** a **Cancel** action is available on that row (REQ-010, BR-001.6)

### AC-02 Past and non-Confirmed bookings cannot

- **Given** a booking that is past-dated, or whose status is **Cancelled** or **Completed**
- **When** the employee views it
- **Then** no **Cancel** action is offered for it, and a cancellation request naming it is refused at the server (V-06, BR-001.6)

### AC-03 Cancelling is confirmed first

- **Given** the **Cancel** action on an eligible row
- **When** it is used
- **Then** a confirmation names the desk and the date before anything changes, with a clear way to back out and Escape to dismiss (SCR-002 ST-07)

### AC-04 Confirming voids the booking and frees the desk

- **Given** the confirmation
- **When** the employee confirms
- **Then** the booking's status becomes **Cancelled**, it stops occupying that desk for that date, and the desk becomes available to others for that date (BR-001.5)

### AC-05 The result is stated in place

- **Given** a successful cancellation
- **When** the list updates
- **Then** the row's status becomes **Cancelled**, the booking leaves the upcoming group, and a transient message states what happened (SCR-002 ST-10)

### AC-06 No password is asked for

- **Given** a valid session inside its 30 days
- **When** a cancellation is confirmed
- **Then** no password prompt or re-authentication appears — this is the specific act NFR-009's session length was chosen to protect

### AC-07 A cancellation in flight cannot be sent twice

- **Given** a cancellation is in flight
- **When** the confirming action is activated again
- **Then** one cancellation request exists, the action is busy, the dialog stays open, and no optimistic change is shown behind it (SCR-002 ST-08)

### AC-08 A failure says nothing changed

- **Given** the cancellation request fails
- **When** the failure is reported
- **Then** the dialog stays open with the booking still **Confirmed**, and the message states that nothing changed and offers a retry (SCR-002 ST-09)

### AC-09 Already cancelled elsewhere is not an error to argue with

- **Given** a booking an Admin has already cancelled (US-015) or that a deactivation cascade voided (US-025)
- **When** the employee confirms their own cancellation of it
- **Then** they are told it is already cancelled, the row updates to **Cancelled**, and no second cancellation or second email is produced (SCR-002 ST-09)

### AC-10 A cancellation email is sent

- **Given** a successful cancellation
- **When** the status becomes **Cancelled**
- **Then** the cancellation email is sent to the booking owner (REQ-024, BR-001.13 — built by US-029)

## Edge cases

- Cancelling today's booking is allowed right up to the end of the office day: BR-001.6 says today or later, with no cut-off hour. Do not add one.
- Cancelling and rebooking the same date is the supported way to change desks (BR-001.2, US-007/AC-07).
- A cancelled booking is never revived. Rebooking creates a new booking; the cancelled record is retained.
- Cancelling releases the desk immediately, so an employee can lose the seat to somebody faster. That is the intent.
- The employee cancelling their own booking is the one cancellation path where the actor needs no naming — BR-001.20 covers the paths where somebody else did it.

## UI

Served by **SCR-002 — My bookings**, approved in design step 2. The same confirmation dialog is reused by **SCR-003 ST-10** (US-007/AC-07).

States exercised: **ST-07** cancel confirmation · **ST-08** cancelling · **ST-09** cancel failed · **ST-10** cancelled.

Design commitments this story must honour: the destructive action is the solid crimson danger fill added on 2026-09-08 — not the danger *border* token reused as a fill — with its `--bw-2` focus offset; no optimistic update (ST-08); the dialog stays open on failure rather than closing and leaving the outcome ambiguous.

## QA notes

- AC-02 needs a server-side test with a past booking's identifier, not just an assertion that the button is missing.
- AC-09 is a two-actor test and the one most likely to be missed: cancel as the Admin, then confirm as the employee. Assert exactly one cancellation email exists across both actors.
- AC-06 is a negative assertion, cheap and worth keeping — it stops a well-intentioned "confirm your password to cancel" appearing later.
- Data setup: bookings today, future, past-Confirmed, Cancelled and Completed for one employee; one booking cancelled by an Admin between load and confirm.

## API impacts

Needs a cancellation endpoint enforcing BR-001.6 server-side and returning "already cancelled" distinguishably from a generic failure, since the screen shows the two differently. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

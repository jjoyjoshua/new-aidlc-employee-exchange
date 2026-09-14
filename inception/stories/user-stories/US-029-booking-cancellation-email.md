# US-029 — Get a cancellation email when my booking is voided

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-029-booking-cancellation-email`) merging with every AC proven by a test named `... (US-029/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-004                                               |
| **Traces to**  | REQ-024, BR-001.13, BR-001.18, BR-001.20, V-13         |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate; was 3 pts at 8 ACs, raised 2026-09-14 when BR-001.20 added AC-05 and AC-06) |
| **Depends on** | US-011, US-034                                         |

## Story

As an employee whose booking was cancelled
I want an email telling me
So that I do not travel in expecting a desk I no longer have.

## Acceptance criteria

### AC-01 A cancellation sends an email to the booking owner

- **Given** a booking whose status becomes **Cancelled**
- **When** the change happens
- **Then** a cancellation email is sent to the booking owner at their account email address (REQ-024, BR-001.13)

### AC-02 It names the desk and the date

- **Given** the cancellation email
- **When** it is read
- **Then** it states the desk number and the booking date in the office timezone (V-13, NFR-001)

### AC-03 Every cancellation path sends it

- **Given** a cancellation by the employee themselves (US-011), by an administrator on their behalf (US-015), or by the cascade from deactivating their account (US-025)
- **When** any of the three occurs
- **Then** the cancellation email is sent, once per cancelled booking — the deactivation cascade sends one per booking, not one summary (REQ-024, REQ-030, BR-001.18)

### AC-04 A cancellation the owner did not perform names the office admin

- **Given** a cancellation performed by somebody other than the booking owner — an Admin cancelling on their behalf (REQ-014), or the cascade from deactivating the account (BR-001.18)
- **When** the email is composed
- **Then** it states that the office admin cancelled the booking — *"Your desk A-02 for Wed 9 Sep was cancelled by your office admin."* — naming the **role** and never the individual administrator (BR-001.20)

### AC-05 A self-cancellation names no actor

- **Given** a booking the owner cancelled themselves (REQ-010)
- **When** the email is composed
- **Then** it reports the cancellation with no actor named — BR-001.20 exists for cancellations the employee did not perform, and attributing their own action back to them would be noise

### AC-06 The deactivation cascade does not invite the recipient to rebook

- **Given** cancellations produced by deactivating a user account (BR-001.18, REQ-030)
- **When** each email is composed
- **Then** it carries the AC-04 wording **without** any invitation to book another desk, because REQ-005 has already stopped that person signing in — and it does not state that the account was closed (BR-001.20 variant)

### AC-07 It goes to the owner and to nobody else

- **Given** any cancellation, including one an administrator performed
- **When** the email is sent
- **Then** the only recipient is the booking owner — the administrator who cancelled it receives nothing (BRD-001 §10, decided 2026-09-07)

### AC-08 No opt-in is required, and no opt-out exists

- **Given** any employee, whatever their push setting
- **When** a booking of theirs is cancelled
- **Then** the email is sent (BR-001.13, BRD-001 §10)

### AC-09 One cancellation, one email

- **Given** a booking cancelled once
- **When** a second cancellation of the same booking is attempted and reported as already cancelled (US-011/AC-09, US-015/AC-09)
- **Then** exactly one cancellation email exists for that booking

### AC-10 The cancellation is not lost when the email fails

- **Given** a mail service that is unavailable
- **When** a cancellation is performed
- **Then** the booking is still **Cancelled** and the desk is free, and the failed send is logged for operational follow-up (NFR-005, RISK-006)

## Edge cases

- A booking cancelled by the deactivation cascade emails a person who can no longer sign in. That is intended: they need to know the desk is gone, and BR-001.18 requires the email for each. What that email must **not** do is invite them to book again — AC-06.
- No email is sent when a **Confirmed** booking simply passes its date and becomes **Completed** (REQ-028). Only a real cancellation sends one.
- The email does not say the desk was returned to the pool or who took it next. Nothing asks for that.
- No email exists for a desk **rename** that affects a booking (BR-001.19) — a fourth transactional email was explicitly rejected.

## QA notes

- AC-03 is three tests, one per path, and the cascade one asserts a count equal to the number of cancelled bookings.
- AC-09 is the two-actor race from both directions; it shares fixtures with US-011/AC-09 and US-015/AC-09.
- AC-04, AC-05 and AC-06 are one matrix, not three independent tests: assert on the composed body for each of the three cancellation paths. Self-cancel names no actor; admin-cancel names the role; cascade names the role **and** omits the rebooking line. Assert the absence of the individual administrator's name in every actor-naming case — that is the part a plausible-looking template will get wrong.
- Data setup: bookings cancelled by owner, by admin, and by cascade; a stubbed mail transport that can fail.

## API impacts

No endpoint of its own — triggered by the cancellation paths in US-011, US-015 and US-025. The message composer needs two things from the caller: **who cancelled** (owner or admin, for AC-04/AC-05) and **whether this came from the deactivation cascade** (for AC-06). The cascade is not inferable from the actor alone — an admin cancelling a single booking and an admin deactivating an account are both "cancelled by an admin", and they take different copy. No OpenAPI contract exists in this repository yet.

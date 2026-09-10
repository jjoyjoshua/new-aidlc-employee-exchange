# US-032 — Get a push alert when a booking is made or cancelled

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-032-push-alerts-on-book-and-cancel`) merging with every AC proven by a test named `... (US-032/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-004                                               |
| **Traces to**  | REQ-027, BR-001.15, BR-001.16, BR-001.20, V-14         |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-031                                                 |

## Story

As an employee who turned push on
I want an alert when a desk of mine is booked or cancelled
So that I find out immediately, and I find out **why** when it was not me who did it.

## Acceptance criteria

### AC-01 An opted-in employee gets a push on booking

- **Given** an employee opted in to push with a live browser subscription
- **When** a booking of theirs becomes **Confirmed**
- **Then** a push notification is sent to them naming the desk and the date (REQ-027)

### AC-02 And on cancellation

- **Given** the same employee
- **When** a booking of theirs becomes **Cancelled** by any path
- **Then** a push notification is sent to them naming the desk and the date (REQ-027)

### AC-03 A cancellation somebody else performed names the office admin

- **Given** an opted-in employee whose booking is cancelled by an administrator (US-015) or by the cascade from deactivating their account (US-025)
- **When** the push is composed
- **Then** it states that the office admin cancelled it — *"Your desk for Tue 9 Sep was cancelled by your office admin."* — rather than reporting the cancellation with no cause (BR-001.20, REQ-027)

### AC-04 A cancellation they performed themselves does not

- **Given** an opted-in employee who cancelled their own booking (US-011)
- **When** the push is composed
- **Then** it does not attribute the act to an administrator — the two wordings are distinct (BR-001.20)

### AC-05 Nothing is pushed to anyone who did not opt in

- **Given** an employee whose opt-in flag is off, whatever their browser permission state
- **When** any booking event of theirs occurs
- **Then** no push notification is sent (BR-001.15, V-14 — this is the check, not the setting screen)

### AC-06 Reminders are never pushed

- **Given** an opted-in employee with a booking tomorrow
- **When** the 08:00 reminder run executes (US-030)
- **Then** no push is sent for it (BR-001.16)

### AC-07 Push never replaces email

- **Given** an opted-in employee
- **When** a booking of theirs is created or cancelled
- **Then** the corresponding email is sent as well (US-028, US-029) — push is an addition, and email remains the reliable channel (BR-001.13, BR-001.15)

### AC-08 An undeliverable push does not break anything

- **Given** a subscription that is expired, revoked, or unreachable
- **When** a push is attempted
- **Then** the booking or cancellation is unaffected, the email still goes, and the failure is logged rather than surfaced to the employee (NFR-005, NFR-006, RISK-007)

### AC-09 One event, one push

- **Given** a single booking event
- **When** the notification is sent
- **Then** exactly one push is delivered per subscription for that event — a cascade cancelling three bookings sends three, one per booking (US-025/AC-09)

### AC-10 Push goes to the booking owner only

- **Given** any booking event
- **When** the push is sent
- **Then** the only recipient is the booking owner — no administrator receives one (BRD-001 §10)

## Edge cases

- BR-001.20 is a **push-only** rule by its own scope limit. The equivalent question for the cancellation **email** is BRD-001 open question #14, carried by US-029/AC-04. This story's AC-03 is decided; that one is not.
- An employee opted in on two browsers receives one push per subscription. That is delivery, not duplication.
- An employee deactivated by US-025 receives push alerts for the cascade's cancellations even though they can no longer sign in. Intended — the desk is genuinely gone.
- No push exists for a role change, a password reset, or a desk rename. Push covers book and cancel only (REQ-027).
- The push carries no action buttons and is not required to deep-link into the application. Nothing asks for either.

## UI

Push notifications are rendered by the browser, not by a screen in this product, so this story has no screen of its own. The employee-facing control that gates it is **SCR-004 — Settings** (US-031), and the wording decision in AC-03 was settled on 2026-09-07 through SCR-004 open question 1 and SCR-008 open question 4.

## QA notes

- **AC-03 and AC-04 are the point of this story and the easiest thing to get wrong**: one shared "your booking was cancelled" template passes AC-02 and breaks BR-001.20. Assert the two wordings differ, from three cancellation paths.
- AC-05 is the security-shaped one: assert no delivery with the flag off even when a valid subscription exists. A check that consults only the browser subscription breaches BR-001.15.
- AC-06 is a negative assertion covering BR-001.16 from this side; US-030/AC-09 covers it from the other.
- AC-08 needs an expired or rejected subscription — the common real-world case after a few weeks.
- Data setup: employees opted in and not; a subscription that can be made to fail; bookings cancelled by owner, by admin, and by cascade.

## API impacts

No endpoint of its own — triggered by the same booking and cancellation events as US-028 and US-029, gated on the account flag from US-031, and needing the actor of a cancellation so AC-03 can select its wording. Delivery mechanism is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

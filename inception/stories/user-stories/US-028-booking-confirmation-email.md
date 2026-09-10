# US-028 — Get a confirmation email when my booking is made

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-028-booking-confirmation-email`) merging with every AC proven by a test named `... (US-028/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-004                                               |
| **Traces to**  | REQ-023, BR-001.13, V-13                               |
| **Priority**   | Must                                                   |
| **Estimate**   | 3 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-007, US-034                                         |

## Story

As an employee who just booked a desk
I want an email confirming it
So that I have the desk number and date somewhere I will find them on the morning.

## Acceptance criteria

### AC-01 A Confirmed booking sends a confirmation email

- **Given** a booking created with status **Confirmed**
- **When** it is created
- **Then** a confirmation email is sent to the booking owner at their account email address (REQ-023)

### AC-02 It names the desk and the date

- **Given** the confirmation email
- **When** it is read
- **Then** it states the desk number and the booking date in the office timezone (V-13, NFR-001)

### AC-03 It goes to the owner and to nobody else

- **Given** a booking made by an employee
- **When** the email is sent
- **Then** the only recipient is that employee — no administrator receives a copy (BRD-001 §10, decided 2026-09-07)

### AC-04 No opt-in is required, and no opt-out exists

- **Given** any employee, whatever their push setting
- **When** they book a desk
- **Then** the confirmation email is sent — booking emails are mandatory and there is no way to switch them off (BR-001.13, BRD-001 §10)

### AC-05 One booking, one email

- **Given** a single booking
- **When** it is created
- **Then** exactly one confirmation email is sent, including when the request was retried after an ambiguous failure that had in fact succeeded (US-007/AC-10)

### AC-06 The address used is the account's current one

- **Given** an employee whose email was changed by an administrator (US-023)
- **When** they next book
- **Then** the confirmation goes to the new address (BR-001.10)

### AC-07 The booking is not lost when the email fails

- **Given** a mail service that is unavailable
- **When** a booking is created
- **Then** the booking is still **Confirmed** and visible in the employee's list, and the failed send is logged for operational follow-up (NFR-005, RISK-006)

### AC-08 The sender address comes from configuration

- **Given** the confirmation email
- **When** it is sent
- **Then** its sender address and mail service come from configuration, never from a value compiled into the application (NFR-007 — built by US-034)

## Edge cases

- A booking created and cancelled within seconds produces both a confirmation (this story) and a cancellation (US-029). Both are sent; neither is suppressed.
- No push notification is this story's concern — US-032 owns it, and it only fires for employees who opted in.
- The email is not required to contain a link into the application. Nothing in BRD-001 asks for one, and none is invented.
- The employee-facing confirmation on screen already names the address the email went to (US-007/AC-04). If the two disagree, the screen is wrong.

## QA notes

- AC-05 is the one that produces real complaints when wrong: assert one email per booking, particularly across the retry path.
- AC-07 is the NFR-005 behaviour and needs a mail service that can be made to fail. Assert the booking survives **and** the failure is logged — the log is the entire operational remedy for RISK-006.
- AC-02's date must be office-local, so a test with a non-office timezone runner is worth having here as well as on the screens.
- Data setup: an employee with a known address; a mail transport that can be stubbed and made to fail; a changed-email account for AC-06.

## API impacts

No endpoint of its own — this is triggered by the booking creation in US-007. It needs the mail transport and the configuration US-034 provides. No OpenAPI contract exists in this repository yet.

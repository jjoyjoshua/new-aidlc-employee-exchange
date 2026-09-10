# US-030 — Get a reminder email the day before

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-030-day-before-reminder-email`) merging with every AC proven by a test named `... (US-030/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-004                                               |
| **Traces to**  | REQ-025, BR-001.14, BR-001.16, V-13, NFR-001           |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-007, US-034                                         |

## Story

As an employee with a desk booked for tomorrow
I want a reminder the morning before
So that I either turn up or free the desk in time for somebody else.

## Acceptance criteria

### AC-01 A reminder is sent at 08:00 office time the previous calendar day

- **Given** a **Confirmed** booking for a future working day
- **When** 08:00 office local time arrives on the calendar day immediately before the booking date
- **Then** one reminder email is sent to the booking owner (REQ-025, BR-001.14, NFR-001)

### AC-02 It names the desk and the date

- **Given** the reminder email
- **When** it is read
- **Then** it states the desk number and the booking date in the office timezone (V-13)

### AC-03 08:00 is the office's, not the server's

- **Given** a server running in a different timezone from the office
- **When** the reminder is scheduled
- **Then** it is sent at 08:00 office local time — a send at 08:00 UTC while the office is not on UTC is a failure (BR-001.14)

### AC-04 No reminder for a same-day booking

- **Given** a booking made for today
- **When** the reminder run executes
- **Then** no reminder is sent for it — there is no previous day left to send it on (BR-001.14)

### AC-05 No reminder for a cancelled or completed booking

- **Given** a booking that is **Cancelled**, or already **Completed**
- **When** the reminder run executes
- **Then** no reminder is sent for it (BR-001.14)

### AC-06 A booking cancelled before the run gets no reminder

- **Given** a **Confirmed** booking for tomorrow that is cancelled at 07:00 office time today
- **When** the 08:00 run executes
- **Then** no reminder is sent — the run reads the status at send time, not at booking time

### AC-07 Exactly one reminder per booking

- **Given** a booking eligible for a reminder
- **When** the reminder run executes, including if it runs more than once or is retried
- **Then** exactly one reminder email exists for that booking

### AC-08 A booking made after the run still gets no second run

- **Given** a booking for tomorrow created at 10:00 office time today, after that day's 08:00 run
- **When** the day proceeds
- **Then** no reminder is sent for it — BR-001.14 defines one send at one time, not a catch-up (this is the honest reading; if the PO wants a catch-up, it is a rule change)

### AC-09 Reminders are email only

- **Given** an employee who has opted in to browser push
- **When** a reminder is due
- **Then** no push notification is sent for it — push is for book and cancel only (BR-001.16, REQ-027)

### AC-10 Failures are logged and do not stop the run

- **Given** a batch of reminders where one send fails
- **When** the run executes
- **Then** the remaining reminders are still sent and the failed one is logged for operational follow-up (NFR-005, RISK-006)

## Edge cases

- A booking for **Monday** gets its reminder on **Sunday** at 08:00 office time. BR-001.14 says "the previous calendar day", not the previous working day, and the reminder's purpose is to leave a full day to cancel. Stated here because "day before" and "working day before" differ for every Monday booking — the rule as written means Sunday. **If the PO intended Friday, this is a BRD amendment, not a code choice**; the walkthrough asks.
- Public holidays are not excluded (BRD-001 §8), so a booking on a company holiday still gets its reminder.
- The reminder does not repeat, and there is no reminder on the day itself.
- A booking whose desk was renamed since (US-018): the reminder carries the current desk number, and the holder was never told about the rename (BR-001.19, RISK-012). The reminder is where they discover it.

## QA notes

- **AC-01, AC-03 and the Monday case in Edge cases are the substance of this story, and all three are clock-and-timezone tests.** Make the office timezone and the run time configuration, and inject the clock — a test that waits for 08:00 is not a test.
- AC-07 needs the run executed twice against the same data. A scheduled job that is not idempotent will double-email the whole office on any retry, which is the most visible possible failure in this release.
- AC-06 and AC-05 are the same assertion at different times; both are cheap.
- AC-09 is a negative assertion and the whole of BR-001.16.
- Data setup: bookings for tomorrow, today, next Monday, one cancelled overnight, one completed; office timezone deliberately different from the runner's.

## API impacts

Needs a scheduled run rather than a request-triggered send — the only story in the release that does. Scheduling mechanism, idempotency and the run's own configuration are `/architect`'s to settle; the 08:00 office-local time and the timezone are configuration, not literals. No OpenAPI contract exists in this repository yet.

# US-010 — View my own bookings, past and upcoming

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-010-view-my-bookings`) merging with every AC proven by a test named `... (US-010/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-009, REQ-028, BR-001.5, NFR-001                    |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As an employee
I want to see the desks I have booked, upcoming and recent
So that I know where I am sitting and what I still hold.

## Acceptance criteria

### AC-01 Upcoming bookings come first

- **Given** an employee with at least one **Confirmed** booking dated later than today
- **When** **My bookings** loads
- **Then** upcoming bookings are shown first, each with its desk number, date and status (SCR-002 ST-01)

### AC-02 Today's booking is distinguished

- **Given** a **Confirmed** booking dated today in the office timezone
- **When** the list is rendered
- **Then** that booking is marked as today's, distinguished by more than colour (NFR-008, SCR-002 ST-05)

### AC-03 Past bookings go back 30 days, with a control for older

- **Given** an employee with bookings older than 30 days
- **When** the list loads
- **Then** past bookings from the last 30 days are shown, and an explicit control loads older ones — nothing is hidden, only paged (REQ-009, amended 2026-09-10)

### AC-04 A passed Confirmed booking reads as Completed

- **Given** a booking with status **Confirmed** whose date has passed in the office timezone
- **When** it is rendered
- **Then** it is presented as **Completed**, never as **Confirmed** (REQ-028, BR-001.5)

### AC-05 Every status carries an icon or a word

- **Given** bookings with statuses **Confirmed**, **Cancelled** and **Completed**
- **When** they are rendered
- **Then** each status is distinguishable without relying on colour (NFR-008)

### AC-06 A first-time employee is told what to do

- **Given** an employee with no bookings at all
- **When** the list loads
- **Then** an empty state explains there is nothing yet and offers the route to **Book a desk** (SCR-002 ST-03)

### AC-07 Nothing upcoming is not the same as never booked

- **Given** an employee with past bookings but no **Confirmed** booking dated today or later
- **When** the list loads
- **Then** a distinct state is shown — the Friday-afternoon state, common rather than exceptional — offering the route to book, with the past bookings still readable (SCR-002 ST-04)

### AC-08 Loading does not shift the layout

- **Given** the bookings request is in flight
- **When** the screen renders
- **Then** skeleton rows at real row height stand in, and one "loading" announcement is made rather than a stream (SCR-002 ST-02)

### AC-09 A failed load offers a retry

- **Given** the bookings request fails or times out
- **When** the error is shown
- **Then** an inline alert replaces the list with **Try again**, and the rest of the shell stays usable (SCR-002 ST-06)

### AC-10 Dates are the office's

- **Given** an employee whose device is in another timezone
- **When** dates and the today boundary are rendered
- **Then** they are office-local, and the office timezone is stated once in the page header (NFR-001)

## Edge cases

- An employee holding both a **Cancelled** and a later **Confirmed** booking for the same date — possible under BR-001.1, which counts **Confirmed** only. Both appear; the list is not deduplicated by date.
- The load-older control pressed repeatedly back to the employee's first booking: the control disappears when there is nothing older.
- REQ-009 sets no page size for the 30-day window. The admin list's 50 (REQ-011) is not automatically this list's number; if the PO wants one stated, it is a one-line BRD amendment. Raised in the walkthrough, not invented here.
- A booking whose desk was renamed since (US-018, BR-001.19): the current desk number is shown, and the holder is not notified. That is the accepted consequence of BR-001.19 (RISK-012).

## UI

Served by **SCR-002 — My bookings**, approved in design step 2. This story builds the list and its states; US-011 builds cancellation on the same screen and US-012 the refresh-on-focus behaviour.

States exercised: **ST-01** default — upcoming bookings · **ST-02** loading · **ST-03** empty — never booked · **ST-04** nothing upcoming · **ST-05** today's booking present · **ST-06** load error.

Design commitments this story must honour: ST-03 and ST-04 stay two states with different words; booking-state tokens from the 2026-09-07 hi-fi pass carry status; skeletons at real row height.

## QA notes

- AC-04 is the derived-status one. Whether **Completed** is stored or computed at read time is `/architect`'s call (BR-001.5's own note says so) — but the test asserts the presentation either way, and it needs an injectable clock so a booking can pass its date inside a test run.
- AC-03's boundary: a booking exactly 30 days old, and one 31 days old.
- AC-06 versus AC-07 is the pair most likely to collapse into one empty state. Assert the two messages differ.
- Data setup: an employee with upcoming, today's, past-within-30-days, and older-than-30-days bookings; one with none at all; one with past only.

## API impacts

Needs the employee's own bookings, paged by the 30-day floor with an explicit "older" page, and a status that already accounts for REQ-028. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

# US-013 — See every booking in the office

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-013-see-every-booking`) merging with every AC proven by a test named `... (US-013/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-011, REQ-028, BR-001.5, NFR-001, V-07              |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As an office administrator
I want to see the bookings across everybody
So that I can answer who is in, on which desk, on any day.

## Acceptance criteria

### AC-01 The administrator lands here

- **Given** an Admin signing in (US-001/AC-02)
- **When** they arrive
- **Then** **All bookings** is the screen they land on — the admin landing screen, not a dashboard of counts (SCR-005 structural decisions)

### AC-02 The default view is today onward, all statuses

- **Given** no filter has been chosen
- **When** the screen loads
- **Then** bookings from today onward are shown at every status, so a cancellation made minutes ago is visible rather than filtered away (SCR-005 ST-01)

### AC-03 Each row carries date, desk, employee and status

- **Given** a booking row
- **When** it is rendered
- **Then** it shows the booking date, the desk number, the employee who holds it, and the status as an icon plus a word (REQ-011, NFR-008)

### AC-04 The list is paged at 50 with an explicit control

- **Given** more than 50 bookings match the current view
- **When** the screen loads
- **Then** 50 are returned and a **Show more** control loads the next page — an explicit control, never infinite scroll, so the end of the list stays findable (REQ-011, amended 2026-09-10)

### AC-05 There is no date floor

- **Given** bookings from more than a year ago
- **When** the date filter reaches back to them (US-014)
- **Then** they are returned — every booking ever made stays reachable, with no archive cut-off (REQ-011, resolved 2026-09-07)

### AC-06 A passed Confirmed booking reads as Completed

- **Given** a **Confirmed** booking whose date has passed in the office timezone
- **When** it is rendered
- **Then** it is presented as **Completed** (REQ-028, BR-001.5)

### AC-07 The count line restates the view in words

- **Given** any view, filtered or not
- **When** it is rendered
- **Then** a count line states the query in prose, so an empty result is self-explaining rather than looking like a broken screen (SCR-005 structural decisions)

### AC-08 An empty system says so distinctly

- **Given** the system holds no bookings whatsoever
- **When** the screen loads
- **Then** an empty state says exactly that, distinct from the "nothing matches your filter" state US-014 owns (SCR-005 ST-03)

### AC-09 Loading and failure behave like the rest of the product

- **Given** the request is in flight, or has failed
- **When** the screen renders
- **Then** skeleton rows at real row height stand in while loading (ST-02), and a failure shows an inline alert with **Try again** in place of the table while the shell stays usable (ST-05)

### AC-10 Only administrators can see it

- **Given** a signed-in Employee
- **When** they request this screen or its data directly
- **Then** it is refused and no other employee's booking data is returned (V-07, and the server half of US-001/AC-03)

### AC-11 A table on desktop, cards below 1024px

- **Given** viewport widths of 1280px, 768px and 360px
- **When** the list is rendered
- **Then** 1280px shows a comparable table; below 1024px the same fields stack in the same order — date, desk, employee — with an 80px minimum row height and the employee name given weight at 360px (NFR-004, SCR-005 structural decisions, 2026-09-10)

## Edge cases

- A row that is not cancellable states its reason in words in the card layouts, and keeps the em dash only in the desktop table where a column gives the dash meaning (decided 2026-09-10). US-015 owns the reason itself.
- Thousands of rows after a year in service: AC-04's paging is the whole answer. An archive or retention rule was rejected for this release — it is a data-policy decision with no screen (resolved 2026-09-07).
- No bulk actions and no checkbox column: rejected deliberately (SCR-005 structural decisions). Bulk cancellation of other people's reservations needs its own requirement first.
- Admins do not appear as booking holders — Admin accounts cannot book at all (BRD-001 §10, decided 2026-09-07).

## UI

Served by **SCR-005 — All bookings**, approved in design step 2, including its admin shell and filter densities from the 2026-09-07 hi-fi pass. This story builds the list; US-014 builds the filters and US-015 the cancellation, on the same screen.

States exercised: **ST-01** default — today onward · **ST-02** loading · **ST-03** empty — no bookings at all · **ST-05** load error.

Design commitments this story must honour: the default filter is from today at all statuses; a real table at 1280px because the administrator compares rows; the bottom-bar indicator fix from 2026-09-07; **Show more** rather than infinite scroll.

## QA notes

- AC-10 must be a server-side test with an Employee session against the admin data route. This is the only screen holding everybody's whereabouts.
- AC-04's boundary: exactly 50 matching rows should show no **Show more**; 51 should show it.
- AC-05 needs a booking seeded well over a year back — easy to miss because no fixture naturally produces one.
- AC-11 is verified again in the sweep of US-033, but the 1024px table-to-card switch belongs here: 1023px and 1024px are the assertion.
- Data setup: 60+ bookings spanning past, today and future across several employees and desks, at all three statuses; an empty system for AC-08.

## API impacts

Needs an all-bookings read that is Admin-only server-side, paged at 50 with a cursor or offset, with no date floor, returning the employee identity per row. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

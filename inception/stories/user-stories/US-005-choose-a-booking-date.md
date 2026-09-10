# US-005 — Choose a booking date inside the window

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-005-choose-a-booking-date`) merging with every AC proven by a test named `... (US-005/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-006, NFR-001, BR-001.3, V-02, V-03                 |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As an employee
I want to pick the day I am coming in, from today up to a month ahead
So that I can plan around the days I already know about.

## Acceptance criteria

### AC-01 A usable date is already chosen on arrival

- **Given** an employee opening **Book a desk** with no date specified
- **When** the screen loads
- **Then** the next bookable working day is preselected — today if today is a working day inside the window, otherwise the next Monday–Friday — and that date's availability is already loading or loaded (SCR-003 ST-01)

### AC-02 The window is today through 30 days ahead

- **Given** the date controls
- **When** they are rendered
- **Then** every date from today to today + 30 calendar days inclusive is offered, and no date before today or after today + 30 days can be selected (REQ-006, V-02)

### AC-03 Weekends cannot be booked

- **Given** a Saturday or Sunday inside the 30-day window
- **When** it appears in the date strip or calendar
- **Then** it is present but not selectable, and it carries **Closed** as text rather than only appearing dimmed (BR-001.3, V-03, SCR-003 ST-03)

### AC-04 A refused date says why

- **Given** a date the rules forbid
- **When** it appears in the date strip
- **Then** the reason is readable as text — **Closed** for a weekend, **Too far ahead** beyond the window, **Past** before today — and never conveyed by appearance alone (NFR-008, SCR-003 ST-03)

### AC-05 The calendar stops at the window's edges

- **Given** the full calendar behind **Pick another date**
- **When** the user navigates months
- **Then** navigation stops at the month containing today and the month containing today + 30 days; it does not scroll into months where every day would be refused (SCR-003 ST-03)

### AC-06 A refused day in the calendar is struck through, with the rules stated once

- **Given** the calendar
- **When** a day is refused
- **Then** that cell is struck through — a non-colour, non-textual cue — and the two rules are stated once in the calendar's footer ("Weekends are closed", and the last bookable date), because a 40px cell cannot carry its own reason (decided 2026-09-08, SCR-003 structural decisions)

### AC-07 "Today" means today in the office

- **Given** an employee whose device is in a different timezone from the office
- **When** the date controls are rendered and the window's boundaries are calculated
- **Then** today, the 30-day edge, and every date label are the office's, not the device's, and the office timezone is stated once in the page header (NFR-001)

### AC-08 Changing the date supersedes an earlier change

- **Given** availability is loading for a date the user just chose
- **When** they choose a different date before the first response arrives
- **Then** the date controls stay fully interactive throughout, and the later response is the one shown — the earlier response never paints over it (SCR-003 ST-02)

## Edge cases

- Today is a Saturday: AC-01 preselects Monday. Today is a Sunday: Monday. The window's *end* is still today + 30 calendar days, not 30 working days.
- Today + 30 days lands on a weekend: that date is offered and refused as **Closed**, not hidden — the window is calendar days (REQ-006) and the weekend rule is separate (BR-001.3).
- Midnight in the office while the screen is open: not specified in BRD-001. The screen is not required to re-derive "today" without a reload. Raised as an open question in this PR's walkthrough.
- Public holidays are **not** excluded (BRD-001 §8, RISK-002 accepted 2026-09-07). A desk booked on a company holiday simply goes unused. Do not add a holiday rule.
- The strip shows **three** days at 360px and seven above it — measured, not chosen (SCR-003 structural decisions, 2026-09-08). Paging arrows keep the same interaction at every width.

## UI

Served by **SCR-003 — Book a desk**, approved in design step 2. This story builds the date controls of that screen; US-006 and US-007 build the availability list and the booking action on the same screen.

States exercised: **ST-01** default · **ST-02** loading availability · **ST-03** non-bookable date shown as unavailable.

Design commitments this story must honour: two date controls (a 7-day strip plus a calendar behind a control); the strip is a single tab stop with left/right arrows moving between days, so a 30-chip strip never becomes 30 tab stops; arrow navigation skips refused days but a screen reader still reads them with their reason; changing the date returns focus to the date control, not to the top of the refreshed list.

## QA notes

- AC-02's boundaries are the classic off-by-one: assert today itself, today + 30, and today + 31.
- AC-07 needs the office timezone set to something other than the test runner's. Run at least one case where the device date and the office date differ — an employee on a late evening call, or a genuinely remote worker.
- AC-08 is a race: assert the response ordering, not just the final rendering, or a flaky pass will hide a real overwrite.
- Data setup: office timezone configurable; a fixed injectable "now" so a test run on a Friday and one on a Monday assert the same thing.

## API impacts

Needs the office timezone as configuration and availability keyed by an office-local date. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

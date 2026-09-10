# US-009 — Be offered the next free days when everything is taken

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-009-next-free-days-when-fully-booked`) merging with every AC proven by a test named `... (US-009/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-035                                                |
| **Priority**   | Could                                                  |
| **Estimate**   | 3 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-006                                                 |

## Story

As an employee who found the office full on the day I wanted
I want to be shown the next days that still have a desk
So that a full day hands me a next step instead of a dead end.

## Acceptance criteria

### AC-01 A full day says so with the count

- **Given** every **Active** desk is **Taken** for the selected date
- **When** availability loads
- **Then** the count line reads **0 of 40 desks free** and an empty-state block replaces the zone list, naming the date — *"Every desk is taken on Wed 9 Sep."* (SCR-003 ST-04)

### AC-02 The next two working days with a free desk are offered

- **Given** a fully booked selected date
- **When** the empty state is rendered
- **Then** it offers the next two working days, inside the booking window, that have at least one desk free, as direct selections (REQ-035)

### AC-03 Choosing one goes straight there

- **Given** a suggested day
- **When** it is chosen
- **Then** the selected date becomes that day and its availability loads — no calendar step in between

### AC-04 The confirm action is hidden, not disabled

- **Given** the fully-booked state
- **When** it is rendered
- **Then** the confirm action is absent rather than present-and-greyed: there is nothing to enable it with (SCR-003 ST-04)

### AC-05 Fewer than two candidate days degrades cleanly

- **Given** fewer than two working days inside the remaining window have a free desk
- **When** the empty state is rendered
- **Then** it offers however many exist — one, or none — and the message still reads correctly with no empty slot or placeholder

### AC-06 Suggestions never break the date rules

- **Given** the suggestions
- **When** they are computed
- **Then** they are Monday–Friday only, no later than today + 30 days, never earlier than the selected date, and never a date on which the employee already holds a **Confirmed** booking (BR-001.3, V-02, BR-001.1)

### AC-07 This state is distinct from having no desks at all

- **Given** an office with no **Active** desks
- **When** availability loads
- **Then** the *no desks exist* state is shown instead (US-006/AC-09), with different words and no suggested days — every date would be equally empty (SCR-003 ST-05)

## Edge cases

- **The stated fallback, which is part of this requirement rather than a get-out:** if the multi-day availability lookahead proves expensive, REQ-035 degrades to *"Try another day"* with no suggestions and **no other state changes** (SCR-003 conflict 3, resolved 2026-09-07; the feasibility call is `/architect`'s). Shipping the fallback satisfies the requirement; shipping neither does not.
- A day that is free when suggested and full when chosen: the employee lands in this same state for the new date. Acceptable, and self-correcting.
- Suggestions do not look past the 30-day window even when nothing inside it is free — AC-05 then shows none.
- **Second to drop if the release tightens**, after US-008. Both are Could.

## UI

Served by **SCR-003 — Book a desk**, approved in design step 2.

States exercised: **ST-04** fully booked — one of the three contexts the shared `empty-state` component serves on this screen.

Design commitment this story must honour: ST-04 and ST-05 stay two distinct states with different words, because the cause and the recovery differ. Offering alternative dates on ST-05 was explicitly rejected as cruel — every date is equally empty.

## QA notes

- AC-06 is where a lookahead quietly goes wrong: assert it skips weekends, stops at the window edge, and skips a date the employee has already booked.
- AC-05 needs a window with genuinely fewer than two free days — easiest with a small desk inventory fully booked across a stretch.
- If the fallback in Edge cases is taken, the tests for AC-02, AC-03, AC-05 and AC-06 are replaced by one asserting the *"Try another day"* message and that no other state changed. Record that decision in the story PR.
- Data setup: an inventory fully booked on a target date, with controlled free/full days after it.

## API impacts

Needs an availability lookahead across several dates in one request, rather than one request per candidate day. This is the cost SCR-003 conflict 3 flagged for `/architect`; the fallback exists precisely because it may be refused. No OpenAPI contract exists in this repository yet.

# US-014 — Filter all bookings by date, status and desk

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-014-filter-all-bookings`) merging with every AC proven by a test named `... (US-014/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-012, REQ-013, REQ-031                              |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-013                                                 |

## Story

As an office administrator
I want to narrow the booking list by day, by status, and by desk
So that I can answer a specific question instead of scanning every row.

## Acceptance criteria

### AC-01 Filter by date

- **Given** bookings across many dates
- **When** a date or date range is set
- **Then** only bookings on those office-local dates are returned (REQ-012, NFR-001)

### AC-02 Filter by status

- **Given** bookings at every status
- **When** **Confirmed**, **Cancelled** or **Completed** is selected
- **Then** only bookings presented at that status are returned, and **Completed** includes passed **Confirmed** bookings (REQ-013, REQ-028, BR-001.5)

### AC-03 Filter by desk

- **Given** bookings across many desks
- **When** a desk is selected
- **Then** only that desk's bookings are returned (REQ-031)

### AC-04 The three filters combine

- **Given** the date, status and desk filters
- **When** any two or all three are set at once
- **Then** the results satisfy every active filter together (REQ-031 — "alone or combined with the date and status filters")

### AC-05 Clearing returns to the default view

- **Given** any active filter
- **When** **Clear** is used
- **Then** the view returns to today onward at all statuses (US-013/AC-02) and the count line says so

### AC-06 An unmatched filter is not an empty system

- **Given** bookings exist but none match the active filter
- **When** the results render
- **Then** the empty state names the filter that produced nothing and offers to clear it — distinct in wording from the no-bookings-at-all state (SCR-005 ST-04 versus ST-03)

### AC-07 A filtered view states its own query

- **Given** an active filter with matches
- **When** the results render
- **Then** the count line restates the filter in words, so an administrator returning to the screen can tell a narrow result from a broken one (SCR-005 ST-06)

### AC-08 Arriving pre-filtered from a blocked desk deactivation works

- **Given** a deactivation blocked because a desk holds upcoming bookings (US-019/AC-04)
- **When** the administrator follows the route out of that refusal
- **Then** they arrive here pre-filtered to that desk, from today, status **Confirmed** — the exact rows they must clear (SCR-006 structural decisions; this is why the desk filter exists at all)

### AC-09 A filter change re-queries without losing the controls

- **Given** a filter change
- **When** results are being fetched
- **Then** the filter controls stay interactive, skeleton rows stand in for the table, and a later change supersedes an earlier one (SCR-005 ST-02)

### AC-10 The filters fit at every width

- **Given** viewport widths of 1280px, 768px and 360px
- **When** the filter area is rendered
- **Then** 1280px shows one row of controls; 768px splits them into two rows so no date value wraps inside its own control; 360px collapses them behind a **Filters** control that opens a panel, so the screen still arrives showing bookings rather than a filter form (NFR-004, SCR-005 ST-12, decided 2026-09-10)

## Edge cases

- Paging interacts with filtering: **Show more** (US-013/AC-04) pages within the active filter, and changing a filter resets to the first page.
- A desk that is **Inactive** still appears in the desk filter — its historic bookings must stay findable, and BR-001.9's route needs it.
- A date range whose end precedes its start: refused in the control rather than sent.
- The desk filter is deliberately included even though REQ-012 and REQ-013 named only date and status — that gap is exactly what REQ-031 was created on 2026-09-10 to close.

## UI

Served by **SCR-005 — All bookings**, approved in design step 2, with the filter densities settled in the 2026-09-07 hi-fi pass and the 768px/360px behaviour on 2026-09-10.

States exercised: **ST-02** loading · **ST-04** empty — nothing matches the filter · **ST-06** filtered · **ST-12** filters open — 360px only.

Design commitment this story must honour: ST-12 exists only at 360px. The panel stays open at 768px and 1280px, where it costs no content.

## QA notes

- AC-04 is the combination case and the one a single-filter implementation quietly fails. Test date+status, date+desk, status+desk, and all three.
- AC-02's **Completed** filter must match the derived status, not a stored one — a passed **Confirmed** booking must appear under **Completed** and must not appear under **Confirmed**.
- AC-08 is a cross-screen journey; test it end to end from the blocked dialog, because the pre-filled filter is what makes BR-001.9's hard block workable.
- AC-10's three widths: assert one row, two rows, and the collapsed control respectively.
- Data setup: bookings spread across dates, desks and all three statuses, including one inactive desk with history.

## API impacts

Needs the all-bookings read to accept date, status and desk filters combinable in one query, with the status filter operating on the presented status. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

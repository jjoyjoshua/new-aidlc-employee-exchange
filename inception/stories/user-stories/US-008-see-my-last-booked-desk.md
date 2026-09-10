# US-008 — See which desk I booked last

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-008-see-my-last-booked-desk`) merging with every AC proven by a test named `... (US-008/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-034                                                |
| **Priority**   | Could                                                  |
| **Estimate**   | 2 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-006                                                 |

## Story

As an employee who tends to sit in the same place
I want the desk I booked last time pointed out among the free ones
So that I can find my usual seat without remembering its number.

## Acceptance criteria

### AC-01 The most recently booked desk is labelled

- **Given** an employee with at least one previous booking, and that desk is **Available** on the selected date
- **When** availability is rendered
- **Then** that desk's row carries a label marking it as the one they booked most recently (REQ-034)

### AC-02 It is not preselected

- **Given** the labelled desk
- **When** the screen loads
- **Then** no desk is selected and the confirm action is disabled reading *"Select a desk"* — the label is a hint, never a pre-commitment (REQ-034, decided 2026-09-07)

### AC-03 It is derived from their own history, not a stored preference

- **Given** an employee's booking history
- **When** the label is determined
- **Then** it comes from their most recent booking by date, with no favourite-desk setting anywhere in the interface for the employee or the Admin to maintain

### AC-04 No history means no label

- **Given** an employee who has never booked
- **When** availability is rendered
- **Then** no row carries the label and nothing states its absence

### AC-05 A taken or absent usual desk is not labelled

- **Given** the most recently booked desk is **Taken** on the selected date, or is now **Inactive**, or has been renamed
- **When** availability is rendered
- **Then** no label appears on any row — the hint is only useful on a row that can be chosen, and a label on a taken desk would read as a tease

### AC-06 The label is text, not a colour

- **Given** the labelled row
- **When** it is rendered
- **Then** the label is readable text and is announced by a screen reader alongside the desk number and its availability (NFR-008)

## Edge cases

- Two bookings on the same most recent date is impossible — BR-001.1 allows one per day — so "most recent" is unambiguous.
- A **Cancelled** booking counts as history: it still records where the employee chose to sit. If the PO prefers **Confirmed** and **Completed** only, that is a one-line change and the walkthrough asks.
- The desk was renamed since (US-018, BR-001.19): the booking points at the desk, not the string, so the label follows the rename. If the desk no longer exists at all, AC-05 applies.
- **This is the first story to drop if the release tightens.** REQ-034 is a Could, and the priority is the PO's. Nothing else depends on it.

## UI

Served by **SCR-003 — Book a desk**, approved in design step 2. The label was accepted on 2026-09-07 as "the cheapest possible expression" of habitual desk use — a label, not a feature.

States exercised: **ST-01** default · **ST-07** desk selected (the label survives selection moving elsewhere). No new state; this story adds a label to an existing row component.

## QA notes

- AC-02 is the whole point of the decision and trivially easy to "improve" into auto-selection. Assert that nothing is selected on load.
- AC-05 has three causes (taken, inactive, deleted) and one expected outcome. Cover at least taken and inactive.
- Data setup: an employee with history whose desk is free; the same with it taken; the same with it deactivated; an employee with no history.

## API impacts

Needs the employee's most recent booking to be readable alongside availability. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

# US-018 — Correct a desk number

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-018-correct-a-desk-number`) merging with every AC proven by a test named `... (US-018/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-016, BR-001.4, BR-001.8, BR-001.19, V-08, V-16     |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-016, US-017                                         |

## Story

As an office administrator
I want to change a desk's number
So that a typo does not stay on the floor plan until every booking on it has passed.

## Acceptance criteria

### AC-01 A desk number can be changed

- **Given** an existing desk
- **When** a valid, unused number is saved
- **Then** the desk keeps its identity and its booking history under the new number, and the inventory reorders accordingly (REQ-016, SCR-007 ST-02, ST-06)

### AC-02 The same format and uniqueness rules apply as on create

- **Given** the edit form
- **When** the new number fails the `^[A-Z]-\d{2}$` pattern, or collides case-normalised and whitespace-trimmed with another desk
- **Then** it is refused for that reason and the desk is unchanged (BR-001.4, BR-001.8, V-08, V-16, SCR-007 ST-03, ST-04)

### AC-03 A booked desk can still be renamed

- **Given** a desk holding one or more **Confirmed** bookings dated today or later
- **When** the number is changed
- **Then** the change is permitted — not blocked (REQ-016, BR-001.19)

### AC-04 The administrator is warned first, with the number of people affected

- **Given** a desk holding upcoming bookings
- **When** the edit form is opened for it
- **Then** it states how many people hold that desk **and** that they will not be told, before the change can be saved (BR-001.19, SCR-007 ST-02)

### AC-05 Nobody is notified

- **Given** a rename of a desk holding upcoming bookings
- **When** the change is saved
- **Then** no email or push notification is sent to any holder — there is no transactional message for inventory changes, and a fourth one was rejected (BR-001.19, BRD-001 §10)

### AC-06 The bookings follow the desk

- **Given** bookings on the renamed desk
- **When** the rename completes
- **Then** those bookings show the new number wherever they appear — the employee's own list (US-010), the administrator's list (US-013), and the desk filter (US-014) — because a booking references the desk, not the string

### AC-07 Renaming to its own current number is not an error

- **Given** the edit form
- **When** the unchanged number is saved
- **Then** it is not refused as a duplicate against itself, and either saves as a no-op or reports nothing to fix

### AC-08 Save guarding and failure match the add path

- **Given** a save in flight, or a save that fails on a server error
- **When** either occurs
- **Then** the action is guarded against a double submit (ST-05), and a failure retains the entry, changes nothing, and offers a retry (ST-07)

### AC-09 Only administrators can edit desks

- **Given** a signed-in Employee
- **When** they attempt to change a desk number
- **Then** it is refused (V-07)

## Edge cases

- **The accepted cost, restated so it is not re-litigated in code review:** a holder arrives at a desk number that no longer exists, with no notification (RISK-012, accepted 2026-09-07). The warning in AC-04 is the most the system can honestly do. Revisit if renames of booked desks prove common in service.
- Swapping two desks' numbers (`A-01` ↔ `A-02`) needs a free intermediate number, because each save is validated against the live inventory. Not a supported operation; not invented here.
- Renaming across zone letters (`A-01` → `B-05`) moves the desk between zone groups on the employee booking screen (US-006/AC-05). Permitted; nothing prohibits it.
- Only the desk **number** is editable. BRD-001 gives a desk no other attributes.

## UI

Served by **SCR-007 — Desk form** (opened from **SCR-006 — Desks**), both approved in design step 2.

States exercised: **ST-02** edit — default, which is where AC-04's warning lives · **ST-03** field validation error · **ST-04** duplicate desk number · **ST-05** saving · **ST-06** saved · **ST-07** save failed.

Design commitments this story must honour: the holder count and the no-notification warning appear in ST-02 *before* the save, not after; the 360px bottom sheet; the title-led duplicate refusal.

## QA notes

- AC-04 is the entire mitigation for RISK-012. Test that the warning appears with a real count, and that it does **not** appear on a desk with no upcoming bookings.
- AC-05 is a negative assertion with real value: a developer implementing US-029 nearby may reasonably assume a rename should notify. Assert zero messages.
- AC-06 is the one that catches a desk number stored on the booking instead of a reference. Rename, then read the booking from three places.
- AC-07 is the classic self-collision bug in uniqueness checks on edit.
- Data setup: a desk with 3 upcoming bookings; one with only past bookings; two desks for the collision case.

## API impacts

Needs a desk-update endpoint, Admin-only, that excludes the desk itself from the uniqueness comparison, exposes the upcoming-booking count for AC-04, and sends nothing. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

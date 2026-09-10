# US-017 — Add a desk

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-017-add-a-desk`) merging with every AC proven by a test named `... (US-017/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-015, BR-001.4, BR-001.8, V-08, V-16                |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-016                                                 |

## Story

As an office administrator
I want to add a desk with a unique number
So that employees have something to book.

## Acceptance criteria

### AC-01 A valid desk number creates an Active desk

- **Given** the add-desk form
- **When** a number matching one upper-case letter, a hyphen and two digits is saved and no desk holds it
- **Then** the desk is created **Active**, appears in the inventory in number order, and is immediately bookable (REQ-015, SCR-007 ST-06)

### AC-02 The format is enforced, exactly four characters

- **Given** the form
- **When** the entry is empty, whitespace only, `A-1`, `AA-01`, `A-001`, or `Window seat 3`
- **Then** it is refused with the reason in text and no request is sent — the pattern is `^[A-Z]-\d{2}$` and nothing else (BR-001.4, V-16, SCR-007 ST-03)

### AC-03 Lower case is accepted and normalised upward

- **Given** the form
- **When** `a-07` is saved
- **Then** the desk is stored and displayed as `A-07`, while `a-7` is still refused (BR-001.4)

### AC-04 A duplicate is refused, and the refusal explains itself

- **Given** a desk `A-01` already exists
- **When** `A-01`, `a-01`, or `A-01 ` with trailing whitespace is saved
- **Then** the server refuses it as already in use and says so in a way the administrator can act on — because a collision caused by case normalisation is one they cannot see for themselves (BR-001.8, V-08, SCR-007 ST-04)

### AC-05 The comparison is case-normalised and whitespace-trimmed

- **Given** desk numbers
- **When** uniqueness is tested
- **Then** `a-01`, `A-01 ` and `A-01` are one desk, not three (BR-001.8)

### AC-06 Saving is guarded and does not shift the layout

- **Given** a save in flight
- **When** the save action is used again
- **Then** exactly one desk is created and the action shows busy with its label kept (SCR-007 ST-05)

### AC-07 A failure that is not a duplicate keeps the entry

- **Given** a save that fails on a server error, timeout or lost connection
- **When** the failure is reported
- **Then** the entered number is retained, nothing was created, and a retry is offered (SCR-007 ST-07)

### AC-08 Only administrators can add desks

- **Given** a signed-in Employee
- **When** they attempt to create a desk
- **Then** it is refused (V-07)

### AC-09 The form works at 360px as a bottom sheet

- **Given** a 360px viewport
- **When** the add-desk form is opened
- **Then** it appears as a bottom sheet with its footer actions correctly placed, and no horizontal page scrolling occurs (NFR-004, SCR-007 decided 2026-09-07)

## Edge cases

- The 26 × 99 ceiling is accepted: 26 zone letters, 99 desks per zone, no non-conforming label (BR-001.4, decided 2026-09-07). An office needing a 27th zone needs a rule change, not a workaround.
- A desk number previously used by a desk that was later deactivated: the deactivated desk still holds the number, so it is a duplicate. There is no delete (US-016/AC-09), so numbers are never released. Deliberate — bookings reference desks.
- New desks are created **Active**. BRD-001 states no way to create one inactive, and none is added.
- The zone letter is not a real area name. "North wing" was rejected as a scope addition needing a new field, an admin control and a requirement (SCR-003 conflict 2).

## UI

Served by **SCR-007 — Desk form** (opened from **SCR-006 — Desks**), both approved in design step 2. Add and edit open this form rather than an inline row editor, because a desk number has real failure states that a table cell cannot host legibly.

States exercised: **ST-01** add — default · **ST-03** field validation error · **ST-04** duplicate desk number · **ST-05** saving · **ST-06** saved · **ST-07** save failed.

Design commitments this story must honour: the bottom sheet at 360px; the title-led duplicate refusal from the 2026-09-07 hi-fi pass; an invalid field's focus ring takes the error colour; reasons are text, never colour alone (NFR-008).

## QA notes

- AC-02 deserves a table-driven test: the pattern is the single most-cited rule in the design, and three screens depend on the letter existing.
- AC-04 and AC-05 are the same rule from two sides. The `a-01` case is the one that matters — it is invisible to the administrator, which is why the message has to explain rather than merely refuse.
- AC-03: assert both storage and display are `A-07`, not just that the save succeeded.
- Data setup: an existing `A-01`; an existing deactivated desk; an empty inventory.

## API impacts

Needs a desk-creation endpoint, Admin-only, enforcing the format and the case-normalised uniqueness server-side and returning the duplicate case distinguishably from a generic failure. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

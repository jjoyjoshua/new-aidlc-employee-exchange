# US-006 — See desk availability for the chosen date

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-006-see-desk-availability`) merging with every AC proven by a test named `... (US-006/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-007, REQ-017, BR-001.4, BR-001.7                   |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-005, US-017                                         |

## Story

As an employee
I want to see which desks are free on the day I picked, by desk number
So that I can choose a specific seat rather than a generic slot.

## Acceptance criteria

### AC-01 The answer comes before the list

- **Given** availability has loaded for the selected date
- **When** the screen is read
- **Then** a count line states the answer first — *"12 of 40 desks free · Wed 9 Sep"* — above the desk list (SCR-003 ST-01)

### AC-02 Every desk is identified by its desk number

- **Given** the desk list
- **When** a desk row is rendered
- **Then** it shows that desk's unique number in the enforced `A-01` format (BR-001.4) and its availability as **Available** or **Taken**, each carrying an icon **and** the word (REQ-007, NFR-008)

### AC-03 Taken desks are shown, not hidden

- **Given** a date on which some desks are taken
- **When** availability is rendered
- **Then** taken desks appear in the list marked **Taken**, so the zone's shape stays the same between dates and a busy Tuesday does not look like an outage (SCR-003 structural decisions)

### AC-04 Inactive desks are absent entirely

- **Given** a desk marked **Inactive** (US-019)
- **When** availability is rendered for any date
- **Then** that desk appears nowhere in the list, neither as available nor as taken (REQ-017, BR-001.7)

### AC-05 Desks are grouped into zones by their letter

- **Given** desks across several letter prefixes
- **When** the list is rendered
- **Then** desks are grouped under a zone heading per letter (*"Zone A"*), in desk-number order within each group — the letter always exists because BR-001.4 enforces it

### AC-06 A taken desk never says who has it

- **Given** a taken desk
- **When** its row is rendered
- **Then** it reads **Taken** and nothing more — no occupant name, initials, or avatar (resolved 2026-09-07: the employee view stays anonymous)

### AC-07 Loading does not shift the layout

- **Given** a date change or a first load
- **When** availability is being fetched
- **Then** the count line is a skeleton and desk rows are skeletons at real row height, so nothing jumps when the data arrives (SCR-003 ST-02)

### AC-08 A failed load is scoped to the list

- **Given** the availability request fails or times out
- **When** the error is shown
- **Then** it replaces the desk list with an inline alert naming the date and offering **Try again**, while the date controls stay fully working so another day can be tried without reloading (SCR-003 ST-06)

### AC-09 An office with no active desks says whose job the fix is

- **Given** the office has no **Active** desks at all
- **When** availability loads for any date
- **Then** a distinct empty state states that no desks are set up and that the office admin adds them, offers no alternative dates, and offers no link into the admin area — an Employee cannot reach it (SCR-003 ST-05, REQ-004)

### AC-10 Availability is announced before it is read

- **Given** a screen-reader user changing the date
- **When** availability loads
- **Then** the count line is announced first — *"12 of 40 desks free, Wednesday 9 September"* — and the loading skeletons produce one "loading" announcement rather than a stream

## Edge cases

- **Fully booked** (every active desk taken) is its own state with its own recovery — US-009 owns it (SCR-003 ST-04). Distinct from AC-09: the cause and the remedy differ.
- A date on which the employee already holds a booking replaces the list entirely — US-007 owns that (SCR-003 ST-10).
- One zone with 99 desks: BR-001.4's ceiling. The list scrolls; no in-list search is added (BRD-001 §10 — out of scope below ~100 desks).
- A desk deactivated between the load and the booking attempt: US-007 owns the refusal.
- Desk rows are full-width touch targets at least 44px tall, and the list is one tab stop behaving as a radio group.

## UI

Served by **SCR-003 — Book a desk**, approved in design step 2. This story builds the availability list; US-005 builds the date controls and US-007 the booking action.

States exercised: **ST-01** default · **ST-02** loading availability · **ST-05** no desks exist · **ST-06** availability load error.

Design commitments this story must honour: taken desks shown rather than filtered out; inactive desks hidden entirely; grouping by number prefix; **Available**/**Taken**/**Selected** each carry an icon and a word, never colour alone (NFR-008 — this screen is where "grey means you can't have it" would otherwise carry five different meanings); the count line is a live region.

## QA notes

- AC-04 is the one with a real consequence if missed — a bookable inactive desk breaks BR-001.7 and lets someone reserve a retired seat. Test it on a date where that desk has no booking, so "absent" cannot be confused with "taken".
- AC-09 versus the fully-booked state (US-009) is the easiest pair to collapse into one generic empty state. Assert the two messages are different.
- AC-06 is a negative assertion worth keeping: occupant names are a natural "helpful" addition that would need a privacy decision.
- Data setup: 40 desks over three zones; one inactive desk; one date with partial bookings; an office with zero active desks.

## API impacts

Needs per-date availability returning every active desk with its number and taken/free state, and deliberately **not** returning occupant identity (AC-06). Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

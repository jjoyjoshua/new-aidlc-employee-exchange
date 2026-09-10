# US-016 — See the desk inventory and how many people hold each desk

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-016-see-the-desk-inventory`) merging with every AC proven by a test named `... (US-016/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-017, BR-001.4, BR-001.9, V-07                      |
| **Priority**   | Must                                                   |
| **Estimate**   | 3 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As an office administrator
I want to see every desk, its state, and how many people have already booked it
So that I can maintain the inventory without discovering the consequences by trial and error.

## Acceptance criteria

### AC-01 Every desk is listed in number order

- **Given** the office's desks
- **When** the inventory loads
- **Then** all of them are listed — **Active** and **Inactive** alike — in desk-number order, so the letter prefix groups them visually (BR-001.4)

### AC-02 Each row shows its state without relying on colour

- **Given** a desk row
- **When** it is rendered
- **Then** its state reads **Active** or **Inactive** as an icon plus a word (NFR-008)

### AC-03 Inactive is a quiet state, not an alarm

- **Given** an **Inactive** desk
- **When** its chip is rendered
- **Then** it uses the quiet neutral fill, not the danger family — a desk is inactive because an administrator chose that, and red would read as a fault (decided 2026-09-10; the role was re-pointed in `tokens.css`)

### AC-04 Each row shows how many upcoming bookings the desk holds

- **Given** a desk with **Confirmed** bookings dated today or later
- **When** its row is rendered
- **Then** it shows that count — the exact quantity BR-001.9 tests — so the hard block in US-019 is predictable rather than discovered (BR-001.9, amended 2026-09-10)

### AC-05 A desk with no upcoming bookings shows zero, not blank

- **Given** a desk holding no **Confirmed** bookings dated today or later
- **When** its row is rendered
- **Then** the count reads as none in a way that cannot be mistaken for missing data

### AC-06 An office with no desks says what to do

- **Given** no desks exist — first run, right after the seeded Admin signs in
- **When** the inventory loads
- **Then** an empty state says so and offers **Add desk**, and the header keeps its own **Add desk** action alongside it (SCR-006 ST-03, decided 2026-09-10)

### AC-07 Loading and failure behave like the rest of the product

- **Given** the request is in flight, or has failed
- **When** the screen renders
- **Then** skeleton rows at real row height stand in while loading (ST-02), and a failure shows an inline alert with **Try again** in place of the table — with **Add desk** hidden, because adding a desk blind risks a duplicate refusal against a list nobody can see (ST-04)

### AC-08 Both row actions are visible at every width

- **Given** a desk row at 1280px, 768px and 360px
- **When** it is rendered
- **Then** **Edit** and the activate/deactivate action are both directly visible — no overflow menu at any width, so the destructive action never costs more clicks on the width with the most room (decided 2026-09-10)

### AC-09 There is no search or filter, and no delete

- **Given** the inventory of 30–100 desks
- **When** the screen is rendered
- **Then** no search field, filter bar or delete action exists — a mistyped desk number is fixed by **Edit** (US-018), and desks are retired by deactivation (US-019), because bookings reference desks and history must survive (SCR-006 structural decisions)

### AC-10 Only administrators can see it

- **Given** a signed-in Employee
- **When** they request this screen or its data
- **Then** it is refused (V-07)

## Edge cases

- 100 desks in one zone letter: the list scrolls. No search until roughly 100 desks total, at which point it is a filter bar above the table with no state changes (SCR-006 open question 2).
- The count in AC-04 counts **Confirmed** bookings dated today or later only — not **Cancelled**, not **Completed**, not past **Confirmed** ones. It must agree exactly with what US-019's block tests, or the screen will promise a block that does not fire, or vice versa.
- A booking cancelled elsewhere while the inventory is open: the count is stale until the next load. REQ-036's focus refresh covers booking lists, not this screen; not extended here.

## Traceability note

**Viewing the desk inventory has no requirement of its own.** It appears in BRD-001 §3 workflow 6 ("views desk inventory with the number of upcoming bookings on each desk") and in the approved SCR-006, but no `REQ-###` states it. This story therefore traces to **REQ-017**, the requirement it exists to serve, and the **Booked ahead** count traces to **BR-001.9**, which resolved SCR-006 open question 1 on 2026-09-07.

No requirement is invented here. It is raised for the PO as a new open question in this PR's walkthrough — the same shape as open questions #9, #12 and #13, which became REQ-028, REQ-029 and NFR-008.

## UI

Served by **SCR-006 — Desks**, approved in design step 2, with its hi-fi pass, explicit row actions and quiet inactive chip settled 2026-09-07 and 2026-09-10.

States exercised: **ST-01** default · **ST-02** loading · **ST-03** empty — no desks yet · **ST-04** load error.

## QA notes

- AC-04 and AC-05 are the load-bearing pair: the count must be computed the same way US-019's block computes it. Test one desk with a past **Confirmed** booking and no future ones — the count must be none and the deactivation must succeed.
- AC-07's hidden **Add desk** on failure is deliberate and easy to miss.
- AC-09 and AC-08 are negative assertions protecting decisions taken on 2026-09-10.
- Data setup: ~40 desks over three zones; one inactive; one with 3 upcoming bookings; one with past bookings only; an empty office.

## API impacts

Needs a desk-inventory read, Admin-only, returning each desk's number, active state, and its count of **Confirmed** bookings dated today or later. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

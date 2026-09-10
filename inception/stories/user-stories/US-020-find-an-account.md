# US-020 — Find an account in the people list

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-020-find-an-account`) merging with every AC proven by a test named `... (US-020/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-032, REQ-004, BR-001.11, V-07                      |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As an office administrator
I want to see the accounts and search them by name or email
So that I can reach the right person without scrolling past everybody else.

## Acceptance criteria

### AC-01 Every account is listed with what identifies it

- **Given** the people list
- **When** it loads
- **Then** each account shows name, email, role, and a status chip reading **Active** or **Deactivated** as an icon plus a word (REQ-004, NFR-008, SCR-008 ST-01)

### AC-02 The summary line states the composition, including the admin count

- **Given** the list
- **When** it is rendered
- **Then** a summary states the totals — *"38 people · 36 employees, 2 admins · 1 deactivated"* — because the admin count is the number BR-001.11 defends, and it must be on screen before a refusal fires

### AC-03 The signed-in administrator's own row is marked

- **Given** the administrator viewing the list
- **When** their own row is rendered
- **Then** it is marked **(you)**

### AC-04 Search matches on name or email

- **Given** a search term
- **When** it is entered
- **Then** accounts whose name **or** email match are shown and the rest are hidden (REQ-032)

### AC-05 A matching search shows what it is showing

- **Given** a search with matches
- **When** the results render
- **Then** the term stays visible with a clear control, only matching rows appear, and a match line above the table reads *"Showing 3 of 38"* (SCR-008 ST-16)

### AC-06 The summary line does not re-count for a search

- **Given** an active search
- **When** the summary line is rendered
- **Then** it still reads the whole-list totals, unchanged — re-counting it would delete the admin count at exactly the moment it is load-bearing, because the last-admin refusals send the administrator *here* to find somebody to promote (decided 2026-09-10)

### AC-07 No match offers the two things worth doing

- **Given** a search matching nobody
- **When** the result renders
- **Then** the term is retained and visible, the message names it, and both **Clear search** and **Add person** are offered — a search that finds nobody is very often a starter who is not in the system yet (SCR-008 ST-03)

### AC-08 There is no truly empty list

- **Given** any state of the system
- **When** the list loads
- **Then** at least the signed-in administrator is present, so no "nobody exists" empty state is built — ST-03 is this screen's only empty state (SCR-008 ST-03)

### AC-09 Loading and failure behave like the rest of the product

- **Given** the request is in flight, or has failed
- **When** the screen renders
- **Then** skeletons stand in at real row height with the search field disabled until there is something to search (ST-02), and a failure shows an inline alert with **Try again** and hides **Add person**, because creating an account blind risks a duplicate-email refusal against a list nobody can see (ST-04, BR-001.10)

### AC-10 The row menu carries four actions in a fixed order

- **Given** a row's overflow trigger
- **When** it is opened
- **Then** it holds **Edit**, the role action, **Reset password**, then **Deactivate** or **Activate** last behind a divider as the destructive one; the role item names the role it would produce; a deactivated account's last item reads **Activate** and its role action stays available (SCR-008 ST-15)

### AC-11 The menu is a bottom sheet at 360px, titled with the person's name

- **Given** a 360px viewport
- **When** a row's menu is opened
- **Then** it appears as a bottom sheet titled with that person's name — the one place an icon-only trigger on a card cannot otherwise say which row is about to change (SCR-008 ST-15, NFR-004)

### AC-12 Dismissing the menu returns focus to its trigger

- **Given** an open row menu
- **When** it is dismissed with Escape or a click away
- **Then** focus returns to the overflow trigger that opened it

### AC-13 Only administrators can see it

- **Given** a signed-in Employee
- **When** they request this screen or its data
- **Then** it is refused, and no other person's name or email is returned (V-07)

## Edge cases

- Search is over name and email only — not role or status. No status filter is specified and none is added.
- Whether search is case-insensitive or matches partial words is not stated in BRD-001. The design shows *"Nobody matches "danna""* for a near-miss on "Dana", which implies a literal substring match rather than fuzzy matching. Implement case-insensitive substring; do not build fuzzy matching without a decision.
- No paging is specified for this list, unlike bookings (REQ-011) and the employee's own list (REQ-009). At 38 people it does not need one. Raised in the walkthrough rather than invented.
- The overflow menu is kept here — unlike SCR-006, which dropped its own on 2026-09-10 — because four actions genuinely do not fit inline (SCR-006 structural decisions).

## UI

Served by **SCR-008 — People**, approved in design step 2, with its hi-fi pass, four-action menu and ST-15/ST-16 settled 2026-09-07 and 2026-09-10.

States exercised: **ST-01** default · **ST-02** loading · **ST-03** no match for search · **ST-04** load error · **ST-15** row menu open · **ST-16** search with matches.

## QA notes

- AC-06 is the one that looks like a bug and is a decision. Assert the summary is unchanged under an active search; a well-meaning "fix" would break the journey out of US-024/AC-05 and US-025/AC-06.
- AC-13 matters: this screen holds everybody's name and email.
- AC-10's order and the divider are asserted as written — the destructive item's position is a safety property, not styling.
- AC-09's disabled search and hidden **Add person** are both deliberate and both easy to miss.
- Data setup: ~38 accounts including 2 admins, 1 deactivated, and names that produce both a match and a near-miss.

## API impacts

Needs a people read, Admin-only, returning name, email, role and active state per account plus the whole-list composition counts for AC-02 and AC-06, with search applied server-side or client-side as `/architect` decides. No OpenAPI contract exists in this repository yet.

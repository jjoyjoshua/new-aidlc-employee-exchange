# US-012 — Come back to a booking list that is still true

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-012-refresh-booking-list-on-focus`) merging with every AC proven by a test named `... (US-012/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-002                                               |
| **Traces to**  | REQ-036                                                |
| **Priority**   | Should                                                 |
| **Estimate**   | 3 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-010                                                 |

## Story

As an employee who left the tab open all morning
I want the list to be current when I come back to it
So that I do not act on a booking that was cancelled an hour ago.

## Acceptance criteria

### AC-01 Regaining focus refreshes the list

- **Given** a booking list that has been open and unfocused
- **When** the browser window or tab regains focus
- **Then** the list is re-fetched and re-rendered from the server (REQ-036)

### AC-02 A booking cancelled elsewhere stops showing as Confirmed

- **Given** a **Confirmed** booking displayed in the list
- **When** it is cancelled elsewhere — by the employee in another tab (US-011), by an Admin (US-015), or by a deactivation cascade (US-025) — and the tab regains focus
- **Then** the row shows **Cancelled** and offers no **Cancel** action (REQ-036, V-06)

### AC-03 The refresh is quiet

- **Given** a refresh on regaining focus
- **When** it runs
- **Then** no full-screen loading state replaces the list, the scroll position is kept, and the layout does not shift — a returning employee sees their list, not a reload

### AC-04 A failed refresh keeps what is on screen

- **Given** a refresh that fails or times out
- **When** the failure occurs
- **Then** the previously loaded list stays visible rather than being replaced by an error state, and the failure is reported unobtrusively with a retry

### AC-05 An open dialog is not disturbed

- **Given** a cancel confirmation is open (US-011/AC-03)
- **When** the tab regains focus
- **Then** the dialog stays open and its target booking is unchanged underneath — a refresh must never pull the row out from under a confirmation

### AC-06 It applies to both booking lists

- **Given** the employee's **My bookings** (SCR-002) and the administrator's **All bookings** (SCR-005)
- **When** either regains focus
- **Then** both refresh under this behaviour (REQ-036 says "a booking list")

## Edge cases

- Rapid focus changes — alt-tabbing repeatedly: the refresh is not fired more often than once per regain, and an in-flight refresh is not duplicated. No specific throttle interval is specified in BRD-001; a sensible one is `/dev`'s judgment, not a business rule.
- A tab focused for days without ever losing focus: not covered by REQ-036, which is about *regaining* focus. No polling is required, and none is invented here.
- The session may have expired while the tab was away (US-003/AC-03): the refresh then lands on the sign-in screen, which is correct and not a failure of this story.
- **Third to drop if the release tightens**, after US-008 and US-009 — but it is a Should, not a Could, and without it AC-02's stale row is what an employee sees every time an Admin cancels for them.

## UI

Served by **SCR-002 — My bookings** and **SCR-005 — All bookings**, both approved in design step 2. This story adds no state: it keeps the existing states truthful.

States affected: SCR-002 **ST-01**, **ST-04**, **ST-05**, and SCR-005 **ST-01**, **ST-06** — the loaded states, whose content this behaviour replaces in place. The screens' loading states (SCR-002 ST-02, SCR-005 ST-02) are deliberately **not** entered by a focus refresh, per AC-03.

## QA notes

- AC-02 is the requirement's whole reason to exist, and it is a two-actor test: cancel in one session, regain focus in the other.
- AC-05 is the one that bites in practice — a refresh that re-creates rows while a dialog holds a reference to one is a real defect and an easy one to ship.
- AC-03 and AC-04 are both "what must *not* happen" assertions: no loading state, no error state replacing good content.
- Data setup: two sessions on the same booking; a controllable focus/blur in the test harness; a refresh endpoint that can be made to fail.

## API impacts

No new endpoint — this re-uses the list reads from US-010 and US-013. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

# US-003 — Stay signed in for 30 days

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-003-thirty-day-session`) merging with every AC proven by a test named `... (US-003/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-001                                               |
| **Traces to**  | NFR-009                                                |
| **Priority**   | Must                                                   |
| **Estimate**   | 3 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As an employee
I want to stay signed in without being asked for my password again
So that cancelling a desk I no longer need is never harder than leaving it booked.

## Acceptance criteria

### AC-01 A session lasts 30 days

- **Given** a user who signed in 29 days ago and has used the application since
- **When** they open the application
- **Then** they are still signed in and are not asked to authenticate (NFR-009)

### AC-02 Use extends the session

- **Given** a session established 20 days ago whose most recent use was today
- **When** 20 more days pass with daily use
- **Then** the session is still valid — the 30 days run from last use, not from sign-in

### AC-03 An unused session expires

- **Given** a session whose last use was 31 days ago
- **When** the user opens the application
- **Then** they are shown the sign-in screen (SCR-001 ST-01) and must authenticate again

### AC-04 No action inside the window asks for a password

- **Given** a valid session
- **When** the user cancels a booking (US-011), books a desk (US-007), or changes their notification setting (US-031)
- **Then** no password prompt or re-authentication step appears at any point (NFR-009 — this is the reason the 30 days were chosen)

### AC-05 There is no "remember me" control

- **Given** the sign-in screen (SCR-001)
- **When** it is displayed
- **Then** no "remember me", "keep me signed in", or session-length control is present — the default already is remember-me (SCR-001 structural decisions)

## Edge cases

- Expiry that falls mid-session: the next request is refused and the user lands on sign-in. No mid-action warning is specified.
- A signed-out session (US-002) is dead immediately regardless of remaining time.
- **The accepted risk, restated so nobody re-litigates it in code review:** a lost unlocked device can book and cancel desks until the session ends (RISK-010). Accepted 2026-09-07 by the PO for a low-sensitivity internal tool. An Admin deactivating the account (US-025) is the remedy, and it also releases the desks.
- BRD-001 does not say whether deactivating an account (US-025) kills that user's live session. Raised as an open question in this PR's walkthrough; not decided here.

## UI

Served by **SCR-001 — Sign in**, approved in design step 2, for the two assertions that are visible: AC-03's return to the sign-in screen, and AC-05's absence of a session-length control. The rest of this story is session behaviour with no interface of its own.

States exercised: **ST-01** default, as the destination of an expired session. This story adds no state.

## QA notes

- AC-01 – AC-03 are clock-dependent. Test them against an injectable clock or a configurable session lifetime, not by waiting — and make the 30 days a configuration value so the test can shorten it.
- AC-04 is a negative assertion across three other stories' flows. Cheapest honest form: assert no authentication challenge is issued on those request paths.
- AC-05 is a one-line assertion on SCR-001 and stops a well-meaning developer adding the control back.

## API impacts

Needs session lifetime and sliding renewal to be configuration, not a literal. Mechanism is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

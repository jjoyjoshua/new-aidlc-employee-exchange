# US-002 — Sign out

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-002-sign-out`) merging with every AC proven by a test named `... (US-002/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-001                                               |
| **Traces to**  | REQ-003                                                |
| **Priority**   | Must                                                   |
| **Estimate**   | 2 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As a signed-in employee or administrator
I want to sign out
So that the next person to use this browser cannot act as me.

## Acceptance criteria

### AC-01 Signing out is reachable from every signed-in screen

- **Given** a signed-in user on any screen inside the application shell
- **When** they open the account menu
- **Then** a **Sign out** action is present and operable by keyboard

### AC-02 Signing out ends the session immediately

- **Given** a signed-in user
- **When** they sign out
- **Then** they arrive at the sign-in screen (SCR-001 ST-01), and the session no longer authorises anything — a subsequent request for any signed-in screen or data is refused (NFR-009)

### AC-03 Going back does not undo it

- **Given** a user who has just signed out
- **When** they use the browser's back navigation to a screen they were on
- **Then** no personal or office data is shown and they are returned to the sign-in screen

### AC-04 Signing out during the forced password change is allowed

- **Given** a user on **Set your password** (SCR-010) because their password was set by an Admin
- **When** they sign out instead of choosing a new password
- **Then** they are signed out, the administrator-set password still works at the next sign-in, and the change is required again (BR-001.17, RISK-009)

## Edge cases

- Signing out with a request already in flight (a cancellation, a save): the sign-out takes effect; the in-flight request's outcome is not reported to the departed user. Whether it completes server-side is `/architect`'s concern, not a business rule.
- Signing out in one browser tab while another tab is open on a signed-in screen: the second tab is not required to react immediately, but its next request must be refused rather than served. No cross-tab broadcast is specified.
- Nothing in BRD-001 asks for a "you have been signed out" confirmation. Not invented here.

## UI

Served by the application shell's account menu, specified on **SCR-002 — My bookings**, **SCR-004 — Settings** and **SCR-005 — All bookings** (all three cite REQ-003). The menu's shell state was settled on 2026-09-10 with the SCR-004 hi-fi pass, and the sign-out placement on 2026-09-07 with the SCR-001 / SCR-010 pre-build pass.

States exercised: the account-menu shell state on each of the three screens, and **SCR-001 ST-01** as the destination. This story adds no state of its own.

## QA notes

- AC-02 and AC-03 are the ones worth real effort: a client-side-only sign-out that clears the interface while leaving the session valid passes a naive UI test and fails the story. Assert against the server's response to a post-sign-out request.
- AC-04 exists because RISK-009 says a failure here strands a new starter on their first morning. Test it explicitly; it is easy to implement the forced-change screen as a trap with no exit.
- Data setup: one Employee, one Admin, one account with an administrator-set password.

## API impacts

Needs a session-termination endpoint whose effect is server-side, not merely a cleared cookie. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

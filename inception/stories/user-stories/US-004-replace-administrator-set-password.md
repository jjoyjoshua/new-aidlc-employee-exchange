# US-004 — Replace an administrator-set password at first sign-in

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-004-replace-administrator-set-password`) merging with every AC proven by a test named `... (US-004/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-001                                               |
| **Traces to**  | REQ-029, BR-001.17, V-12, V-15                         |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As a person whose password was typed by an administrator
I want to be made to choose my own password the first time I sign in
So that nobody else is left holding a working credential for my account.

## Acceptance criteria

### AC-01 An administrator-set password sends the user to choose their own

- **Given** an account marked administrator-set — created by an Admin (US-021) or reset by one (US-027)
- **When** the owner signs in with that password successfully
- **Then** they land on **Set your password** (SCR-010 ST-01) instead of their usual destination

### AC-02 Nothing else is reachable until it is done

- **Given** a user on SCR-010 with the mark still set
- **When** they request any other signed-in screen directly by its address
- **Then** they are returned to SCR-010, and no booking, desk or people data is served (REQ-029 — "before any other application function is reachable")

### AC-03 The screen cannot be reached voluntarily

- **Given** a signed-in user whose password is **not** administrator-set
- **When** they request SCR-010 directly by its address
- **Then** it is not served — there is no voluntary password change in this release (BRD-001 §10)

### AC-04 The new password must meet the policy

- **Given** the Set your password screen
- **When** submit is attempted with a password missing any of the five rules (at least 8 characters, an upper-case letter, a lower-case letter, a digit, a special character — V-12), or with the two entries not matching, or with either field empty
- **Then** the failing rules are named in the checklist, no request is sent, and the password is not changed (SCR-010 ST-02)

### AC-05 The new password must not be the one they were given

- **Given** the Set your password screen
- **When** the submitted password equals the administrator-set password
- **Then** the server refuses it with that specific reason, and the password is unchanged (V-15, SCR-010 ST-03 — the one check the browser cannot make)

### AC-06 On success the old password stops working

- **Given** a successful password change
- **When** a later sign-in is attempted with the administrator-set password
- **Then** it is rejected (SCR-001 ST-04), the new password signs in, the administrator-set mark is cleared, and the user is not asked again (BR-001.17)

### AC-07 On success the user continues into the product

- **Given** a successful password change
- **When** SCR-010 ST-05 completes
- **Then** an Employee lands on **My bookings** (SCR-002) and an Admin on **All bookings** (SCR-005)

### AC-08 Abandoning it cannot lock anyone out

- **Given** a user on SCR-010 who has not yet chosen a password
- **When** they sign out (US-002/AC-04) or close the browser
- **Then** the administrator-set password still signs them in, and SCR-010 is required again (BR-001.17, RISK-009)

## Edge cases

- A save failure that is not AC-05 — server error, timeout, lost connection: the account keeps the administrator-set password, the entered values are retained, and the message says nothing changed (SCR-010 ST-06).
- An Admin resets the password of a user who is *already* mid-change: the newly reset password becomes the administrator-set one, and the earlier screen's submission fails AC-05 or AC-06. Deterministic, and not a business rule to add.
- The user's own new password happening to equal a *previously* used password: allowed. No password history is specified in BRD-001 and none is invented here.
- Password is not trimmed or normalised in any way.

## UI

Served by **SCR-010 — Set your password**, approved in design step 2. Its hi-fi pass and the five-rule checklist were settled on 2026-09-07 and 2026-09-08; this story builds it and designs nothing.

States exercised: **ST-01** default · **ST-02** rules not met · **ST-03** same as the password you were given · **ST-04** saving · **ST-05** saved · **ST-06** save failed. All six; SCR-010 has no others.

Design commitments this story must honour: the checklist's third state (a rule met, pending, or failed — settled 2026-09-07); sign-out stays reachable from this screen (ST-06, RISK-009); an invalid field's focus ring takes the error colour; the rules are stated as text, never signalled by colour alone (NFR-008).

## QA notes

- AC-02 and AC-03 are the two that make this a security story rather than a form. Both need direct-address requests, not UI navigation — a redirect implemented only in the client passes a click-through test and fails the story.
- AC-06 has two halves that are easy to half-implement: the new password working, and the old one *stopping*. Assert both.
- AC-08 is the RISK-009 mitigation. Test it; the natural implementation of "before any other function is reachable" is a trap with no exit.
- Data setup: an account created by an Admin (never signed in), an account whose password an Admin has just reset, and an ordinary account with a self-chosen password for AC-03.

## API impacts

Needs the account to carry an administrator-set marker that the sign-in response exposes, and a password-change endpoint that performs the V-15 comparison server-side. Shapes are `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

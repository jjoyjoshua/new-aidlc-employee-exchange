# US-027 — Reset somebody's password

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-027-reset-somebodys-password`) merging with every AC proven by a test named `... (US-027/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-021, BR-001.12, BR-001.17, V-12                    |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-020                                                 |

## Story

As an office administrator
I want to give somebody a new password when they cannot get in
So that a forgotten password does not keep an employee out, with no self-service reset in this release.

## Acceptance criteria

### AC-01 Resetting sets a new compliant password

- **Given** an account
- **When** the reset is confirmed
- **Then** the system generates a new password satisfying V-12 and sets it on that account (REQ-021, BR-001.12)

### AC-02 The confirmation states every consequence before it happens

- **Given** the reset action
- **When** the confirmation appears
- **Then** it states that a new password will be generated and shown once, that it is not emailed so it must be passed on, that the current password stops working straight away, and that the person will be asked to choose their own the first time they sign in with it (BR-001.12, BR-001.17, BRD-001 §10, SCR-008 ST-10)

### AC-03 The new password is shown exactly once, with a copy control

- **Given** a successful reset
- **When** the result appears
- **Then** the password is shown in a monospaced field large enough to read aloud accurately, with a **Copy** control that confirms in place, and the text states plainly that this is the only time it will be seen (BR-001.12, RISK-005, SCR-008 ST-11)

### AC-04 That dialog cannot be dismissed by accident

- **Given** the shown-once password
- **When** a click outside it or Escape occurs
- **Then** it stays open — only **Done** closes it, and nothing else on the screen is reachable until then (SCR-008 ST-11)

### AC-05 It cannot be shown again

- **Given** a dismissed result
- **When** the administrator looks for the password anywhere in the interface
- **Then** it is not retrievable — a second reset is the only way to produce a new one (BR-001.12)

### AC-06 The old password stops working immediately

- **Given** a reset
- **When** the person attempts to sign in with their previous password
- **Then** it is refused (BR-001.12, SCR-001 ST-04)

### AC-07 The account is marked administrator-set

- **Given** a reset
- **When** the person signs in with the new password
- **Then** they are sent to **Set your password** before anything else is reachable (BR-001.17, REQ-029, US-004/AC-01)

### AC-08 The password is never emailed and never logged

- **Given** a reset
- **When** it completes
- **Then** no email containing the password is sent to anyone, and the value appears in no persistent log or audit record (BR-001.12, BRD-001 §10, RISK-005)

### AC-09 Nothing is changed until the reset succeeds, and a failure says so

- **Given** a reset in flight, or one that fails
- **When** it is pending, or fails
- **Then** the dialog's action shows busy with Escape suppressed (SCR-008 ST-12), and a failure leaves the existing password working and says nothing changed (SCR-008 ST-13)

### AC-10 A person mid-forced-change can be reset again

- **Given** a person who signed in with an administrator-set password and has not yet chosen their own
- **When** their password is reset again
- **Then** the newest password becomes the administrator-set one, the previous one stops working, and the forced change is still required (US-004 edge cases)

### AC-11 Only administrators can reset a password

- **Given** a signed-in Employee
- **When** they attempt to reset any password, including their own
- **Then** it is refused (V-07) — there is no self-service reset in this release (BRD-001 §10, RISK-003)

## Edge cases

- An administrator can reset **their own** password from this screen. Nothing forbids it, and BR-001.17 then applies to them too: they will be sent to the forced-change screen at their next sign-in.
- Resetting a **deactivated** account's password: permitted, and useless until it is reactivated (US-026), since sign-in is refused either way. Nothing prohibits it.
- The generated password is subject to V-12. Whether it should also exclude the ambiguous characters V-18 requires on the **create** path (US-022) is not stated — this password is read aloud in exactly the same way. The walkthrough asks; do not silently apply V-18 here.
- RISK-005's exposure — a credential on screen — is real on this path. The forced change (US-004) is the mitigation that closes the window.
- No notification of any kind reaches the person. They learn their password changed by being handed it, which is the whole shape of BR-001.12.

## UI

Served by **SCR-008 — People**, approved in design step 2. The final clause of AC-02 was added to this screen on 2026-09-10 by the cross-screen consistency sweep: the create path (SCR-009 ST-01) had always warned about the forced change and this screen had not, so an administrator handed over a credential without knowing it was about to be replaced.

States exercised: **ST-10** reset password confirmation · **ST-11** password reset result — shown once · **ST-12** action in progress · **ST-13** action failed · **ST-15** row menu open.

Design commitments this story must honour: ST-11's shown-once warning comes **first** and the forced-change sentence **last**, because this state's first job is to stop the credential being lost; **Copy** confirms in place, since a silent copy leads to pasting the wrong clipboard; the dialog resists dismissal.

## QA notes

- AC-08 is the one that needs a deliberate check of the log output, not just the response body. RISK-005 names log exposure explicitly.
- AC-06 and AC-07 are the pair that make this a security story: assert the old password fails **and** the new one lands on the forced-change screen.
- AC-04 is easy to lose to a generic dialog component that closes on backdrop click. Assert both dismissal paths do nothing.
- AC-05 is a negative assertion worth keeping — a "show again" affordance would be a natural, wrong, convenience.
- Data setup: an account with a known password; one mid-forced-change; a deactivated account; the administrator's own account.

## API impacts

Needs a password-reset endpoint, Admin-only, that generates a V-12-compliant password server-side, returns it exactly once in the response and never again, sets the administrator-set marker, invalidates the previous password, and writes the value nowhere. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

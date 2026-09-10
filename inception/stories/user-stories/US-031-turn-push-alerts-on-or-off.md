# US-031 — Turn browser push alerts on or off

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-031-turn-push-alerts-on-or-off`) merging with every AC proven by a test named `... (US-031/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-004                                               |
| **Traces to**  | REQ-026, NFR-006, BR-001.15, V-14                      |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-001                                                 |

## Story

As an employee
I want to choose whether the browser alerts me about my bookings
So that I get the notifications I want and none that I do not.

## Acceptance criteria

### AC-01 Push is off until it is asked for

- **Given** an employee who has never changed the setting
- **When** the settings screen loads on a browser that supports push
- **Then** the toggle is off — opt-out is the default (REQ-026, BR-001.15, SCR-004 ST-02)

### AC-02 Turning it on asks the browser, then registers

- **Given** the toggle off
- **When** it is switched on
- **Then** the browser's own permission prompt is shown and, once granted, the subscription is registered and the setting is saved as opted in (REQ-026, SCR-004 ST-03, ST-04)

### AC-03 Turning it off stops push and leaves email alone

- **Given** push on
- **When** it is switched off
- **Then** no further push notifications are sent, and the booking, cancellation and reminder emails continue exactly as before (BR-001.15)

### AC-04 The setting survives the session

- **Given** an employee who opted in
- **When** they sign in again later
- **Then** the setting is still on — it belongs to the account, not to the page

### AC-05 A denied permission says what to do about it

- **Given** the browser has denied notification permission, at the prompt or previously for the site
- **When** the settings screen renders
- **Then** it states that the browser is blocking it and what to change, and the toggle does not falsely show as on (SCR-004 ST-05)

### AC-06 An unsupported browser says so differently

- **Given** a browser with no push support at all
- **When** the settings screen renders
- **Then** it says so in different words from a denied permission — there is no setting to change — and the employee is told email still works (NFR-006, SCR-004 ST-06)

### AC-07 A failed save does not leave the toggle lying

- **Given** the browser granted permission but the setting could not be saved, or an opt-out failed
- **When** the failure occurs
- **Then** the toggle shows the setting's real state, the failure is reported, and a retry is offered (SCR-004 ST-07)

### AC-08 A failed read has its own state

- **Given** the opt-in flag or the browser permission state cannot be read
- **When** the screen loads
- **Then** a load-error state is shown with a retry, rather than a toggle in an invented state (SCR-004 ST-08, added 2026-09-10)

### AC-09 Loading is a state, not a guess

- **Given** the screen opening
- **When** the flag and the browser permission are being read
- **Then** a loading state is shown rather than a default-off toggle that may flip a moment later (SCR-004 ST-01)

### AC-10 The setting is the employee's own

- **Given** any employee
- **When** they change their setting
- **Then** it affects only their own notifications, and no administrator screen offers to change it for them

### AC-11 It works at all three widths

- **Given** viewport widths of 1280px, 768px and 360px
- **When** the settings screen is rendered
- **Then** it is usable at each, with the content column narrowing to 520px at 768px, and no horizontal page scrolling (NFR-004, SCR-004 layout)

## Edge cases

- Permission granted in the browser but our save failing leaves a real mismatch — the browser is subscribed and the account is not opted in. AC-07 requires the toggle to show the *account's* state, and no push is sent while the flag is off (V-14).
- The same account opted in on one browser and not another: BRD-001 treats the opt-in as a single account-level flag (REQ-026). Per-device subscriptions are an implementation matter for `/architect`, not a second setting.
- Revoking permission in the browser after opting in: the setting may still read on while delivery fails. Nothing in BRD-001 requires reconciliation; not invented here.
- Reminders are never pushed, whatever this setting says (US-030/AC-09, BR-001.16).

## UI

Served by **SCR-004 — Settings**, approved in design step 2, with its hi-fi pass, ST-08 load-error state, account-menu shell state and the toggle settled on 2026-09-10.

States exercised: **ST-01** loading · **ST-02** push off · **ST-03** requesting permission · **ST-04** push on · **ST-05** permission denied · **ST-06** unsupported browser · **ST-07** change failed · **ST-08** couldn't load your settings. All eight; SCR-004 has no others.

Design commitments this story must honour: ST-05 and ST-06 stay two states with different words, because one has a remedy and the other does not; the toggle's state is carried by more than colour (NFR-008).

## QA notes

- AC-05 and AC-06 need a browser or harness that can simulate denied permission and absent push support respectively. Both are easy to skip and both are the difference between graceful degradation and a dead toggle.
- AC-07's mismatch case is the one with a real consequence: assert no push is delivered while the account flag is off, even with a live browser subscription.
- AC-01 is the requirement's stated default and worth an explicit test — an opt-in that defaults on breaches BR-001.15.
- Data setup: a fresh account; one opted in; harness control over browser permission and push support.

## API impacts

Needs a read and a write of the account's opt-in flag, plus somewhere to hold the browser subscription the flag gates. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

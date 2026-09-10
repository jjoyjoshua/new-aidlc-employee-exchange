# US-026 — Bring a deactivated account back

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-026-reactivate-an-account`) merging with every AC proven by a test named `... (US-026/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-020, REQ-005                                       |
| **Priority**   | Must                                                   |
| **Estimate**   | 3 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-025                                                 |

## Story

As an office administrator
I want to reactivate an account I deactivated
So that somebody returning from leave, or deactivated by mistake, can sign in again.

## Acceptance criteria

### AC-01 A deactivated account can be reactivated

- **Given** an account in state **Deactivated**
- **When** its **Activate** action is used
- **Then** its state becomes **Active** (REQ-020's inverse; SCR-008 ST-14)

### AC-02 They can sign in again

- **Given** a reactivated account
- **When** its owner signs in with their existing password
- **Then** they are signed in and reach the destination their role gives them (REQ-005, US-001/AC-01, AC-02)

### AC-03 Their role comes back as it was

- **Given** a deactivated account whose role was **Admin**
- **When** it is reactivated
- **Then** it holds **Admin** again — a deactivated person's role decides what they come back to (SCR-008 ST-15)

### AC-04 The bookings that were cancelled are not restored

- **Given** an account whose upcoming bookings were cancelled by the deactivation cascade (US-025/AC-02)
- **When** it is reactivated
- **Then** those bookings stay **Cancelled**, and the person books again themselves (RISK-011)

### AC-05 Their password state is untouched

- **Given** a reactivated account
- **When** its owner signs in
- **Then** they are asked to choose a new password only if they were already carrying an administrator-set one (BR-001.17) — reactivating neither resets nor re-marks the password

### AC-06 The outcome is stated in place

- **Given** a successful reactivation
- **When** the list updates
- **Then** the row's chip becomes **Active** in place, the summary line's counts update, a transient message states the effect, and focus returns to the row's overflow trigger (SCR-008 ST-14)

### AC-07 Failure changes nothing

- **Given** a reactivation that fails
- **When** the failure is reported
- **Then** the account is still **Deactivated** and the message says nothing changed (SCR-008 ST-13)

### AC-08 Only administrators can reactivate an account

- **Given** a signed-in Employee
- **When** they attempt it
- **Then** it is refused (V-07)

## Edge cases

- Reactivation is **not** confirmed with a dialog, matching the desk asymmetry in US-019/AC-09: it restores access, harms nobody, and is undone by the same control. If the PO wants a confirmation here — this one does restore access to office data, which activating a desk does not — say so and it is a one-line change. The walkthrough asks.
- BR-001.11 cannot be triggered by reactivation: adding an active admin never reduces the count to zero.
- An account deactivated for months comes back with the same password. Whether that is acceptable is a security question BRD-001 does not raise; noted, not invented.
- Reactivating does not notify the person. No such notification is specified.

## Traceability note

**Reactivation has no requirement of its own.** REQ-020 states only that an Admin can deactivate an account, and BRD-001 §3 workflow 7 does not mention bringing one back. The capability is in the **approved design** — SCR-008 ST-15's last menu item reads **Activate** on a deactivated account, and ST-14 covers the success — so it is inside the frozen scope by the design merge rather than by a requirement.

This story therefore traces to **REQ-020** and **REQ-005**, the two requirements it operates on. No requirement is invented here; it is raised for the PO as a new open question in this PR's walkthrough.

## UI

Served by **SCR-008 — People**, approved in design step 2. No new state: this story uses the menu item and the outcome states the screen already specifies.

States exercised: **ST-15** row menu open (where the item reads **Activate**) · **ST-12** action in progress · **ST-13** action failed · **ST-14** action succeeded.

## QA notes

- AC-04 is the one that documents RISK-011 in a test: assert the cancelled bookings are still cancelled after reactivation, so nobody later reads the absence as a bug.
- AC-05 has two branches — an account with a self-chosen password must not be sent to the forced-change screen; one that never completed the forced change still must be.
- AC-03 needs a deactivated **Admin** in the fixtures.
- Data setup: a deactivated employee whose bookings were cascade-cancelled; a deactivated admin; a deactivated account still carrying an administrator-set password.

## API impacts

Needs an activation endpoint, Admin-only, that changes state only — restoring no bookings and touching no credentials. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

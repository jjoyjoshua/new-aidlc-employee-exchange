# US-019 — Take a desk out of service, and put it back

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-019-take-a-desk-out-of-service`) merging with every AC proven by a test named `... (US-019/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-017, BR-001.7, BR-001.9, V-09                      |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-016                                                 |

## Story

As an office administrator
I want to retire a desk from the bookable pool and bring it back later
So that a desk being repaired is not reserved by somebody who then has nowhere to sit.

## Acceptance criteria

### AC-01 Deactivating removes the desk from availability for every date

- **Given** an **Active** desk with no **Confirmed** bookings dated today or later
- **When** it is deactivated
- **Then** its state becomes **Inactive**, and it appears nowhere in employee availability for any date (REQ-017, BR-001.7)

### AC-02 An inactive desk cannot be booked at all

- **Given** an **Inactive** desk
- **When** a booking request names it, however constructed
- **Then** it is refused at the server (BR-001.7, and the counterpart of US-007/AC-12)

### AC-03 Deactivating is confirmed, and says history survives

- **Given** the deactivate action on an eligible desk
- **When** it is used
- **Then** a confirmation states what it does and that past bookings are kept — "deactivate" reads as "delete", and the record is preserved (SCR-006 ST-05)

### AC-04 A desk holding upcoming bookings is hard-blocked

- **Given** a desk with one or more **Confirmed** bookings dated today or later
- **When** deactivation is attempted
- **Then** it is **refused**, the refusal reports how many such bookings exist, and nothing is cancelled (BR-001.9, V-09, SCR-006 ST-06)

### AC-05 The refusal offers no cancel-them-all action

- **Given** the blocked refusal
- **When** it is rendered
- **Then** it offers no action that cancels the bookings — BR-001.9 says the system must not cancel bookings as part of this action, and the hard block was chosen over the cancelling alternative (BRD-001 open question #6, decided 2026-09-07)

### AC-06 The refusal routes to exactly the rows that must be cleared

- **Given** the blocked refusal
- **When** the administrator follows its primary route
- **Then** they arrive at **All bookings** pre-filtered to that desk, from today, status **Confirmed** (SCR-006 structural decisions; served by US-014/AC-08)

### AC-07 Deactivation succeeds once the bookings are gone

- **Given** a previously blocked desk whose upcoming **Confirmed** bookings have all been cancelled
- **When** deactivation is attempted again
- **Then** it succeeds (BR-001.9)

### AC-08 The block is enforced at the server, not only predicted on screen

- **Given** the row count from US-016/AC-04 showing none
- **When** a booking is made on that desk between the load and the deactivation
- **Then** the server refuses the deactivation and the screen shows the blocked refusal — the count is a prediction, the server is the rule (SCR-006 ST-06)

### AC-09 Activating is not confirmed

- **Given** an **Inactive** desk
- **When** it is activated
- **Then** it becomes **Active** and bookable with no confirmation dialog — it harms nobody and is undone by the same control, and confirming both would train the administrator to dismiss the dialog that matters (SCR-006 ST-10, structural decisions)

### AC-10 The row stays in place and states the outcome

- **Given** a successful deactivation or activation
- **When** the list updates
- **Then** the row stays where it is with its chip changed, and the outcome is stated — a row that vanishes from an unfiltered list is unexplained (SCR-006 ST-09, ST-10)

### AC-11 A failure that is not the block says nothing changed

- **Given** a deactivation that fails on a server error or timeout
- **When** the failure is reported
- **Then** the desk is unchanged and a retry is offered (SCR-006 ST-08)

### AC-12 Only administrators can change a desk's state

- **Given** a signed-in Employee
- **When** they attempt to activate or deactivate a desk
- **Then** it is refused (V-07)

## Edge cases

- **This is the opposite shape from deactivating a person (US-025), deliberately.** A desk is hard-blocked and cancels nothing; a person always proceeds and cancels everything. BR-001.18's own note gives the reason: a desk can wait, a revoked account cannot. Neither is a precedent for the other, and a developer implementing both in sequence will otherwise assume the first was the house style.
- Past **Confirmed** and **Completed** bookings never block: only **Confirmed** dated today or later (BR-001.9).
- An inactive desk keeps its number reserved — there is no delete, so the number is never released (US-016/AC-09).
- An inactive desk still appears in the administrator's desk filter (US-014), so its history stays findable.
- Deactivating every desk in the office puts the employee booking screen into its no-desks-exist state (US-006/AC-09), not the fully-booked one.

## UI

Served by **SCR-006 — Desks**, approved in design step 2.

States exercised: **ST-05** deactivate confirmation · **ST-06** deactivate blocked · **ST-07** deactivating · **ST-08** deactivate failed · **ST-09** deactivated · **ST-10** activated.

Design commitments this story must honour: the blocked refusal **is** the dialog, not an alert nested inside one, with a warning icon in the header as the non-colour signal and the count in the body (decided 2026-09-10); ST-05's copy is drawn on a desk that has no upcoming bookings; the row action is visible at every width with no overflow menu.

## QA notes

- AC-04 and AC-05 together are the whole of BR-001.9. The tempting "helpful" implementation — cancel them and proceed — is exactly the alternative the PO rejected on 2026-09-07. Assert the bookings are untouched after a blocked attempt.
- AC-08 is a race and the reason the block cannot live only in the screen. Book the desk between load and deactivate.
- AC-09 is a negative assertion protecting a deliberate asymmetry; a developer adding a confirmation for symmetry would be undoing a decision.
- AC-02 needs a server-side booking attempt naming the inactive desk.
- Data setup: a desk with no upcoming bookings; one with 3; one whose bookings are all past; one inactive desk; an office where every desk is inactive.

## API impacts

Needs desk activate and deactivate endpoints, Admin-only, with the deactivate path enforcing BR-001.9 server-side and returning the blocking count so the refusal can state it. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

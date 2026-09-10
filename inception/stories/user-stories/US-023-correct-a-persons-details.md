# US-023 — Correct a person's name or email

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-023-correct-a-persons-details`) merging with every AC proven by a test named `... (US-023/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-019, BR-001.10, V-10                               |
| **Priority**   | Must                                                   |
| **Estimate**   | 3 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-020, US-021                                         |

## Story

As an office administrator
I want to fix a person's name or email address
So that a typo does not stop their notifications arriving or their account being recognised.

## Acceptance criteria

### AC-01 Name and email can be changed

- **Given** an existing account
- **When** a new name, a new email, or both are saved
- **Then** the account keeps its identity, role, state and booking history, and the new values appear in the people list (REQ-019, SCR-009 ST-02, ST-07)

### AC-02 A duplicate email is refused

- **Given** an email already held by another account, active or deactivated
- **When** it is saved
- **Then** the server refuses it and the account is unchanged (BR-001.10, V-10, SCR-009 ST-04)

### AC-03 Saving the account's own email is not a duplicate

- **Given** the edit form with the email unchanged
- **When** it is saved
- **Then** it is not refused as a collision with itself

### AC-04 Required fields and an implausible email are caught in the browser

- **Given** the edit form
- **When** save is attempted with the name or email empty, or an email that is not a plausible address
- **Then** the fields are marked in error with the reason in text and no request is sent (SCR-009 ST-03)

### AC-05 A new email becomes the sign-in identifier

- **Given** a changed email
- **When** the person next signs in
- **Then** the new address signs them in and the old one does not (REQ-002, BR-001.10)

### AC-06 Notifications follow the new address

- **Given** a changed email and a subsequent booking event for that person
- **When** the notification is sent
- **Then** it goes to the new address — bookings email the account's current address (REQ-023, REQ-024, REQ-025)

### AC-07 Changing details does not touch the password

- **Given** an account whose owner has chosen their own password
- **When** the name or email is changed
- **Then** the password is unchanged and the account is **not** marked administrator-set — the person is not sent to **Set your password** at their next sign-in

### AC-08 Saving is guarded, and a failure keeps the entry

- **Given** a save in flight, or a save that fails for a reason that is not a duplicate
- **When** either occurs
- **Then** the action is guarded against a double submit (ST-06), and a failure retains the entered values, changes nothing, and offers a retry (ST-08)

### AC-09 Only administrators can edit an account

- **Given** a signed-in Employee
- **When** they attempt to change any account's details
- **Then** it is refused (V-07) — note there is no self-service profile editing anywhere in this release

## Edge cases

- Changing a **role** from this same form is US-024's story, including the last-admin refusal it can hit (SCR-009 ST-05).
- Editing the signed-in administrator's own name or email is permitted; only role and state changes on that account meet BR-001.11.
- An email changed while that person is signed in: their session is not required to end. BRD-001 says nothing about it; nothing is invented.
- Bookings are not re-notified after an email change. Only future events use the new address (AC-06).

## UI

Served by **SCR-009 — User form** (opened from **SCR-008 — People**), both approved in design step 2.

States exercised: **ST-02** edit — default · **ST-03** field validation error · **ST-04** duplicate email · **ST-06** saving · **ST-07** saved · **ST-08** save failed.

Design commitment this story must honour: the edit form shows no password field and no password rules — the only password paths in this release are creation (US-021), the admin reset (US-027) and the forced change (US-004).

## QA notes

- AC-03 is the self-collision bug that uniqueness checks on edit reliably ship.
- AC-02 must include a deactivated account's email.
- AC-05 and AC-07 are the two easy to get wrong together: an implementation that "re-provisions" the account on an email change may reset the password or re-mark it administrator-set, sending an innocent user to the forced-change screen.
- Data setup: two active accounts and one deactivated for the collision cases; one account with a self-chosen password for AC-07.

## API impacts

Needs a user-update endpoint, Admin-only, excluding the account itself from the uniqueness comparison and leaving credentials untouched. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

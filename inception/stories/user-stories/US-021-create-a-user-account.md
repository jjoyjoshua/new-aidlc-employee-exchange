# US-021 — Create a user account

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-021-create-a-user-account`) merging with every AC proven by a test named `... (US-021/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-018, REQ-004, BR-001.10, BR-001.17, V-10, V-12     |
| **Priority**   | Must                                                   |
| **Estimate**   | 8 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-020                                                 |

## Story

As an office administrator
I want to create an account for a new starter with a role and a first password
So that they can sign in on their first morning.

## Acceptance criteria

### AC-01 An account is created with name, email, role and an initial password

- **Given** the create-person form
- **When** a name, a plausible unused email, a role of **Employee** or **Admin**, and a password meeting the policy are saved
- **Then** the account is created **Active** with exactly that one role and appears in the people list (REQ-018, REQ-004)

### AC-02 Exactly one role, never both and never none

- **Given** the role control
- **When** the form is rendered and saved
- **Then** one role must be chosen and only one can be held (REQ-004)

### AC-03 The password must meet all five rules

- **Given** the password field
- **When** the entry is shorter than 8 characters or lacks an upper-case letter, a lower-case letter, a digit, or a special character
- **Then** the failing rules are named in the checklist, no request is sent, and nothing is created (V-12, SCR-009 ST-03)

### AC-04 A password meeting every rule is shown as met

- **Given** a password satisfying all five rules, whether typed or generated (US-022)
- **When** the checklist renders
- **Then** every rule shows as met — the state the administrator is looking at every time they save (SCR-009 ST-09)

### AC-05 Required fields and an implausible email are caught in the browser

- **Given** the form
- **When** save is attempted with a required field empty or an email that is not a plausible address
- **Then** the fields are marked in error with the reason in text and no request is sent (SCR-009 ST-03)

### AC-06 A duplicate email is refused

- **Given** an email already held by any account, active or deactivated
- **When** the form is saved
- **Then** the server refuses it as already in use and no account is created (REQ-018, BR-001.10, V-10, SCR-009 ST-04)

### AC-07 The form says the password will be replaced

- **Given** the create form
- **When** it is rendered
- **Then** it states that the person will be asked to choose their own password the first time they sign in (BR-001.17, REQ-029, SCR-009 ST-01)

### AC-08 The created account is marked administrator-set

- **Given** a successful creation
- **When** the new user first signs in with the password the administrator typed
- **Then** they are sent to **Set your password** before anything else (BR-001.17, delivered by US-004/AC-01)

### AC-09 The success message repeats what to pass on

- **Given** a successful creation
- **When** the confirmation appears
- **Then** it repeats that the person will be asked to change the password at first sign-in — stated on the form and again here, because this is the moment the administrator is actually handing the credential over (SCR-009 ST-07)

### AC-10 The password is never emailed

- **Given** a successful creation
- **When** the account exists
- **Then** no email containing the password is sent to anyone — emailing credentials is out of scope (BR-001.12's principle, BRD-001 §10)

### AC-11 Saving is guarded, and a failure keeps the entry

- **Given** a save in flight, or a save that fails for a reason that is not a duplicate or a rule refusal
- **When** either occurs
- **Then** exactly one account is created at most (ST-06), and a failure retains every entered value, creates nothing, and offers a retry (ST-08)

### AC-12 Only administrators can create accounts

- **Given** a signed-in Employee
- **When** they attempt to create an account
- **Then** it is refused (V-07)

## Edge cases

- Creating a second **Admin** is unrestricted — BR-001.11 only guards against reaching zero.
- An email that differs only by case from an existing one: BR-001.10 makes email the sign-in identifier, so treat the comparison as case-insensitive, consistently with US-001's edge case on sign-in. Both hang on the same undecided question raised in this PR's walkthrough.
- The administrator sees the password they typed, so RISK-005's shoulder-surfing exposure applies here as it does to a reset (US-027). The forced change (US-004) is what closes the window.
- No welcome email of any kind is specified. None is invented.
- BRD-001 gives an account a name, an email, a role and a password. No department, phone, or start date.

## UI

Served by **SCR-009 — User form** (opened from **SCR-008 — People**), both approved in design step 2, with the five-rule checklist and ST-09 settled 2026-09-07 and 2026-09-10.

States exercised: **ST-01** create — default · **ST-03** field validation error · **ST-04** duplicate email · **ST-06** saving · **ST-07** saved · **ST-08** save failed · **ST-09** create — all rules met.

Design commitments this story must honour: the dialog scrolls within a cap rather than growing past the viewport (2026-09-07); an invalid field's focus ring takes the error colour; the five rules are stated as text with their met/pending/failed state carried by more than colour (NFR-008).

## QA notes

- AC-03 deserves a table-driven test across all five rules plus the boundary at exactly 8 characters.
- AC-06 must include a **deactivated** account's email — the natural implementation filters to active accounts and lets a duplicate through.
- AC-08 is the join with US-004 and is easy to leave out: creating the account is not enough, it has to carry the marker.
- AC-07 and AC-09 are copy assertions that exist because the reset path (US-027) was silent about the same rule until 2026-09-10. Keep both.
- Data setup: an existing active account and an existing deactivated account for the duplicate cases; one of each role.

## API impacts

Needs a user-creation endpoint, Admin-only, enforcing V-12 and the email uniqueness server-side, returning the duplicate case distinguishably, and setting the administrator-set marker US-004 reads. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

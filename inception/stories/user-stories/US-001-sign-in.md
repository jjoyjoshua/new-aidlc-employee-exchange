# US-001 — Sign in with email and password

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-001-sign-in`) merging with every AC proven by a test named `... (US-001/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-001                                               |
| **Traces to**  | REQ-001, REQ-002, REQ-005, NFR-003, V-01               |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | —                                                      |

## Story

As an employee or administrator
I want to sign in with my email address and password
So that only I can see and change my own bookings, and only administrators can manage the office.

## Acceptance criteria

### AC-01 An employee reaches their own bookings

- **Given** an active Employee account whose password was not set by an Admin
- **When** they submit their correct email and password
- **Then** they are signed in and land on **My bookings** (SCR-002)

### AC-02 An administrator reaches the office's bookings

- **Given** an active Admin account whose password was not set by an Admin
- **When** they submit their correct email and password
- **Then** they are signed in and land on **All bookings** (SCR-005), and the admin navigation (Bookings, Desks, People) is present

### AC-03 An employee cannot reach the administrator's screens

- **Given** a signed-in Employee
- **When** they request an Admin-only screen directly by its address (SCR-005, SCR-006, SCR-007, SCR-008 or SCR-009)
- **Then** the screen is not served, no admin data is returned, and they are returned to **My bookings** (V-07)

### AC-04 Wrong credentials and a deactivated account are indistinguishable

- **Given** the sign-in screen
- **When** the submitted email is unknown, **or** the password is wrong, **or** the account is marked deactivated (REQ-005)
- **Then** all three produce the identical message and the identical response time band, revealing nothing about which accounts exist (SCR-001 ST-04, V-01)

### AC-05 An incomplete form never reaches the server

- **Given** the sign-in screen
- **When** submit is attempted with either field empty, or with an email that is not a plausible address
- **Then** the fields are marked in error with the reason in text, focus moves to the first invalid field, and no sign-in request is sent (SCR-001 ST-02)

### AC-06 A submission in flight cannot be sent twice

- **Given** a valid-looking submission has been sent
- **When** the submit control is activated again before the response arrives
- **Then** only one sign-in request exists, and the control is shown as busy with its label kept (SCR-001 ST-03)

### AC-07 An unreachable service does not read as a rejection

- **Given** the sign-in screen
- **When** the request times out, cannot reach the server, or returns a server error
- **Then** the message states that the service is unavailable and offers a retry, and does **not** suggest the credentials were wrong (SCR-001 ST-05)

### AC-08 Credentials are never sent in the clear

- **Given** a deployed environment
- **When** the sign-in form is submitted
- **Then** the request is made over HTTPS, and a plain-HTTP request to the sign-in endpoint is refused or redirected rather than served (NFR-003)

## Edge cases

- **Email case.** BRD-001 makes email the sign-in identifier (BR-001.10) but says nothing about whether `Priya@company.com` signs in an account stored as `priya@company.com`. `TBD (owner: Joy Joshua)` — see the new open question in this PR's walkthrough. Until decided, the safe reading is case-insensitive match on sign-in, which is what BR-001.10's case-normalised uniqueness implies; do not ship a case-sensitive comparison without the decision.
- Leading and trailing whitespace on the email is trimmed before comparison — the same treatment BR-001.8 gives desk numbers.
- An account deactivated **while** its owner is signed in: out of this story. US-025 owns what deactivation does; the surviving-session question is raised as an open question in this PR's walkthrough.
- Password is never trimmed, normalised, or case-folded.
- No account-lockout or rate-limit is specified in BRD-001. Not invented here; raised as an open question.

## UI

Served by **SCR-001 — Sign in**, approved in design step 2 (structure 2a, styling 2b). This story does not design anything; it builds the approved screen.

States exercised: **ST-01** default · **ST-02** field validation error · **ST-03** submitting · **ST-04** rejected · **ST-05** service unavailable. All five belong to this story; SCR-001 has no others.

Design commitments this story must honour: the card width and the sign-in backdrop from the hi-fi pass; an invalid field's focus ring takes the error colour (decided 2026-09-08); the error message is text, never colour alone (NFR-008); every control has a visible focus ring.

## QA notes

- AC-04 is the security-relevant one and the easiest to break by accident: three code paths naturally produce three different messages. Test all three inputs against one expected message, and assert the deactivated-account path does not return a distinguishable status code or timing.
- AC-03 needs a real request against an admin route while holding an Employee session — a UI test that only checks the nav is absent proves nothing.
- Data setup: one active Employee, one active Admin, one deactivated Employee, all with known non-administrator-set passwords.
- AC-08 is environment-level; it is tested against a deployed environment or the deployment configuration, not in a unit test.

## API impacts

No OpenAPI contract exists in this repository yet, so the endpoint shape is `/architect`'s to settle rather than this story's to declare. What this story needs from it: a credential-submission endpoint that returns one indistinguishable failure for all three AC-04 causes, and a session establishment mechanism US-003 can then extend.

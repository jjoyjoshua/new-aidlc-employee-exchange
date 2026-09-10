# US-025 — Deactivate an account and release the desks it holds

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-025-deactivate-an-account`) merging with every AC proven by a test named `... (US-025/AC-##)`.

|                |                                                                    |
| -------------- | ------------------------------------------------------------------ |
| **Epic**       | EPIC-003                                                           |
| **Traces to**  | REQ-020, REQ-030, REQ-005, REQ-024, BR-001.11, BR-001.18, V-11, V-17 |
| **Priority**   | Must                                                               |
| **Estimate**   | 8 pts (AI draft — humans re-estimate)                              |
| **Depends on** | US-020, US-024                                                     |

## Story

As an office administrator
I want deactivating somebody's account to also give back the desks they were holding
So that a leaver's reservations do not sit empty until somebody notices.

## Acceptance criteria

### AC-01 A deactivated person cannot sign in

- **Given** an active account
- **When** it is deactivated
- **Then** its state becomes **Deactivated** and sign-in with it is refused, indistinguishably from wrong credentials (REQ-020, REQ-005, US-001/AC-04)

### AC-02 Their upcoming Confirmed bookings are cancelled in the same act

- **Given** a person holding **Confirmed** bookings dated today or later
- **When** their account is deactivated
- **Then** every one of those bookings becomes **Cancelled** as part of the same action, and those desks go back into the pool (REQ-030, BR-001.18, V-17)

### AC-03 Past bookings are kept

- **Given** the same person's past bookings
- **When** the account is deactivated
- **Then** they are retained and unchanged (BR-001.18)

### AC-04 Deactivation is never blocked by the bookings

- **Given** a person holding upcoming bookings
- **When** deactivation is attempted
- **Then** it proceeds — the bookings are not a refusal, and there is no way to deactivate the account without cancelling them (BR-001.18)

### AC-05 The administrator is shown the bookings first, listed and counted

- **Given** a person holding upcoming **Confirmed** bookings
- **When** the deactivate confirmation appears
- **Then** it lists those bookings individually — desk and date each — as well as their count, states that the desks return to the pool and that the person is emailed about each, and confirms that past bookings are kept (REQ-030, BR-001.18, V-17, SCR-008 ST-06)

### AC-06 The confirming action's own label carries the count

- **Given** that confirmation
- **When** its actions are rendered
- **Then** the confirming action reads with the number in it — *"Deactivate and cancel 3 bookings"* — so a habitual click cannot hide what it does (SCR-008 ST-06)

### AC-07 Someone with nothing upcoming gets the simpler confirmation

- **Given** a person holding no **Confirmed** bookings dated today or later
- **When** deactivation is confirmed
- **Then** a distinct confirmation is shown that says they will not be able to sign in and their past bookings are kept, with no cancellation clause and no count (SCR-008 ST-05)

### AC-08 A cancellation email is sent for each booking

- **Given** bookings cancelled by the cascade
- **When** the deactivation completes
- **Then** one cancellation email is sent to that person for each cancelled booking (REQ-024, REQ-030, BR-001.13)

### AC-09 An opted-in person's push alert names the office admin

- **Given** the person had opted in to browser push (US-031)
- **When** the cascade cancels their bookings
- **Then** each push alert states that the office admin cancelled it, rather than reporting a cancellation with no cause (REQ-027, BR-001.20 — delivered by US-032)

### AC-10 Deactivating the only active administrator is refused

- **Given** an account that is the only active **Admin**
- **When** deactivation is attempted
- **Then** it is **refused** with no override, naming the consequence — nobody able to manage desks, bookings or people, including nobody able to undo it — and its primary action routes to promoting somebody else (BR-001.11, V-11, SCR-008 ST-07)

### AC-11 Nothing is changed optimistically, and a failure changes nothing

- **Given** a deactivation in flight
- **When** it is pending, or it fails
- **Then** the row is not updated ahead of the result, Escape is suppressed while in flight (ST-12), and a failure leaves the account active with every booking still **Confirmed**, saying explicitly that nothing changed (ST-13)

### AC-12 The cascade is all or nothing

- **Given** a deactivation of a person holding several bookings
- **When** the cancellation of one of them fails
- **Then** the account is not left deactivated with some bookings still **Confirmed** — either the whole act completes or it reports failure with nothing changed (BR-001.18 — "in the same action")

### AC-13 Success states the effect and updates the counts

- **Given** a successful deactivation
- **When** the list updates
- **Then** the row's chip becomes **Deactivated** in place, the summary line's counts update, a transient message states that they can no longer sign in, and focus returns to the row's overflow trigger (SCR-008 ST-14)

### AC-14 Only administrators can deactivate an account

- **Given** a signed-in Employee
- **When** they attempt to deactivate any account
- **Then** it is refused (V-07)

## Edge cases

- **This is the opposite shape from deactivating a desk (US-019), deliberately.** A person's deactivation always proceeds and cancels everything; a desk's is hard-blocked and cancels nothing. BR-001.18's own note gives the reason: a desk can wait, a revoked account cannot. Neither is a precedent for the other.
- **The cancellations are irreversible.** Reactivating the account (US-026) does not restore them (RISK-011). The mitigations are AC-05's individual listing and AC-06's counted label; re-booking is then self-service, provided the desks are still free.
- BRD-001 does not say whether deactivation ends that person's **live session** (NFR-009's 30 days). Sign-in is refused, but a session already open may survive. Raised as an open question in this PR's walkthrough — it is the difference between revoking access and revoking future access.
- The person is emailed about each cancelled booking, but nothing tells them their account was deactivated. No such notification is specified and none is invented.
- Deactivating a person with a **Cancelled** or **Completed** booking today: neither is **Confirmed**, so neither is touched, and AC-07's simpler confirmation applies.

## UI

Served by **SCR-008 — People**, approved in design step 2, with the two-shaped confirmation settled 2026-09-07 and the hi-fi pass on 2026-09-10.

States exercised: **ST-05** deactivate confirmation — no upcoming bookings · **ST-06** deactivate confirmation — bookings will be cancelled · **ST-07** deactivate blocked — last active admin · **ST-12** action in progress · **ST-13** action failed · **ST-14** action succeeded · **ST-15** row menu open.

Design commitments this story must honour: ST-05 and ST-06 stay two states, because the second one is releasing specific desks on specific days and the administrator may recognise one they did not expect; the bookings are **listed**, not only counted; the count sits inside the confirming action's label; the destructive action uses the solid crimson danger fill.

## QA notes

- AC-12 is the one worth designing the test around first: a partial cascade is the failure mode that leaves the data in a state no screen can explain. Force a cancellation failure mid-cascade.
- AC-02 must count **Confirmed** and dated today-or-later only. Seed a past **Confirmed** booking and a **Cancelled** future one, and assert neither is touched — and that AC-07's simpler dialog is the one shown.
- AC-08's count of emails equals the count in AC-06's label. Assert both against the same fixture.
- AC-10 needs the same deactivated-admin fixture as US-024/AC-07.
- AC-09 needs an opted-in person, and the wording must differ from a self-initiated cancellation (US-011).
- Data setup: a person with 3 upcoming bookings, one past and one cancelled; a person with none; the only active admin; two admins with one deactivated; one opted-in to push.

## API impacts

Needs a deactivation endpoint, Admin-only, that evaluates BR-001.11 transactionally, cancels the qualifying bookings atomically with the state change, emits one cancellation notification per booking, and exposes the affected bookings **before** the act so AC-05 can list them. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

# US-024 — Change a person's role

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-024-change-a-persons-role`) merging with every AC proven by a test named `... (US-024/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-022, REQ-004, BR-001.11, V-11                      |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-020                                                 |

## Story

As an office administrator
I want to make somebody an admin, or return them to being an employee
So that the office is never left without an administrator, and nobody keeps access they no longer need.

## Acceptance criteria

### AC-01 A role can be changed in either direction

- **Given** an account
- **When** its role is changed between **Employee** and **Admin**
- **Then** the account holds exactly the new role and the people list shows it (REQ-022, REQ-004)

### AC-02 The change is confirmed, naming what is gained or lost

- **Given** a role change
- **When** the confirmation appears
- **Then** it states the effect in either direction — a promotion says they will be able to see and cancel everyone's bookings and manage desks and people; a demotion says they lose that and will be able to book a desk for themselves (SCR-008 ST-08)

### AC-03 The new role takes effect on what they can reach

- **Given** a person promoted to **Admin**
- **When** they next use the application
- **Then** the admin screens are available to them; and a person demoted to **Employee** is refused those screens and gains the booking screens instead (V-07, REQ-004)

### AC-04 Demoting the only active administrator is refused

- **Given** an account that is the only active **Admin**
- **When** a change to **Employee** is attempted, from the row menu or from the edit form
- **Then** it is **refused** — not warned about — because it would leave nobody able to manage desks, bookings or people, including nobody able to undo it (BR-001.11, V-11, SCR-008 ST-09, SCR-009 ST-05)

### AC-05 That refusal routes to the fix

- **Given** the last-admin refusal
- **When** it is shown
- **Then** its primary action takes the administrator to find somebody to promote, with the search field focused and ready for a name (SCR-008 ST-09)

### AC-06 There is no override

- **Given** the last-admin refusal
- **When** it is rendered
- **Then** no "I understand the risk" or force option exists — BR-001.11 is a rejection, not a warning (SCR-008 ST-09)

### AC-07 The rule counts active admins only

- **Given** two **Admin** accounts, one of them deactivated
- **When** the active one is demoted
- **Then** it is refused — a deactivated admin cannot sign in (REQ-005) and so does not count towards the safeguard (BR-001.11)

### AC-08 Both routes to a role change enforce it identically

- **Given** the row menu on **People** and the role control on the edit form
- **When** either is used to make the same change
- **Then** the same rule, the same refusal and the same confirmation wording apply — one rule, two doors (SCR-008 ST-08/ST-09, SCR-009 ST-05)

### AC-09 Nothing is shown as changed until it has

- **Given** a role change in flight
- **When** it is pending
- **Then** the row is not updated optimistically, the dialog stays open with its action busy, and Escape is suppressed — a role shown as changed that then fails would leave the administrator believing they had promoted somebody they had not (SCR-008 ST-12)

### AC-10 A failure says nothing changed

- **Given** a role change that fails for a reason that is not the refusal
- **When** the failure is reported
- **Then** the dialog stays open, the role is unchanged, and the message says so explicitly (SCR-008 ST-13)

### AC-11 Success updates the row and the admin count

- **Given** a successful role change
- **When** the list updates
- **Then** the row's role changes in place, the summary line's admin count changes with it, a transient message states the effect, and focus returns to the row's overflow trigger (SCR-008 ST-14)

### AC-12 A deactivated person's role can still be changed

- **Given** a deactivated account
- **When** its role action is used
- **Then** it is available and works — a deactivated person's role still decides what they come back to (SCR-008 ST-15)

### AC-13 Only administrators can change a role

- **Given** a signed-in Employee
- **When** they attempt to change any account's role, including their own
- **Then** it is refused (V-07)

## Edge cases

- An administrator demoting **themselves** while another active admin exists: permitted. They lose the admin screens immediately and become able to book a desk. BR-001.11 guards the count, not the identity.
- Two administrators demoting each other simultaneously: the safeguard must hold under concurrency, so the count is evaluated at the moment of the write, not from the list the screen was showing.
- Promoting somebody does **not** let them book a desk — REQ-004 gives one role, and Admin accounts cannot book (BRD-001 §10). The demotion wording in AC-02 says so from the other direction.
- Changing a role never touches the password and never marks the account administrator-set.

## UI

Served by **SCR-008 — People** (row menu route) and **SCR-009 — User form** (edit route), both approved in design step 2.

States exercised: SCR-008 **ST-08** role change confirmation · **ST-09** role change blocked — last active admin · **ST-12** action in progress · **ST-13** action failed · **ST-14** action succeeded · **ST-15** row menu open. SCR-009 **ST-05** role change would remove the last admin.

Design commitments this story must honour: the refusal names the consequence it prevented rather than quoting the rule; the primary action focuses the search field; no optimistic update; focus returns to the overflow trigger, which survives every one of these actions.

## QA notes

- AC-07 is the subtle half of BR-001.11 and the one a naive `count(role == Admin) > 1` check fails. Seed a deactivated admin.
- The concurrency case in Edge cases needs a server-side test: two simultaneous demotions must not both succeed.
- AC-08 means every AC here is tested twice, once per route. Worth it — the refusal exists on two screens by design.
- AC-11's admin count assertion is what makes US-020/AC-06's frozen summary line meaningful.
- Data setup: one active admin; two active admins; two admins with one deactivated; an employee to promote; a deactivated employee.

## API impacts

Needs a role-change endpoint, Admin-only, evaluating BR-001.11 transactionally at write time and returning the refusal distinguishably from a generic failure. Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet.

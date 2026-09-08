# BRD-001 — Employee Desk Booking System

> Approval = the PO/BA human reviewing + merging this document's PR (Gate 1). No approval headers — GitHub records who approved what.

|                  |                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Author**       | BA persona (AI draft) with Joy Joshua (PO/BA)                                                                                                                       |
| **Source input** | `inception/product/inputs/2026-09-07-desk-booking-brd-handover.md` (verbatim raw material), `inception/product/inputs/2026-09-08-ba-pending-items.md` (the REQ-029 / NFR-004 revision, verbatim) and `inception/product/inputs/2026-09-08-nfr-008-accessibility.md` (the NFR-008 change request, verbatim). Upstream inputs cited in the `Source` column are not present here — see open question #8. |
| **Related**      | EPIC-001 (filled when stories are drafted after design approval)                                                                                                     |

## 1. Business goal

Provide a web application so employees at a single hybrid office can reserve a specific desk before coming in, and so administrators can oversee bookings, maintain desk inventory, and manage user accounts for the office.

## 2. Actors

| Actor    | Description                                    | Needs                                                                                                                       |
| -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Employee | Staff member who works hybrid and books a desk | Sign in, replacing an administrator-set password with one of their own at first use (REQ-029); book/view/cancel desks; receive booking emails; optionally enable browser push for book/cancel                      |
| Admin    | Office administrator                           | Sign in; view/cancel all bookings; manage desks and users. Admins do **not** receive copies of booking emails (§10, decided 2026-09-07). |

## 3. Workflows

1. **Employee books a desk:** Employee signs in → selects a date (today through +30 days, working day, office timezone) → views desks by unique number with availability → selects one available desk → booking is created with status **Confirmed**.

2. **Employee reviews bookings:** Employee opens own bookings list → sees past and future bookings with status → can cancel today or future **Confirmed** bookings → cancelled bookings become **Cancelled**.

3. **Employee changes desk:** Employee cancels the existing booking for that date → books a different available desk for the same date (no direct desk swap on an existing booking).

4. **Admin monitors bookings:** Admin signs in → views all bookings → filters by date and/or status → can cancel a **Confirmed** booking on behalf of an employee for today or a future date.

5. **Booking completes:** When a **Confirmed** booking date passes in office local time without cancellation, status becomes **Completed**.

6. **Admin manages desks:** Admin signs in → views desk inventory → adds a desk with a unique number → edits desk number (when allowed) → activates or deactivates desks → inactive desks are excluded from employee booking availability.

7. **Admin manages users:** Admin signs in → views user list → creates a user (email, role, initial credentials) → edits user details → assigns **Employee** or **Admin** role → deactivates users → resets a user's password (admin-initiated, not self-service).

8. **Booking notifications (email):** When a booking becomes **Confirmed** or **Cancelled**, the system sends an email to the employee who owns the booking. For each **Confirmed** booking on a future working day, the system sends a reminder email at 08:00 office local time on the previous calendar day.

9. **Booking notifications (browser push, optional):** An Employee may opt in to browser push alerts. When opted in, the system sends a push notification on book and on cancel (employee-initiated or admin-initiated cancel of that employee's booking). Day-before reminders remain email only.

10. **First sign-in on an administrator-set password:** A user whose password was set by an Admin — at account creation or by an admin reset — signs in with it → the system requires a new password of the user's own choosing before anything else is reachable → on success the administrator-set password stops working and the user continues to workflow 1 (Employee) or workflow 4 (Admin). This step precedes workflows 1 and 4 for such accounts; it cannot be reached voluntarily.

## 4. Functional requirements

> Each REQ is testable (pass/fail decidable), prioritized MoSCoW, and sourced (input file or named person).
>
> `Source` values name the upstream discovery sessions recorded in the handover document. Those session files are not present in this repository (open question #8); `inception/product/inputs/2026-09-07-desk-booking-brd-handover.md` is the provenance held here.

| ID      | Requirement                                                                                                                                                                                    | Priority | Source                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------ |
| REQ-001 | The product is a browser-based web application for desk booking at one office location.                                                                                                        | Must     | 2026-08-13-client-discussion.md                  |
| REQ-002 | A user can sign in with email and password.                                                                                                                                                    | Must     | 2026-08-13-client-discussion.md                  |
| REQ-003 | A signed-in user can sign out.                                                                                                                                                                 | Must     | 2026-08-13-client-discussion.md                  |
| REQ-004 | The system assigns each user exactly one role: **Employee** or **Admin**.                                                                                                                      | Must     | 2026-08-13-client-discussion.md                  |
| REQ-005 | A user marked deactivated cannot sign in.                                                                                                                                                      | Must     | 2026-08-13-client-discussion.md                  |
| REQ-006 | An Employee can select a booking date from today through 30 calendar days ahead, calculated in the office local timezone.                                                                       | Must     | 2026-08-13-client-discussion.md                  |
| REQ-007 | For a selected date, an Employee can view desk availability where each desk is identified by a unique desk number (e.g. A-01, B-02).                                                            | Must     | 2026-08-13-client-discussion.md, PO/BA interview |
| REQ-008 | An Employee can book exactly one available desk for one selected date.                                                                                                                         | Must     | 2026-08-13-client-discussion.md                  |
| REQ-009 | An Employee can view a list of their own bookings, including past and future dates.                                                                                                            | Must     | 2026-08-13-client-discussion.md                  |
| REQ-010 | An Employee can cancel their own booking for today or a future date; past bookings cannot be cancelled by the Employee.                                                                         | Must     | 2026-08-13-client-discussion.md, PO/BA interview |
| REQ-011 | An Admin can view all bookings across employees.                                                                                                                                               | Must     | 2026-08-13-client-discussion.md                  |
| REQ-012 | An Admin can filter all bookings by date.                                                                                                                                                      | Must     | 2026-08-13-client-discussion.md                  |
| REQ-013 | An Admin can filter all bookings by status (**Confirmed**, **Cancelled**, or **Completed**).                                                                                                   | Must     | 2026-08-13-client-discussion.md, PO/BA interview |
| REQ-014 | An Admin can cancel an Employee's booking on their behalf for today or a future date; past bookings cannot be cancelled by the Admin.                                                           | Must     | 2026-08-13-client-discussion.md, PO/BA interview |
| REQ-015 | An Admin can add a new desk identified by a unique desk number.                                                                                                                                | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-016 | An Admin can edit an existing desk's desk number, subject to uniqueness validation.                                                                                                            | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-017 | An Admin can activate or deactivate a desk; **Inactive** desks must not appear in employee booking availability.                                                                               | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-018 | An Admin can create a user account with email, name, role (**Employee** or **Admin**), and an initial password set by the Admin.                                                                | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-019 | An Admin can edit a user's name and email.                                                                                                                                                     | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-020 | An Admin can deactivate a user account; deactivated users cannot sign in (see REQ-005).                                                                                                        | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-021 | An Admin can reset a user's password (admin-initiated); this is not a self-service forgot-password flow.                                                                                       | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-022 | An Admin can assign or change a user's role between **Employee** and **Admin**.                                                                                                                | Must     | 2026-08-14-admin-provisioning.md                 |
| REQ-023 | When a booking is created with status **Confirmed**, the system sends a confirmation email to the booking owner at their account email address.                                                 | Must     | 2026-08-14-notifications.md                      |
| REQ-024 | When a booking becomes **Cancelled**, the system sends a cancellation email to the booking owner at their account email address.                                                                | Must     | 2026-08-14-notifications.md                      |
| REQ-025 | For each **Confirmed** booking on a future working day, the system sends a reminder email to the booking owner on the calendar day immediately before the booking date (office local timezone). | Must     | 2026-08-14-notifications.md                      |
| REQ-026 | An Employee can opt in to or opt out of browser push notifications for booking events; default is opt-out.                                                                                      | Must     | 2026-08-14-notifications.md                      |
| REQ-027 | When an Employee has opted in to browser push, the system sends a push notification on **Confirmed** (book) and **Cancelled** events for that Employee's bookings.                              | Must     | 2026-08-14-notifications.md                      |
| REQ-028 | When a **Confirmed** booking's date has passed in office local time without cancellation, the booking is presented to Employees and Admins, and is filterable by Admins, as **Completed**.      | Must     | PO/BA decision 2026-09-07 (open question #9)     |
| REQ-029 | A user whose current password was set by an Admin — at account creation (REQ-018) or by an admin reset (REQ-021) — must replace it with a password of their own choosing at the next successful sign-in, before any other application function is reachable.       | Must     | PO/BA decision 2026-09-07 (SCR-010 conflict #1); 2026-09-08-ba-pending-items.md |

## 5. Non-functional requirements

| ID      | Category      | Requirement (quantified or `TBD (owner)`)                                                                                  | Priority |
| ------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| NFR-001 | Locale/time   | All booking dates and the "today" boundary use the office local timezone.                                                  | Must     |
| NFR-002 | Scope         | The application supports exactly one office location in this release.                                                      | Must     |
| NFR-003 | Security      | Sign-in credentials are protected in transit (HTTPS in deployed environments).                                             | Must     |
| NFR-004 | Usability     | The web UI must be usable on both mobile and desktop browsers (responsive layout); every screen is verified at **360px, 768px and 1280px** viewport widths, with no horizontal page scrolling at any of the three. | Must     |
| NFR-005 | Notifications | Transactional emails (book, cancel, reminder) must be sent reliably; failed sends must be logged for operational follow-up. | Must     |
| NFR-006 | Notifications | Browser push requires user opt-in and supported browser permission; unsupported browsers degrade gracefully (email only).   | Must     |
| NFR-007 | Config        | The transactional email sender address and mail service are configuration values, never hard-coded; production values are `TBD (owner: IT)` and required before go-live. | Must     |
| NFR-008 | Accessibility | Colour is never the only signal: every status pair carries an icon or a label, never colour alone. Keyboard operability and visible focus are specified per screen, not assumed. Text-on-surface token pairs meet WCAG AA 4.5:1 in both themes. | Must     |

> **NFR-008 wording and number.** The text is the AI-DLC framework's own rule, carried over verbatim from `ai/roles/ux.md`, `ai/templates/screen-spec.md`, `ai/quality/review-checklist.md` and the design README (PO decision 2026-09-08, [issue #7](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/7)). Two deliberate departures: **the number** — the framework calls this rule NFR-003 throughout, which here is the HTTPS requirement, and that collision is what caused seven screen specs to cite a "design standard" document that does not exist; and **the contrast figure** — the framework commits to 4.5:1 text-on-surface, which `aidlc-check` enforces, so the 3:1 `--c-border-control` token added in design pass 2b for form-field boundaries (WCAG 1.4.11) exceeds this requirement rather than being obliged by it. All ten approved screens already comply; this records the rule they comply with, and changes no screen, state, or flow. Full provenance: [`inputs/2026-09-08-nfr-008-accessibility.md`](../inputs/2026-09-08-nfr-008-accessibility.md).

> **NFR-004 verification widths.** The three widths are the three responsive shells defined in the [information architecture](../../design/ia.md): 360px exercises the bottom-bar shell, 768px the collapsed icon-only sidebar, and 1280px the persistent sidebar. 768px was added on 2026-09-08 (open question #11) because the middle shell carries layout behaviour no other width tests — the admin tables on SCR-005, SCR-006 and SCR-008 become stacked cards, SCR-003 shows a five-day date strip instead of seven, and SCR-004 narrows its content column to 520px. Verified at 360px and 1280px only, those commitments would ship untested.

## 6. Business rules

### BR-001.1 One desk per employee per working day

- **Statement:** When an Employee attempts to create a booking, the system must reject the request if that Employee already has a **Confirmed** booking for the same calendar date (office local timezone).
- **Rationale:** Prevents double-booking and matches hybrid office policy of one seat per person per day.
- **Examples:** Pass — Employee with no booking on 2026-08-20 books desk A-01. Fail — Employee with **Confirmed** booking on 2026-08-20 attempts to book desk B-02 the same date.
- **Affects:** REQ-008

### BR-001.2 Change desk by cancel-then-book

- **Statement:** When an Employee wants a different desk on a date they already booked, the system must require cancellation of the existing **Confirmed** booking before a new booking for that date can be created.
- **Rationale:** Client chose explicit cancel-then-book over in-place desk changes.
- **Examples:** Pass — Employee cancels A-01 for Tuesday, then books B-02 for Tuesday. Fail — Employee attempts to change A-01 to B-02 on the same booking record without cancelling.
- **Affects:** REQ-008, REQ-010

### BR-001.3 Working-day booking window

- **Statement:** When an Employee or Admin selects or creates a booking date, the system must allow only Monday–Friday dates; Saturday and Sunday are not bookable.
- **Rationale:** Hybrid office operates on standard working days; weekends are out of scope for booking.
- **Examples:** Pass — booking created for a Wednesday. Fail — booking attempted for a Saturday within the +30-day window.
- **Affects:** REQ-006, REQ-008

### BR-001.4 Unique desk numbers

- **Statement:** When desks are presented for booking, each desk must display a unique identifier in the form of an alphanumeric desk number (e.g. A-01, B-02, C-05).
- **Rationale:** Employees choose a specific desk; labels must be unambiguous.
- **Examples:** Pass — availability list shows "A-01" and "B-02" as distinct selectable desks. Fail — two desks share the same displayed number.
- **Affects:** REQ-007, REQ-008

### BR-001.5 Booking status lifecycle

- **Statement:** Every booking must be in exactly one status: **Confirmed** (active future or current-day reservation), **Cancelled** (voided before use), or **Completed** (the booking date has passed without cancellation). A **Confirmed** booking whose date has passed in office local time must be presented and filterable as **Completed**.
- **Rationale:** Admin filtering and reporting depend on a shared status vocabulary agreed with the client.
- **Examples:** Pass — past **Confirmed** booking shown as **Completed** after the date. Fail — booking remains **Confirmed** indefinitely after the date passes.
- **Affects:** REQ-009, REQ-011, REQ-012, REQ-013, REQ-028
- **Note:** whether the Confirmed → Completed transition is a stored state change or derived at read time is a design/architecture decision, not a business one. That it happens is now stated as **REQ-028** (decided 2026-09-07, open question #9).

### BR-001.6 Cancellation eligibility

- **Statement:** When a user (Employee or Admin) attempts to cancel a booking, the system must allow cancellation only if the booking date is today or in the future (office local timezone) and the current status is **Confirmed**; past-date **Confirmed** or **Completed** bookings cannot be cancelled.
- **Rationale:** Aligns employee and admin cancellation rules from client clarification.
- **Examples:** Pass — Admin cancels Employee's booking for tomorrow. Fail — Employee cancels a booking dated yesterday.
- **Affects:** REQ-010, REQ-014

### BR-001.7 Inactive desks excluded from booking

- **Statement:** When a desk is **Inactive**, the system must exclude it from employee availability for all dates and must reject new bookings against that desk.
- **Rationale:** Deactivation retires a desk from the bookable pool without deleting history.
- **Examples:** Pass — Employee availability list shows only **Active** desks. Fail — Employee books an **Inactive** desk.
- **Affects:** REQ-007, REQ-008, REQ-017

### BR-001.8 Desk number uniqueness on create and edit

- **Statement:** When an Admin adds or edits a desk, the system must reject duplicate desk numbers (case-normalized comparison per implementation).
- **Rationale:** BR-001.4 requires unambiguous desk identifiers.
- **Examples:** Pass — Admin adds A-12 when A-12 does not exist. Fail — Admin adds A-12 when A-12 already exists.
- **Affects:** REQ-015, REQ-016, BR-001.4

### BR-001.9 Deactivate desk with future bookings

- **Statement:** When an Admin attempts to deactivate a desk that has one or more **Confirmed** bookings dated today or later, the system must reject the deactivation and report how many such bookings exist. Deactivation succeeds only once every one of those bookings has been cancelled. The system must not cancel bookings as part of the deactivate action.
- **Rationale:** Prevents employees holding reservations on desks removed from service without notice, and forces the Admin to see who they displace before the desk disappears.
- **Examples:** Pass — Admin deactivates B-03 with no **Confirmed** bookings dated today or later. Fail — Admin deactivates B-03 while a **Confirmed** booking exists for next Tuesday. Fail — deactivation succeeds and silently cancels that booking.
- **Affects:** REQ-017, REQ-014
- **Decided:** 2026-09-07 (PO/BA, open question #6) — hard block, chosen over cancelling the affected bookings inside the deactivate action.

### BR-001.10 User email uniqueness

- **Statement:** When an Admin creates or edits a user, the system must reject duplicate email addresses across all accounts.
- **Rationale:** Email is the sign-in identifier (REQ-002).
- **Examples:** Pass — Admin creates jane@company.com when unused. Fail — Admin creates a second account with the same email.
- **Affects:** REQ-018, REQ-019

### BR-001.11 Last active Admin safeguard

- **Statement:** When an Admin attempts to deactivate an account or change a role such that zero **Admin** users would remain active, the system must reject the action.
- **Rationale:** Prevents locking the organization out of admin functions.
- **Examples:** Pass — Two active Admins; one is deactivated. Fail — Only one active Admin remains and that account is deactivated.
- **Affects:** REQ-020, REQ-022

### BR-001.12 Admin password reset delivery

- **Statement:** When an Admin resets a user's password, the system must set a new password and display it once to the Admin in the application (copy-to-clipboard encouraged); the system must not email the password to the user unless a separate requirement is approved.
- **Rationale:** REQ-021 is admin-initiated; email delivery of credentials is explicitly out of scope (§10).
- **Examples:** Pass — Admin resets password; new temporary value shown once on screen. Fail — Password change with no feedback to the Admin performing the reset.
- **Affects:** REQ-021

### BR-001.13 Mandatory booking emails

- **Statement:** When a booking transitions to **Confirmed** or **Cancelled**, the system must send the corresponding email (REQ-023, REQ-024) to the booking owner's account email without requiring user opt-in.
- **Rationale:** Email is the primary notification channel agreed for this release.
- **Examples:** Pass — Employee books desk A-01; confirmation email sent. Fail — Booking confirmed with no email attempted.
- **Affects:** REQ-023, REQ-024

### BR-001.14 Day-before reminder email

- **Statement:** When a **Confirmed** booking date is a future working day (Mon–Fri, office local timezone), the system must send one reminder email at **08:00 office local time** on the previous calendar day; no reminder is sent for same-day bookings or for **Cancelled**/**Completed** bookings.
- **Rationale:** Reduces no-shows; the reminder lands as the working day starts, leaving the recipient a full day to cancel. Both "day-before" and 08:00 are defined in office local time (PO/BA, 2026-09-07).
- **Examples:** Pass — **Confirmed** booking for Wed 20 Aug; reminder sent 08:00 Tue 19 Aug office time. Fail — reminder sent for a **Cancelled** booking. Fail — reminder sent at 08:00 UTC while the office is not on UTC.
- **Affects:** REQ-025, BR-001.3, NFR-001

### BR-001.15 Browser push opt-in only

- **Statement:** Browser push for book/cancel events must be disabled until the Employee explicitly opts in (REQ-026); opting out must stop subsequent push notifications without affecting email notifications.
- **Rationale:** Push is optional per client request; email remains the reliable channel.
- **Examples:** Pass — Employee enables push; receives push on next booking. Fail — Push sent to Employee who never opted in.
- **Affects:** REQ-026, REQ-027

### BR-001.16 Push scope excludes reminders

- **Statement:** Day-before reminder notifications must be delivered by email only; browser push must not be used for reminders in this release.
- **Rationale:** Client specified push for book/cancel only.
- **Examples:** Pass — Reminder email sent; no push for reminder. Fail — Push notification for day-before reminder.
- **Affects:** REQ-025, REQ-027

### BR-001.17 Forced password change on an administrator-set password

- **Statement:** An account whose current password was set by an Admin — at creation (REQ-018) or by reset (REQ-021) — must be marked as administrator-set. On the next successful sign-in of such an account, the system must require a new password before granting access to any other function. The new password must satisfy V-12 and must not equal the administrator-set password. On success the mark clears and the administrator-set password stops working immediately. Until it succeeds the administrator-set password remains valid, so signing out or abandoning the step cannot lock the account holder out.
- **Rationale:** REQ-018 and REQ-021 leave the Admin who set the password holding a working credential for another person's account indefinitely — including after they cease to be an Admin. With no self-service reset in this release (§10), the forced change at first use is the only point at which the account holder takes sole possession of their credential.
- **Examples:** Pass — a new starter signs in with the password their Admin gave them, is required to choose a new one, and then reaches their bookings. Pass — that user signs out without choosing one; the administrator-set password still works next time and the change is required again. Fail — a user with an administrator-set password reaches any other screen without changing it. Fail — a new password is accepted when it equals the administrator-set one. Fail — the administrator-set password still signs the user in after a successful change.
- **Affects:** REQ-002, REQ-018, REQ-021, REQ-029, V-12

## 7. Validations

| Validation | Rule                                                                              | Related                                                                           |
| ---------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| V-01       | Sign-in rejected for unknown credentials or deactivated account                   | REQ-002, REQ-005                                                                  |
| V-02       | Selected date must be ≥ today and ≤ today + 30 days (office local timezone)       | REQ-006                                                                           |
| V-03       | Selected date must be a working day (Mon–Fri)                                     | BR-001.3                                                                          |
| V-04       | Selected desk must be available (not **Confirmed** by another user) for that date | REQ-008                                                                           |
| V-05       | Employee must not already hold a **Confirmed** booking for the same date          | BR-001.1                                                                          |
| V-06       | Cancellation only on **Confirmed** bookings for today or future dates             | BR-001.6                                                                          |
| V-07       | Admin-only actions require **Admin** role                                         | REQ-004, REQ-011–REQ-022                                                          |
| V-08       | Desk number must be unique on add/edit                                            | REQ-015, REQ-016, BR-001.8                                                        |
| V-09       | Deactivation rejected while any **Confirmed** booking dated today or later exists on that desk | REQ-017, BR-001.9                                            |
| V-10       | User email must be unique on create/edit                                          | REQ-018, REQ-019, BR-001.10                                                       |
| V-11       | Cannot remove the last active **Admin**                                           | REQ-020, REQ-022, BR-001.11                                                       |
| V-12       | Password must meet minimum length/complexity policy on create and reset           | REQ-018, REQ-021 — **min 8 chars; upper, lower, digit, special** (PO/security, 2026-08-21) |
| V-13       | Email notifications include desk number and booking date                          | REQ-023, REQ-024, REQ-025                                                         |
| V-14       | Push notifications only when user opt-in flag is true                             | REQ-026, REQ-027, BR-001.15                                                       |
| V-15       | Forced password change: the new password meets V-12 **and** must not equal the administrator-set password | REQ-029, BR-001.17                                     |

## 8. Constraints

- Single office location only (no multi-site routing or selection).
- Email/password authentication only; no SSO or social login in this release.
- Desk inventory and user accounts are maintained in-app by Admins (REQ-015–REQ-022); initial bootstrap of the first Admin account: **DbInitializer seed when no users exist** (PO/Architect, 2026-08-21).
- Company public holidays are **out of scope for this release** (decided 2026-09-07, open question #2); only the weekend exclusion (BR-001.3) applies. A desk booked on a public holiday simply goes unused.

## 9. Risks

| ID       | Risk                                                                                   | Likelihood | Impact | Mitigation                                                                            |
| -------- | -------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------- |
| RISK-001 | Admin provisioning expands delivery surface (CRUD, validation, audit).                 | Medium     | Medium | UX derives the admin screens from the IA; Architect addresses data model; slice stories after design merge. |
| RISK-002 | Holidays deliberately out of scope — an employee may book a desk on a company holiday.  | Medium     | Low    | Accepted 2026-09-07: the office is closed, the desk goes unused, nothing is lost. Revisit if it becomes a nuisance in service. |
| RISK-003 | No self-service password reset; employees depend on Admin for password help.           | Medium     | Low    | REQ-021 admin reset; self-service remains out of scope per §10.                       |
| RISK-004 | Concurrent booking of the same desk could cause double-booking without proper locking. | Low        | High   | Address in architecture/delivery (not a BA design decision).                          |
| RISK-005 | Admin displays new password on screen — shoulder-surfing / log exposure if mishandled. | Low        | Medium | Show once + copy; UX warning copy; no password in persistent audit log; the forced change (REQ-029) closes the window at the owner's next sign-in.               |
| RISK-006 | Email delivery failures (wrong address, SMTP outage) leave users uninformed.           | Medium     | Medium | Log failures (NFR-005); operational monitoring; valid email on user create (REQ-018). |
| RISK-007 | Browser push permission denied or unsupported — user expects alerts.                   | Medium     | Low    | Clear UX that push is optional; email always sent (BR-001.13).                        |
| RISK-008 | Upstream discovery inputs are not in this repository, so no REQ can be traced back to the client's own words. | High | Medium | Open action (owner: Joy Joshua, raised 2026-09-07): search for the three session files; if unrecoverable, re-point every `Source` value at the handover input. Must close before Gate 2. |
| RISK-009 | The forced password change (REQ-029) stands between a new starter and the product, so a failure there blocks all access on someone's first morning. | Low | Medium | BR-001.17 keeps the administrator-set password valid until the change succeeds and leaves sign-out available, so an outage cannot strand a user (SCR-010 ST-06). |

## 10. Out of scope

- Forgot-password / **self-service** password reset (client confirmed for current stage). Admin-initiated reset is **in scope** (REQ-021).
- Email delivery of **passwords** or **admin account credentials** (separate from booking transactional email).
- SMS or mobile-app push notifications.
- Browser push for day-before reminders (email only per BR-001.16).
- User opt-out of mandatory booking emails (emails on book/cancel/reminder are always sent per REQ-023–REQ-025).
- Booking more than one desk per employee per day.
- In-place desk swap without cancellation.
- Multi-office or multi-location support.
- Weekend desk booking (Saturday/Sunday).
- Company public holiday exclusion — only Saturday and Sunday are blocked (open question #2, decided 2026-09-07).
- Admin copies of booking, cancellation, or reminder emails — those go to the booking owner only (open question #10, decided 2026-09-07).
- **Voluntary** password change — a "change my password" option for a user who simply wants a new one. The only password change in this release is the forced one on an administrator-set credential (REQ-029); offering a voluntary route would reintroduce the self-service reset excluded above (raised by SCR-010, 2026-09-08).
- Visitor desk booking on behalf of others by Employees (one desk per employee per day only).

## 11. Open questions

| #   | Question                                                                                                                                                                 | Owner        | Status                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------- |
| 1   | How is the first Admin account created before any Admin exists in the app (seed script, installer, manual database)?                                                      | PO/Architect | **Resolved** — DbInitializer seeds Admin when no users (2026-08-21)   |
| 2   | How is the company holiday calendar defined and maintained so working-day rules exclude public holidays?                                                                                  | PO/client    | **Resolved** — out of scope this release; weekends only (2026-09-07) |
| 3   | What time of day should the day-before reminder email be sent (office local timezone)?                                                                                                    | PO/client    | **Resolved** — 08:00 office local (2026-09-07)                       |
| 4   | Must the web UI support mobile browsers in this release, or desktop-only?                                                                                                                 | PO/client    | **Resolved** — responsive: mobile and desktop (2026-09-07); NFR-004 now testable, UX unblocked |
| 5   | Minimum password length/complexity for create and reset (V-12)?                                                                                                           | PO/security  | **Resolved** — min 8 chars; upper, lower, digit, special (2026-08-21) |
| 6   | When deactivating a desk with future bookings, must the Admin cancel all affected bookings in one step, or block until manually cleared?                                                   | PO/client    | **Resolved** — hard block; BR-001.9 rewritten (2026-09-07)           |
| 7   | Approved sender address / email domain and SMTP service for transactional mail?                                                                                                           | PO/IT        | **Resolved (approach)** — configuration, not hard-coded (NFR-007); production value `TBD (owner: IT)` before go-live |
| 8   | The three upstream discovery inputs cited in the `Source` column are not in this repository. Recover them, or re-confirm the requirement set with the client?                              | Joy Joshua   | **Open action** — search for the notes; if unrecoverable, re-point `Source` at the handover input. Close before Gate 2 |
| 9   | The Confirmed → Completed transition is stated in workflow 5 and BR-001.5 but has no functional REQ of its own. Promote it to a REQ so it is scheduled and tested?                         | PO/BA        | **Resolved** — promoted to REQ-028 (2026-09-07)                      |
| 10  | The actor table says Admins receive booking emails "where applicable", but REQ-023–REQ-025 send only to the booking owner. Do Admins get a copy of any booking email?                      | PO/client    | **Resolved** — no Admin copies (2026-09-07)                          |
| 11  | The information architecture defines three responsive shells (≥1024px, 768–1023px, <768px), but NFR-004 named only 360px and 1280px as verification widths — leaving the middle shell designed and untested. Add 768px, or drop the shell?                     | PO/BA        | **Resolved** — NFR-004 gains **768px** as a third verification width (2026-09-08); the 768–1023px collapsed sidebar stays as designed |
| 12  | SCR-010 (Set your password) rests on the 2026-09-07 decision that an administrator-set password must be replaced by its owner at first use, but BRD-001 carried no requirement for it. Codify it?                                                              | PO/BA        | **Resolved** — promoted to **REQ-029**, with BR-001.17 and V-15 (2026-09-08) |
| 13  | All ten approved screen specs are designed against a non-colour-signalling rule they cite as "NFR-003 of the design standard" — but no design standard document exists in this repository, and BRD-001's NFR-003 is the HTTPS requirement. The accessibility commitment the design rests on traces to nothing approved. Codify it?                    | PO/BA        | **Resolved** — promoted to **NFR-008** (2026-09-08), using the AI-DLC framework's own wording per PO decision on [issue #7](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/7). Numbered 008 because the framework's NFR-003 is taken here. Surfaced while reverting six wrong NFR-003 screen edges introduced by PR #6 |

# Raw input — Employee Desk Booking System requirements handover

|                       |                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------- |
| **Date received**     | 2026-09-07                                                                         |
| **Source**            | PO/BA human (joy_j@trigent.com), pasted into the BA session                        |
| **Original filename** | `1_Business_Requirements_Employee_Desk_Booking_System.docx.md`                      |
| **Form**              | A previously drafted BRD, handed over as the starting material for this repository |

## Provenance note

The handed-over document cites three upstream discovery inputs:

- `inception/product/inputs/2026-08-13-client-discussion.md`
- `inception/product/inputs/2026-08-14-admin-provisioning.md`
- `inception/product/inputs/2026-08-14-notifications.md`

**None of those three files exist in this repository.** They were produced in a prior
workspace and were not carried over. This file is therefore the earliest provenance this
repository holds for the requirements below. The `Source` column in `BRD-001` preserves the
original attributions verbatim so the chain back to the client discussions is not lost, but
those cited files cannot be opened from here. Recovering them — or re-confirming the
requirements with the client — is tracked as open question #8 in the BRD.

Two decisions in the document are attributed to sessions dated 2026-08-21 (password policy,
first-Admin bootstrap) and are likewise not backed by any file present here.

## Document as received

Reproduced without change to content. Character-encoding artifacts introduced by the
document conversion (arrows, en/em dashes and comparison operators rendered as mojibake
sequences) have been restored to the characters they stood for. No wording, number, ID or
table cell was otherwise altered.

---
>
> # Business Requirements Document (BRD)
>
> # Employee Desk Booking System
>
> Approval = the PO/BA human reviewing + merging this document's PR (Gate 1). No approval headers — GitHub records who approved what.
>
> | Author           | BA persona (AI draft) with PO/BA human                                                                                                                                    |
> | :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | **Source input** | inception/product/inputs/2026-08-13-client-discussion.md, inception/product/inputs/2026-08-14-admin-provisioning.md, inception/product/inputs/2026-08-14-notifications.md |
> | **Related**      | EPIC-001 (filled when stories are drafted after design approval)                                                                                                          |
>
> ## 1. Business goal
>
> Provide a web application so employees at a single hybrid office can reserve a specific desk before coming in, and so administrators can oversee bookings, maintain desk inventory, and manage user accounts for the office.
>
> ## 2. Actors
>
> | Actor    | Description                                    | Needs                                                                                                                                     |
> | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
> | Employee | Staff member who works hybrid and books a desk | Sign in, book/view/cancel desks; receive booking emails; optionally enable browser push for book/cancel                                    |
> | Admin    | Office administrator                           | Sign in; view/cancel all bookings; manage desks and users; receive same booking emails when acting on behalf of employees where applicable |
>
> ## 3. Workflows
>
> 1. **Employee books a desk:** Employee signs in → selects a date (today through +30 days, working day, office timezone) → views desks by unique number with availability → selects one available desk → booking is created with status **Confirmed**.
>
> 2. **Employee reviews bookings:** Employee opens own bookings list → sees past and future bookings with status → can cancel today or future **Confirmed** bookings → cancelled bookings become **Cancelled**.
>
> 3. **Employee changes desk:** Employee cancels the existing booking for that date → books a different available desk for the same date (no direct desk swap on an existing booking).
>
> 4. **Admin monitors bookings:** Admin signs in → views all bookings → filters by date and/or status → can cancel a **Confirmed** booking on behalf of an employee for today or a future date.
>
> 5. **Booking completes:** When a **Confirmed** booking date passes in office local time without cancellation, status becomes **Completed**.
>
> 6. **Admin manages desks:** Admin signs in → views desk inventory → adds a desk with a unique number → edits desk number (when allowed) → activates or deactivates desks → inactive desks are excluded from employee booking availability.
>
> 7. **Admin manages users:** Admin signs in → views user list → creates a user (email, role, initial credentials) → edits user details → assigns **Employee** or **Admin** role → deactivates users → resets a user's password (admin-initiated, not self-service).
>
> 8. **Booking notifications (email):** When a booking becomes **Confirmed** or **Cancelled**, the system sends an email to the employee who owns the booking. For each **Confirmed** booking on a future working day, the system sends a reminder email on the previous calendar day (office local timezone).
>
> 9. **Booking notifications (browser push, optional):** An Employee may opt in to browser push alerts. When opted in, the system sends a push notification on book and on cancel (employee-initiated or admin-initiated cancel of that employee's booking). Day-before reminders remain email only.
>
> ## 4. Functional requirements
>
> Each REQ is testable (pass/fail decidable), prioritized MoSCoW, and sourced (input file or named person).
>
> | ID      | Requirement                                                                                                                                                                        | Priority | Source                                            |
> | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------- |
> | REQ-001 | The product is a browser-based web application for desk booking at one office location.                                                                                            | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-002 | A user can sign in with email and password.                                                                                                                                        | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-003 | A signed-in user can sign out.                                                                                                                                                     | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-004 | The system assigns each user exactly one role: **Employee** or **Admin**.                                                                                                          | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-005 | A user marked deactivated cannot sign in.                                                                                                                                          | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-006 | An Employee can select a booking date from today through 30 calendar days ahead, calculated in the office local timezone.                                                           | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-007 | For a selected date, an Employee can view desk availability where each desk is identified by a unique desk number (e.g. A-01, B-02).                                                | Must     | 2026-08-13-client-discussion.md, PO/BA interview  |
> | REQ-008 | An Employee can book exactly one available desk for one selected date.                                                                                                             | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-009 | An Employee can view a list of their own bookings, including past and future dates.                                                                                                | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-010 | An Employee can cancel their own booking for today or a future date; past bookings cannot be cancelled by the Employee.                                                             | Must     | 2026-08-13-client-discussion.md, PO/BA interview  |
> | REQ-011 | An Admin can view all bookings across employees.                                                                                                                                   | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-012 | An Admin can filter all bookings by date.                                                                                                                                          | Must     | 2026-08-13-client-discussion.md                   |
> | REQ-013 | An Admin can filter all bookings by status (**Confirmed**, **Cancelled**, or **Completed**).                                                                                       | Must     | 2026-08-13-client-discussion.md, PO/BA interview  |
> | REQ-014 | An Admin can cancel an Employee's booking on their behalf for today or a future date; past bookings cannot be cancelled by the Admin.                                               | Must     | 2026-08-13-client-discussion.md, PO/BA interview  |
> | REQ-015 | An Admin can add a new desk identified by a unique desk number.                                                                                                                    | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-016 | An Admin can edit an existing desk's desk number, subject to uniqueness validation.                                                                                                | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-017 | An Admin can activate or deactivate a desk; **Inactive** desks must not appear in employee booking availability.                                                                   | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-018 | An Admin can create a user account with email, name, role (**Employee** or **Admin**), and an initial password set by the Admin.                                                    | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-019 | An Admin can edit a user's name and email.                                                                                                                                         | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-020 | An Admin can deactivate a user account; deactivated users cannot sign in (see REQ-005).                                                                                            | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-021 | An Admin can reset a user's password (admin-initiated); this is not a self-service forgot-password flow.                                                                           | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-022 | An Admin can assign or change a user's role between **Employee** and **Admin**.                                                                                                    | Must     | 2026-08-14-admin-provisioning.md                  |
> | REQ-023 | When a booking is created with status **Confirmed**, the system sends a confirmation email to the booking owner at their account email address.                                     | Must     | 2026-08-14-notifications.md                       |
> | REQ-024 | When a booking becomes **Cancelled**, the system sends a cancellation email to the booking owner at their account email address.                                                    | Must     | 2026-08-14-notifications.md                       |
> | REQ-025 | For each **Confirmed** booking on a future working day, the system sends a reminder email to the booking owner on the calendar day immediately before the booking date (office local timezone). | Must     | 2026-08-14-notifications.md                       |
> | REQ-026 | An Employee can opt in to or opt out of browser push notifications for booking events; default is opt-out.                                                                          | Must     | 2026-08-14-notifications.md                       |
> | REQ-027 | When an Employee has opted in to browser push, the system sends a push notification on **Confirmed** (book) and **Cancelled** events for that Employee's bookings.                  | Must     | 2026-08-14-notifications.md                       |
>
> ## 5. Non-functional requirements
>
> | ID      | Category    | Requirement (quantified or TBD (owner))                                                                                       | Priority |
> | ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
> | NFR-001 | Locale/time | All booking dates and the "today" boundary use the office local timezone.                                                     | Must     |
> | NFR-002 | Scope       | The application supports exactly one office location in this release.                                                         | Must     |
> | NFR-003 | Security    | Sign-in credentials are protected in transit (HTTPS in deployed environments).                                                | Must     |
> | NFR-004 | Usability   | Target device support (desktop-only vs mobile-responsive web): TBD (owner: PO/client)                                         | Should   |
> | NFR-005 | Notifications | Transactional emails (book, cancel, reminder) must be sent reliably; failed sends must be logged for operational follow-up.  | Must     |
> | NFR-006 | Notifications | Browser push requires user opt-in and supported browser permission; unsupported browsers degrade gracefully (email only).    | Must     |
>
> ## 6. Business rules
>
> ### BR-001.1 One desk per employee per working day
>
> - **Statement:** When an Employee attempts to create a booking, the system must reject the request if that Employee already has a **Confirmed** booking for the same calendar date (office local timezone).
> - **Rationale:** Prevents double-booking and matches hybrid office policy of one seat per person per day.
> - **Examples:** Pass — Employee with no booking on 2026-08-20 books desk A-01. Fail — Employee with **Confirmed** booking on 2026-08-20 attempts to book desk B-02 the same date.
> - **Affects:** REQ-008
>
> ### BR-001.2 Change desk by cancel-then-book
>
> - **Statement:** When an Employee wants a different desk on a date they already booked, the system must require cancellation of the existing **Confirmed** booking before a new booking for that date can be created.
> - **Rationale:** Client chose explicit cancel-then-book over in-place desk changes.
> - **Examples:** Pass — Employee cancels A-01 for Tuesday, then books B-02 for Tuesday. Fail — Employee attempts to change A-01 to B-02 on the same booking record without cancelling.
> - **Affects:** REQ-008, REQ-010
>
> ### BR-001.3 Working-day booking window
>
> - **Statement:** When an Employee or Admin selects or creates a booking date, the system must allow only Monday–Friday dates; Saturday and Sunday are not bookable.
> - **Rationale:** Hybrid office operates on standard working days; weekends are out of scope for booking.
> - **Examples:** Pass — booking created for a Wednesday. Fail — booking attempted for a Saturday within the +30-day window.
> - **Affects:** REQ-006, REQ-008
>
> ### BR-001.4 Unique desk numbers
>
> - **Statement:** When desks are presented for booking, each desk must display a unique identifier in the form of an alphanumeric desk number (e.g. A-01, B-02, C-05).
> - **Rationale:** Employees choose a specific desk; labels must be unambiguous.
> - **Examples:** Pass — availability list shows "A-01" and "B-02" as distinct selectable desks. Fail — two desks share the same displayed number.
> - **Affects:** REQ-007, REQ-008
>
> ### BR-001.5 Booking status lifecycle
>
> - **Statement:** Every booking must be in exactly one status: **Confirmed** (active future or current-day reservation), **Cancelled** (voided before use), or **Completed** (the booking date has passed without cancellation).
> - **Rationale:** Admin filtering and reporting depend on a shared status vocabulary agreed with the client.
> - **Examples:** Pass — past **Confirmed** booking automatically shown as **Completed** after the date. Fail — booking remains **Confirmed** indefinitely after the date passes.
> - **Affects:** REQ-009, REQ-011, REQ-012, REQ-013
>
> ### BR-001.6 Cancellation eligibility
>
> - **Statement:** When a user (Employee or Admin) attempts to cancel a booking, the system must allow cancellation only if the booking date is today or in the future (office local timezone) and the current status is **Confirmed**; past-date **Confirmed** or **Completed** bookings cannot be cancelled.
> - **Rationale:** Aligns employee and admin cancellation rules from client clarification.
> - **Examples:** Pass — Admin cancels Employee's booking for tomorrow. Fail — Employee cancels a booking dated yesterday.
> - **Affects:** REQ-010, REQ-014
>
> ### BR-001.7 Inactive desks excluded from booking
>
> - **Statement:** When a desk is **Inactive**, the system must exclude it from employee availability for all dates and must reject new bookings against that desk.
> - **Rationale:** Deactivation retires a desk from the bookable pool without deleting history.
> - **Examples:** Pass — Employee availability list shows only **Active** desks. Fail — Employee books an **Inactive** desk.
> - **Affects:** REQ-007, REQ-008, REQ-017
>
> ### BR-001.8 Desk number uniqueness on create and edit
>
> - **Statement:** When an Admin adds or edits a desk, the system must reject duplicate desk numbers (case-normalized comparison per implementation).
> - **Rationale:** BR-001.4 requires unambiguous desk identifiers.
> - **Examples:** Pass — Admin adds A-12 when A-12 does not exist. Fail — Admin adds A-12 when A-12 already exists.
> - **Affects:** REQ-015, REQ-016, BR-001.4
>
> ### BR-001.9 Deactivate desk with future bookings
>
> - **Statement:** When an Admin deactivates a desk that has one or more **Confirmed** bookings for today or a future date, the system must block deactivation until those bookings are cancelled or the Admin explicitly cancels them as part of the deactivate action.
> - **Rationale:** Prevents employees holding reservations on desks removed from service without notice.
> - **Examples:** Pass — Admin deactivates B-03 with no future **Confirmed** bookings. Fail — Admin deactivates B-03 while a **Confirmed** booking exists for next Tuesday unless that booking is cancelled in the same flow.
> - **Affects:** REQ-017, REQ-014
>
> ### BR-001.10 User email uniqueness
>
> - **Statement:** When an Admin creates or edits a user, the system must reject duplicate email addresses across all accounts.
> - **Rationale:** Email is the sign-in identifier (REQ-002).
> - **Examples:** Pass — Admin creates jane@company.com when unused. Fail — Admin creates a second account with the same email.
> - **Affects:** REQ-018, REQ-019
>
> ### BR-001.11 Last active Admin safeguard
>
> - **Statement:** When an Admin attempts to deactivate an account or change a role such that zero **Admin** users would remain active, the system must reject the action.
> - **Rationale:** Prevents locking the organization out of admin functions.
> - **Examples:** Pass — Two active Admins; one is deactivated. Fail — Only one active Admin remains and that account is deactivated.
> - **Affects:** REQ-020, REQ-022
>
> ### BR-001.12 Admin password reset delivery
>
> - **Statement:** When an Admin resets a user's password, the system must set a new password and display it once to the Admin in the application (copy-to-clipboard encouraged); the system must not email the password to the user unless a separate requirement is approved.
> - **Rationale:** REQ-021 is admin-initiated; email delivery is not assumed (notifications open question #3).
> - **Examples:** Pass — Admin resets password; new temporary value shown once on screen. Fail — Password change with no feedback to the Admin performing the reset.
> - **Affects:** REQ-021
>
> ### BR-001.13 Mandatory booking emails
>
> - **Statement:** When a booking transitions to **Confirmed** or **Cancelled**, the system must send the corresponding email (REQ-023, REQ-024) to the booking owner's account email without requiring user opt-in.
> - **Rationale:** Email is the primary notification channel agreed for this release.
> - **Examples:** Pass — Employee books desk A-01; confirmation email sent. Fail — Booking confirmed with no email attempted.
> - **Affects:** REQ-023, REQ-024
>
> ### BR-001.14 Day-before reminder email
>
> - **Statement:** When a **Confirmed** booking date is a future working day (Mon–Fri, office local timezone), the system must send one reminder email on the previous calendar day; no reminder is sent for same-day bookings or for **Cancelled**/**Completed** bookings.
> - **Rationale:** Reduces no-shows; "day-before" defined in office local time per client request.
> - **Examples:** Pass — **Confirmed** booking for Wed 20 Aug; reminder sent Tue 19 Aug (office TZ). Fail — Reminder sent for a **Cancelled** booking.
> - **Affects:** REQ-025, BR-001.3, NFR-001
>
> ### BR-001.15 Browser push opt-in only
>
> - **Statement:** Browser push for book/cancel events must be disabled until the Employee explicitly opts in (REQ-026); opting out must stop subsequent push notifications without affecting email notifications.
> - **Rationale:** Push is optional per client request; email remains the reliable channel.
> - **Examples:** Pass — Employee enables push; receives push on next booking. Fail — Push sent to Employee who never opted in.
> - **Affects:** REQ-026, REQ-027
>
> ### BR-001.16 Push scope excludes reminders
>
> - **Statement:** Day-before reminder notifications must be delivered by email only; browser push must not be used for reminders in this release.
> - **Rationale:** Client specified push for book/cancel only.
> - **Examples:** Pass — Reminder email sent; no push for reminder. Fail — Push notification for day-before reminder.
> - **Affects:** REQ-025, REQ-027
>
> ## 7. Validations
>
> | Validation | Rule                                                                            | Related                                                                                     |
> | ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
> | V-01       | Sign-in rejected for unknown credentials or deactivated account                 | REQ-002, REQ-005                                                                            |
> | V-02       | Selected date must be ≥ today and ≤ today + 30 days (office local timezone)     | REQ-006                                                                                     |
> | V-03       | Selected date must be a working day (Mon–Fri)                                   | BR-001.3                                                                                    |
> | V-04       | Selected desk must be available (not **Confirmed** by another user) for that date | REQ-008                                                                                   |
> | V-05       | Employee must not already hold a **Confirmed** booking for the same date        | BR-001.1                                                                                    |
> | V-06       | Cancellation only on **Confirmed** bookings for today or future dates           | BR-001.6                                                                                    |
> | V-07       | Admin-only actions require **Admin** role                                       | REQ-004, REQ-011–REQ-022                                                                    |
> | V-08       | Desk number must be unique on add/edit                                          | REQ-015, REQ-016, BR-001.8                                                                  |
> | V-09       | Cannot deactivate desk with unresolved future **Confirmed** bookings            | REQ-017, BR-001.9                                                                           |
> | V-10       | User email must be unique on create/edit                                        | REQ-018, REQ-019, BR-001.10                                                                 |
> | V-11       | Cannot remove the last active **Admin**                                         | REQ-020, REQ-022, BR-001.11                                                                 |
> | V-12       | Password reset must meet minimum length/complexity policy                       | REQ-021 — **min 8 chars; upper, lower, digit, special** (PO/security, 2026-08-21)           |
> | V-13       | Email notifications include desk number and booking date                        | REQ-023, REQ-024, REQ-025                                                                   |
> | V-14       | Push notifications only when user opt-in flag is true                           | REQ-026, REQ-027, BR-001.15                                                                 |
>
> ## 8. Constraints
>
> - Single office location only (no multi-site routing or selection).
> - Email/password authentication only; no SSO or social login in this release.
> - Desk inventory and user accounts are maintained in-app by Admins (REQ-015–REQ-022); initial bootstrap of the first Admin account: **DbInitializer seed when no users exist** (PO/Architect, 2026-08-21).
> - Company public holidays are not yet defined in scope — until resolved, only weekend exclusion (BR-001.3) is guaranteed.
>
> ## 9. Risks
>
> | ID       | Risk                                                                                    | Likelihood | Impact | Mitigation                                                                                            |
> | -------- | --------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------- |
> | RISK-001 | Admin provisioning expands delivery surface (CRUD, validation, audit).                  | Medium     | Medium | UX designs SCR-005/SCR-006; Architect addresses data model; slice stories after design merge.         |
> | RISK-002 | Holiday calendar undefined — employees may book on company holidays.                    | Medium     | Medium | Resolve open question #2; interim Mon–Fri rule documented in BR-001.3.                                |
> | RISK-003 | No self-service password reset; employees depend on Admin for password help.            | Medium     | Low    | REQ-021 admin reset; self-service remains out of scope per §10.                                       |
> | RISK-004 | Concurrent booking of the same desk could cause double-booking without proper locking.  | Low        | High   | Address in architecture/delivery (not a BA design decision).                                          |
> | RISK-005 | Admin displays new password on screen — shoulder-surfing / log exposure if mishandled.  | Low        | Medium | Show once + copy; UX warning copy; no password in persistent audit log.                               |
> | RISK-006 | Email delivery failures (wrong address, SMTP outage) leave users uninformed.            | Medium     | Medium | Log failures (NFR-005); operational monitoring; valid email on user create (REQ-018).                 |
> | RISK-007 | Browser push permission denied or unsupported — user expects alerts.                    | Medium     | Low    | Clear UX that push is optional; email always sent (BR-001.13).                                        |
>
> ## 10. Out of scope
>
> - Forgot-password / **self-service** password reset (client confirmed for current stage). Admin-initiated reset is **in scope** (REQ-021).
> - Email delivery of **passwords** or **admin account credentials** (separate from booking transactional email).
> - SMS or mobile-app push notifications.
> - Browser push for day-before reminders (email only per BR-001.16).
> - User opt-out of mandatory booking emails (emails on book/cancel/reminder are always sent per REQ-023–REQ-025).
> - Booking more than one desk per employee per day.
> - In-place desk swap without cancellation.
> - Multi-office or multi-location support.
> - Weekend desk booking (Saturday/Sunday).
> - Visitor desk booking on behalf of others by Employees (one desk per employee per day only).
>
> ## 11. Open questions
>
> | #   | Question                                                                                                                                | Owner        | Status                                                                          |
> | --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
> | 1   | How is the first Admin account created before any Admin exists in the app (seed script, installer, manual database)?                     | PO/Architect | **Resolved** — DbInitializer seeds Admin when no users (2026-08-21)             |
> | 2   | How is the company holiday calendar defined and maintained so working-day rules exclude public holidays?                                 | PO/client    | Open                                                                            |
> | 3   | What time of day should the day-before reminder email be sent (office local timezone)?                                                   | PO/client    | Open — default: 08:00 office local                                              |
> | 4   | Must the web UI support mobile browsers in this release, or desktop-only?                                                                | PO/client    | Open                                                                            |
> | 5   | Minimum password length/complexity for create and reset (V-12)?                                                                          | PO/security  | **Resolved** — min 8 chars; upper, lower, digit, special (2026-08-21)           |
> | 6   | When deactivating a desk with future bookings, must the Admin cancel all affected bookings in one step, or block until manually cleared? | PO/client    | Open — default BR-001.9: block or cancel-in-same-flow                           |
> | 7   | Approved sender address / email domain and SMTP service for transactional mail?                                                          | PO/IT        | Open                                                                            |
>
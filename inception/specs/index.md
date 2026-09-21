# Spec index

Every development spec package in this repo. **Check here before creating a new folder** — the capability may already have one, and a change to it is a revision of that package, not a second spec.

| Story | Feature | Tier | Status | Folder |
| ----- | ------- | ---- | ------ | ------ |
| US-001 | Sign in with email and password | Complex | implemented | [`US-001-sign-in/`](US-001-sign-in/) |
| US-002 | Sign out | Complex | implemented | [`US-002-sign-out/`](US-002-sign-out/) |
| US-003 | Stay signed in for 30 days | Complex | implemented | [`US-003-thirty-day-session/`](US-003-thirty-day-session/) |
| US-004 | Replace an administrator-set password at first sign-in | Complex | implemented | [`US-004-replace-administrator-set-password/`](US-004-replace-administrator-set-password/) |
| US-005 | Choose a booking date inside the window | Complex | implemented | [`US-005-choose-a-booking-date/`](US-005-choose-a-booking-date/) |
| US-006 | See desk availability for the chosen date | Complex | implemented | [`US-006-see-desk-availability/`](US-006-see-desk-availability/) |
| US-007 | Book an available desk | Complex | implemented | [`US-007-book-an-available-desk/`](US-007-book-an-available-desk/) |
| US-008 | See which desk I booked last | Complex | implemented | [`US-008-see-my-last-booked-desk/`](US-008-see-my-last-booked-desk/) |
| US-009 | Be offered the next free days when everything is taken | Complex | implemented | [`US-009-next-free-days-when-fully-booked/`](US-009-next-free-days-when-fully-booked/) |
| US-010 | View my own bookings, past and upcoming | Complex | implemented | [`US-010-view-my-bookings/`](US-010-view-my-bookings/) |
| US-011 | Cancel my own booking | Complex | implemented | [`US-011-cancel-my-own-booking/`](US-011-cancel-my-own-booking/) |
| US-012 | Come back to a booking list that is still true | Complex | implemented (My bookings only — SCR-005 half deferred to US-013) | [`US-012-refresh-booking-list-on-focus/`](US-012-refresh-booking-list-on-focus/) |
| US-013 | See every booking in the office | Complex | implemented | [`US-013-see-every-booking/`](US-013-see-every-booking/) |
| US-014 | Filter all bookings by date, status and desk | Complex | implemented | [`US-014-filter-all-bookings/`](US-014-filter-all-bookings/) |
| US-015 | Cancel an employee's booking on their behalf | Complex | implemented | [`US-015-cancel-a-booking-on-behalf/`](US-015-cancel-a-booking-on-behalf/) |
| US-016 | See the desk inventory and how many people hold each desk | Complex | implemented | [`US-016-see-the-desk-inventory/`](US-016-see-the-desk-inventory/) |
| US-017 | Add a desk | Complex | implemented | [`US-017-add-a-desk/`](US-017-add-a-desk/) |
| US-018 | Correct a desk number | Complex | implemented | [`US-018-correct-a-desk-number/`](US-018-correct-a-desk-number/) |
| US-019 | Take a desk out of service, and put it back | Complex | implemented | [`US-019-take-a-desk-out-of-service/`](US-019-take-a-desk-out-of-service/) |
| US-020 | Find an account in the people list | Complex | implemented | [`US-020-find-an-account/`](US-020-find-an-account/) |
| US-021 | Create a user account | Complex | implemented | [`US-021-create-a-user-account/`](US-021-create-a-user-account/) |
| US-022 | Suggest an initial password | Medium | implemented | [`US-022-suggest-an-initial-password/`](US-022-suggest-an-initial-password/) |
| US-023 | Correct a person's name or email | Complex | implemented | [`US-023-correct-a-persons-details/`](US-023-correct-a-persons-details/) |
| US-024 | Change a person's role | Complex | implemented | [`US-024-change-a-persons-role/`](US-024-change-a-persons-role/) |
| US-025 | Deactivate an account and release the desks it holds | Complex | implemented (AC-08/AC-09 moved to US-029/US-032, issue #59) | [`US-025-deactivate-an-account/`](US-025-deactivate-an-account/) |
| US-026 | Reactivate an account | Complex | implemented | [`US-026-reactivate-an-account/`](US-026-reactivate-an-account/) |
| US-027 | Reset somebody's password | Complex | implemented | [`US-027-reset-somebodys-password/`](US-027-reset-somebodys-password/) |
| US-034 | Transactional email is configured, not hard-coded, and failures are logged | Complex | implemented | [`US-034-email-configuration-and-failure-logging/`](US-034-email-configuration-and-failure-logging/) |
| US-028 | Get a confirmation email when my booking is made | Medium | implemented | [`US-028-booking-confirmation-email/`](US-028-booking-confirmation-email/) |
| US-029 | Get a cancellation email when my booking is voided | Medium | implemented | [`US-029-booking-cancellation-email/`](US-029-booking-cancellation-email/) |
| US-030 | Get a reminder email the day before | Complex | implemented | [`US-030-day-before-reminder-email/`](US-030-day-before-reminder-email/) |

## How to update

- Add a row when you create `inception/specs/US-###-<slug>/` (DEV, at Gate D1)
- Move Status to `implemented` when the story PR merges
- Simple-tier changes own no folder — they record one row in `_change-log.md` instead

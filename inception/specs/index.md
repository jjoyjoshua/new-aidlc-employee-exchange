# Spec index

Every development spec package in this repo. **Check here before creating a new folder** — the capability may already have one, and a change to it is a revision of that package, not a second spec.

| Story | Feature | Tier | Status | Folder |
| ----- | ------- | ---- | ------ | ------ |
| US-001 | Sign in with email and password | Complex | planned | [`US-001-sign-in/`](US-001-sign-in/) |
| US-002 | Sign out | Complex | planned | [`US-002-sign-out/`](US-002-sign-out/) |
| US-003 | Stay signed in for 30 days | Complex | planned | [`US-003-thirty-day-session/`](US-003-thirty-day-session/) |
| US-004 | Replace an administrator-set password at first sign-in | Complex | planned | [`US-004-replace-administrator-set-password/`](US-004-replace-administrator-set-password/) |
| US-005 | Choose a booking date inside the window | Complex | planned | [`US-005-choose-a-booking-date/`](US-005-choose-a-booking-date/) |
| US-006 | See desk availability for the chosen date | Complex | approved | [`US-006-see-desk-availability/`](US-006-see-desk-availability/) |
| US-007 | Book an available desk | Complex | implemented | [`US-007-book-an-available-desk/`](US-007-book-an-available-desk/) |

## How to update

- Add a row when you create `inception/specs/US-###-<slug>/` (DEV, at Gate D1)
- Move Status to `implemented` when the story PR merges
- Simple-tier changes own no folder — they record one row in `_change-log.md` instead

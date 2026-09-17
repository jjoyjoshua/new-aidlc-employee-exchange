# Modules

One folder per business capability. Each owns its routes, its request/response shapes, and
the service that does the work (`app-architecture.md` §2).

| Module          | Owns                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `auth`          | Sign-in, sign-out, session verification, the forced password change, the `must_change_password` gate  |
| `users`         | Account CRUD, role, activate/deactivate **and its cascade**, admin password reset, search             |
| `desks`         | Desk inventory, number validation and normalization, activate/deactivate and its block                |
| `bookings`      | Booking, cancellation, the two list views and their filters, availability for a date                  |
| `notifications` | Email and push composition and dispatch, opt-in, subscriptions, the reminder run, the delivery log    |

## Two rules that are easy to get wrong

**`users` owns the deactivation cascade, not `bookings`.** BR-001.18 makes cancelling the
leaver's desks part of deactivating the account — one act, one transaction, refusable as a
whole. Splitting it across two modules makes it two acts that can half-succeed, which is
exactly the failure RISK-011 describes.

**`notifications` is called, never consulted.** No other module asks whether somebody is
opted in or what the message should say. Callers hand over a booking and an event; this
module decides. That keeps BR-001.15 (opt-in), BR-001.16 (no push for reminders) and
BR-001.20 (name the actor) in one file each rather than scattered across every caller.

## The boundary, enforced

No module imports another module's service. They collaborate through `domain/` or a declared
port. `bookings` and `users` may import `notifications`; `notifications` imports neither, and
nothing else imports it at all. `eslint.config.mjs` enforces this per module — crossing it is
a design change, not an eslint-disable comment.

Folders are empty until a story fills them. Each story PR adds the routes, schemas and
service it needs, and nothing more.

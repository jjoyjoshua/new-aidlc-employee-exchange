# US-029 — implementation plan

> **The Gate D1 artifact.** The human reads this file, `spec.md` and `decisions.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                        |
| --------- | -------------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-029-booking-cancellation-email.md`    |
| **Spec**  | `spec.md`                                                                 |
| **Tier**  | Medium                                                                    |

## Approval — Gate D1

| Field                 | Value           |
| ---------------------- | ---------------- |
| Status                 | **approved**    |
| Approved by            | Joy Joshua <joy_j@trigent.com> |
| Approved on            | 2026-09-21      |
| Plan commit approved   | *uncommitted at approval* — base `3726265ddf549bd8b064c2f2bf2af00ef6c468f7` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either
is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit
holding this plan **as they read it**. The name is self-asserted — attribution, not
authentication.

## Steps

### Step 1 — the cancellation composer and its date format

| Field    | Value                                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                                                                                            |
| Files    | `apps/api/src/domain/format-display-date.ts` (create), `apps/api/src/domain/format-display-date.spec.ts` (create), `apps/api/src/domain/cancellation-copy.ts` (create), `apps/api/src/domain/cancellation-copy.spec.ts` (create), `apps/api/src/modules/notifications/notifications.service.ts` (modify), `apps/api/src/modules/notifications/notifications.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- format-display-date notifications.service` — expected: green                                                                                                           |

Failing tests first, named `... (US-029/AC-0#)`:

- `formatShortDate('2026-09-09')` returns `'Wed 9 Sep'` — no comma, assembled from
  `formatToParts` (D-06), plus a boundary case crossing a month (`'2026-01-31'` → `'Sat 31 Jan'`)
- `sendBookingCancellation` calls `recordAndSend` with `kind: 'cancellation'`, the given
  `bookingId`/`userId`, `recipient` equal to the given `email` and no other address (AC-01)
- the composed body names the desk number and `formatShortDate(date)` (AC-02)
- the AC-04/05/06 wording matrix, one `describe` asserting the composed body for all three
  `cancellationSource` values against the same booking facts (QA notes' own instruction — one
  matrix, not three independent tests): `'owner'` names no actor (AC-05); `'admin'` states
  *"...was cancelled by your office admin"* and never the individual administrator's name
  (AC-04); `'deactivation_cascade'` states the same office-admin sentence but omits the
  rebooking line and never states the account was closed (AC-06)
- calling it is unconditional — no parameter suppresses it (AC-08, a structural absence, same
  reasoning as US-028/AC-04)

`sendBookingCancellation(input: BookingCancellationInput): Promise<RecordAndSendResult>` —
`BookingCancellationInput = { bookingId, userId, email, deskNumber, date, cancellationSource:
'owner' | 'admin' | 'deactivation_cascade' }`. Composes subject/body per D-05's copy, using
`formatShortDate(date)`, then `return recordAndSend({ kind: 'cancellation', bookingId, userId,
recipient: email, subject, body })`.

### Step 2 — the owner-cancel path (US-011)

| Field    | Value                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-03                                                                                                                                                                                              |
| Files    | `apps/api/src/modules/bookings/bookings.repository.ts` (modify), `apps/api/src/modules/bookings/bookings.repository.spec.ts` (modify), `apps/api/src/modules/bookings/bookings.service.ts` (modify), `apps/api/src/modules/bookings/bookings.service.spec.ts` (modify), `apps/api/src/modules/bookings/bookings.router.ts` (modify), `apps/api/src/modules/bookings/bookings.routes.spec.ts` (modify), `apps/api/src/composition.ts` (modify) |
| Verify   | `npm test -w apps/api -- bookings` — expected: green (existing US-007/009/011 tests unaffected)                                                                                                          |

`cancelOwnedBooking`'s `.select('id')` widens to `.select('id, desk_id, booking_date')` (plain
columns, D-02) — the pinned-query test in `bookings.repository.spec.ts` updates to match, and its
return type widens from `{ id: string } | undefined` to `{ id, desk_id, booking_date } |
undefined`.

`bookings.service.ts`'s `CancelBookingOutcome`'s `'ok'` branch widens to carry `deskNumber`/
`date` (via `availability.getDeskById(desk_id)`, D-02, mirroring `createBooking`'s own call to
the same method) alongside `id`.

`BookingsRouterDeps.notifications` widens from `Pick<NotificationsService,
'sendBookingConfirmation'>` to `Pick<NotificationsService, 'sendBookingConfirmation' |
'sendBookingCancellation'>`. `POST /:id/cancel` calls and awaits `sendBookingCancellation` only
on `outcome.kind === 'ok'`, using `user.email` (the session's own, same as US-028/D-02 — no
second read), `cancellationSource: 'owner'`, wrapped in its own `try/catch` (US-028/D-05's
precedent) so a notify failure never changes the `200` response (AC-10). `composition.ts`'s
`BuildAppOptions.notifications` type widens the same way; no new option is added.

New tests, against the real route, mirroring `bookings.routes.spec.ts`'s existing US-028
fixtures:

- a successful `POST /:id/cancel` calls the fake exactly once with the caller's email, the
  cancelled booking's id, its desk and date, and `cancellationSource: 'owner'` (AC-01, AC-02,
  AC-05)
- a `notifications` fake that fails or throws still returns `200` (AC-10)

### Step 3 — the admin-cancel path (US-015)

| Field    | Value                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04, FR-05                                                                                                                                                                                                      |
| Files    | `apps/api/src/modules/bookings/admin-bookings.repository.ts` (modify), `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` (modify), `apps/api/src/modules/bookings/admin-bookings.service.ts` (modify), `apps/api/src/modules/bookings/admin-bookings.service.spec.ts` (modify), `apps/api/src/modules/admin/admin.router.ts` (modify), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify), `apps/api/src/composition.ts` (modify) |
| Verify   | `npm test -w apps/api -- admin-bookings admin.routes` — expected: green (existing US-013/014/015 tests unaffected)                                                                                                |

`cancelAnyBooking`'s write is unchanged. On a successful write (`data` truthy), one follow-up
read (D-03) — `.from('bookings').select('booking_date, desks(desk_number),
user_profiles!user_id(email)').eq('id', bookingId).maybeSingle()` — resolves the desk number and
the owner's current email in a shape `CancelAnyBookingOutcome`'s `'ok'` branch now carries.

`AdminRouterDeps` gains `notifications: Pick<NotificationsService, 'sendBookingConfirmation' |
'sendBookingCancellation'>` (reusing the one seam Step 2 widened, not a second one). `POST
/bookings/:id/cancel` calls `sendBookingCancellation` on `outcome.kind === 'ok'`, using the
looked-up owner email, `cancellationSource: 'admin'`, same `try/catch` discipline as Step 2
(AC-10). `composition.ts` wires `createAdminRouter({ ..., notifications: options.notifications
?? notificationsService })`.

New tests, mirroring Step 2's:

- a successful admin cancel calls the fake once with the **owner's** email (never the acting
  admin's), the booking's desk and date, and `cancellationSource: 'admin'` (AC-01, AC-02, AC-04,
  AC-07)
- a failing/throwing notify still returns `200` (AC-10)

### Step 4 — the deactivation cascade (US-025)

| Field    | Value                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-06, FR-07                                                                                                                                                       |
| Files    | `apps/api/src/modules/users/users.service.ts` (modify), `apps/api/src/modules/users/users.service.spec.ts` (modify), `apps/api/src/modules/admin/admin.router.ts` (modify), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- users.service admin.routes` — expected: green (existing US-025 tests unaffected)                                                          |

`DeactivateAccountOutcome`'s `'ok'` branch widens to also carry `cancelledBookings:
CancelledBookingRow[]` (D-04) — the repository already returns this; the service currently
reduces it to `cancelledCount` and now returns both.

`POST /users/:id/deactivate` calls, on `outcome.kind === 'ok'`, one `sendBookingCancellation`
**per row** in `outcome.cancelledBookings` — never a summary (AC-03) — using
`outcome.account.email` (the deactivated person's own address, already on the response),
`cancellationSource: 'deactivation_cascade'`. Each call keeps the same `try/catch` discipline;
one failed send does not stop the loop or affect the `200` response (AC-10).

New tests:

- deactivating an account with three cancelled bookings calls the fake exactly three times, once
  per booking, each with that booking's own desk/date (AC-03)
- the cascade's composed body carries the office-admin sentence with no rebooking line and no
  mention of the account closing (AC-06 — covered by Step 1's matrix test against the same
  composer; this step's test asserts the ROUTE actually passes `cancellationSource:
  'deactivation_cascade'`, not the wording itself again)
- deactivating an account with zero upcoming bookings sends nothing (the loop is empty)

### Step 5 — AC-09's race

| Field    | Value                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-08                                                                                                                        |
| Files    | `apps/api/src/modules/bookings/bookings.routes.spec.ts` (modify), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- bookings.routes admin.routes` — expected: green                                                     |

**Revised during implementation** (see `change-log.md`): `bookings.repository.concurrency.spec.ts`
and `admin.concurrency.spec.ts` call the repositories directly and hold no `notifications`
dependency at all — they cannot exercise a send either way, and were the wrong file for this
step. AC-09 is two separate facts at two separate layers, each already proven where it actually
lives: the DATABASE's single-winner arbitration is the concurrency specs' existing, unchanged
proof; "only the winning write ever reaches the notify call" is a route-level fact, proven by a
test in each of `bookings.routes.spec.ts` (owner path) and `admin.routes.spec.ts` (admin path)
asserting `cancellationCalls` is empty on the `already_cancelled` branch.

### Step 6 — traceability

| Field    | Value                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | bookkeeping                                                                                                                                                                                    |
| Files    | `traceability.md` (modify), `change-log.md` (modify — status rows only, no plan edit), `knowledge/traceability/manifest.json` (modify — `US-029.tests[]`), `inception/specs/index.md` (modify — add row) |
| Verify   | `node tools/aidlc-check.mjs` — expected: passes                                                                                                                                                |

## Rollback

Revert the PR. No schema change, no new endpoint, no new required config, no new dependency. A
revert restores all three cancellation paths to sending no email, which is the pre-US-029
behaviour exactly.

## Open questions

None. Every load-bearing fact was verified by reading (`notifications.service.ts`,
`bookings.repository.ts`, `bookings.service.ts`, `bookings.router.ts`, `admin-bookings
.repository.ts`, `admin-bookings.service.ts`, `admin.router.ts`, `users.repository.ts`,
`users.service.ts`, `composition.ts`, `0003_bookings.sql`, and the existing US-028/US-034
tests), never assumed — including the one fact that changed the plan mid-research: issue #59
only removes AC-08/AC-09 from **US-025**, and confirms US-029's own ACs are unchanged. The
non-checkable calls (which query shape resolves the admin/cascade paths' desk-and-email lookup,
and the two undictated email bodies) are recorded as decisions (D-02, D-03, D-05, D-06) rather
than left open, each with its rejected alternative — the human can overrule any of them in this
chat before `go`, or in the PR diff after.

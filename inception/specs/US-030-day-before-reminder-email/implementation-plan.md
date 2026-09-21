# US-030 — implementation plan

> **The Gate D1 artifact.** The human reads this file, `spec.md`, `impact-analysis.md` and `decisions.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                          |
| --------- | ---------------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-030-day-before-reminder-email.md`     |
| **Spec**  | `spec.md`                                                                 |
| **Tier**  | Complex                                                                   |

## Approval — Gate D1

| Field                 | Value           |
| ---------------------- | ---------------- |
| Status                 | **approved**    |
| Approved by            | Joy Joshua <joy_j@trigent.com> |
| Approved on            | 2026-09-21      |
| Plan commit approved   | *uncommitted at approval* — base `699c2514c63094925286c638e298d8a1ab67fdf9` |

## Steps

### Step 1 — the reminders module's repository: who gets a reminder

| Field    | Value                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04                                                                                                                                                        |
| Files    | `apps/api/src/modules/reminders/reminders.repository.ts` (create), `apps/api/src/modules/reminders/reminders.repository.spec.ts` (create)                   |
| Verify   | `npm test -w apps/api -- reminders.repository` — expected: green                                                                                             |

`listConfirmedBookingsForDate(date: OfficeDate): Promise<ReminderCandidateRow[]>` — one query:
`.from('bookings').select('id, user_id, booking_date, desks(desk_number), user_profiles!user_id(email)').eq('booking_date', date).eq('status', 'confirmed')`, mirroring the exact embed shape
`admin-bookings.repository.ts`'s `listBookings` and US-029's `cancelAnyBooking` follow-up read
already prove works. `ReminderCandidateRow = { id, userId, email, deskNumber, bookingDate }`.

Failing tests first, named `... (US-030/AC-0#)`:

- selects exactly `status = 'confirmed'` for the given date — a **cancelled** or **completed**
  (past-dated) row is never returned, proven with a pinned-query fake asserting the `.eq()` calls
  (AC-05, AC-06)
- throws if a row has no joined desk or no joined user_profiles — the same NOT-NULL-backed
  invariant `admin-bookings.repository.ts`/`users.repository.ts` already assert, not a new rule

### Step 2 — `recordAndSend`'s claim-before-send extension

| Field    | Value                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-03                                                                                                                                                                                          |
| Files    | `apps/api/src/modules/notifications/notifications.repository.ts` (modify), `apps/api/src/modules/notifications/notifications.repository.spec.ts` (modify), `apps/api/src/modules/notifications/notifications.service.ts` (modify), `apps/api/src/modules/notifications/notifications.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- notifications` — expected: green, including every existing US-028/US-029 test unmodified and still passing                                                                  |

`NotificationsRepository` gains (D-02, D-03):

```ts
claimReminderSent(row: DeliveryRow): Promise<{ claimed: true; id: string } | { claimed: false }>;
markDeliveryFailed(id: string, errorDetail: MailFailureReason): Promise<void>;
```

`claimReminderSent` inserts the row with `outcome: 'sent'` and `.select('id').single()`. On a
`23505` whose message names `notification_deliveries_one_sent_reminder_per_booking`, returns
`{ claimed: false }` — an expected outcome, never thrown (mirrors `insertConfirmedBooking`'s own
discipline of checking the message, not trusting any `23505`). Any other error still throws.
`markDeliveryFailed` is a plain `UPDATE ... WHERE id = ...`.

`recordAndSend` gains one branch at its top: `if (input.kind === 'reminder') return
recordAndSendClaimFirst(input);` — a new PRIVATE function in the same file, never exported,
calling `deliveries.claimReminderSent` first; only on `{ claimed: true }` does it call `send()`;
a transport failure demotes the claimed row via `markDeliveryFailed` and returns `{ ok: false,
error, recorded: true }` (or `recorded: false` if the demotion itself fails, logged exactly like
the existing `recordAndSend`'s own `insertDelivery` failure path). An unclaimed row (`{ claimed:
false }`) returns `{ ok: true, recorded: true }` without calling `send()` at all — the AC-07
guarantee lives here.

Failing tests first, named `... (US-030/AC-0#)`:

- `sendBookingConfirmation`/`sendBookingCancellation`'s EXISTING test files run unmodified and
  green — the regression proof `impact-analysis.md` names
- a fake `deliveries` records that `claimReminderSent`/`markDeliveryFailed` are never called for
  `kind: 'confirmation'`/`'cancellation'` — the branch condition itself, proven directly, not only
  inferred from unchanged behaviour
- `sendReminderEmail` (added in Step 3, exercised here via `recordAndSend({kind:'reminder',...})`
  directly): a claimed row calls `send()` once and returns `{ ok: true, recorded: true }` (AC-01)
- a SECOND `recordAndSend({kind:'reminder', ...bookingId})` for the SAME booking against a fake
  `deliveries` that reports `{ claimed: false }` calls `send()` **zero** times (AC-07)
- a transport failure on a claimed row calls `markDeliveryFailed` with the sanitized reason, and
  the failure is logged (AC-10)

### Step 3 — the composer and the run's own logic

| Field    | Value                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-05, FR-06, FR-08, FR-09                                                                                                                                 |
| Files    | `apps/api/src/modules/notifications/notifications.service.ts` (modify, `sendReminderEmail`), `apps/api/src/modules/notifications/notifications.service.spec.ts` (modify), `apps/api/src/modules/reminders/reminders.service.ts` (create), `apps/api/src/modules/reminders/reminders.service.spec.ts` (create) |
| Verify   | `npm test -w apps/api -- notifications reminders.service` — expected: green                                                                                      |

`sendReminderEmail(input: BookingReminderInput): Promise<RecordAndSendResult>` — composes
subject/body naming `input.deskNumber` and `formatShortDate(input.date)`, calls `recordAndSend({
kind: 'reminder', ... })`. No new domain function: date wording reuses US-029's `formatShortDate`.

`createRemindersService({ bookings, notifications, nowMs, officeTimezone })` exposes
`runReminders(): Promise<ReminderRunResult>`:

1. `today = officeToday(nowMs(), officeTimezone)`; `tomorrow = addDays(today, 1)`.
2. `if (isWeekend(tomorrow)) return { kind: 'skipped', reason: 'weekend' };` — no query, no send
   (AC-04, the Monday edge case: a Monday booking's own reminder still fires on the SUNDAY run,
   since `isWeekend('2026-09-20')` [a Sunday] is `false` — only the booking DATE's weekend status
   is ever checked, never the run date's).
3. `const rows = await bookings.listConfirmedBookingsForDate(tomorrow);`
4. For each row, `try { await notifications.sendReminderEmail({...}); sent++ } catch (e) {
   logger.error(...); failed++ }` (FR-06, FR-09 — no retry-tracking state beyond this one pass).
5. Return `{ kind: 'ran', date: tomorrow, attempted: rows.length, sent, failed }`.

`RemindersServiceDeps`'s `notifications` field is typed `Pick<NotificationsService,
'sendReminderEmail'>` — structurally no push dependency exists to call (FR-08, AC-09).

Failing tests first, named `... (US-030/AC-0#)`:

- with the server clock set to a UTC instant that is a different calendar day in `Asia/Kolkata`
  than in UTC, `runReminders` computes `tomorrow` from the OFFICE date, not the UTC one — the
  same fixture shape as `booking-window.spec.ts`'s own `officeToday` test (AC-01, AC-03)
- when tomorrow (office-relative) is a Saturday or Sunday, returns `{ kind: 'skipped', reason:
  'weekend' }` and the repository's `listConfirmedBookingsForDate` is never called (AC-04)
- a booking dated the NEXT Monday, with the clock set to the preceding Sunday, still gets a
  reminder — `isWeekend` is checked on the booking's OWN date, and Sunday is not a weekend day by
  that predicate (the Monday edge case, confirmed with the human: build BR-001.14 exactly as
  written)
- a fake `notifications.sendReminderEmail` that throws for one of three rows: the other two still
  get called, the run reports `sent: 2, failed: 1`, and the failure is logged (AC-10)
- `RemindersServiceDeps` — a structural assertion (matching `bookings.router.ts`'s own AC-04
  precedent for US-028) that the type carries no push-capable dependency; no runtime test can
  prove an absence, so this is a `Pick<...>` type-level fact, asserted by the file compiling at
  all against the narrowed dependency shape (AC-09)

### Step 4 — the route, the shared secret, and wiring it in

| Field    | Value                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-07                                                                                                                                                                                                                              |
| Files    | `apps/api/src/http/middleware/require-reminder-secret.ts` (create), `apps/api/src/http/middleware/require-reminder-secret.spec.ts` (create), `apps/api/src/modules/reminders/reminders.router.ts` (create), `apps/api/src/modules/reminders/reminders.routes.spec.ts` (create), `apps/api/src/http/app.ts` (modify), `apps/api/src/composition.ts` (modify), `libs/contracts/src/error.ts` (modify — add `reminder_run_unauthorized`) |
| Verify   | `npm test -w apps/api -- require-reminder-secret reminders.routes` — expected: green; `npm run typecheck` — expected: clean (every `createApp`/`buildApp` call site still compiles)                                              |

`requireReminderSecret`: reads the `X-Reminder-Run-Secret` header (D-05), compares against
`config().REMINDER_RUN_SECRET` with `crypto.timingSafeEqual` after a length check (unequal
lengths refuse immediately, never call `timingSafeEqual` on mismatched buffers — it throws on
length mismatch). No header, wrong length, or a mismatch all refuse identically with `401
reminder_run_unauthorized` — no distinguishing detail, the same anti-enumeration posture
`requireAdmin` takes for a wrong role.

`createRemindersRouter({ service })`: `router.post('/run', ...)` calls `service.runReminders()`
and returns `200` with the run summary (D-06). A repository-level failure (the listing query
itself throwing) propagates to `next(error)` — a genuine outage should surface as a `500`, not be
swallowed; only a PER-BOOKING send failure is caught (Step 3).

`http/app.ts`: `AppDeps` gains `remindersRouter: Router`; mount `app.use('/api/internal/reminders',
requireReminderSecret, deps.remindersRouter)`, positioned beside `/api/admin`/`/api/bookings`.

`composition.ts`: wires the real `remindersRepository`/`createRemindersService`/
`createRemindersRouter`; `BuildAppOptions` gains an optional `reminders` seam (mirrors
`adminBookings`/`desks`/`users`) so route tests can inject a fake without needing
`REMINDER_RUN_SECRET` set — additive, no existing `buildApp({...})` call site changes.

Failing tests first, named `... (US-030/AC-0#)`:

- the correct secret in `X-Reminder-Run-Secret` reaches the router; a missing header, an empty
  string, and a wrong-but-same-length secret all get `401 reminder_run_unauthorized`
- against the REAL mount (supertest, matching `bookings.routes.spec.ts`'s own reasoning): a
  correctly-authenticated `POST /api/internal/reminders/run` returns `200` with the run summary
  shape (AC-01)
- `GET /api/internal/reminders/run` and any other method/path under the mount still requires the
  secret — the guard is mount-level, not per-route (matches `requireAdmin`'s own proof shape)

### Step 5 — AC-07's real idempotency proof, and traceability

| Field    | Value                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-02, FR-03 (real-Postgres proof), bookkeeping                                                                                                                                              |
| Files    | `apps/api/src/modules/notifications/notifications.repository.concurrency.spec.ts` (create — first file of its kind for this repository), `traceability.md` (modify), `knowledge/traceability/manifest.json` (modify), `inception/specs/index.md` (modify) |
| Verify   | `RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test -w apps/api -- notifications.repository.concurrency` — expected: green, when a real database is available; `node tools/aidlc-check.mjs` — expected: passes |

`testing-standards.md`'s own rule: concurrency-arbitrated behaviour needs a real-Postgres test,
not a mocked-DB unit test (US-029's own precedent for citing this rather than re-deriving it).
The QA note's own instruction ("AC-07 needs the run executed twice against the same data") is a
DATABASE fact — whether the partial unique index actually arbitrates two overlapping `INSERT`s
the way `claimReminderSent`'s mapping assumes — that Step 2's fake-client unit tests cannot prove
any more than `bookings.repository.spec.ts` could prove `cancelOwnedBooking`'s own race. This
file proves it: two concurrent `claimReminderSent` calls for the SAME booking, exactly one
resolves `{ claimed: true }`.

This file, like `bookings.repository.concurrency.spec.ts`, is gated behind
`RUN_BOOKINGS_CONCURRENCY_TEST=1` and requires a real database this environment does not have —
the PR notes this explicitly, matching US-029's own precedent for an unrun-locally gate.

## Rollback

Revert the PR. No migration (the schema was already merged in US-034), so a revert removes the
route, the repository/service additions, and the `recordAndSend` branch — `confirmation`/
`cancellation` sends continue exactly as before. `REMINDER_RUN_SECRET` stays in the config schema
(harmless if unread) rather than being removed, to avoid a second config change on the same
revert.

## Open questions

None. The Monday-vs-Friday edge case was confirmed with the human before this plan was written
(build BR-001.14 exactly as written — D-00's own footnote). Every other load-bearing fact was
verified by reading: `app-architecture.md` §4.3, US-034's `design-note.md` §2.3,
`0006_notification_deliveries.sql`, `config/index.ts`, `http/app.ts`, `require-admin.ts`,
`booking-window.ts` (`isWeekend`), and the existing US-028/US-029 test suites this story must
leave green.

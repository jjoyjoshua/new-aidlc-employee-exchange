# US-030 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                        |
| ----------- | -------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-030-day-before-reminder-email.md`     |
| **Tier**    | Complex                                                                   |
| **Updated** | 2026-09-21                                                                |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                                    |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                  | yes      | One new route: `POST /api/internal/reminders/run` — no request body, guarded by a shared secret (`http/app.ts:22-27`'s own docblock: "Mounting a new module is a Complex change: it adds a contract") |
| Persistence                | no       | The idempotency schema already exists — `notification_deliveries`'s partial unique index (`0006_notification_deliveries.sql:52-54`), built ahead of this story for exactly this reason. No migration in this PR. |
| Trust                     | yes      | A new authentication mechanism — a shared secret compared against `config().REMINDER_RUN_SECRET` (already in the config schema, `config/index.ts:62-64`, unused until now), mounted at the router level like `requireAdmin` (`require-admin.ts`) |
| Dependency & integration  | no       | No new package. `app-architecture.md` §4.3 explicitly designs against an in-process scheduler/library — the route is triggered externally by infrastructure this PR does not configure |
| Operational                | yes      | **The first scheduled job in this codebase.** No cron/trigger config ships in this PR (that's Gate 3/DevOps, `spec.md`'s Out of scope) — but the route existing at all, plus the `recordAndSend` behavioural extension for retries, is exactly the operational surface `ai/standards/task-surfaces.md`'s "Scripts & jobs" section pre-names this route under |

## Files and callers

| File                                                          | Symbol                                   | Change                                                                 | Callers found (`file:line`)                                                                 |
| --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/notifications/notifications.service.ts`   | `recordAndSend`                            | internal branch on `input.kind === 'reminder'` — claim-first vs send-then-record; external signature (`SendEmailInput → RecordAndSendResult`) unchanged | `sendBookingConfirmation` (unchanged call), `sendBookingCancellation` (unchanged call), new `sendReminderEmail` |
| `apps/api/src/modules/notifications/notifications.service.ts`   | `sendReminderEmail` (new)                  | add                                                                        | `apps/api/src/modules/reminders/reminders.service.ts` (new)                                     |
| `apps/api/src/modules/notifications/notifications.repository.ts`| `NotificationsRepository`, `claimReminderSent`/`markDeliveryFailed` (new) | widen interface, add two methods; `insertDelivery` unchanged             | `notifications.service.ts`'s new claim-first branch only — the two existing callers keep using `insertDelivery` |
| `apps/api/src/modules/reminders/reminders.repository.ts` (new)  | `RemindersRepository`, `listConfirmedBookingsForDate` | add                                                          | `reminders.service.ts` (new)                                                                   |
| `apps/api/src/modules/reminders/reminders.service.ts` (new)     | `createRemindersService`, `runReminders`   | add                                                                        | `reminders.router.ts` (new)                                                                     |
| `apps/api/src/modules/reminders/reminders.router.ts` (new)      | `createRemindersRouter`, `POST /run`       | add                                                                        | `composition.ts` (new wiring)                                                                   |
| `apps/api/src/http/middleware/require-reminder-secret.ts` (new) | `requireReminderSecret`                    | add                                                                        | `http/app.ts` (new mount)                                                                       |
| `apps/api/src/http/app.ts`                                      | `AppDeps`, `createApp`                     | add `remindersRouter: Router` to `AppDeps`; mount `app.use('/api/internal/reminders', requireReminderSecret, deps.remindersRouter)` | every existing `createApp({...})` call site — all inside `composition.ts` and its own tests, none direct elsewhere |
| `apps/api/src/composition.ts`                                   | `buildApp`, `BuildAppOptions`              | wire the real `remindersRepository`/`remindersService`/`remindersRouter`; add a `reminders`-shaped test seam mirroring the existing per-module seams | every `buildApp({...})` call across every route-level `*.routes.spec.ts` file — additive only, no existing call site needs to change (a new optional field, defaulted) |
| `libs/contracts/src/error.ts`                                   | `errorCodeSchema`                          | add one new code (`reminder_run_unauthorized`)                            | `http/middleware/require-reminder-secret.ts` (new)                                              |

## Regression risk

| Area                                                | Risk   | Why                                                                                                                    | Covered by                                                                 |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| US-028's `sendBookingConfirmation` / US-029's `sendBookingCancellation` | medium | Both call the SAME `recordAndSend` this story branches inside — a mistake in the branch condition could route a confirmation/cancellation into the claim-first path, silently changing their idempotency semantics | Every existing test in `notifications.service.spec.ts`, `bookings.routes.spec.ts`, `admin.routes.spec.ts` re-run unmodified; a new test asserts `recordAndSend({kind:'confirmation'/'cancellation', ...})` never calls the new repository methods |
| `notification_deliveries`'s existing rows (US-028/US-029, already in production data shape) | low | The claim-first path only ever inserts `kind: 'reminder'` rows; the partial unique index scopes to `kind = 'reminder'` (`0006_notification_deliveries.sql:52-54`) so it cannot interact with existing confirmation/cancellation rows | schema unchanged in this PR — no migration |
| Every existing route test's `Config`/`buildApp` fixture | low | `remindersRouter` is a new REQUIRED field on `AppDeps`, but `composition.ts` builds it internally and `BuildAppOptions.reminders` is a new OPTIONAL test seam defaulted to the real wiring — no existing `buildApp({...})` call site needs to change, and none of them exercise `/api/internal/reminders/run` so `config().REMINDER_RUN_SECRET` is never read on their paths | typecheck (a missing required `AppDeps` field fails compilation) plus the existing suites passing unmodified |
| CORS/HTTPS/body-parsing middleware order in `http/app.ts` | low | The new mount is added alongside `/api/admin`/`/api/bookings`, after the existing global middleware — same position, same pattern | `http/app.ts`'s own existing route tests (health, 404) plus a new test hitting the mount |

## Deliberately not touched

- `0006_notification_deliveries.sql` — reused exactly as built for this story; no migration in
  this PR (D-00).
- Any scheduler/cron configuration — Gate 3/DevOps, `spec.md`'s Out of scope.
- `infra/webpush` — never imported by this story (FR-08, AC-09).
- `insertDelivery`'s existing signature and the send-then-record path for `confirmation`/
  `cancellation` kinds — unchanged, proven by their own unmodified test suites staying green.

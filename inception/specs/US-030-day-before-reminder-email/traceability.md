# US-030 — traceability

|             |                                                                          |
| ----------- | -------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-030-day-before-reminder-email.md`     |
| **Updated** | 2026-09-21                                                                |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------ | --------- | ----------- |
| FR-01  | `apps/api/src/modules/notifications/notifications.service.ts` | `sendReminderEmail` | `notifications.service.spec.ts` — `(US-030/AC-01, US-030/AC-02)` | implemented |
| FR-02  | `apps/api/src/modules/notifications/notifications.service.ts` | `recordAndSend`, `recordAndSendClaimFirst` | `notifications.service.spec.ts` — `(US-030/AC-07)`, `(US-030/AC-10)`; `notifications.repository.concurrency.spec.ts` — `(US-030/AC-07)` | implemented |
| FR-03  | `apps/api/src/modules/notifications/notifications.repository.ts` | `claimReminderSent`, `markDeliveryFailed` | `notifications.repository.spec.ts` — `(US-030/AC-07)`; `notifications.repository.concurrency.spec.ts` — `(US-030/AC-07)` | implemented |
| FR-04  | `apps/api/src/modules/reminders/reminders.repository.ts` | `listConfirmedBookingsForDate` | `reminders.repository.spec.ts` — `(US-030/AC-01, US-030/AC-02, US-030/AC-05, US-030/AC-06)` | implemented |
| FR-05  | `apps/api/src/modules/reminders/reminders.service.ts` | `runReminders` | `reminders.service.spec.ts` — `(US-030/AC-01, US-030/AC-03)`, `(US-030/AC-04)` | implemented |
| FR-06  | `apps/api/src/modules/reminders/reminders.service.ts` | `runReminders` | `reminders.service.spec.ts` — `(US-030/AC-10)` | implemented |
| FR-07  | `apps/api/src/modules/reminders/reminders.router.ts`, `apps/api/src/http/middleware/require-reminder-secret.ts` | `POST /run` handler, `requireReminderSecret` | `reminders.routes.spec.ts`, `require-reminder-secret.spec.ts` — `(US-030/AC-01)` | implemented |
| FR-08  | `apps/api/src/modules/reminders/reminders.service.ts` | `RemindersServiceDeps` | `reminders.service.spec.ts` — `(US-030/AC-09)` | implemented |
| FR-09  | `apps/api/src/modules/reminders/reminders.service.ts` | `runReminders` | `reminders.service.spec.ts` — `(US-030/AC-08)` | implemented |
| NFR-01 | `apps/api/src/modules/reminders/reminders.service.ts` | `runReminders` (`officeToday`/`addDays`, never a UTC literal) | `reminders.service.spec.ts` — `(US-030/AC-01, US-030/AC-03)` | implemented |
| NFR-02 | `apps/api/src/modules/reminders/reminders.service.ts` | `runReminders`'s per-booking `catch` | `reminders.service.spec.ts` — `(US-030/AC-10)` | implemented |

Every `FR-##`/`NFR-##` above has a row here, filled as the code lands, in the same commit.

## AC to requirement

| AC    | Served by            |
| ----- | --------------------- |
| AC-01 | FR-04, FR-05, FR-07   |
| AC-02 | FR-01, FR-04          |
| AC-03 | FR-05                 |
| AC-04 | FR-05                 |
| AC-05 | FR-04                 |
| AC-06 | FR-04                 |
| AC-07 | FR-02, FR-03          |
| AC-08 | FR-09                 |
| AC-09 | FR-08                 |
| AC-10 | FR-02, FR-06          |

## Key symbols

| Symbol                        | Location                                                              |
| ------------------------------ | ------------------------------------------------------------------------ |
| `sendReminderEmail`            | `apps/api/src/modules/notifications/notifications.service.ts`          |
| `recordAndSendClaimFirst`      | `apps/api/src/modules/notifications/notifications.service.ts`          |
| `claimReminderSent`            | `apps/api/src/modules/notifications/notifications.repository.ts`       |
| `listConfirmedBookingsForDate` | `apps/api/src/modules/reminders/reminders.repository.ts`               |
| `runReminders`                 | `apps/api/src/modules/reminders/reminders.service.ts`                  |
| `POST /api/internal/reminders/run` | `apps/api/src/modules/reminders/reminders.router.ts`, mounted in `apps/api/src/http/app.ts` |
| `requireReminderSecret`        | `apps/api/src/http/middleware/require-reminder-secret.ts`              |

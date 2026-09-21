# US-034 — traceability

|             |                                                                                  |
| ----------- | -------------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-034-email-configuration-and-failure-logging.md` |
| **Updated** | 2026-09-21                                                                       |

## Requirement to code

| Req    | File                                                              | Symbol / location | Proven by                                                | Status      |
| ------ | ------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------- | ----------- |
| FR-01  | `apps/api/src/infra/mailer/index.ts`                                | `sendMail`          | `apps/api/src/infra/mailer/index.spec.ts`                   | implemented |
| FR-02  | `apps/api/src/config/index.ts`                                      | `MAIL_PROVIDER` enum + production guard | `apps/api/src/config/index.spec.ts`         | implemented |
| FR-03  | `supabase/migrations/0006_notification_deliveries.sql`             | `notification_deliveries` | reviewed against `db-design.md` §1.5 (no migration test harness in this repo) | implemented |
| FR-04  | `apps/api/src/modules/notifications/notifications.service.ts`      | `recordAndSend`     | `apps/api/src/modules/notifications/notifications.service.spec.ts` | implemented |
| FR-05  | `apps/api/src/modules/notifications/notifications.service.ts`, `apps/api/src/infra/mailer/index.ts` | `recordAndSend`, `safeFailureReason`, `MailFailureReason` | `apps/api/src/modules/notifications/notifications.service.spec.ts` | implemented |
| FR-06  | `apps/api/src/modules/notifications/notifications.service.ts`      | `recordAndSend`     | `apps/api/src/modules/notifications/notifications.service.spec.ts` | implemented |
| FR-07  | `eslint.config.mjs`                                                 | mailer boundary rule (amends existing blocks) | `npm run lint` + `apps/api/src/eslint-boundaries.spec.ts` | implemented |
| FR-08  | `.env.example`, `apps/api/src/config/index.ts`                      | `MAIL_PROVIDER` etc. | `apps/api/src/config/index.spec.ts`                          | implemented |
| NFR-01 | `apps/api/src/infra/mailer/index.ts`                                | `sendMail`          | `apps/api/src/infra/mailer/index.spec.ts`                   | implemented |
| NFR-02 | `apps/api/src/modules/notifications/notifications.repository.ts`   | `insertDelivery`    | `apps/api/src/modules/notifications/notifications.repository.spec.ts` | implemented |

Every `FR-##`/`NFR-##` above gets its row updated to `implemented` as the code lands, in the
same commit — never reconstructed afterwards.

## Key symbols

| Symbol             | Location                                                       |
| ------------------- | ---------------------------------------------------------------- |
| `sendMail`           | `apps/api/src/infra/mailer/index.ts`                              |
| `recordAndSend`      | `apps/api/src/modules/notifications/notifications.service.ts`     |
| `insertDelivery`     | `apps/api/src/modules/notifications/notifications.repository.ts`  |
| `notification_deliveries` | `supabase/migrations/0006_notification_deliveries.sql`      |

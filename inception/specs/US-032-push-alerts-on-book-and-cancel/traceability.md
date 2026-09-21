# US-032 — traceability

|             |                                                                        |
| ----------- | ---------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-032-push-alerts-on-book-and-cancel.md` |
| **Updated** | 2026-09-21                                                              |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status |
| ------ | ---- | ------------------ | --------- | ------ |
| FR-01  | `apps/api/src/modules/notifications/notifications.service.ts:159,270` | `recordAndSend` (channel dispatch), `recordAndSendPush` | `notifications.service.spec.ts` | implemented |
| FR-02  | `apps/api/src/modules/notifications/notifications.service.ts:401,433` | `sendBookingConfirmation`, `sendBookingCancellation` (fan-out) | `notifications.service.spec.ts` | implemented |
| FR-03  | `apps/api/src/modules/notifications/notifications.service.ts:73` | `SendPushInput.kind` | `notifications.service.spec.ts` (AC-06) | implemented |
| FR-04  | `apps/api/src/modules/notifications/notifications.service.ts:254` | `findPushRecipients` | `notifications.service.spec.ts` (AC-05), `notifications.repository.spec.ts` | implemented |
| FR-05  | `apps/api/src/modules/notifications/notifications.service.ts:270` | `recordAndSendPush` | `notifications.service.spec.ts` (AC-09) | implemented |
| FR-06  | `apps/api/src/modules/notifications/notifications.service.ts:352` | `sendBookingPush` | `notifications.service.spec.ts` (AC-10) | implemented |
| FR-07  | `apps/api/src/modules/notifications/notifications.service.ts:352` | `sendBookingPush` wording | `notifications.service.spec.ts` (AC-03, AC-04) | implemented |
| FR-08  | `apps/api/src/infra/webpush/index.ts:45,78` | `sendPush`, `PushFailureReason`, `SendPushResult` | `apps/api/src/infra/webpush/index.spec.ts` | implemented |
| FR-09  | `apps/api/src/modules/notifications/notifications.repository.ts:194`, `notifications.service.ts:270` | `deletePushSubscriptionByEndpoint`, `recordAndSendPush` | `notifications.service.spec.ts` (AC-08) | implemented |
| FR-10  | `apps/api/src/infra/webpush/index.ts:78` | `sendPush` (`vapidDetails`) | `apps/api/src/infra/webpush/index.spec.ts` | implemented |
| FR-11  | `apps/api/src/infra/webpush/index.ts:78` | `sendPush` (no `contentEncoding`) | `apps/api/src/infra/webpush/index.spec.ts` | implemented |
| FR-12  | `apps/api/src/infra/webpush/index.ts:51,55` | `PUSH_TTL_SECONDS`, `PUSH_TIMEOUT_MS` | `apps/api/src/infra/webpush/index.spec.ts` | implemented |
| FR-13  | `apps/api/src/modules/notifications/notifications.service.ts:270` | `recordAndSendPush` failure log (`endpoint`, never `recipient`) | `notifications.service.spec.ts` (redaction) | implemented |
| FR-14  | `apps/ui/public/sw.js:30` | `push` listener | manual (DevTools, blocked in this session's browser pane by an embedded-browser SW restriction — see PR notes) | implemented |
| FR-15  | `apps/ui/public/sw.js:47` | `notificationclick` listener | manual (same caveat) | implemented |
| NFR-01 | `apps/api/src/modules/notifications/notifications.service.ts:352` | `sendBookingPush`'s try/catch; `infra/webpush`'s `sendPush`'s never-throwing contract | `notifications.service.spec.ts` (AC-08) | implemented |
| NFR-02 | `apps/api/src/modules/notifications/notifications.service.ts:270`, `apps/api/src/infra/webpush/index.ts:78` | redaction discipline; closed `PushFailureReason` | `notifications.service.spec.ts`, `apps/api/src/infra/webpush/index.spec.ts` | implemented |

## Key symbols

| Symbol | Location |
| --- | --- |
| `recordAndSendPush` | `apps/api/src/modules/notifications/notifications.service.ts:270` |
| `findPushRecipients` | `apps/api/src/modules/notifications/notifications.service.ts:254` |
| `sendBookingPush` | `apps/api/src/modules/notifications/notifications.service.ts:352` |
| `sendPush` | `apps/api/src/infra/webpush/index.ts:78` |
| `listPushSubscriptions` | `apps/api/src/modules/notifications/notifications.repository.ts:184` |
| `deletePushSubscriptionByEndpoint` | `apps/api/src/modules/notifications/notifications.repository.ts:194` |
| `markPushSubscriptionDelivered` | `apps/api/src/modules/notifications/notifications.repository.ts:200` |

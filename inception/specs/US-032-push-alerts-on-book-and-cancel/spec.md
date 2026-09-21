# US-032 — Get a push alert when a booking is made or cancelled

|                   |                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-032-push-alerts-on-book-and-cancel.md`           |
| **Traces to**     | REQ-027, BR-001.15, BR-001.16, BR-001.20, V-14                                       |
| **Screen**        | none — push is rendered by the browser; the gating control is SCR-004 (US-031)      |
| **Covering ADRs** | ADR-004 (exception, already granted, US-031), ADR-015 (dependency, no amendment)     |
| **Tier**          | Complex                                                                              |
| **Status**        | implemented                                                                          |
| **Updated**       | 2026-09-21                                                                           |

## Problem

`recordAndSend` (`notifications.service.ts`) sends email only; `infra/webpush` serves only the
VAPID public key (US-031). Nothing sends a push when a booking is confirmed or cancelled, and
`push_subscriptions`/`notification_deliveries` already carry the columns to record one
(`0006`/`0007`, built ahead of this story). This story adds the send: a third arm of
`recordAndSend` for `channel: 'push'`, fanned out from inside `sendBookingConfirmation` and
`sendBookingCancellation` to every opted-in subscription, and the service worker's `push` /
`notificationclick` handlers that were stubbed in US-031 for this story to fill.

Full technical design: [`design-note.md`](design-note.md) (Architect, advisory). This file is the
FR breakdown Gate D1 reads; the design note is where each decision's reasoning lives.

## Functional requirements

| ID    | Requirement                                                                                                                      | Priority | Serves               | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------- | ----------- |
| FR-01 | `recordAndSend` dispatches a `channel: 'push'` input to a third internal arm (`recordAndSendPush`), alongside its existing email and reminder-claim arms — not a second send path | Must     | AC-01, AC-02          | implemented |
| FR-02 | `sendBookingConfirmation` and `sendBookingCancellation` each await their email send, then fan a push out unconditionally (never gated on the email's outcome), and return the email's `RecordAndSendResult` unchanged. No router or service call site changes | Must     | AC-01, AC-02, AC-07, AC-08 | implemented |
| FR-03 | The push input's `kind` is typed `'confirmation' \| 'cancellation'` — `'reminder'` is excluded at the type level, so `sendReminderEmail` cannot reach the push path | Must     | AC-06                 | implemented |
| FR-04 | `findPushRecipients(userId)` reads `push_opt_in` first and returns `[]` **without** reading `push_subscriptions` when the flag is false | Must     | AC-05                 | implemented |
| FR-05 | Exactly one `sendNotification` call and one `notification_deliveries` row (`channel: 'push'`, `recipient` = the endpoint) per subscription per event; no retry loop | Must     | AC-09                 | implemented |
| FR-06 | The push targets only `input.userId`'s subscriptions — no admin id, no second lookup, no parameter naming another account | Must     | AC-10                 | implemented |
| FR-07 | Push composes its own title/body from `cancellationCopy(source).actorClause` and `formatShortDate`, ignoring `includeRebookInvite`; the email subject/body are unchanged | Must     | AC-03, AC-04           | implemented |
| FR-08 | `infra/webpush` exposes a never-throwing send function returning a closed `PushFailureReason` set (`subscription_gone` \| `push_rejected` \| `push_unreachable` \| `push_unknown`); `WebPushError.body`/`.headers`/`.endpoint` never leave the module | Must     | AC-08                 | implemented |
| FR-09 | A `subscription_gone` result (404/410) writes the failed delivery row first, then hard-deletes that one `push_subscriptions` row by endpoint. No other outcome deletes anything | Must     | AC-08, db-design.md §1.4 | implemented |
| FR-10 | VAPID details are passed per call via `options.vapidDetails`; `setVapidDetails` is never called | Must     | (design note §6.2)    | implemented |
| FR-11 | No `contentEncoding` is passed to `sendNotification` (the installed library's runtime default is `aes128gcm`) | Must     | (design note §6.2, C14) | implemented |
| FR-12 | An explicit `TTL` and `timeout` are passed to every `sendNotification` call | Must     | (design note §6.2, C15) | implemented |
| FR-13 | The endpoint never reaches a log line under the field name `recipient`, nor inside a raw subscription or error object — only under the field name `endpoint`, which `infra/logger` already redacts | Must     | security-standards.md | implemented |
| FR-14 | `sw.js`'s `push` handler wraps `showNotification` in `event.waitUntil(...)`, always shows a notification (including when `event.data` is absent or unparseable), and sets no `tag` | Must     | AC-09 (visible), NFR-006 | implemented |
| FR-15 | `sw.js`'s `notificationclick` handler closes the notification, then focuses an existing client or opens `/`. No action buttons, no other deep link | Must     | (story §UI, edge cases) | implemented |

## Non-functional requirements

| ID     | Requirement                                                                                      | Serves                  |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------- |
| NFR-01 | An undeliverable or slow push never delays or fails the booking/cancellation write it rides on — bounded by an explicit socket timeout and wrapped so it cannot throw out of the composer | NFR-005, NFR-006, RISK-007, AC-08 |
| NFR-02 | No subscription endpoint, key, or raw push-service response body ever reaches a log line            | security-standards.md     |

## Technical constraints

All from the Architect design note, §10 (`design-note.md`) — cited here, not restated:

- C1–C8 are **blocker**: fan-out stays internal to the two composers (no call-site diff); email
  before push, push unconditional and wrapped; AC-06 enforced by the type, not a branch;
  `findPushRecipients` checks the flag before ever reading subscriptions; the endpoint is never
  logged under `recipient`; `infra/webpush` never throws and its failure set is closed; only the
  owner's subscriptions are targeted; one send and one delivery row per subscription per event.
- C9–C18 are **major**: the 404/410 hard-delete order, the wording composition rule, the service
  worker's `waitUntil`/no-`tag` rules, the per-call VAPID form, no `contentEncoding`, explicit
  `TTL`/`timeout`, awaited concurrent fan-out, the `sendPush` test seam, the payload shape.
- C19–C23 are **minor/nit**: `last_success_at` stamping, `formatShortDate` on both push messages,
  `notificationclick` behaviour, the "nothing new under migrations/config/eslint" constraint, and
  the two module README updates.
- The fan-out placement (§2 of the design note) is the single most important constraint in this
  story: it is what makes AC-06, AC-07 and AC-10 structural rather than conventions four call
  sites could each get wrong differently.

## Out of scope

- Any migration, `config/**` change, or `eslint.config.mjs` change — all three surfaces are
  already correctly shaped by US-031 (design note §0, §5).
- Any `libs/contracts` change — this story adds no route and no wire contract; the push payload is
  server-to-service-worker only (design note §7.1).
- A second, public `sendBookingPush` method on `NotificationsService` — the fan-out is internal
  (design note §2.1).
- Retry, queueing, backoff, or a dead-letter path for a failed push — AC-08 says "logged rather
  than surfaced," and `app-architecture.md` §6 already rejects a queue at this size.
- Push for reminders, in any form (BR-001.16).
- Any change to `cancellation-copy.ts`, or to the confirmation/cancellation email subject or body.
- Action buttons or a deep link on the notification — the story's own edge cases exclude both.
- Any admin-facing push, or any parameter that could name a recipient other than the booking
  owner (AC-10).

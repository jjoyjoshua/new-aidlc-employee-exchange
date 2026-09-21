# US-032 — impact analysis

|             |                                                                        |
| ----------- | ---------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-032-push-alerts-on-book-and-cancel.md` |
| **Tier**    | Complex                                                                 |
| **Updated** | 2026-09-21                                                              |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| Contract                 | no       | No route, no request/response shape, no `libs/contracts` change. The push payload is server-to-service-worker only, documented in code comments on both ends (design note §7.1) |
| Persistence               | no       | `notification_channel` already accepts `'push'` (`0006`); `push_subscriptions` was created whole by US-031 (`0007`), `last_success_at` included. No migration |
| Trust                    | yes      | The first story to actually POST to a client-supplied `endpoint` — the blind-SSRF residual US-031 accepted "at US-032" (design note §4.4) goes live here. The validating schema itself is unchanged |
| Dependency & integration | yes      | The project's first real outbound third-party integration at runtime — `web-push`'s `sendNotification` against live push services. The dependency itself was already approved and added at US-031/ADR-015; this story is the first call site |
| Operational               | yes      | The service worker's `push`/`notificationclick` handlers go from stubs to real bodies (Complex by name, `task-surfaces.md`); `recordAndSend` gains a third dispatch arm |

## Files and callers

| File | Symbol | Change | Callers found (`file:line`) |
| --- | --- | --- | --- |
| `apps/api/src/modules/notifications/notifications.service.ts` | `SendNotificationInput`, `recordAndSend`, `recordAndSendPush` (new), `sendBookingPush` (new, internal) | modify | `recordAndSend` called internally only (`:122`, `:219`, `:243`); no external caller changes |
| `apps/api/src/modules/notifications/notifications.service.ts` | `sendBookingConfirmation`, `sendBookingCancellation` | modify (body only — signature unchanged) | `bookings.router.ts:165`, `bookings.router.ts:221`, `admin.router.ts:336`, `admin.router.ts:610` — all four call sites keep their existing call, no diff |
| `apps/api/src/modules/notifications/notifications.service.ts` | `NotificationsServiceDeps` | modify (add `sendPush` port) | `notifications.service.spec.ts` (fakes), the real wiring at the file's bottom |
| `apps/api/src/modules/notifications/notifications.repository.ts` | `findPushRecipients` (new), `listPushSubscriptions` (new), `deletePushSubscriptionByEndpoint` (new), `markPushSubscriptionDelivered` (new) | modify (add) | `notifications.service.ts` only |
| `apps/api/src/infra/webpush/index.ts` | `sendPush` (new), `PushFailureReason`, `SendPushResult` (new types) | modify (add) | `modules/notifications` only — `eslint.config.mjs`'s existing `WEBPUSH_BAN` enforces this, unchanged |
| `apps/api/src/infra/webpush/README.md` | — | modify (record the send surface, correct the `setVapidDetails` line) | — |
| `apps/api/src/modules/notifications/README.md` | — | modify (record the third `recordAndSend` arm) | — |
| `apps/ui/public/sw.js` | `push`, `notificationclick` listeners | modify (fill the US-031 stubs) | browser only |
| `apps/api/src/modules/notifications/notifications.service.spec.ts` | — | modify (new describe blocks; existing US-028/US-029/US-030 blocks unchanged) | n/a (test file) |
| `apps/api/src/modules/notifications/notifications.repository.spec.ts` | — | modify | n/a (test file) |
| `apps/api/src/infra/webpush/index.spec.ts` | — | create | n/a (test file) |

## Regression risk

| Area | Risk | Why | Covered by |
| --- | --- | --- | --- |
| US-028/US-029 email sending | medium | `sendBookingConfirmation`/`sendBookingCancellation` bodies change to add the push fan-out; a mistake here could alter the email path they already own | Existing `notifications.service.spec.ts:437-632` assertions must pass unmodified; FR-02/C2 require the email call and its returned result to be byte-for-byte unchanged |
| US-030 reminder path | none (verified, not touched) | The push input type structurally excludes `kind: 'reminder'` (FR-03/C3); `recordAndSendClaimFirst` is not touched | `notifications.service.spec.ts:623-632`'s existing claim-first regression test, plus a new AC-06 assertion that `sendPush` is never called from the reminder path |
| `notification_deliveries` reminder partial-unique index | none (verified) | The index excludes `channel`, and only `kind: 'reminder'` rows are constrained by it; push never writes `kind: 'reminder'` | Structural (FR-03); stated explicitly in the PR per `0006:44-47`'s own warning |
| A booking/cancellation request's latency | medium | The push fan-out is awaited inline (D-05); a deactivation cascade with several bookings and multiple browsers per employee adds several bounded (10s, D-02) outbound calls to one request | Bounded per-call timeout; fan-out is concurrent across subscriptions, not sequential (design note §3.1) |
| Endpoint leaking into logs | medium | `recordAndSend`'s existing failure log writes `recipient: input.recipient` (`:129-134`); copying that line into the push arm would log a capability URL under a field name `infra/logger` does not redact | FR-13/C5 — a dedicated logger assertion that the push arm never logs the endpoint under `recipient` |
| `infra/webpush` dependency | low | First real outbound call using `web-push`; a malformed VAPID key would already refuse boot (US-031 §7), so the residual is a live push-service rejection, which is exactly what `PushFailureReason` and AC-08 exist to absorb | `infra/webpush/index.spec.ts` against a mocked `web-push`; AC-08's assertion that a rejected send never throws out |

## Deliberately not touched

- `bookings.router.ts`, `admin.router.ts`, `users.service.ts` — no call site changes; the fan-out
  is internal to the two composers (design note §2.1, FR-02).
- `cancellation-copy.ts` — its output is reused, not modified.
- `sendReminderEmail` — no fan-out; the reminder path is untouched by this story.
- `supabase/migrations/**`, `apps/api/src/config/**`, `libs/contracts/**`, `eslint.config.mjs` —
  all already correctly shaped by US-031; a diff in any of them means something was assumed rather
  than checked (design note §0, §12).
- `apps/ui/src/main.tsx` and the worker's registration point — the worker installed by US-031
  persists and wakes for a `push` event with no page open; nothing here re-registers it.
- Any admin-facing screen or route — no admin receives a push (AC-10).

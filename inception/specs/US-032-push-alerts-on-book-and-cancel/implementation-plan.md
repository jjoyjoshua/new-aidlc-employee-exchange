# US-032 — implementation plan

|           |                                                                        |
| --------- | ------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-032-push-alerts-on-book-and-cancel.md` |
| **Spec**  | `spec.md`                                                                 |
| **Tier**  | Complex                                                                   |

## Approval — Gate D1

| Field                | Value                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| Status                | **approved**                                                                |
| Approved by           | Joy Joshua <joy_j@trigent.com>                                             |
| Approved on            | 2026-09-21                                                                  |
| Plan commit approved  | *uncommitted at approval* — base `b7e325d6011b8530212328994bbd486d2d3c13b1` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`.
`Plan commit approved` is the SHA of the commit holding this plan as they read it. The name is
self-asserted — attribution, not authentication.

**Before saying `go`, please look at `decisions.md` D-01 through D-06** — six calls the Architect's
design note flagged as the human's to make (its §11 "open items"), which DEV has adopted with the
Architect's own recommended default rather than blocking on them individually. Any one can be
overridden by telling DEV what to change instead of `go`.

## Steps

Ordered. Test-first per acceptance criterion: the failing test named `... (US-032/AC-##)` is
written before the code that turns it green. Full reasoning for each non-obvious call is in
[`design-note.md`](design-note.md) — cited by section, not repeated.

### Step 1 — `infra/webpush`: the send wrapper

| Field    | Value |
| -------- | ----- |
| Advances | FR-08, FR-10, FR-11, FR-12 |
| Files    | `apps/api/src/infra/webpush/index.ts` (modify — add `sendPush`, `PushFailureReason`, `SendPushResult`), `apps/api/src/infra/webpush/index.spec.ts` (create), `apps/api/src/infra/webpush/README.md` (modify — record the send surface, correct the `setVapidDetails` line per design note §6.2) |
| Verify   | `npm run test -w apps/api -- infra/webpush` — a mocked `web-push` module: a 2xx resolves `{ ok: true }`; a `WebPushError` with `statusCode: 404` or `410` maps to `subscription_gone`; any other 4xx maps to `push_rejected`; a 5xx or a plain network `Error` maps to `push_unreachable`; `.body`/`.headers`/`.endpoint` never appear in the returned error. Also paste a real run proving the named `web-push` import resolves at runtime under this project's ESM config (design note open item 6, D-07) |

### Step 2 — Repository: push recipients and lifecycle

| Field    | Value |
| -------- | ----- |
| Advances | FR-04, FR-09 |
| Files    | `apps/api/src/modules/notifications/notifications.repository.ts` (modify — add `findPushRecipients`, `listPushSubscriptions`, `deletePushSubscriptionByEndpoint`, `markPushSubscriptionDelivered`), `apps/api/src/modules/notifications/notifications.repository.spec.ts` (modify) |
| Verify   | `npm run test -w apps/api -- notifications.repository` — `findPushRecipients` with the flag false never calls the subscriptions read (assert on the fake's call log, not just the return value, `... (US-032/AC-05)`); delete-by-endpoint removes exactly the matching row |

### Step 3 — Service: the third `recordAndSend` arm and the internal fan-out

| Field    | Value |
| -------- | ----- |
| Advances | FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-13 |
| Files    | `apps/api/src/modules/notifications/notifications.service.ts` (modify — `SendNotificationInput` discriminated union, `recordAndSendPush`, internal `sendBookingPush`, wire the fan-out into `sendBookingConfirmation`/`sendBookingCancellation`; `NotificationsServiceDeps` gains `sendPush`), `apps/api/src/modules/notifications/notifications.service.spec.ts` (modify — new describe blocks; existing US-028/US-029/US-030 blocks must pass unmodified) |
| Verify   | `npm run test -w apps/api -- notifications.service` — full matrix: AC-01/AC-02 (push sent alongside email), AC-03/AC-04 (wording differs by `cancellationSource`, all three sources), AC-05 (flag off ⇒ no subscriptions read), AC-06 (`sendReminderEmail` never calls `sendPush`), AC-07 (email unaffected by a push failure; push unaffected by an email failure), AC-08 (a `subscription_gone` result still resolves `{ ok: true }` from the composer and deletes the row), AC-09 (two subscriptions ⇒ two sends, two rows; a 3-booking cascade ⇒ three per subscription), AC-10 (admin-cancel path targets only `outcome.ownerId`'s subscriptions). Existing `notifications.service.spec.ts:437-632` assertions pass with zero edits to their expectations |

### Step 4 — Service worker: fill the US-031 stubs

| Field    | Value |
| -------- | ----- |
| Advances | FR-14, FR-15 |
| Files    | `apps/ui/public/sw.js` (modify — `push` and `notificationclick` handler bodies) |
| Verify   | Manual: `npm run dev -w apps/ui`, DevTools → Application → Service Workers, trigger a test push via DevTools' "Push" button with a `{title, body}` JSON payload and confirm a notification renders; confirm a malformed/absent payload still shows the generic fallback copy; confirm no constant `tag` (open a second test push and see two notifications, not one) |

### Step 5 — Module READMEs

| Field    | Value |
| -------- | ----- |
| Advances | (documents the third `recordAndSend` arm and the send surface) |
| Files    | `apps/api/src/modules/notifications/README.md` (modify), `apps/api/src/infra/webpush/README.md` (already updated in Step 1 — confirm it's consistent) |
| Verify   | Manual review |

### Step 6 — Traceability close-out

| Field    | Value |
| -------- | ----- |
| Advances | (housekeeping) |
| Files    | `traceability.md` (modify — every FR to `implemented`), `knowledge/traceability/manifest.json` (modify — US-032 entry, `requirements[]`, `acs[]`) |
| Verify   | `node tools/aidlc-check.mjs` — clean |

### Step 7 — Full sweep

| Field    | Value |
| -------- | ----- |
| Advances | all |
| Files    | none |
| Verify   | `npm run lint && npm run typecheck && npm run test` at the repo root — all green; paste the output in the PR. Confirm `npm audit` shows no new high/critical (no new dependency was added by this story — `web-push` is already in `package.json` from US-031) |

## Rollback

Revert the PR. No migration, no config change, no new dependency — the entire blast radius is
application code (`notifications.service.ts`, `notifications.repository.ts`,
`infra/webpush/index.ts`, `sw.js`) and is safe to revert wholesale. The one operational residual a
revert does not undo: any push notifications already delivered to browsers before the revert stay
delivered (there is nothing to recall), and any `notification_deliveries` rows already written
stay written, exactly as US-028/US-029's email rows do.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |
| — | — | — |

Design note open items 1–5 and 7 are resolved with the Architect's recommended default, recorded
as `decisions.md` D-01 through D-06, and presented for override at Gate D1 rather than blocking on
them individually. Open item 6 (the `web-push` import resolving at runtime) is a build-time
verification task tracked in Step 1, not a blocker to starting.

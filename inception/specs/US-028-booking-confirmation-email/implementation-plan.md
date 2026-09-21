# US-028 — implementation plan

> **The Gate D1 artifact.** The human reads this file, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                              |
| --------- | ------------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-028-booking-confirmation-email.md`         |
| **Tier**  | Medium                                                                        |

## Approval — Gate D1

| Field                | Value           |
| --------------------- | ---------------- |
| Status                | **approved**    |
| Approved by            | Joy Joshua <joy_j@trigent.com> |
| Approved on            | 2026-09-21      |
| Plan commit approved  | *uncommitted at approval* — base `6547be807d7c065c1c0ea1b98277d20878ad745a` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan
commit approved` is the SHA of the commit holding this plan as they read it. The name is
self-asserted — attribution, not authentication.

## Steps

### Step 1 — the confirmation composer

| Field    | Value                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Advances | AC-01, AC-02, AC-03, AC-04, AC-08                                                                                          |
| Files    | `apps/api/src/modules/notifications/notifications.service.ts` (modify), `apps/api/src/modules/notifications/notifications.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- notifications.service` — expected: green                                                         |

Failing tests first, named `... (US-028/AC-0#)`:

- `sendBookingConfirmation` calls `recordAndSend` with `kind: 'confirmation'`, the given `bookingId`/`userId`, `recipient` equal to the given `email` and no other address (AC-01, AC-03)
- the composed body/subject names the desk number and the booking date (AC-02) — asserted against the fake `send`'s captured message, not against `recordAndSend`'s return value (never assert the mock — this fake exists to observe what was actually composed, the one thing this step adds)
- calling it is unconditional — there is no parameter or config value that suppresses it (AC-04, a structural absence — no opt-in flag exists on `user_profiles` and this function reads none)
- the message handed to `send` carries only `to`/`subject`/`body` — no sender field for this composer to set, since `MailMessage` has none and the address comes from `config()` inside `sendMail` (US-034) — proving AC-08 from this story's own side without re-proving US-034's mechanism

`sendBookingConfirmation(input: { bookingId, userId, email, deskNumber, date }): Promise<RecordAndSendResult>` — composes `subject`/`body` from `deskNumber`/`date` (D-01), then `return recordAndSend({ kind: 'confirmation', bookingId, userId, recipient: email, subject, body })`. No new AC-08 test: `recordAndSend` already sources the sender/transport from `config()` (US-034), and this function does not touch that.

### Step 2 — wire it into booking creation

| Field    | Value                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Advances | AC-01, AC-05, AC-06, AC-07                                                                                           |
| Files    | `apps/api/src/modules/bookings/bookings.router.ts` (modify), `apps/api/src/composition.ts` (modify)                |
| Verify   | `npm test -w apps/api -- bookings.routes` — expected: green (existing US-007/009/011 tests unaffected)              |

`BookingsRouterDeps` gains `notifications: Pick<NotificationsService, 'sendBookingConfirmation'>` (D-04). `POST /` calls and awaits it only when `outcome.kind === 'ok'`, using `user.email` — the same value the response's existing `confirmationEmail` field already carries (AC-01, AC-06 — `requireSession` reloads `user_profiles` per request, so this is always the account's current address, not a cached one). The 201 response is unchanged and unaffected by the result (AC-07 — `recordAndSend` never throws; the response ships regardless).

`composition.ts` wires the real `notificationsService` by default, with a new `BuildAppOptions.notifications` test seam (matching `availability`/`adminBookings`/`desks`/`users`) so `bookings.routes.spec.ts`'s existing `appWith` helper can keep injecting a no-op fake without needing `MAIL_*` config.

AC-05 ("one booking, one email, including across the US-007/AC-10 retry") needs no new code: only the branch that reaches `outcome.kind === 'ok'` sends anything, and the same partial unique index that already makes a retried request land on `user_conflict`/`desk_conflict` (never a second `ok`) makes a second send structurally unreachable. A test proves this by asserting the fake notifications double is called exactly once across two sequential identical requests.

### Step 3 — route-level tests and the AC-07 failure path

| Field    | Value                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------ |
| Advances | AC-01, AC-03, AC-05, AC-06, AC-07                                                                  |
| Files    | `apps/api/src/modules/bookings/bookings.routes.spec.ts` (modify)                                 |
| Verify   | `npm test -w apps/api -- bookings.routes` — expected: green, including the new AC-citing tests    |

`appWith`'s default `notifications` fake becomes a recording no-op (`{ async sendBookingConfirmation() { calls.push(...); return { ok: true, recorded: true }; } }`), so every existing US-007/009/011 test keeps passing unchanged and this story's new tests can read `calls` back. New tests, against the real route (matching this file's own stated reason for existing — a serialized-body proof, not a function's return value):

- a successful `POST /api/bookings` calls the fake exactly once with the caller's email, the created booking's id, and the desk/date it just created (AC-01, AC-02, AC-06)
- two sequential identical `POST /api/bookings` (the US-007/AC-10 retry shape already covered in this file) result in exactly one call (AC-05)
- a `notifications` fake that resolves `{ ok: false, error: 'transport_unreachable', recorded: true }` still returns `201` with the booking, unaffected (AC-07) — the booking is not lost when mail fails
- a `notifications` fake that **throws** still returns `201` — the router wraps the call in its own `try/catch` (D-05) rather than trusting `recordAndSend`'s "never throws" contract three files away; a caught error here is logged, never surfaced to the response

### Step 4 — traceability

| Field    | Value                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------- |
| Advances | bookkeeping                                                                                          |
| Files    | `traceability.md` (modify), `knowledge/traceability/manifest.json` (modify — `US-028.tests[]`), `inception/specs/index.md` (modify — add row) |
| Verify   | `node tools/aidlc-check.mjs` — expected: passes                                                       |

## Rollback

Revert the PR. No schema change, no new endpoint, no new required config. A revert restores
`POST /api/bookings` to sending no confirmation, which is the pre-US-028 behaviour exactly.

## Open questions

None. Every load-bearing fact was verified by reading (`bookings.router.ts`, `bookings.service.ts`,
`composition.ts`, `bookings.routes.spec.ts`, `notifications.service.ts`, `modules/README.md`)
rather than assumed. The one technical judgment call — whether to defend `bookings.router.ts`
against a future regression in `recordAndSend`'s "never throws" contract — is recorded as D-05
in `decisions.md`, not left open: wrap the call in its own `try/catch` regardless, since one
extra guard is cheap and AC-07 reads more honestly as a property of this code path too, not only
of a dependency's contract three files away.

# US-030 — Get a reminder email the day before

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do.

|                   |                                                                          |
| ----------------- | ------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-030-day-before-reminder-email.md`    |
| **Traces to**     | REQ-025, BR-001.14, BR-001.16, V-13, NFR-001                             |
| **Screen**        | none — no UI                                                              |
| **Covering ADRs** | none — `app-architecture.md` §4.3 and US-034's `design-note.md` §2.3 already settle the design questions an ADR would otherwise raise (see `decisions.md` D-00) |
| **Tier**          | Complex                                                                  |
| **Status**        | implemented                                                              |
| **Updated**       | 2026-09-21                                                               |

## Problem

Nothing in this system runs on a schedule today — every send so far is caused by a one-time user
action (US-028, US-029). This story is the first scheduled job: a confirmed booking for tomorrow
gets no reminder unless something calls a run at 08:00 office time, and that run must survive
being called twice without double-emailing the office (REQ-025, BR-001.14).

The mechanism is already designed, not invented here: `app-architecture.md` §4.3 specifies an
ordinary route (`POST /api/internal/reminders/run`) guarded by a shared secret rather than a
session, idempotent via a partial unique index already built (`0006_notification_deliveries.sql`).
US-034's own `design-note.md` §2.3 additionally specifies that `recordAndSend` must be *extended*
for a claim-before-send flow, not duplicated. This spec turns both into code.

## Functional requirements

| ID    | Requirement                                                                                                                                                         | Priority | Serves                          | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------- | ----------- |
| FR-01 | `notifications.service.ts` gains `sendReminderEmail(input)`, composing subject/body naming the desk number and `formatShortDate(date)`, then calling `recordAndSend` | Must     | AC-02                              | implemented |
| FR-02 | `recordAndSend` is extended, not duplicated: for `kind === 'reminder'` it claims the delivery row FIRST (insert as `sent`), and calls the transport only if the claim succeeds; for `confirmation`/`cancellation` its existing send-then-record behaviour is byte-for-byte unchanged | Must     | AC-07, AC-10                       | implemented |
| FR-03 | `notifications.repository.ts` gains `claimReminderSent`/`markDeliveryFailed`; a `23505` naming the reminder partial-unique index maps to `{ claimed: false }` — an EXPECTED outcome, never a thrown error (US-034 design-note.md §2.3's own instruction) | Must     | AC-07                              | implemented |
| FR-04 | A new `modules/reminders` repository lists every **Confirmed** booking on a given date, with its desk number and the owner's current email, in one query | Must     | AC-01, AC-02, AC-05, AC-06         | implemented |
| FR-05 | The reminders service computes tomorrow via `officeToday(nowMs(), officeTimezone)` + `addDays(..., 1)` — never the server's local clock or a UTC assumption — and sends nothing when tomorrow is a weekend (`isWeekend`, already in `@desk-booking/contracts`) | Must     | AC-01, AC-03, AC-04, Monday edge case | implemented |
| FR-06 | The service calls `sendReminderEmail` once per listed booking; one failed send is logged and does not stop the remaining ones | Must     | AC-10                              | implemented |
| FR-07 | A new `POST /api/internal/reminders/run` route, mounted behind a new shared-secret middleware (never a user session), calls the service and returns a run summary — the callable surface an external scheduler invokes once daily | Must     | AC-01                              | implemented |
| FR-08 | The reminder composer and service hold no push dependency at all — structurally incapable of sending a push notification, never a runtime branch that happens to skip one | Must     | AC-09                              | implemented |
| FR-09 | The service is stateless per invocation: there is no catch-up/backfill of a missed run, no history of past invocations — a booking created after the day's run gets nothing until the day itself, by construction, not by a guard checking the clock | Must     | AC-08                              | implemented |

## Non-functional requirements

| ID     | Requirement                                                                                          | Serves        |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------- |
| NFR-01 | Office-local 08:00 resolves via the same `officeToday`/timezone-config pattern every other date rule in this codebase uses — never a UTC literal (NFR-001) | AC-01, AC-03  |
| NFR-02 | A failed reminder send is logged with enough detail for operational follow-up, never silently dropped (NFR-005, RISK-006) | AC-10         |

## Technical constraints

- No literal wording lives outside `notifications` — same discipline as US-028/US-029.
- `recordAndSend`'s existing two callers (`sendBookingConfirmation`, `sendBookingCancellation`)
  must show zero behavioural change — proven by re-running their existing test suites unmodified.
- The route carries no request body and needs no `libs/contracts` schema — it takes no input
  beyond the secret header (`app-architecture.md` §4.3).
- No new npm dependency: no in-process scheduler, no cron library. The route is triggered
  externally; `app-architecture.md` §4.3 explicitly rejects an in-process timer as the default.
- `channel` is never part of the reminder idempotency index (`0006_notification_deliveries.sql:44-47`)
  — this story must not add a push send that could collide with it.

## Out of scope

- **Which scheduler calls the route** (`pg_cron`, a host scheduler, GitHub Actions cron). Settled
  as an open, hosting-merits-only decision for Gate 3/DevOps (`app-architecture.md` §7's open
  question #3) — the route's correctness does not depend on the answer. This PR ships no cron
  configuration, no GitHub Actions schedule, no `pg_cron` statement.
- Push reminders — BR-001.16 rules them out entirely (AC-09); US-031/US-032 own push.
- A BRD amendment to send the Monday case on Friday instead of Sunday — confirmed with the human
  as out of scope for this story: build BR-001.14 exactly as written.

# US-034 — Transactional email is configured, not hard-coded, and failures are logged

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do.

|                   |                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-034-email-configuration-and-failure-logging.md`                |
| **Traces to**     | NFR-005, NFR-007                                                                                  |
| **Screen**        | none — no UI                                                                                       |
| **Covering ADRs** | none — no new ADR (§ Decisions §D-01 explains why)                                                 |
| **Tier**          | Complex                                                                                            |
| **Status**        | implemented                                                                                        |
| **Updated**       | 2026-09-21                                                                                         |

## Problem

Nothing in the server sends mail yet. `apps/api/src/config/index.ts` already validates
`MAIL_PROVIDER`/`MAIL_API_KEY`/`MAIL_FROM_ADDRESS` as required, non-defaulted values (added at
scaffold time, ahead of this story), and `.env.example` ships them blank — so AC-01–AC-04's
*configuration* half is already true. What is missing is everything downstream of that
configuration: a transport that actually dispatches through it, a place to record every attempt
(`notification_deliveries` does not exist yet), and a single path the three message stories
(US-028, US-029, US-030) will each call so none of them invents its own.

## Functional requirements

| ID    | Requirement                                                                                                                                   | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01 | `infra/mailer` exposes `sendMail(message)`; the sender is always `config().MAIL_FROM_ADDRESS` and the transport is always chosen from `config().MAIL_PROVIDER` — no literal address or provider name in the module | Must     | AC-01, AC-02 | implemented |
| FR-02 | `MAIL_PROVIDER` is a closed enum of implemented transports (`['console']`), enforced by `config()` at **boot**, not at first send — an unimplemented value refuses to start the process, matching the boot-time guarantee `app-architecture.md` §5.4 already promises for this AC (design note §1.2, F-3) | Must     | AC-04        | implemented |
| FR-03 | Migration creates `notification_deliveries` and its three enums (`notification_channel`, `notification_kind`, `delivery_outcome`) plus the reminder partial-unique index, exactly per `db-design.md` §1.5/§3, created whole though unexercised until US-028/029/030 | Must     | AC-05        | implemented |
| FR-04 | `modules/notifications` exposes one function, `recordAndSend(input)` — the single path — that sends via the mailer and writes exactly one `notification_deliveries` row per attempt (`sent` or `failed`) | Must     | AC-05, AC-08 | implemented |
| FR-05 | A failed attempt is logged via `logger.error` with the message kind, the booking id, the recipient, the timestamp and a **sanitized, bounded** failure reason — never the raw transport error, a response body, or a credential, in either the log line or the recorded row (design note §4, F-5) | Must     | AC-05, AC-06 | implemented |
| FR-06 | `recordAndSend` never throws **and never silently loses a failure**: if the delivery-log write itself fails, the attempt is still logged in full and the result says so (`recorded: false`) — so a caller's own booking/cancellation write is never put at risk, and a failure never vanishes (design note §2.2, F-4) | Must     | AC-05, AC-07 | implemented |
| FR-07 | `infra/mailer` is importable only from `modules/notifications`, enforced by amending the *existing* `eslint.config.mjs` boundary blocks (not a new one that would replace them) — a second mail path cannot appear silently, and neither can a silently-weakened boundary (design note §3.2–§3.4, F-1, F-7, F-8) | Must     | AC-08        | implemented |
| FR-08 | `MAIL_PROVIDER`/`MAIL_API_KEY`/`MAIL_FROM_ADDRESS` ship with no value in `.env.example`, said to be `TBD (owner: IT)` rather than left unexplained, and `config()` has no default for any of them — proven together with FR-01's own test that the sender always comes from a changed setting, never a literal (design note §6, F-2, F-11) | Must     | AC-03        | implemented |

## Non-functional requirements

| ID     | Requirement                                                                          | Serves  |
| ------ | ------------------------------------------------------------------------------------- | ------- |
| NFR-01 | Sender address and mail service come from configuration, never a compiled-in literal | NFR-007 |
| NFR-02 | Every failed send is queryable via `notification_deliveries`, not only greppable     | NFR-005 |

## Technical constraints

- **No new dependency.** The production mail provider is `TBD (owner: IT)` — the story forbids
  inventing it. The only transport implemented is `console`, which writes a structured log line
  through `infra/logger` and reports success; it is a real, working transport for local dev and
  demos, not a mock. Choosing an SDK now would be guessing a provider that isn't ours to guess.
  `console` is refused at boot when `NODE_ENV=production` (FR-02) — it never sends, so that
  combination would be silently dropped mail with a `sent` row to match.
- **Dispatch-after-commit is each caller's job, not this one's.** `app-architecture.md` §4.1 says
  sending must happen after the caller's transaction commits. `recordAndSend` takes no
  transaction and opens none — it is a plain async call a caller makes once its own write has
  already landed.
- **`recordAndSend` is send-then-record, and that is a documented seam, not a finished
  guarantee.** It is correct for the confirmation (US-028) and cancellation (US-029) paths, each
  caused by a one-time user action. The reminder run (US-030, `app-architecture.md` §4.3) is
  triggered by a scheduler that retries and needs a **claim before the send** — most likely
  inserting the `sent` row first, demoting it to `failed` if the transport rejects — which is
  what makes §4.3's "a retry resends only what failed" true. **US-030 must extend this function,
  not write a second one**, or AC-08 breaks (design note §2.3, F-6).
- `notifications` continues to import neither `bookings` nor `users` (existing eslint boundary).
  `recordAndSend`'s input is plain values (`bookingId`, `userId`, `recipient`, `subject`, `body`,
  `kind`), never another module's type. `channel` is not an input — this function is the email
  path and hardcodes it.

## Out of scope

- Message wording for the confirmation (US-028), cancellation (US-029) or reminder (US-030)
  email — each owns its own copy and calls `recordAndSend` with it.
- Push notifications — a separate channel (`infra/webpush`, untouched by this story).
- The real mail provider and its SDK — `TBD (owner: IT)`, and adding a dependency needs human +
  Architect approval this story does not have grounds to ask for yet.
- Retry policy, dead-letter queue, alerting/monitoring on the failure log — named out of scope by
  the story's own Edge cases.

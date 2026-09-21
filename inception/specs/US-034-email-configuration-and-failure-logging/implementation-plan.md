# US-034 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                                    |
| --------- | ------------------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-034-email-configuration-and-failure-logging.md`   |
| **Spec**  | `spec.md`                                                                            |
| **Tier**  | Complex                                                                              |

## Approval — Gate D1

| Field                | Value           |
| --------------------- | ---------------- |
| Status                | **approved**    |
| Approved by            | Joy Joshua <joy_j@trigent.com> |
| Approved on            | 2026-09-21      |
| Plan commit approved  | *uncommitted at approval* — base `756680c48c06b90036a9b764e6f5de66b1ea6367` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan
commit approved` is the SHA of the commit holding this plan as they read it. The name is
self-asserted — attribution, not authentication.

**Architect design note: done — `design-note.md` in this folder.** Verdict: proceed-with-changes.
No new ADR — every real decision here was already made in `app-architecture.md`/`db-design.md`;
the one genuine trade-off (which mail provider) is `TBD (owner: IT)` and earns its ADR when IT
names one, not now. D-01, D-02, D-04 endorsed on the merits. Two `blocker` findings resolved
below before any code: **F-1** — the originally planned lint block would have silently disabled
every import boundary in the project (flat config replaces, not merges); the fix instead amends
the existing blocks (Step 5, rewritten). **F-2** — AC-03 had no test anywhere in the package;
added (Step 6, rewritten). Four `major` findings folded into the steps: a production/`console`
guard on `MAIL_PROVIDER` (F-3, Step 2), a swallowed delivery-log failure (F-4, Step 4), a
redaction gap where a credential could hide in a failure-reason string (F-5, Step 2 + Step 4),
and a written-not-built seam for the reminder run's idempotency (F-6, Step 4). One
pre-existing, unrelated finding (F-7 — the module-boundary blocks never restated the Supabase
client ban) is fixed in the same Step 5 edit and called out in the PR description rather than
filed separately, since the fix is one line once F-1's block is rewritten. Minor/nit findings
F-8–F-12 folded into Steps 1, 2 and 5.

Sequencing note: this story exists to unblock US-028, which depends on it and is not itself
started.

## Steps

### Step 1 — the delivery-log table

| Field    | Value                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Advances | FR-03                                                                                                        |
| Files    | `supabase/migrations/0006_notification_deliveries.sql` (create)                                             |
| Verify   | Manual review against `db-design.md:190-210` (this repo has no migration test harness — same as `0001`–`0005`); `npx supabase db push` locally (not part of CI) |

Create `notification_deliveries` and the three enums (`notification_channel`,
`notification_kind`, `delivery_outcome`) exactly per `db-design.md` §1.5, plus the partial
unique index on `(booking_id, kind) WHERE kind = 'reminder' AND outcome = 'sent'`. FKs to
`bookings` and `user_profiles`, both `ON DELETE RESTRICT`, matching every other history table in
this schema. RLS enabled and forced, matching `0003_bookings.sql`'s pattern — this table is
server-only, no browser ever queries it directly. `id` defaults `gen_random_uuid()`,
`attempted_at` defaults `now()` (design note §5, F-9). Two comments go in the migration, not a
design change: `channel` is deliberately outside the reminder's partial unique index because
BR-001.16 makes the reminder email-only (a two-channel reminder cannot exist to collide); and
`booking_id`'s nullability is safe under that same index only because a reminder always names a
booking (design note §5).

### Step 2 — the mailer transport, and the config guard it needs

| Field    | Value                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02                                                                                                  |
| Files    | `apps/api/src/infra/mailer/index.ts` (create), `apps/api/src/infra/mailer/index.spec.ts` (create), `apps/api/src/infra/mailer/README.md` (modify), `apps/api/src/config/index.ts` (modify — **protected path, added after D1**; see impact-analysis.md), `apps/api/src/config/index.spec.ts` (modify — fixture + new case), `.env.example` (modify — one comment line) |
| Verify   | `npm test -w apps/api -- mailer config` — expected: every test green, including one asserting an unrecognised `MAIL_PROVIDER` is rejected **at boot**, and one asserting `MAIL_PROVIDER=console` under `NODE_ENV=production` is rejected at boot |

**Design-note change (F-3):** AC-04 is a boot-time guarantee in `app-architecture.md` §5.4, and
the original plan pushed it to first-send, where a `recordAndSend` catch (Step 4) would have
swallowed it. Fixed at the source instead:

```ts
// config/index.ts
MAIL_PROVIDER: z.enum(['console']),
```

plus a `superRefine` alongside the existing `SESSION_LAST_SEEN_THROTTLE_MINUTES` check, refusing
`NODE_ENV === 'production' && MAIL_PROVIDER === 'console'` — `console` never sends, so that
combination is silently dropped mail with a `sent` row to match, which is the exact failure
AC-04 forbids. `config/index.spec.ts`'s valid fixture (`MAIL_PROVIDER: 'postmark'`) becomes
`'console'`; add a case for the new production guard and one for a value outside the enum.

Failing tests first, named `... (US-034/AC-0#)`:

- `sendMail` sends the `from` address from `config().MAIL_FROM_ADDRESS`, never a literal (AC-01)
- with `MAIL_PROVIDER=console`, `sendMail` resolves `{ ok: true }` and writes exactly one
  structured log line carrying `to`/`subject` and **not the body** (design note §4, F-10 — a
  comment explains why: the console transport writes to the same stdout a log aggregator
  collects, so a body would be persistent-log content)
- `config()` refuses to boot on a `MAIL_PROVIDER` value outside `['console']` (AC-04) — moved
  here from a first-send throw, per F-3
- `config()` refuses to boot on `MAIL_PROVIDER=console` with `NODE_ENV=production` (AC-04, F-3)

Then `sendMail(message: { to, subject, body }): Promise<{ ok: true } | { ok: false; error: string }>`.
With the enum in place, `console` is the only value that reaches `sendMail`, so the function
itself no longer needs its own unrecognised-provider branch — the config schema is the one place
that decision is made (D-01, unchanged). **F-5 — the returned `error` string is a short, bounded,
code-based description** (e.g. `transport_rejected`, plus a capped, known-safe detail such as an
HTTP status) assembled at this boundary, never the raw transport error, response body or headers
— so a credential can never ride inside it into the caller's log line or delivery row. A test
induces a failure whose underlying detail contains a credential-shaped token and asserts the
returned `error` string does not.

### Step 3 — the delivery repository

| Field    | Value                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Advances | NFR-02 (supports FR-04)                                                                                                        |
| Files    | `apps/api/src/modules/notifications/notifications.repository.ts` (create), `apps/api/src/modules/notifications/notifications.repository.spec.ts` (create) |
| Verify   | `npm test -w apps/api -- notifications.repository` — expected: green                                                          |

`insertDelivery(row)` — one `INSERT` into `notification_deliveries`, columns exactly matching
`db-design.md` §1.5 (`booking_id` nullable, `user_id`, `channel`, `kind`, `recipient`,
`outcome`, `error_detail` nullable, `provider_ref` nullable). `channel` is hardcoded `'email'` by
the caller (Step 4, F-12) — this repository does not decide it. A comment notes the row
deliberately carries neither `subject` nor `body` (design note §2.1; `db-design.md:218`).
Tested with a recording-fake Supabase client, the pattern `bookings.repository.spec.ts` set —
asserts the exact insert payload, not a mocked return value.

### Step 4 — the one send path

| Field    | Value                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04, FR-05, FR-06                                                                                                           |
| Files    | `apps/api/src/modules/notifications/notifications.service.ts` (create), `apps/api/src/modules/notifications/notifications.service.spec.ts` (create), `apps/api/src/modules/notifications/README.md` (modify) |
| Verify   | `npm test -w apps/api -- notifications.service` — expected: green                                                             |

Failing tests first, against a fake `insertDelivery` (records what it received, never asserted
as a mock call) and a fake `sendMail`:

- a successful send records exactly one `sent` row (`channel: 'email'`, F-12) and returns
  `{ ok: true, recorded: true }` (AC-05)
- a failed send (fake transport rejects) records exactly one `failed` row with the sanitized
  `error_detail` (Step 2, F-5) set, logs an `error` line carrying kind/bookingId/recipient/
  timestamp/reason, and resolves — never rejects (AC-05, AC-06, AC-07)
- **F-4 — a failed send whose delivery-log insert *also* fails** still resolves without throwing,
  logs the full context via `logger.error` (the row that could not be written), and returns
  `{ ok: false, error, recorded: false }` — the "never throws" guarantee extended to "never
  silent" per the `RecordAndSendResult` shape below
- the log line **and** the recorded row's `error_detail` from a failed send contain no
  credential-shaped token (F-5) — this replaces the original plan's weaker check, which only
  inspected the log and only for a fixed field name (design note §4)
- calling `recordAndSend` twice with different `kind`s ('confirmation' vs 'cancellation')
  produces two independent rows through the identical function — the structural half of AC-08
  this story can prove without US-028/029/030 as callers yet

Then:

```ts
export type RecordAndSendResult =
  | { ok: true; recorded: boolean }
  | { ok: false; error: string; recorded: boolean };
```

`recordAndSend(input: { kind, bookingId, userId, recipient, subject, body })`: calls `sendMail`,
then attempts `insertDelivery` in its own `try` (F-4) — a failure there is logged, never thrown,
and reflected as `recorded: false`. `channel` is hardcoded to `'email'` inside this function
(F-12); `recordAndSend` takes no transaction and opens none (design note §2.1). **F-6 — this
function is documented, not built, as send-then-record**: `notifications/README.md` gains a note
that the reminder run (US-030) needs a claim-before-send variant to make
`app-architecture.md` §4.3's "a retry resends only what failed" true, and that US-030 must extend
this function rather than write a second one, or AC-08 breaks. No code changes for that; it is a
seam left legible for the story that needs it.

### Step 5 — the lint boundary, corrected

| Field    | Value                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------- |
| Advances | FR-07                                                                                                   |
| Files    | `eslint.config.mjs` (modify), `apps/api/src/eslint-boundaries.spec.ts` (create — F-8 regression test) |
| Verify   | `npm run lint` — expected: clean; new spec asserting `calculateConfigForFile` still yields every pre-existing ban (ADR-001 in `http/` and in the browser bundle, ADR-002's browser→api ban, all five module boundaries) **plus** the new mailer ban, one representative file per boundary — expected: green |

**Design-note change (F-1, blocker):** the original plan's broad `apps/**/*.ts` block would have
*replaced* `no-restricted-imports` for every file it matches — flat config does not merge the
rule — silently deleting the ADR-001 browser-bundle ban, the ADR-002 ban, and all five module
boundaries, while `npm run lint` stayed green. Rewritten instead to amend the blocks that already
own the rule:

- Hoist the ADR-001 `@supabase/supabase-js` path entry into a shared `SUPABASE_CLIENT_BAN`
  constant; add a `MAILER_BAN` pattern for `**/infra/mailer/**`.
- Boundary 1 (`apps/**/*.ts`) keeps its `paths`, adds `patterns: [MAILER_BAN]`.
- Each generated `moduleBoundaries` block restates `paths: [SUPABASE_CLIENT_BAN]` (**F-7** — this
  was never restated before; all five module directories could otherwise import
  `@supabase/supabase-js` directly, a pre-existing hole this fix closes as a side effect — called
  out in the PR description per the design note rather than filed as a separate issue) and adds
  `MAILER_BAN` to its patterns for every module **except `notifications`**, which keeps the
  Supabase ban and omits the mailer ban — the exemption AC-08 requires.
- Boundary 4 (`apps/ui/**`) adds `MAILER_BAN` to its existing patterns.
- Boundary 5 and the `supabase-client.ts` override are untouched.

**F-8** — because a silently-deleted rule and a satisfied one look identical to `npm run lint`
alone, add a permanent spec that calls `new ESLint().calculateConfigForFile(...)` for one file
per boundary (`apps/api/src/http/app.ts`, `apps/ui/src/lib/api-client.ts`,
`apps/api/src/modules/bookings/*.ts`, `apps/api/src/modules/notifications/*.ts`) and asserts each
still carries its expected ban(s) — this is the regression test for a protected path whose whole
value is that it never silently weakens.

### Step 6 — traceability, docs, and the AC-03 gap

| Field    | Value                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | all FRs (bookkeeping) plus the missing AC-03                                                                                                        |
| Files    | `apps/api/src/config/index.spec.ts` (modify — AC-03 test, see below), `.env.example` (modify — F-11 comment), `traceability.md` (modify — statuses to `implemented`, add AC-03 row), `spec.md` (modify — add explicit AC-03 FR row so it is never silently unproven again), `knowledge/traceability/manifest.json` (modify — `US-034.tests[]`), `inception/specs/index.md` (modify — status to `implemented`) |
| Verify   | `node tools/aidlc-check.mjs` — expected: passes                                                                                                      |

**Design-note change (F-2, blocker):** AC-03 had no test anywhere in the original package, and
`manifest.json` already lists it among `US-034`'s eight ACs — `aidlc-check` would have failed the
branch outright. Added, all named `... (US-034/AC-03)`: `.env.example` ships
`MAIL_PROVIDER`/`MAIL_API_KEY`/`MAIL_FROM_ADDRESS` with no value; `.env.example` says the
production values are `TBD (owner: IT)` rather than leaving the blank unexplained (**F-11**); and
`config()` has no default for `MAIL_FROM_ADDRESS`, so a repository checked out with no `.env` at
all refuses to boot rather than picking a value. A repo-wide scan for a literal mail address was
considered and dropped — this codebase's other modules legitimately hold example addresses in
test fixtures unrelated to the sender, so a blanket scan would false-positive on unrelated
stories. FR-01's own test (Step 2 — the sender always comes from a changed `config()` setting)
is the narrower, correctly-scoped proof the story's QA notes ask for.

## Rollback

Revert the PR. The migration is additive only (a new table, no altered column on an existing
one) — a revert of `0006_notification_deliveries.sql` drops an unused table with no data yet
written to it, since no caller exists until US-028. `config/index.ts`'s enum/production guard is
also additive-only against existing deployments: every environment already sets `MAIL_PROVIDER`
to a non-blank string, and the only value it will reject going forward is one nothing currently
implements.

## Open questions

None. Every load-bearing fact was verified by reading (`config/index.ts`, `.env`/`.env.example`,
`db-design.md` §1.5, `app-architecture.md` §5.4–5.5, `eslint.config.mjs`,
`bookings.repository.ts`/`bookings.service.spec.ts` for convention) rather than assumed, and the
Architect design note's findings (F-1 through F-12) are folded into the steps above rather than
left as open questions.
